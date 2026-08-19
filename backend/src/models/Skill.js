'use strict';

const mongoose = require('mongoose');

/**
 * Skill collection — the canonical taxonomy of skills used for:
 *   1. Skill extraction from job descriptions (keyword matching)
 *   2. User skill profile (userSkills join)
 *   3. Job skill requirements (jobSkills join)
 *   4. Trend analytics (group-by skillId in aggregation pipelines)
 *
 * Data-modeling note — why REFERENCE (not embed on Job or User):
 *   Skills are queried independently for the taxonomy management admin UI,
 *   the skill selector in the user profile, and the analytics dashboard.
 *   A skill like "JavaScript" is referenced by potentially thousands of jobs
 *   and hundreds of users — embedding it anywhere would create massive data
 *   duplication with no query benefit.
 */
const skillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Skill name is required'],
    unique: true,
    trim: true,
  },
  /**
   * aliases — known alternate spellings / shorthand for this skill.
   * Used by skillExtractor.js to match non-canonical terms in job descriptions.
   * Examples: ["JS", "javascript", "ECMAScript"] → canonical "JavaScript"
   *           ["CPP", "C/C++", "c plus plus"] → canonical "C++"
   * Managed via the admin skill taxonomy UI.
   */
  aliases: [{ type: String, trim: true }],
  /**
   * category — broad grouping for display and filtering.
   * E.g. "Language", "Framework", "Database", "Tool", "Concept"
   */
  category: {
    type: String,
    trim: true,
    default: 'General',
  },
});

// Text index supports admin search and the GET /api/skills?search=... endpoint
skillSchema.index({ name: 'text' });

module.exports = mongoose.model('Skill', skillSchema);
