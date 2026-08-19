'use strict';

const fs = require('fs');
const path = require('path');
const { parseGreenhouseBoard } = require('../src/services/ingestion/greenhouse');

/**
 * Unit tests for the Greenhouse scraper's HTML-parsing logic.
 *
 * These test parseGreenhouseBoard() — the pure function — against a real board
 * page saved as a fixture (boards.greenhouse.io/discord, captured during
 * development). No network call is made; this proves the DOM-parsing logic
 * itself is correct, independent of whether the live site is reachable.
 *
 * The fixture is a genuine snapshot, not hand-written HTML, so it also pins the
 * "New" badge edge case discovered while building this: Greenhouse nests a
 * <span class="tag-container">New</span> INSIDE the title element for
 * recently-posted roles, which would otherwise leak into the extracted title.
 */

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'greenhouse-board.html'),
  'utf8'
);

describe('parseGreenhouseBoard', () => {
  const records = parseGreenhouseBoard(fixtureHtml, 'discord');

  test('extracts more than zero records from a real board page', () => {
    expect(records.length).toBeGreaterThan(0);
  });

  test('never returns more than the 50-row ceiling', () => {
    expect(records.length).toBeLessThanOrEqual(50);
  });

  test('every record has the common-schema fields populated', () => {
    for (const record of records) {
      expect(typeof record.title).toBe('string');
      expect(record.title.length).toBeGreaterThan(0);
      expect(typeof record.location).toBe('string');
      expect(record.location.length).toBeGreaterThan(0);
      expect(record.sourceUrl).toMatch(/^https:\/\/job-boards\.greenhouse\.io\//);
      expect(record.sourceName).toBe('greenhouse');
      expect(record.postedDate).toBeInstanceOf(Date);
    }
  });

  test('description is intentionally empty for scraped records (documented boundary)', () => {
    // See greenhouse.js file header: full descriptions live on a per-job detail
    // page that this scraper deliberately does not fetch, to keep request volume
    // bounded across many companies.
    for (const record of records) {
      expect(record.description).toBe('');
    }
  });

  test('strips the "New" badge nested inside the title element', () => {
    // Regression test for the exact bug found during development: Greenhouse
    // renders <span class="tag-container">New</span> INSIDE the same <p> as the
    // title text for recently-posted roles, so a naive .text() call produced
    // "Senior Software Engineer, Data PlatformNew".
    const taggedJob = records.find((r) => r.title.startsWith('Senior Software Engineer, Data Platform'));
    expect(taggedJob).toBeDefined();
    expect(taggedJob.title).toBe('Senior Software Engineer, Data Platform');
    expect(taggedJob.title.endsWith('New')).toBe(false);
  });

  test('extracts a known job title exactly from the fixture', () => {
    expect(records[0].title).toBe('Director of Engineering, Safety');
    expect(records[0].location).toBe('San Francisco Bay Area');
  });

  test('malformed rows (no title, no link) are skipped rather than throwing', () => {
    const malformedHtml = `
      <table>
        <tr class="job-post"><td class="cell"><a href="/jobs/1"><p class="body body--medium"></p></a></td></tr>
        <tr class="job-post"><td class="cell"></td></tr>
        <tr class="job-post"><td class="cell"><a href="/jobs/2"><p class="body body--medium">Real Job</p><p class="body__secondary">Remote</p></a></td></tr>
      </table>
    `;
    const parsed = parseGreenhouseBoard(malformedHtml, 'testco');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Real Job');
  });

  test('empty/unexpected HTML produces an empty array, not a throw', () => {
    expect(parseGreenhouseBoard('<html><body>No jobs here</body></html>', 'testco')).toEqual([]);
    expect(parseGreenhouseBoard('', 'testco')).toEqual([]);
  });
});
