'use strict';

/**
 * Shared text-cleaning helpers applied to raw strings arriving from external
 * sources, before anything downstream (dedup hashing, skill extraction, storage)
 * sees them.
 *
 * These live in the normalization module rather than inside a single fetcher
 * because the problems they fix are not specific to one API — any source can send
 * HTML-encoded or badly-encoded text, and every source's output flows through the
 * same normalization stage.
 *
 * Note: every non-ASCII character in this file is written as a \u escape on
 * purpose. These helpers exist to deal with encoding damage, so the code that
 * detects it must not itself depend on how this file happens to be saved.
 */

// Lead bytes of a UTF-8 sequence when misread as Latin-1: U+00C2, U+00C3, and
// U+00E2-U+00E5 (covering the 2- and 3-byte sequences these sources produce).
// Followed by a continuation byte in the U+0080-U+00BF range.
const MOJIBAKE_PATTERN = /[ÂÃâ-å][-¿]/;

// U+FFFD, the Unicode replacement character.
const REPLACEMENT_CHAR = '�';

// How much of a repaired string may be undecodable before the repair is rejected.
// Sources sometimes truncate a field at a fixed byte length, slicing a multi-byte
// character in half; that damages one or two characters at the cut point while the
// rest of the string decodes perfectly. A small allowance recovers those strings.
// A high proportion of replacement characters means something else is going on and
// the reinterpretation should not be trusted at all.
const MAX_UNDECODABLE_RATIO = 0.1;

/**
 * repairMojibake — repairs text that was UTF-8 encoded and then decoded as Latin-1.
 *
 * The failure looks like this: a curly apostrophe (U+2019) is three bytes in UTF-8,
 * `E2 80 99`. If something reads those bytes one at a time as Latin-1, it produces
 * three separate characters, so "Heart's Content" arrives as "Heart<U+00E2><U+0080><U+0099>s Content".
 *
 * Importantly this is NOT a bug in how we read the response — RemoteOK serves text
 * that is already in this state, so fetching the raw bytes and decoding them
 * correctly as UTF-8 reproduces it exactly. The damage happened upstream, and this
 * is the only remaining place to fix it.
 *
 * The repair is the inverse operation: reinterpret each character as one Latin-1
 * byte, then decode that byte sequence as UTF-8.
 *
 * Why it is guarded rather than applied unconditionally:
 *   1. MOJIBAKE_PATTERN requires a lead character followed by a continuation-range
 *      character. Ordinary accented text — "Café", "Zürich", "Peña" — does not
 *      match that shape, so it is left untouched.
 *   2. If the round trip produces U+FFFD, the byte sequence was not valid UTF-8
 *      after all, so the original is returned. A failed repair is never worse
 *      than no repair.
 *
 * Deliberately not handled: text double-encoded more than once. Looping until the
 * output stops changing would risk mangling text that legitimately contains these
 * characters, and a single pass covers everything observed from these sources.
 *
 * @param {string} str
 * @returns {string} the repaired string, or the original if no safe repair applies
 */
function repairMojibake(str) {
  if (!str || typeof str !== 'string') return '';

  if (!MOJIBAKE_PATTERN.test(str)) return str;

  const repaired = Buffer.from(str, 'latin1').toString('utf8');

  const undecodable = (repaired.match(/�/g) || []).length;
  if (undecodable === 0) return repaired;

  // Some replacement characters appeared. This is usually a source that truncated
  // the field mid-character: the bytes before the cut decode correctly and only the
  // severed character is lost. Those bytes are gone either way — declining the
  // repair does not recover them, it just leaves the whole string unreadable — so
  // the decoded form is kept and the dead characters dropped, provided they are a
  // small minority. Above the threshold the reinterpretation is not trustworthy and
  // the original is returned untouched.
  if (undecodable / repaired.length > MAX_UNDECODABLE_RATIO) return str;

  return repaired.split(REPLACEMENT_CHAR).join('');
}

/**
 * decodeEntities — converts the HTML entities some sources embed in text fields
 * back into plain characters.
 *
 * A company genuinely called "Alexander & Bebout" can arrive as
 * "Alexander &amp; Bebout". Left undecoded this is not merely cosmetic: the company
 * name is stored verbatim and normalised into the dedup key, so the same employer
 * could land under two spellings depending on whether a given posting happened to
 * contain an entity.
 *
 * Only the five predefined XML entities plus &nbsp; and numeric references are
 * handled — that is the full set observed from these sources, and a complete HTML
 * entity table would be a dependency for no additional benefit here.
 *
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // &amp; must be decoded LAST, so that an input like "&amp;lt;" decodes to the
    // literal text "&lt;" rather than being re-decoded into a "<" character.
    .replace(/&amp;/gi, '&');
}

/**
 * cleanExternalText — the standard cleanup applied to every text field taken from
 * an external source.
 *
 * Order matters: repair the encoding first, because a mojibake sequence can span
 * characters that an entity decode would otherwise operate on; collapse whitespace
 * last so any spacing introduced by the earlier steps is tidied up.
 *
 * @param {string} str
 * @returns {string}
 */
function cleanExternalText(str) {
  if (!str || typeof str !== 'string') return '';

  return decodeEntities(repairMojibake(str))
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { repairMojibake, decodeEntities, cleanExternalText };
