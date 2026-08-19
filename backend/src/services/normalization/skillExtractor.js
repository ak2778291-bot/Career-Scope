'use strict';

/**
 * extractSkillIds — scans a job description for taxonomy skill terms.
 *
 * Returns an array of Skill ObjectId strings for all skills matched in the text.
 *
 * Design decisions:
 *
 *   1. SKILLS CACHE — the skillsCache parameter must be loaded ONCE per ingestion
 *      run (by ingestionRunner.js), not fetched per-job. This avoids N+1 database
 *      queries: if 200 jobs are ingested, we do 1 DB query for skills, not 200.
 *
 *   2. WORD-BOUNDARY MATCHING — skills are matched with lookahead/lookbehind to
 *      prevent false positives on substrings:
 *        "Java" should NOT match "JavaScript"
 *        "C"   should NOT match "CSS" or "Docker"
 *      The regex uses (?<![a-zA-Z0-9]) / (?![a-zA-Z0-9]) as word-boundary guards
 *      because \b doesn't work correctly with special characters like "C++".
 *
 *   3. ALIAS EXPANSION — both the canonical skill name and all aliases[] are
 *      checked. An alias match is treated identically to a canonical name match.
 *      The skill ObjectId (not the alias string) is returned.
 *
 *   4. SET DEDUPLICATION — a Set<string> prevents the same skill being returned
 *      twice (once via canonical name, once via an alias) for a single job.
 *
 * @param {string} description - Raw job description text
 * @param {Array}  skillsCache - Array of Skill documents: { _id, name, aliases }
 * @returns {string[]} Array of unique Skill ObjectId strings
 */
function extractSkillIds(description, skillsCache) {
  if (!description || typeof description !== 'string') return [];
  if (!skillsCache || skillsCache.length === 0) return [];

  const foundSkillIds = new Set();

  for (const skill of skillsCache) {
    // Build the list of terms to search: canonical name + all aliases
    const terms = [skill.name, ...(skill.aliases || [])].filter(Boolean);

    for (const term of terms) {
      // Escape special regex characters in the term (important for "C++", "Node.js")
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Word-boundary regex: does not start or end with an alphanumeric character.
      // This correctly handles "C++" (the + chars are not alphanumeric boundaries)
      // while still preventing "C" from matching inside "Docker" or "React".
      const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');

      if (regex.test(description)) {
        foundSkillIds.add(skill._id.toString());
        break; // Found this skill — no need to check remaining aliases
      }
    }
  }

  return [...foundSkillIds];
}

module.exports = { extractSkillIds };
