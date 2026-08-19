'use strict';

const UserSkill = require('../../models/UserSkill');
const JobSkill = require('../../models/JobSkill');
const Job = require('../../models/Job');

/**
 * computeGap — computes the skill gap for a user against postings matching their target role.
 *
 * Algorithm:
 *   1. Fetch all skill IDs in the user's profile (userSkills collection)
 *   2. Find jobs matching the target role (text search on title), posted in last 30 days
 *   3. Fetch all unique demanded skill IDs across those jobs (jobSkills collection)
 *   4. matched          = intersection(userSkillIds, demandedSkillIds), where the
 *                         user's status is 'proficient' or 'expert'
 *   5. partiallyMatched = intersection(userSkillIds, demandedSkillIds), where the
 *                         user's status is 'learning' (i.e. "in progress")
 *   6. missing          = demandedSkillIds − userSkillIds
 *   7. gapPct           = |missing| / |demandedSkillIds| × 100
 *
 * Why three buckets rather than two:
 *   §4 of the project plan reports a skill the student marked "in progress" as
 *   *partially* matched, not as a plain match — a student halfway through DSA is
 *   in a materially different position from one who has finished it, and folding
 *   the two together hides exactly the information the report exists to surface.
 *   The UserSkill.status field ('learning' | 'proficient' | 'expert') carries this
 *   distinction, and this is the only place it is interpreted.
 *
 * Why gapPercent still counts only `missing`:
 *   §6.5 of the plan defines Gap % = |Missing| / |jobSkills| × 100. A partially
 *   matched skill is not missing — the user has started it and it appears in their
 *   profile — so it stays out of the numerator. Keeping the published formula
 *   unchanged means the headline number remains the one the spec defines, while
 *   the three buckets below add detail underneath it. Roadmap generation likewise
 *   consumes `missing` only, so a skill already in progress does not generate a
 *   "go learn this" item the student has demonstrably already acted on.
 *
 * Design:
 *   - Fully rule-based / set-arithmetic. No ML, no scoring model.
 *   - "Why did my gap report show X as missing?" has a direct, traceable answer:
 *     because skill X appears in jobSkills for postings matching your targetRole,
 *     and it is not in your userSkills. The logic is inspectable at every step.
 *   - Job search is capped at 100 postings to keep query time bounded. At this
 *     project's scale this is not a limitation; at larger scale, a materialized
 *     view or periodic precomputation would replace the live query.
 *
 * @param {string} userId     - ObjectId of the authenticated user
 * @param {string} targetRole - User's target role (e.g. "Software Engineer")
 * @returns {object} Gap report object
 */
async function computeGap(userId, targetRole) {
  // ── Step 1: User's skills ────────────────────────────────────────────────
  const userSkillDocs = await UserSkill
    .find({ userId })
    .populate('skillId', 'name category')
    .lean();

  // Build a Map (not a Set) for O(1) lookup during intersection.
  // The Map carries the whole userSkill record, so the classification below can
  // read status/proficiency without a second linear scan per demanded skill.
  const userSkillById = new Map(
    userSkillDocs
      .filter(us => us.skillId) // guard against a skill deleted from the taxonomy
      .map(us => [us.skillId._id.toString(), us])
  );

  // ── Step 2: Find relevant job IDs ────────────────────────────────────────
  // Text search uses the compound text index on jobs.title + jobs.description.
  // Returns only _id to avoid fetching full job documents (we only need the IDs
  // to query jobSkills in Step 3).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const relevantJobs = await Job.find(
    {
      $text: { $search: targetRole },
      isActive: true,
      postedDate: { $gte: since },
    },
    { _id: 1 }
  ).limit(100).lean();

  const relevantJobIds = relevantJobs.map(j => j._id);

  // ── Handle: no matching postings ─────────────────────────────────────────
  if (relevantJobIds.length === 0) {
    // Return an empty-but-valid gap report. Frontend should display the message.
    // Shape must stay identical to the populated report below — the frontend
    // reads the same fields either way and only branches on noDataMessage.
    return {
      targetRole,
      jobsAnalyzed: 0,
      skillsDemanded: 0,
      userSkills: userSkillDocs
        .filter(us => us.skillId)
        .map(us => ({
          skillId: us.skillId._id,
          name: us.skillId.name,
          category: us.skillId.category,
          status: us.status,
          proficiency: us.proficiency,
        })),
      matched: [],
      partiallyMatched: [],
      missing: [],
      gapPercent: 0,
      noDataMessage: `No job postings found for "${targetRole}" in the last 30 days. ` +
        'Try updating your target role or wait for the next ingestion run.',
    };
  }

  // ── Step 3: Demanded skills across those jobs ────────────────────────────
  const jobSkillDocs = await JobSkill
    .find({ jobId: { $in: relevantJobIds } })
    .populate('skillId', 'name category')
    .lean();

  // Deduplicate demanded skills (same skill may appear across many jobs)
  const demandedSkillMap = new Map();
  for (const js of jobSkillDocs) {
    if (!js.skillId) continue; // guard against orphaned references
    const idStr = js.skillId._id.toString();
    if (!demandedSkillMap.has(idStr)) {
      demandedSkillMap.set(idStr, {
        skillId: js.skillId._id,
        name: js.skillId.name,
        category: js.skillId.category,
      });
    }
  }

  // ── Steps 4-6: Classify every demanded skill into exactly one bucket ──────
  const matched = [];
  const partiallyMatched = [];
  const missing = [];

  for (const [skillIdStr, skillInfo] of demandedSkillMap) {
    const userEntry = userSkillById.get(skillIdStr);

    if (!userEntry) {
      missing.push(skillInfo);
      continue;
    }

    const entry = {
      ...skillInfo,
      status: userEntry.status || 'learning',
      proficiency: userEntry.proficiency || 'beginner',
    };

    // 'learning' is the profile's way of saying "in progress" — a started but
    // unfinished skill is reported separately from one the user actually has.
    if (entry.status === 'learning') {
      partiallyMatched.push(entry);
    } else {
      matched.push(entry);
    }
  }

  // ── Step 7: Gap percentage ────────────────────────────────────────────────
  // Per §6.5: only fully-absent skills count toward the gap.
  const total = demandedSkillMap.size;
  const gapPercent = total > 0 ? Math.round((missing.length / total) * 100) : 0;

  return {
    targetRole,
    jobsAnalyzed: relevantJobIds.length,
    skillsDemanded: total,
    userSkills: userSkillDocs
      .filter(us => us.skillId)
      .map(us => ({
        skillId: us.skillId._id,
        name: us.skillId.name,
        category: us.skillId.category,
        status: us.status,
        proficiency: us.proficiency,
      })),
    matched,
    partiallyMatched,
    missing,
    gapPercent,
  };
}

module.exports = { computeGap };
