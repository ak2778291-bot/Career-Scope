'use strict';

const fs = require('fs');
const path = require('path');
const { parseLeverBoard } = require('../src/services/ingestion/lever');

/**
 * Unit tests for the Lever scraper's HTML-parsing logic.
 *
 * Mirrors greenhouse.test.js: parseLeverBoard() is tested against a real board
 * page saved as a fixture (jobs.lever.co/palantir, captured during development),
 * with no network call, proving the DOM-parsing logic is correct on its own.
 */

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'lever-board.html'),
  'utf8'
);

describe('parseLeverBoard', () => {
  const records = parseLeverBoard(fixtureHtml, 'palantir');

  test('extracts more than zero records from a real board page', () => {
    expect(records.length).toBeGreaterThan(0);
  });

  test('never returns more than the 40-row ceiling, even though this company has 300+ live postings', () => {
    // The fixture company (Palantir) has 308 postings server-rendered in one page —
    // this proves MAX_JOBS_PER_COMPANY actually caps output rather than just
    // documenting an intention.
    expect(records.length).toBeLessThanOrEqual(40);
  });

  test('every record has the common-schema fields populated', () => {
    for (const record of records) {
      expect(typeof record.title).toBe('string');
      expect(record.title.length).toBeGreaterThan(0);
      expect(typeof record.location).toBe('string');
      expect(record.location.length).toBeGreaterThan(0);
      expect(record.sourceUrl).toMatch(/^https:\/\/jobs\.lever\.co\/palantir\//);
      expect(record.sourceName).toBe('lever');
      expect(record.postedDate).toBeInstanceOf(Date);
    }
  });

  test('description is intentionally empty for scraped records (documented boundary)', () => {
    for (const record of records) {
      expect(record.description).toBe('');
    }
  });

  test('extracts a known job title exactly from the fixture', () => {
    expect(records[0].title).toBe('Administrative Business Partner');
    expect(records[0].location).toBe('London, United Kingdom');
  });

  test('malformed postings (no title, no link) are skipped rather than throwing', () => {
    const malformedHtml = `
      <div class="posting"><a class="posting-title" href="/x/1"><h5 data-qa="posting-name"></h5></a></div>
      <div class="posting"></div>
      <div class="posting">
        <a class="posting-title" href="/x/2">
          <h5 data-qa="posting-name">Real Job</h5>
          <div class="posting-categories"><span class="location">Remote</span></div>
        </a>
      </div>
    `;
    const parsed = parseLeverBoard(malformedHtml, 'testco');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Real Job');
  });

  test('empty/unexpected HTML produces an empty array, not a throw', () => {
    expect(parseLeverBoard('<html><body>No jobs here</body></html>', 'testco')).toEqual([]);
    expect(parseLeverBoard('', 'testco')).toEqual([]);
  });
});
