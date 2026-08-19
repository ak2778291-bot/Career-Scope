'use strict';

const titleAliases = require('../../../data/titleAliases');

/**
 * normalizeTitle — maps a raw job title from an external API to a canonical form.
 *
 * Steps applied in order:
 *   1. Strip common noise suffixes that vary between sources but add no meaning
 *      (e.g. "— Urgent", "NEW!", "ASAP").
 *   2. Check the titleAliases lookup table for a known canonical mapping.
 *      If found, use the canonical form.
 *   3. Re-attach the internship marker if step 2 dropped it (see below).
 *   4. If no alias matches, return the cleaned raw title as-is.
 *
 * Why this matters for deduplication:
 *   The dedup hash is computed on the normalized title, so "SDE Intern" and
 *   "Software Development Engineer Intern" from two different sources hash to
 *   the same value and are correctly identified as the same posting.
 *
 * Why step 3 exists — the intern guard:
 *   Step 2 matches aliases by substring, so a title like "Frontend Engineer
 *   Intern" matches the shorter 'frontend engineer' pattern and would normalize
 *   to "Frontend Engineer", silently discarding the word that distinguishes an
 *   internship from a full-time role. That is worse than leaving the title
 *   unnormalized: two genuinely different postings at the same company and
 *   location would produce the same hash and be merged into one record. On a
 *   platform built for students deciding what to apply for, quietly folding an
 *   internship into a full-time listing is the most damaging dedup error the
 *   system could make. Rather than adding an "<x> intern" entry for every role
 *   in the alias table (which has to be remembered every time a role is added),
 *   the marker is re-attached here as a rule, so it holds for entries that do
 *   not yet exist.
 *
 * Known limitation (deliberate, v2): seniority markers ("Senior", "Staff",
 * "Lead") are treated the same way as noise and can still collapse into the base
 * canonical title. Internship was singled out because this platform's users are
 * students, for whom the intern/full-time distinction is the decision-relevant
 * one. Generalising this to a seniority-aware canonical form is a natural v2
 * refinement of the same rule.
 *
 * @param {string} rawTitle
 * @returns {string} normalized title
 */

// Matches "intern", "interns", "internship" as whole words — but NOT "internal",
// which is a common word in job titles ("Internal Tools Engineer").
const INTERN_PATTERN = /\bintern(s|ship)?\b/i;

function normalizeTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';

  let title = rawTitle.trim();

  // Step 1: Strip trailing noise patterns (case-insensitive)
  title = title
    .replace(/\s*[-–—|]\s*(urgent|new|hot|asap|immediate|apply now|hiring now).*$/i, '')
    .replace(/\b(new!?|urgent|hot|🔥|⚡)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const isInternship = INTERN_PATTERN.test(title);

  // Step 2: Check alias table (match on lowercase substring)
  const titleLower = title.toLowerCase();
  for (const [pattern, canonical] of Object.entries(titleAliases)) {
    // Use includes() for substring matching — allows "Senior SDE Intern" to
    // match the "sde intern" pattern. More specific patterns are listed first
    // in titleAliases.js to avoid false matches.
    if (titleLower.includes(pattern)) {
      // Step 3: the intern guard described above.
      if (isInternship && !INTERN_PATTERN.test(canonical)) {
        return `${canonical} Intern`;
      }
      return canonical;
    }
  }

  // Step 4: No alias — return the cleaned title
  return title;
}

module.exports = { normalizeTitle };
