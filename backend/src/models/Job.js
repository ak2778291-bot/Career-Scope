'use strict';

const mongoose = require('mongoose');

/**
 * Job collection — the central document in the data model.
 *
 * Data-modeling decision — what is REFERENCED vs what is EMBEDDED:
 *
 *   REFERENCED (separate collections, linked by ObjectId):
 *     - company → Company collection
 *         Reason: Companies are queried independently (analytics, filters),
 *         appear across many jobs, and have their own update lifecycle.
 *
 *     - Skills are NOT referenced from Job directly.
 *         Instead, the join is modelled via a JobSkill collection (join table).
 *         Reason: Many-to-many relationship. A job requires many skills; a skill
 *         appears in many jobs. The join table lets us query "all jobs needing
 *         React" or "all skills for job X" efficiently with indexed fields, and
 *         supports the aggregation pipelines in analytics/trends.js without
 *         pulling full job documents into memory just to count skill co-occurrences.
 *
 *   EMBEDDED (inside the Job document):
 *     - sources[] — array of { name, url, fetchedAt }
 *         Reason: source entries are small (3 fields), bounded in size (a job
 *         realistically appears on 2-5 platforms at most), always accessed
 *         together with the job, and have no independent lifecycle — they exist
 *         only to record where this job was found. Embedding avoids a separate
 *         collection for data that adds no value on its own.
 */

const sourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },   // 'adzuna', 'remoteok', 'greenhouse', 'lever'
    url: { type: String },
    fetchedAt: { type: Date, default: Date.now },
  },
  { _id: false } // no independent _id needed — embedded subdocuments only
);

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
    },
    /**
     * normalizedTitle — the title after alias mapping (e.g. "SDE Intern" → "Software Development Engineer Intern").
     * Stored separately from title so the original display title is preserved
     * while the normalized form is available for consistent grouping/search.
     */
    normalizedTitle: {
      type: String,
      trim: true,
    },
    /**
     * company — REFERENCED, not embedded.
     * See data-modeling rationale above.
     */
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    location: {
      type: String,
      default: 'Remote',
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    postedDate: {
      type: Date,
      default: Date.now,
    },
    sourceUrl: {
      type: String,
    },
    /**
     * dedupeHash — SHA-256 of normalize(title) + '|' + normalize(company) + '|' + normalize(location).
     * Unique index enforces exact-match deduplication at the database level:
     * any attempt to insert a job with the same hash raises a duplicate-key error,
     * which ingestionRunner.js catches to run the merge (sources[] update) path instead.
     */
    dedupeHash: {
      type: String,
      required: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /**
     * sources[] — EMBEDDED.
     * See data-modeling rationale above.
     *
     * Invariant: at most ONE entry per distinct source name. When ingestion meets
     * a posting it has already stored, it updates that source's existing entry in
     * place (refreshing url/fetchedAt) instead of appending another one — see the
     * dedup branch of ingestionRunner.js:processRecord. This is what keeps the
     * array small and bounded, which is the entire justification for embedding it
     * here rather than making it its own collection. A naive append on every
     * scheduled run would grow the array indefinitely and invalidate that choice.
     */
    sources: [sourceSchema],
  },
  { timestamps: true }
);

// ── Indexes (per §11 of the spec) ─────────────────────────────────────────────
// Text index supports full-text search on GET /api/jobs?search=...
// and is used by the skill-gap engine's targetRole text search.
jobSchema.index({ title: 'text', description: 'text' });

// Single-field indexes on common filter fields
jobSchema.index({ company: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ postedDate: -1 }); // descending — most recent first is the default sort

module.exports = mongoose.model('Job', jobSchema);
