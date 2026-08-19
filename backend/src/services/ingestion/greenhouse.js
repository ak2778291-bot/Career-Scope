'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { cleanExternalText } = require('../normalization/textClean');
const { GREENHOUSE_COMPANIES } = require('../../config/scrapeTargets');

/**
 * Greenhouse job-board scraper.
 *
 * Unlike adzuna.js/remoteok.js, this source has no API key at all — individual
 * companies essentially never publish one. What they do have, if they use
 * Greenhouse as their applicant-tracking system, is a public, human-readable board
 * page at boards.greenhouse.io/{slug}. This module fetches that page's raw HTML and
 * parses it with Cheerio the same way a browser's DOM would be queried, to pull out
 * structured job records. This is genuine HTML scraping, not a JSON API call.
 *
 * (Greenhouse also exposes an undocumented per-company JSON endpoint at
 * boards-api.greenhouse.io — that endpoint was used ONLY to verify which company
 * slugs are currently live during development of config/scrapeTargets.js. It is
 * deliberately not used for ingestion here, because consuming ready-made JSON would
 * not exercise or demonstrate any HTML-parsing/scraping logic at all — the entire
 * point of this module.)
 *
 * robots.txt (boards.greenhouse.io/robots.txt) disallows only the /embed/ path;
 * the board page path used here is unrestricted.
 *
 * Scaling to many companies without many scrapers:
 *   Every company on Greenhouse renders the SAME board template — only the slug and
 *   the job data differ. So this is one scraper, parameterized by company slug, not
 *   one scraper per company. Coverage grows by adding verified slugs to
 *   config/scrapeTargets.js, not by writing new parsing code.
 *
 * Verified HTML structure (see DESIGN.md for the verification method):
 *   tr.job-post                     one row per job posting (Greenhouse's own
 *                                    board template caps this at 50 rows/company)
 *     a[href*="/jobs/"]              link to the job's detail page
 *       .body--medium                job title
 *       .body__secondary             location
 *
 * Because this targets a live third-party page rather than a versioned API, these
 * selectors can break if Greenhouse changes its board template — a deliberate,
 * documented trade-off of scraping vs. calling an API (see DESIGN.md). A parsing
 * or network failure for one company is caught and logged, never allowed to abort
 * the rest of the batch.
 *
 * Scope decision — one HTML request per company, not one per job listing:
 *   The board page above gives title + location + link for every open role in a
 *   single request. Full descriptions live on each job's own detail page; fetching
 *   those individually would multiply request volume by the total number of open
 *   roles across every configured company. Scraped records therefore carry an
 *   empty description — skill extraction naturally finds fewer matches on these
 *   jobs than on the API sources. That is a real, explainable scraping-at-scale
 *   trade-off worth naming directly if asked, not a bug.
 *
 * Returns: { records: [...], errors: [...] } — same shape as every other source.
 */

const BOARD_URL = (slug) => `https://boards.greenhouse.io/${slug}`;

// No formal crawl-delay is published for this path; staying near 1 request/second
// between companies matches the courtesy already applied to RemoteOK (remoteok.js)
// and keeps this a lightweight, well-behaved client per §9 of the spec.
const INTER_REQUEST_DELAY_MS = 800;

// Defensive ceiling on rows kept per company. Greenhouse's own board template
// already caps the rendered table at 50 rows (verified during development), so
// this rarely binds — it exists so a template change can't silently balloon one
// company's contribution to the dataset.
const MAX_JOBS_PER_COMPANY = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * parseGreenhouseBoard — pure function: HTML string -> normalized job records.
 *
 * Exported separately from the network fetch below so it can be unit-tested
 * against a fixed HTML fixture without a live network call — the same reason
 * dedup.js and skillExtractor.js are pure, testable modules.
 *
 * @param {string} html
 * @param {string} companySlug - used only as a fallback company label; the real
 *   fetcher overwrites this with the configured displayName.
 * @returns {Array}
 */
function parseGreenhouseBoard(html, companySlug) {
  const $ = cheerio.load(html);
  const records = [];

  $('tr.job-post')
    .slice(0, MAX_JOBS_PER_COMPANY)
    .each((_, row) => {
      const $row = $(row);

      // Greenhouse tags recently-posted roles with a "New" badge rendered as a
      // nested <span class="tag-container"> INSIDE the same <p> as the title text
      // — .text() on the title element without removing it first would return
      // "Senior Software Engineer, Data PlatformNew". Clone before mutating so the
      // original DOM (still needed if this element were queried again) is untouched.
      const $titleEl = $row.find('.body--medium').first().clone();
      $titleEl.find('.tag-container').remove();
      const title = cleanExternalText($titleEl.text());

      const location = cleanExternalText($row.find('.body__secondary').first().text());
      const href = $row.find('a').first().attr('href');

      // Malformed/unexpected row shape — skip it, don't throw and abort the batch.
      if (!title || !href) return;

      records.push({
        title,
        company: companySlug,
        location: location || 'Remote',
        // See file header: full descriptions are not fetched at scrape time.
        description: '',
        // The board listing page does not expose a posted date (unlike the JSON
        // API, which has updated_at) — see DESIGN.md for this documented boundary.
        postedDate: new Date(),
        sourceUrl: href,
        sourceName: 'greenhouse',
      });
    });

  return records;
}

/**
 * fetchFromGreenhouse — loops over the configured company slugs, scrapes each
 * board page, and returns { records, errors } in the same shape as every other
 * ingestion source, so ingestionRunner.js does not need to know this one scrapes
 * HTML instead of calling an API.
 *
 * @returns {Promise<{ records: Array, errors: Array<string> }>}
 */
async function fetchFromGreenhouse() {
  const errors = [];
  const records = [];

  for (let i = 0; i < GREENHOUSE_COMPANIES.length; i++) {
    const { slug, displayName } = GREENHOUSE_COMPANIES[i];

    if (i > 0) await sleep(INTER_REQUEST_DELAY_MS);

    try {
      const response = await axios.get(BOARD_URL(slug), {
        headers: {
          // Identifies this client honestly as a student portfolio project, not as
          // a disguised or generic bot — the courtesy expected of any scraper.
          'User-Agent': 'CareerConnect-Portfolio-Project/1.0 (educational scraper; contact: student)',
        },
        timeout: 10000,
      });

      const parsed = parseGreenhouseBoard(response.data, slug).map((record) => ({
        ...record,
        company: displayName,
      }));

      if (parsed.length === 0) {
        errors.push(
          `Greenhouse: company "${slug}" returned 0 postings — board may be empty or the page layout changed`
        );
      }

      records.push(...parsed);
    } catch (err) {
      // Per-company failure isolation: one company's page failing (404, timeout,
      // network error) never blocks the rest of the batch — the same isolation
      // principle applied per-source in ingestionRunner.js, one level deeper here.
      const message = err.response
        ? `Greenhouse: company "${slug}" HTTP ${err.response.status}`
        : `Greenhouse: company "${slug}" network error: ${err.message}`;
      errors.push(message);
    }
  }

  return { records, errors };
}

module.exports = { fetchFromGreenhouse, parseGreenhouseBoard };
