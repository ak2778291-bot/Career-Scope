'use strict';

const mongoose = require('mongoose');

/**
 * JobSkill collection — join table between Job and Skill.
 *
 * Data-modeling note — why a separate collection (not an array on Job):
 *   Jobs and Skills have a many-to-many relationship. A job requires many skills;
 *   a skill appears in many jobs.
 *
 *   The join-table approach (rather than embedding a skills[] array on Job) has
 *   two critical advantages for this codebase:
 *
 *   1. ANALYTICS: The aggregation pipeline queries in analytics/trends.js group
 *      by skillId across all JobSkill documents to compute "top demanded skills".
 *      This $group on a dedicated collection with an indexed skillId field is
 *      significantly faster than $unwind-ing a skills[] array embedded in every
 *      Job document — especially as the dataset grows.
 *
 *   2. SKILL-GAP: The gap engine (skillGap/gapEngine.js) queries
 *      { jobId: { $in: relevantJobIds } } on this collection to get all demanded
 *      skill IDs in one indexed query. The same query on an embedded array would
 *      require fetching and unpacking full Job documents.
 *
 * Both indexes below (per §11 of the spec) are single-field to support:
 *   - jobId: "what skills does this job require?" (JobDetail page)
 *   - skillId: "which jobs require this skill?" (skill-gap + analytics)
 * The compound unique index prevents the same skill from being linked
 * to the same job twice (guard against re-runs of ingestion).
 */
const jobSkillSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
  },
  skillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill',
    required: true,
  },
});

// Per §11 — indexed on both sides of the join
jobSkillSchema.index({ jobId: 1 });
jobSkillSchema.index({ skillId: 1 });
// Compound unique: same skill linked to same job only once
jobSkillSchema.index({ jobId: 1, skillId: 1 }, { unique: true });

module.exports = mongoose.model('JobSkill', jobSkillSchema);
