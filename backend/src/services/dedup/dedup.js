'use strict';

const crypto = require('crypto');

/**
 * computeDedupeHash — produces a deterministic SHA-256 hash for a job posting.
 *
 * Hash input: normalize(title) + '|' + normalize(company) + '|' + normalize(location)
 *
 * Why this triple?
 *   - title alone is not unique: the same company can post "Software Engineer"
 *     across multiple locations. Company alone is not unique: a company posts many jobs.
 *   - The triple (title, company, location) is the minimum set that uniquely identifies
 *     a single job posting with high confidence. Two postings with the same triple
 *     from different sources are treated as the same underlying listing.
 *
 * Why SHA-256?
 *   - Fixed-length output (64 hex chars) is suitable for a unique index field.
 *   - Collision-resistant for this use case: SHA-256 collisions in job-posting
 *     data are astronomically unlikely.
 *   - Fast enough that hashing 200+ records per ingestion run is imperceptible.
 *
 * Why not include postedDate?
 *   - Different sources may report slightly different dates for the same posting
 *     (e.g., one says "posted 2 days ago", another says "posted 3 days ago").
 *     Including the date would break deduplication for these cases.
 *   - The (title, company, location) triple already handles the vast majority of
 *     true duplicates without the date.
 *
 * Why normalizeForHash() is applied again here, even though callers pass
 * already-normalized values:
 *   normalizeForHash() is idempotent (lowercasing and punctuation-stripping an
 *   already-lowercased, already-stripped string is a no-op), so re-applying it
 *   costs nothing and closes a real dedup hole. The title component arrives from
 *   normalizeTitle(), which trims and alias-maps but deliberately preserves the
 *   canonical display casing ("Software Development Engineer I"). Without this
 *   step, a title that finds no entry in the alias table — say "Junior Rust
 *   Developer" from one source and "junior rust developer" from another — would
 *   hash differently and the duplicate would slip through. Normalizing at the
 *   hash boundary makes the hash depend only on the semantic content of the
 *   triple, never on the formatting a particular source happened to use.
 *
 * @param {string} title    - Job title (typically the output of normalizeTitle())
 * @param {string} company  - Company name
 * @param {string} location - Job location
 * @returns {string} 64-char hex SHA-256 hash
 */
function computeDedupeHash(title, company, location) {
  const input = [
    normalizeForHash(title),
    normalizeForHash(company),
    normalizeForHash(location),
  ].join('|');

  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * normalizeForHash — normalises a string field for inclusion in the dedup hash.
 *
 * Lowercase, strip non-alphanumeric characters, collapse whitespace.
 * Applied to title, company, and location before hashing so that minor
 * formatting differences across sources (extra spaces, punctuation) don't
 * produce different hashes for the same posting.
 *
 * Examples:
 *   "Google LLC"        → "google llc"
 *   "Bangalore, India"  → "bangalore india"
 *   "  Remote  "        → "remote"
 *
 * @param {string} str
 * @returns {string}
 */
function normalizeForHash(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation (keep letters, digits, spaces)
    .replace(/\s+/g, ' ')         // collapse multiple spaces
    .trim();
}

module.exports = { computeDedupeHash, normalizeForHash };
