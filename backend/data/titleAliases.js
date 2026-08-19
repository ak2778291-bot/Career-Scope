'use strict';

/**
 * Title alias lookup table.
 *
 * Maps known raw-title patterns (as lowercase substrings) to their canonical form.
 * Used by normalization/titleNorm.js during ingestion.
 *
 * Design:
 *   - Keys are lowercase substrings to match against the lowercased raw title.
 *   - Longer/more-specific patterns should be listed before shorter ones to avoid
 *     early-exit on a less specific match (e.g., "sde intern" before "sde").
 *   - The goal is not to catch every possible variant — it's to normalize the most
 *     common ones so that deduplication works correctly when sources describe the
 *     same role differently. An unmatched title is stored as-is.
 *
 * Maintenance: add entries here when you observe recurring title variants in
 * ingestion logs that represent the same canonical role.
 */
const titleAliases = {
  // ── SDE variants ──────────────────────────────────────────────────────────
  'software development engineer intern': 'Software Development Engineer Intern',
  'sde intern': 'Software Development Engineer Intern',
  'software engineer intern': 'Software Engineer Intern',
  'software engineering intern': 'Software Engineer Intern',
  'sde-1': 'Software Development Engineer I',
  'sde 1': 'Software Development Engineer I',
  'sde i': 'Software Development Engineer I',
  'sde1': 'Software Development Engineer I',
  'software development engineer 1': 'Software Development Engineer I',
  'software development engineer i': 'Software Development Engineer I',
  'sde-2': 'Software Development Engineer II',
  'sde 2': 'Software Development Engineer II',
  'sde ii': 'Software Development Engineer II',
  'software development engineer 2': 'Software Development Engineer II',
  'sde': 'Software Development Engineer',

  // ── Frontend/Backend/Full-stack ───────────────────────────────────────────
  'frontend developer': 'Frontend Developer',
  'front end developer': 'Frontend Developer',
  'front-end developer': 'Frontend Developer',
  'frontend engineer': 'Frontend Engineer',
  'front end engineer': 'Frontend Engineer',
  'backend developer': 'Backend Developer',
  'back end developer': 'Backend Developer',
  'back-end developer': 'Backend Developer',
  'backend engineer': 'Backend Engineer',
  'back end engineer': 'Backend Engineer',
  'full stack developer': 'Full Stack Developer',
  'full-stack developer': 'Full Stack Developer',
  'fullstack developer': 'Full Stack Developer',
  'full stack engineer': 'Full Stack Engineer',
  'full-stack engineer': 'Full Stack Engineer',

  // ── Data roles ────────────────────────────────────────────────────────────
  'data scientist': 'Data Scientist',
  'data analyst': 'Data Analyst',
  'data engineer': 'Data Engineer',
  'machine learning engineer': 'Machine Learning Engineer',
  'ml engineer': 'Machine Learning Engineer',
  'ai engineer': 'AI Engineer',
  'ai/ml engineer': 'AI/ML Engineer',

  // ── DevOps / Cloud ────────────────────────────────────────────────────────
  'devops engineer': 'DevOps Engineer',
  'site reliability engineer': 'Site Reliability Engineer',
  'sre': 'Site Reliability Engineer',
  'cloud engineer': 'Cloud Engineer',

  // ── Intern/Junior ─────────────────────────────────────────────────────────
  'junior software engineer': 'Junior Software Engineer',
  'junior developer': 'Junior Developer',
  'graduate software engineer': 'Graduate Software Engineer',
  'associate software engineer': 'Associate Software Engineer',
};

module.exports = titleAliases;
