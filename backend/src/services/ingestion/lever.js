'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { cleanExternalText } = require('../normalization/textClean');
const { LEVER_COMPANIES } = require('../../config/scrapeTargets');

/**
 * Lever job-board scraper.
 *
 * Second scraped source, alongside greenhouse.js. Lever is a different applicant-
 * tracking platform with its own board template at jobs.lever.co/{slug} — a
 * separate parser is needed because the HTML shape is unrelated to Greenhouse's,
 * even though both fill the same "one template scraper, many companies" role in
 * the pipeline (see greenhouse.js for that scaling rationale in full).
 *
 * robots.txt (jobs.lever.co/robots.txt) has a general
 *   User-agent: * / Allow: / / Crawl-delay: 1
 * entry permitting scraping, alongside separate named-bot disallow entries
 * (GPTBot, ClaudeBot, CCBot, etc.) that target AI-training/AI-crawler identities
 * specifically — not a script identifying itself honestly with its own descriptive
 * User-Agent, as this one does below. This module respects the general 1-second
 * crawl delay.
 *
 * Verified HTML structure (see DESIGN.md for the verification method):
 *   .posting                        one div per job posting (Lever renders every
 *                                    open role server-side, unlike Greenhouse's
 *                                    50-row cap — see MAX_JOBS_PER_COMPANY below)
 *     a.posting-title[href]          link to the job's detail/apply page
 *       h5[data-qa="posting-name"]   job title
 *     .posting-categories .location  location
 *
 * Same scope decision as greenhouse.js: one HTML request per company (not per
 * listing), so scraped records carry an empty description — see greenhouse.js's
 * file header for the full reasoning, which applies identically here.
 *
 * Returns: { records: [...], errors: [...] } — same shape as every other source.
 */

const BOARD_URL = (slug) => `https://jobs.lever.co/${slug}`;

// Matches Lever's own published Crawl-delay: 1 in robots.txt.
const INTER_REQUEST_DELAY_MS = 1000;

// Lever does not cap its rendered board (verified: one company returned 308 rows
// in a single page during development) — this ceiling exists to keep one large
// company's postings from dominating the aggregated dataset. Companies are
// visited in the order configured in scrapeTargets.js, so this keeps a mix of
// employers represented rather than one company's full catalog.
const MAX_JOBS_PER_COMPANY = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * parseLeverBoard — pure function: HTML string -> normalized job records.
 * Exported separately from the network fetch so it can be unit-tested against a
 * fixed HTML fixture without a live network call.
 *
 * @param {string} html
 * @param {string} companySlug - used only as a fallback company label; the real
 *   fetcher overwrites this with the configured displayName.
 * @returns {Array}
 */
function parseLeverBoard(html, companySlug) {
  const $ = cheerio.load(html);
  const records = [];

  $('.posting')
    .slice(0, MAX_JOBS_PER_COMPANY)
    .each((_, posting) => {
      const $posting = $(posting);
      const title = cleanExternalText($posting.find('h5[data-qa="posting-name"]').first().text());
      const location = cleanExternalText($posting.find('.posting-categories .location').first().text());
      const href = $posting.find('a.posting-title').first().attr('href');

      // Malformed/unexpected posting shape — skip it, don't throw and abort the batch.
      if (!title || !href) return;

      records.push({
        title,
        company: companySlug,
        location: location || 'Remote',
        description: '', // see file header — full descriptions are not fetched at scrape time
        postedDate: new Date(), // board page does not expose a posted date, same boundary as greenhouse.js
        sourceUrl: href,
        sourceName: 'lever',
      });
    });

  return records;
}

/**
 * fetchFromLever — loops over the configured company slugs, scrapes each board
 * page, and returns { records, errors } in the same shape as every other source.
 *
 * @returns {Promise<{ records: Array, errors: Array<string> }>}
 */
async function fetchFromLever() {
  const errors = [];
  const records = [];

  for (let i = 0; i < LEVER_COMPANIES.length; i++) {
    const { slug, displayName } = LEVER_COMPANIES[i];

    if (i > 0) await sleep(INTER_REQUEST_DELAY_MS);

    try {
      const response = await axios.get(BOARD_URL(slug), {
        headers: {
          'User-Agent': 'CareerConnect-Portfolio-Project/1.0 (educational scraper; contact: student)',
        },
        timeout: 10000,
      });

      const parsed = parseLeverBoard(response.data, slug).map((record) => ({
        ...record,
        company: displayName,
      }));

      if (parsed.length === 0) {
        errors.push(
          `Lever: company "${slug}" returned 0 postings — board may be empty or the page layout changed`
        );
      }

      records.push(...parsed);
    } catch (err) {
      // Per-company failure isolation — see greenhouse.js for the same principle.
      const message = err.response
        ? `Lever: company "${slug}" HTTP ${err.response.status}`
        : `Lever: company "${slug}" network error: ${err.message}`;
      errors.push(message);
    }
  }

  return { records, errors };
}

module.exports = { fetchFromLever, parseLeverBoard };
