'use strict';

/**
 * Unit tests for role-title normalization.
 *
 * Title normalization is the input to the dedup hash, so a bug here shows up as
 * either a missed merge (two records for one posting) or — worse — a false merge
 * (two genuinely different postings collapsed into one). These tests cover both
 * directions, not just the happy path.
 */

const { normalizeTitle } = require('../src/services/normalization/titleNorm');

describe('normalizeTitle — alias mapping', () => {
  test('maps a known shorthand to its canonical form', () => {
    expect(normalizeTitle('SDE Intern')).toBe('Software Development Engineer Intern');
  });

  test('different wordings of the same role converge on one canonical title', () => {
    // This convergence is what makes cross-source deduplication work at all.
    expect(normalizeTitle('SDE 1 - Backend')).toBe('Software Development Engineer I');
    expect(normalizeTitle('Software Development Engineer I')).toBe('Software Development Engineer I');
  });

  test('is case-insensitive when matching the alias table', () => {
    expect(normalizeTitle('full stack developer')).toBe('Full Stack Developer');
    expect(normalizeTitle('FULL STACK DEVELOPER')).toBe('Full Stack Developer');
  });

  test('an unrecognised title is returned cleaned but otherwise unchanged', () => {
    expect(normalizeTitle('Quantum Compiler Architect')).toBe('Quantum Compiler Architect');
  });
});

describe('normalizeTitle — noise stripping', () => {
  test('strips recruiter noise suffixes', () => {
    expect(normalizeTitle('Data Engineer - URGENT')).toBe('Data Engineer');
    expect(normalizeTitle('Data Engineer — Apply Now!')).toBe('Data Engineer');
  });

  test('collapses whitespace and trims', () => {
    expect(normalizeTitle('   Data    Engineer   ')).toBe('Data Engineer');
  });

  test('handles empty, null, and non-string input without throwing', () => {
    expect(normalizeTitle('')).toBe('');
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
    expect(normalizeTitle(42)).toBe('');
  });
});

describe('normalizeTitle — the intern guard', () => {
  // An internship and a full-time role at the same company and location must not
  // normalize to the same title, or exact-match dedup would merge them.

  test('preserves "Intern" when the matched alias does not carry it', () => {
    expect(normalizeTitle('Frontend Engineer Intern')).toBe('Frontend Engineer Intern');
    expect(normalizeTitle('Data Engineer Intern')).toBe('Data Engineer Intern');
  });

  test('"Internship" is recognised as the same marker as "Intern"', () => {
    expect(normalizeTitle('Backend Developer Internship')).toBe('Backend Developer Intern');
  });

  test('an internship does NOT normalize to its full-time counterpart', () => {
    const intern = normalizeTitle('Frontend Engineer Intern');
    const fullTime = normalizeTitle('Frontend Engineer');
    expect(intern).not.toBe(fullTime);
  });

  test('does not double-append when the canonical form already says Intern', () => {
    expect(normalizeTitle('SDE Intern')).toBe('Software Development Engineer Intern');
    expect(normalizeTitle('Software Engineering Intern')).toBe('Software Engineer Intern');
  });

  test('"Internal" is not mistaken for "Intern"', () => {
    // Guards the word-boundary in the intern pattern — "Internal Tools Engineer"
    // is a full-time role and must not gain an "Intern" suffix.
    expect(normalizeTitle('Internal Tools Engineer')).toBe('Internal Tools Engineer');
  });
});
