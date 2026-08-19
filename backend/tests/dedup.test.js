'use strict';

/**
 * Unit tests for deduplication logic.
 *
 * These tests verify the exact-match hashing behaviour of dedup.js.
 * They are pure unit tests — no database connection required.
 *
 * The dedup logic is one of the three pieces an interviewer will probe
 * directly ("walk me through your dedup logic"). These tests prove it
 * works correctly, not just that it runs.
 */

const { computeDedupeHash, normalizeForHash } = require('../src/services/dedup/dedup');
const { normalizeTitle } = require('../src/services/normalization/titleNorm');

describe('normalizeForHash', () => {
  test('lowercases input', () => {
    expect(normalizeForHash('Google LLC')).toBe('google llc');
  });

  test('strips punctuation', () => {
    expect(normalizeForHash('Bangalore, India!')).toBe('bangalore india');
    expect(normalizeForHash('C++ Developer')).toBe('c developer'); // + is stripped
  });

  test('collapses multiple spaces', () => {
    expect(normalizeForHash('  hello   world  ')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(normalizeForHash('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(normalizeForHash(null)).toBe('');
    expect(normalizeForHash(undefined)).toBe('');
  });
});

describe('computeDedupeHash', () => {
  test('same inputs produce the same hash', () => {
    const h1 = computeDedupeHash('software engineer', 'google', 'bangalore');
    const h2 = computeDedupeHash('software engineer', 'google', 'bangalore');
    expect(h1).toBe(h2);
  });

  test('different titles produce different hashes', () => {
    const h1 = computeDedupeHash('software engineer', 'google', 'bangalore');
    const h2 = computeDedupeHash('data engineer', 'google', 'bangalore');
    expect(h1).not.toBe(h2);
  });

  test('different companies produce different hashes', () => {
    const h1 = computeDedupeHash('software engineer', 'google', 'bangalore');
    const h2 = computeDedupeHash('software engineer', 'amazon', 'bangalore');
    expect(h1).not.toBe(h2);
  });

  test('different locations produce different hashes', () => {
    const h1 = computeDedupeHash('software engineer', 'google', 'bangalore');
    const h2 = computeDedupeHash('software engineer', 'google', 'hyderabad');
    expect(h1).not.toBe(h2);
  });

  test('case differences alone do NOT change the hash', () => {
    // Simulates the same posting arriving from two sources with different casing.
    // computeDedupeHash normalizes internally, so these must collide (= be deduped).
    const h1 = computeDedupeHash('Junior Rust Developer', 'Acme', 'Bangalore');
    const h2 = computeDedupeHash('junior rust developer', 'ACME', 'bangalore');
    expect(h1).toBe(h2);
  });

  test('company suffix differences DO change the hash (documented boundary)', () => {
    // normalizeForHash deliberately does NOT strip corporate suffixes like
    // "LLC" / "Inc" / "Ltd" — stripping them would need a separate company
    // normalization step with its own false-positive risk. In the running system
    // this rarely bites, because ingestionRunner upserts companies on
    // normalizedName, so a company keeps one canonical spelling once first seen.
    // This test pins the boundary deliberately rather than leaving it implicit.
    const h1 = computeDedupeHash('Software Engineer', 'Google', 'Bangalore');
    const h2 = computeDedupeHash('Software Engineer', 'Google LLC', 'Bangalore');
    expect(h1).not.toBe(h2);
  });

  test('whitespace variations in the same field produce the same hash', () => {
    const h1 = computeDedupeHash('software engineer', 'google', 'bangalore');
    const h2 = computeDedupeHash('  software engineer  ', 'google  ', '  bangalore');
    expect(h1).toBe(h2);
  });

  test('produces a 64-character hex string (SHA-256)', () => {
    const hash = computeDedupeHash('title', 'company', 'location');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ── End-to-end dedup scenarios (title normalization + hashing together) ─────
  // These use the real normalizeTitle() the ingestion pipeline uses, so they
  // test the actual path a record takes, not a hand-normalized approximation.

  test('dedup scenario: differently-worded titles for the same role DO merge', () => {
    // This is the §4 worked example from the project plan.
    // Adzuna:   "Software Development Engineer I"
    // RemoteOK: "SDE 1 - Backend"
    // Both normalize to the canonical "Software Development Engineer I",
    // so with the same company and location they hash identically and merge.
    const hashFromAdzuna = computeDedupeHash(
      normalizeTitle('Software Development Engineer I'),
      'ExampleCorp',
      'Bangalore'
    );
    const hashFromRemoteOK = computeDedupeHash(
      normalizeTitle('SDE 1 - Backend'),
      'ExampleCorp',
      'Bangalore'
    );

    expect(hashFromAdzuna).toBe(hashFromRemoteOK);
  });

  test('dedup boundary: a differing location string does NOT merge (v1 limitation)', () => {
    // Same posting, but RemoteOK reports the location as "Bangalore (Remote-friendly)".
    // Exact-match dedup treats this as a distinct posting. This is the known,
    // deliberate v1 boundary — near-duplicate matching (Jaccard/Levenshtein on the
    // normalized triple) is the documented v2 extension, not an accidental bug.
    const strictLocation = computeDedupeHash(
      normalizeTitle('Software Development Engineer I'),
      'ExampleCorp',
      'Bangalore'
    );
    const looseLocation = computeDedupeHash(
      normalizeTitle('SDE 1 - Backend'),
      'ExampleCorp',
      'Bangalore (Remote-friendly)'
    );

    expect(strictLocation).not.toBe(looseLocation);
  });

  test('re-running the same source produces the same hash (idempotent ingestion)', () => {
    const first = computeDedupeHash(normalizeTitle('SDE Intern'), 'ExampleCorp', 'Bangalore');
    const second = computeDedupeHash(normalizeTitle('SDE Intern'), 'ExampleCorp', 'Bangalore');
    expect(first).toBe(second);
  });
});
