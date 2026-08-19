'use strict';

const axios = require('axios');
const { config } = require('../../config/env');
const { cleanExternalText } = require('../normalization/textClean');

/**
 * RemoteOK API integration.
 *
 * Documentation: https://remoteok.com/api
 * No authentication required — public JSON endpoint.
 * Rate limit: unofficial, but 1 request per second is safe.
 *
 * Endpoint: GET https://remoteok.com/api?tag=dev
 * Note: The first element of the response array is a metadata object, not a job.
 *       Filter it out by checking for the presence of an 'id' field.
 *
 * IMPORTANT — one request per tag, not one request with many tags:
 *   RemoteOK's `tag` parameter accepts a SINGLE tag. Passing a comma-separated
 *   list (`?tag=dev,backend`) does not mean "dev OR backend" — it is treated as
 *   one literal tag name, matches nothing, and returns a 200 response containing
 *   only the legal-notice element. That is the worst kind of failure: a silent
 *   zero-record success that logs no error and looks exactly like "there were no
 *   new jobs today". So each configured tag is fetched in its own request and the
 *   results are merged here, de-duplicated on RemoteOK's own post id (a job
 *   tagged both 'dev' and 'backend' comes back from both calls).
 *
 * Returns: { records: [...], errors: [...] }
 */

const REMOTEOK_URL = 'https://remoteok.com/api';

// Small pause between per-tag requests. RemoteOK publishes no formal rate limit;
// staying near 1 request/second is the commonly respected courtesy, and §9 of the
// spec requires respecting each source's limits and terms of use.
const INTER_REQUEST_DELAY_MS = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches job postings from RemoteOK and maps them to the normalized common schema.
 *
 * @returns {{ records: Array, errors: Array<string> }}
 */
async function fetchFromRemoteOK() {
  const errors = [];

  // Fall back to the single 'dev' tag if configuration left the list empty,
  // rather than issuing an untagged request that pulls the entire board.
  const tags = (config.remoteok.tags || []).filter(Boolean);
  const tagsToFetch = tags.length > 0 ? tags : ['dev'];

  // Keyed by RemoteOK post id so the same job appearing under two tags is counted
  // once. This is source-local de-duplication and is deliberately separate from
  // the cross-source dedup in services/dedup — that one still runs downstream.
  const byId = new Map();

  for (let i = 0; i < tagsToFetch.length; i++) {
    const tag = tagsToFetch[i];

    if (i > 0) await sleep(INTER_REQUEST_DELAY_MS);

    try {
      const response = await axios.get(REMOTEOK_URL, {
        params: { tag },
        headers: {
          // RemoteOK recommends setting a User-Agent to identify scrapers
          'User-Agent': 'CareerConnect-Aggregator/1.0 (portfolio project; contact: student)',
        },
        timeout: 10000,
      });

      // RemoteOK response is an array; the first element is always a metadata/legal
      // notice object (no 'id' field). Filter it out before processing.
      const items = (Array.isArray(response.data) ? response.data : []).filter(item => item.id);

      if (items.length === 0) {
        // Surface the empty result explicitly. Without this the ingestion log would
        // show a clean run with zero records and give no hint that a tag is wrong.
        errors.push(`RemoteOK: tag "${tag}" returned no postings — check that it is a valid RemoteOK tag`);
      }

      for (const item of items) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    } catch (err) {
      // One failing tag must not lose the postings already collected from the others —
      // the same isolation principle applied per-source in ingestionRunner.js.
      const message = err.response
        ? `RemoteOK API error ${err.response.status} for tag "${tag}": ${err.message}`
        : `RemoteOK network error for tag "${tag}": ${err.message}`;
      errors.push(message);
    }
  }

  const rawResults = [...byId.values()];

  const records = [];
  for (const item of rawResults) {
    try {
      if (!item.position || !item.company) {
        errors.push(`RemoteOK: skipping record with missing position or company — id: ${item.id}`);
        continue;
      }

      // RemoteOK date: 'date' field is an ISO string or epoch seconds
      let postedDate = new Date();
      if (item.date) {
        const parsed = new Date(item.date);
        if (!isNaN(parsed.getTime())) postedDate = parsed;
      } else if (item.epoch) {
        postedDate = new Date(item.epoch * 1000);
      }

      // Location: RemoteOK jobs are remote by default; include any location hint if provided.
      // Trailing separators are common in RemoteOK's location strings ("Cammeray, ").
      const rawLocation = cleanExternalText(item.location).replace(/[,\s]+$/, '').trim();
      const location = rawLocation !== '' ? rawLocation : 'Remote';

      // Description: RemoteOK provides an HTML description. Strip tags FIRST, then
      // run the shared cleanup — in this order an encoded "&lt;script&gt;" in the
      // original text decodes to literal "<script>" text rather than becoming a tag
      // that the strip step has already walked past.
      const description = cleanExternalText(
        (item.description || '').replace(/<[^>]+>/g, ' ')
      );

      records.push({
        title: cleanExternalText(item.position),
        company: cleanExternalText(item.company),
        location,
        description,
        postedDate,
        sourceUrl: item.url || `https://remoteok.com/l/${item.id}`,
        sourceName: 'remoteok',
      });
    } catch (mapErr) {
      errors.push(`RemoteOK: failed to map record id=${item?.id}: ${mapErr.message}`);
    }
  }

  return { records, errors };
}

module.exports = { fetchFromRemoteOK };
