'use strict';

const axios = require('axios');
const { config } = require('../../config/env');
const { cleanExternalText } = require('../normalization/textClean');

/**
 * Adzuna API integration.
 *
 * Documentation: https://developer.adzuna.com/docs/search
 * Free tier: 250 requests/day, no credit card required.
 *
 * Endpoint: GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
 * Params:
 *   app_id, app_key (from env), results_per_page (max 50), what (search term)
 *
 * Returns: { records: [...], errors: [...] }
 *   records: array of normalized raw job records (common schema)
 *   errors:  array of string messages for non-fatal warnings (e.g. malformed records)
 *
 * Error isolation:
 *   Any network error, timeout, or API error is caught here and returned as an error
 *   in the errors array with records = []. The caller (ingestionRunner.js) handles
 *   this gracefully — a failed source never blocks the other source.
 */

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs';
const RESULTS_PER_PAGE = 50; // Adzuna's maximum

/**
 * Fetches job postings from Adzuna and maps them to the normalized common schema.
 *
 * @returns {{ records: Array, errors: Array<string> }}
 */
async function fetchFromAdzuna() {
  const errors = [];

  // Guard: if no API credentials configured, return early with a clear message
  if (!config.adzuna.appId || !config.adzuna.appKey) {
    errors.push('Adzuna API credentials not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY missing in .env)');
    return { records: [], errors };
  }

  let rawResults = [];

  try {
    const url = `${ADZUNA_BASE}/${config.adzuna.country}/search/1`;
    const response = await axios.get(url, {
      params: {
        app_id: config.adzuna.appId,
        app_key: config.adzuna.appKey,
        results_per_page: RESULTS_PER_PAGE,
        what: config.adzuna.query,
        content_type: 'application/json',
      },
      timeout: 10000, // 10-second timeout — prevents a slow Adzuna response from blocking ingestion
    });

    rawResults = response.data?.results || [];
  } catch (err) {
    // Catch network errors, timeouts, 4xx/5xx from Adzuna
    const message = err.response
      ? `Adzuna API error ${err.response.status}: ${err.response.data?.message || err.message}`
      : `Adzuna network error: ${err.message}`;
    errors.push(message);
    return { records: [], errors };
  }

  // Map Adzuna's response schema to the normalized common schema
  const records = [];
  for (const item of rawResults) {
    try {
      // Validate minimum required fields before mapping
      if (!item.title || !item.company?.display_name) {
        errors.push(`Adzuna: skipping record with missing title or company — id: ${item.id}`);
        continue;
      }

      // Same cleanup as the RemoteOK fetcher — encoding repair, entity decoding,
      // whitespace collapse. Applied here too because these are source-agnostic
      // problems, not RemoteOK quirks: Adzuna descriptions are also HTML-derived.
      records.push({
        title: cleanExternalText(item.title),
        company: cleanExternalText(item.company.display_name),
        location: cleanExternalText(
          item.location?.display_name || item.location?.area?.join(', ') || ''
        ) || 'Remote',
        description: cleanExternalText(item.description || ''),
        postedDate: item.created ? new Date(item.created) : new Date(),
        sourceUrl: item.redirect_url || item.adref || '',
        sourceName: 'adzuna',
      });
    } catch (mapErr) {
      errors.push(`Adzuna: failed to map record id=${item?.id}: ${mapErr.message}`);
    }
  }

  return { records, errors };
}

module.exports = { fetchFromAdzuna };
