'use strict';

/**
 * Unit tests for external-text cleanup.
 *
 * These run on the raw strings arriving from job APIs, before the text reaches the
 * dedup hash, the skill extractor, or storage. The risk being tested for is not
 * cosmetic: a company name that is cleaned inconsistently normalises into two
 * different dedup keys, which splits one employer into two.
 *
 * The most important tests here are the negative ones — legitimately accented text
 * must survive untouched.
 */

const { repairMojibake, decodeEntities, cleanExternalText } = require('../src/services/normalization/textClean');

// Build the damaged form explicitly from its byte values rather than pasting the
// characters, so these tests do not depend on this file's own encoding.
const CURLY_APOSTROPHE_AS_LATIN1 = String.fromCharCode(0xE2, 0x80, 0x99);
const BROKEN = `Heart${CURLY_APOSTROPHE_AS_LATIN1}s Content`;
const FIXED = 'Heart’s Content';

describe('repairMojibake', () => {
  test('repairs UTF-8 text that was decoded as Latin-1', () => {
    expect(repairMojibake(BROKEN)).toBe(FIXED);
  });

  test('leaves legitimately accented text untouched', () => {
    // These are the false positives that a careless implementation would corrupt.
    const safe = ['Café', 'Zürich', 'Peña', 'São Paulo', 'München'];
    safe.forEach(s => expect(repairMojibake(s)).toBe(s));
  });

  test('leaves plain ASCII untouched', () => {
    expect(repairMojibake('Bengaluru')).toBe('Bengaluru');
    expect(repairMojibake('Software Engineer')).toBe('Software Engineer');
  });

  test('returns the original when too much of the reinterpretation is undecodable', () => {
    // A lead character followed by a continuation character, but not a valid
    // sequence. The undecodable proportion is far above the threshold, so the
    // guard must decline rather than emit replacement characters.
    const notUtf8 = `A${String.fromCharCode(0xE2, 0x80)}Z`;
    const out = repairMojibake(notUtf8);
    expect(out).toBe(notUtf8);
    expect(out).not.toContain('�');
  });

  test('recovers a long string that the source truncated mid-character', () => {
    // Sources cut fields at a fixed byte length, slicing a multi-byte character in
    // half. The bytes before the cut decode fine; only the severed character is
    // lost — and it is lost either way, so the readable form is kept.
    const japanese = '生産推進_建設業務設計';
    const utf8 = Buffer.from(japanese, 'utf8');
    // Drop the final byte, then mis-decode the result as Latin-1 (what the source did).
    const damaged = utf8.subarray(0, utf8.length - 1).toString('latin1');

    const out = repairMojibake(damaged);

    expect(out).toBe('生産推進_建設業務設');
    expect(out).not.toContain('�');
  });

  test('never returns a string containing replacement characters', () => {
    const samples = [
      BROKEN,
      'Café',
      `A${String.fromCharCode(0xE2, 0x80)}Z`,
      Buffer.from('生産推進', 'utf8').subarray(0, 7).toString('latin1'),
    ];
    samples.forEach(s => expect(repairMojibake(s)).not.toContain('�'));
  });

  test('handles empty and non-string input', () => {
    expect(repairMojibake('')).toBe('');
    expect(repairMojibake(null)).toBe('');
    expect(repairMojibake(undefined)).toBe('');
    expect(repairMojibake(42)).toBe('');
  });
});

describe('decodeEntities', () => {
  test('decodes the named entities these sources emit', () => {
    expect(decodeEntities('Alexander &amp; Bebout')).toBe('Alexander & Bebout');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"');
    expect(decodeEntities('it&#39;s')).toBe("it's");
  });

  test('decodes numeric and hex references', () => {
    expect(decodeEntities('&#72;&#105;')).toBe('Hi');
    expect(decodeEntities('&#x48;&#x69;')).toBe('Hi');
  });

  test('decodes &amp; last so double-encoded input is not over-decoded', () => {
    // "&amp;lt;" means the literal text "&lt;", NOT a "<" character.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  test('handles empty and non-string input', () => {
    expect(decodeEntities('')).toBe('');
    expect(decodeEntities(null)).toBe('');
  });
});

describe('cleanExternalText', () => {
  test('repairs encoding, decodes entities, and collapses whitespace together', () => {
    expect(cleanExternalText(`  H&amp;M   ${BROKEN} `)).toBe(`H&M ${FIXED}`);
  });

  test('a company name cleans to one stable form regardless of encoding damage', () => {
    // The point of the whole module: both spellings must converge, or the same
    // employer splits across two dedup keys.
    expect(cleanExternalText('Alexander &amp; Bebout, Inc.')).toBe('Alexander & Bebout, Inc.');
  });

  test('handles empty and non-string input', () => {
    expect(cleanExternalText('')).toBe('');
    expect(cleanExternalText(null)).toBe('');
  });
});
