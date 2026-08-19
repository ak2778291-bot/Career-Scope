'use strict';

const Company = require('../../models/Company');
const Job = require('../../models/Job');
const JobSkill = require('../../models/JobSkill');
const IngestionLog = require('../../models/IngestionLog');
const Skill = require('../../models/Skill');
const { fetchFromAdzuna } = require('./adzuna');
const { fetchFromRemoteOK } = require('./remoteok');
const { fetchFromGreenhouse } = require('./greenhouse');
const { fetchFromLever } = require('./lever');
const { computeDedupeHash, normalizeForHash } = require('../dedup/dedup');
const { normalizeTitle } = require('../normalization/titleNorm');
const { extractSkillIds } = require('../normalization/skillExtractor');

/**
 * Sources registry.
 * To add a new source: add an entry here pointing to its fetcher function.
 * No other changes required in this file.
 *
 * adzuna/remoteok call a documented (or at least stable, public) API and return
 * JSON directly. greenhouse/lever have no API at all — they are scraped: each
 * fetcher below downloads a company's public board page as raw HTML and parses it
 * with Cheerio (see greenhouse.js/lever.js) before returning the same
 * { records, errors } shape as the API sources. Everything downstream of this
 * registry — normalization, dedup, storage, analytics — treats all four sources
 * identically, which is the point: it should not need to know or care how a given
 * record was obtained.
 */
const SOURCES = [
  { name: 'adzuna', fetcher: fetchFromAdzuna },
  { name: 'remoteok', fetcher: fetchFromRemoteOK },
  { name: 'greenhouse', fetcher: fetchFromGreenhouse },
  { name: 'lever', fetcher: fetchFromLever },
];

/**
 * runIngestion — main ingestion orchestrator.
 *
 * Called by:
 *   - POST /api/admin/trigger-ingestion  (manual re-run via admin UI or external cron trigger)
 *
 * Scheduling note:
 *   This function is NOT called by an in-process node-cron job. Instead, an external
 *   scheduled trigger (Render Cron Job or cron-job.org) sends a POST request to the
 *   ingestion endpoint at the configured interval. This avoids a known issue with
 *   in-process cron: Render's free tier spins down idle services, which silently
 *   kills any running node-cron timers. An external trigger works even after a
 *   cold start because it causes the service to spin up, handle the request,
 *   and spin back down — no always-on process required.
 *   This decision is documented in DESIGN.md § "Scheduling: external trigger vs node-cron".
 *
 * @param {string} triggeredBy - 'cron' | 'admin'
 * @returns {Array} Array of per-source result summaries
 */
async function runIngestion(triggeredBy = 'cron') {
  console.log(`[Ingestion] Starting run — triggered by: ${triggeredBy}`);

  // Load the full skills taxonomy ONCE here, not per-job.
  // Rationale: extractSkillIds() needs access to all skill names + aliases on every job.
  // Loading inside processRecord() would create N+1 DB queries (one per job).
  // Loading here creates exactly 1 DB query per ingestion run regardless of job count.
  const skillsCache = await Skill.find({}, 'name aliases').lean();
  console.log(`[Ingestion] Loaded ${skillsCache.length} skills into cache`);

  const results = [];

  // Process each source independently.
  // The for...of loop (not Promise.all) is intentional: sequential source processing
  // avoids hitting both APIs simultaneously, which could trip rate limits.
  // Sources are cheap enough (2 APIs, ~50 records each) that parallelism is not needed.
  for (const source of SOURCES) {
    const startTime = Date.now();
    const logEntry = {
      source: source.name,
      recordsFetched: 0,
      recordsInserted: 0,
      recordsDeduplicated: 0,
      errors: [],
      triggeredBy,
    };

    try {
      // ── Step 1: Fetch ──────────────────────────────────────────────────────
      // Each fetcher returns { records, errors } — never throws.
      // Any source-level failure produces errors[] and records = [].
      const { records, errors: fetchErrors } = await source.fetcher();
      logEntry.errors.push(...fetchErrors);
      logEntry.recordsFetched = records.length;

      console.log(`[Ingestion][${source.name}] Fetched ${records.length} records`);

      // ── Step 2: Process each record ────────────────────────────────────────
      for (const record of records) {
        try {
          await processRecord(record, source.name, skillsCache, logEntry);
        } catch (recordErr) {
          // A single bad record must not abort the entire source batch.
          logEntry.errors.push(`Record error: ${recordErr.message}`);
        }
      }

    } catch (sourceErr) {
      // Source-level catastrophic failure (shouldn't reach here since fetchers
      // don't throw, but guard for unexpected conditions).
      console.error(`[Ingestion][${source.name}] Unexpected source failure:`, sourceErr.message);
      logEntry.errors.push(`Source failure: ${sourceErr.message}`);
    }

    // ── Step 3: Write per-source ingestion log ─────────────────────────────
    logEntry.durationMs = Date.now() - startTime;

    try {
      await IngestionLog.create(logEntry);
    } catch (logErr) {
      // Log write failure is non-fatal — don't let it crash the ingestion run
      console.error(`[Ingestion][${source.name}] Failed to write log:`, logErr.message);
    }

    console.log(
      `[Ingestion][${source.name}] Done — ` +
      `fetched: ${logEntry.recordsFetched}, ` +
      `inserted: ${logEntry.recordsInserted}, ` +
      `deduped: ${logEntry.recordsDeduplicated}, ` +
      `errors: ${logEntry.errors.length}, ` +
      `duration: ${logEntry.durationMs}ms`
    );

    results.push({ ...logEntry });
  }

  return results;
}

/**
 * processRecord — processes a single raw job record through the full pipeline.
 *
 * Steps (as confirmed in the build approval response):
 *   1. Normalise title, company name, and location for hashing
 *   2. Company upsert — atomic findOneAndUpdate, returns existing or new Company
 *   3. Compute dedup hash; check for existing job
 *      - Duplicate: push source entry onto existing job's sources[], skip insert
 *      - New: insert Job document
 *   4. Skill extraction (new jobs only): scan description → bulk-insert JobSkills
 *
 * @param {object} record      - Normalised raw record from a fetcher
 * @param {string} sourceName  - 'adzuna' | 'remoteok' | 'greenhouse' | 'lever'
 * @param {Array}  skillsCache - Pre-loaded Skill documents { _id, name, aliases }
 * @param {object} logEntry    - Mutable log entry for this source run
 */
async function processRecord(record, sourceName, skillsCache, logEntry) {
  // ── 1. Normalize for hashing ───────────────────────────────────────────
  const normalizedTitle = normalizeTitle(record.title);
  const normalizedCompany = normalizeForHash(record.company || 'Unknown');
  const normalizedLocation = normalizeForHash(record.location || 'Remote');

  // ── 2. Company upsert ─────────────────────────────────────────────────
  // findOneAndUpdate with upsert:true is atomic — no race condition between
  // a concurrent "find" and "insert" for the same company name.
  // $setOnInsert means: only set name/normalizedName if creating a new document;
  // if the company already exists, the operation is a no-op (update nothing).
  const companyDoc = await Company.findOneAndUpdate(
    { normalizedName: normalizedCompany },
    {
      $setOnInsert: {
        name: record.company || 'Unknown',
        normalizedName: normalizedCompany,
      },
    },
    { upsert: true, new: true }
  );

  // ── 3. Dedup check ────────────────────────────────────────────────────
  const dedupeHash = computeDedupeHash(normalizedTitle, normalizedCompany, normalizedLocation);

  const existingJob = await Job.findOne({ dedupeHash }).lean();

  if (existingJob) {
    // Duplicate detected — record this source on the existing job's sources[].
    //
    // Why this is an upsert-into-array rather than $addToSet:
    //   $addToSet compares whole subdocuments, and every entry carries a fresh
    //   `fetchedAt`. Two sightings of the same posting from the same source are
    //   therefore never equal, so $addToSet would append a new element on every
    //   scheduled run — the array would grow without bound (4 runs/day is ~120
    //   entries per job per month) and eventually threaten the 16MB document
    //   limit. It would also invalidate the reason sources[] is embedded at all:
    //   that it is small and bounded (see the data-modeling note in models/Job.js).
    //
    //   So: if this source is already listed, update that entry in place to record
    //   the latest sighting; only push a new element for a genuinely new source.
    //   The result is one entry per distinct source — which is what "sources
    //   merged: 2" is supposed to mean.
    const touched = await Job.updateOne(
      { _id: existingJob._id, 'sources.name': sourceName },
      {
        // The positional `$` refers to the sources[] element matched in the filter.
        $set: {
          'sources.$.fetchedAt': new Date(),
          'sources.$.url': record.sourceUrl,
        },
      }
    );

    if (touched.matchedCount === 0) {
      // This source has not been seen for this job before — add it.
      await Job.updateOne(
        { _id: existingJob._id },
        {
          $push: {
            sources: {
              name: sourceName,
              url: record.sourceUrl,
              fetchedAt: new Date(),
            },
          },
        }
      );
    }

    // Note: we do NOT re-extract skills for deduplicated jobs — they were already
    // linked to this job document during its initial insert.
    logEntry.recordsDeduplicated++;
    return; // Done — no further processing needed
  }

  // ── 4a. Insert new job ────────────────────────────────────────────────
  const newJob = await Job.create({
    title: record.title,          // original title preserved for display
    normalizedTitle,              // alias-mapped title for grouping/search
    company: companyDoc._id,
    location: record.location || 'Remote',
    description: record.description || '',
    postedDate: record.postedDate ? new Date(record.postedDate) : new Date(),
    sourceUrl: record.sourceUrl,
    dedupeHash,
    isActive: true,
    sources: [
      {
        name: sourceName,
        url: record.sourceUrl,
        fetchedAt: new Date(),
      },
    ],
  });
  logEntry.recordsInserted++;

  // ── 4b. Skill extraction + JobSkill bulk insert ────────────────────────
  // Only runs for newly inserted jobs — deduplicated jobs already have their
  // skill links from the original insert.
  const matchedSkillIds = extractSkillIds(newJob.description, skillsCache);

  if (matchedSkillIds.length > 0) {
    const jobSkillDocs = matchedSkillIds.map(skillId => ({
      jobId: newJob._id,
      skillId,
    }));

    // ordered: false — continue inserting even if some (jobId, skillId) pairs
    // already exist from a previous run. Duplicate key errors (code 11000) are
    // suppressed; any other error is logged but doesn't abort the batch.
    await JobSkill.insertMany(jobSkillDocs, { ordered: false }).catch(err => {
      if (err.code !== 11000 && !err.message?.includes('11000')) {
        logEntry.errors.push(`JobSkill insert error for job ${newJob._id}: ${err.message}`);
      }
    });
  }
}

module.exports = { runIngestion };
