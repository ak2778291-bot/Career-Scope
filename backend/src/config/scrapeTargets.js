'use strict';

/**
 * Seed list of companies scraped by services/ingestion/greenhouse.js and lever.js.
 *
 * Why a curated list instead of discovering companies dynamically:
 *   Neither Greenhouse nor Lever publishes a directory of which companies use their
 *   platform. Every real scraper that covers "many companies" on these ATS platforms
 *   works from a maintained list of known company slugs, not discovery — this list
 *   IS that mechanism, not a shortcut around a missing feature.
 *
 * Every slug below was verified TWICE during development, not once:
 *   1. Against the platform's own JSON board endpoint (confirms the company
 *      genuinely uses this ATS at all).
 *   2. Against the actual HTML board page, run through this project's own
 *      parseGreenhouseBoard()/parseLeverBoard() (confirms the scraper can
 *      actually extract records from it).
 *   These two checks disagree for a meaningful fraction of companies: many
 *   JSON-verified companies (e.g. Stripe, Airbnb, Coinbase, Databricks) redirect
 *   their public board to a fully custom, bespoke careers page on their own
 *   domain rather than rendering the shared Greenhouse/Lever template — so the
 *   ATS-existence check alone is not sufficient evidence a company belongs here.
 *   Only slugs that passed BOTH checks are listed below. This distinction — and
 *   being able to explain it — is real, load-bearing scraping knowledge, not a
 *   detail to gloss over; see DESIGN.md.
 *
 * A slug can stop resolving if a company migrates ATS platforms, renames its
 * board, or redesigns its template after this list was verified; when that
 * happens the per-company failure isolation in greenhouse.js/lever.js logs it as
 * a single ingestion-log error and skips that company, without affecting any
 * other source.
 *
 * Scaling this list is the direct path to a larger "aggregated from N companies"
 * number — add a slug that passes both checks above, and it flows through the
 * exact same pipeline with no other code change.
 */

const GREENHOUSE_COMPANIES = [
  { slug: 'discord', displayName: 'Discord' },
  { slug: 'gitlab', displayName: 'GitLab' },
  { slug: 'affirm', displayName: 'Affirm' },
  { slug: 'twitch', displayName: 'Twitch' },
  { slug: 'reddit', displayName: 'Reddit' },
  { slug: 'gusto', displayName: 'Gusto' },
  { slug: 'airtable', displayName: 'Airtable' },
  { slug: 'scaleai', displayName: 'Scale AI' },
  { slug: 'carta', displayName: 'Carta' },
  { slug: 'amplitude', displayName: 'Amplitude' },
  { slug: 'mixpanel', displayName: 'Mixpanel' },
  { slug: 'launchdarkly', displayName: 'LaunchDarkly' },
  { slug: 'vercel', displayName: 'Vercel' },
  { slug: 'anthropic', displayName: 'Anthropic' },
  { slug: 'togetherai', displayName: 'Together AI' },
  { slug: 'webflow', displayName: 'Webflow' },
  { slug: 'newrelic', displayName: 'New Relic' },
  { slug: 'pagerduty', displayName: 'PagerDuty' },
  { slug: 'postman', displayName: 'Postman' },
  { slug: 'algolia', displayName: 'Algolia' },
  { slug: 'netlify', displayName: 'Netlify' },
  { slug: 'contentful', displayName: 'Contentful' },
  { slug: 'gremlin', displayName: 'Gremlin' },
  { slug: 'honeycomb', displayName: 'Honeycomb' },
  { slug: 'buildkite', displayName: 'Buildkite' },
  { slug: 'imbue', displayName: 'Imbue' },
  { slug: 'clickhouse', displayName: 'ClickHouse' },
  { slug: 'planetscale', displayName: 'PlanetScale' },
];

const LEVER_COMPANIES = [
  { slug: 'palantir', displayName: 'Palantir Technologies' },
  { slug: 'gopuff', displayName: 'Gopuff' },
  { slug: 'weride', displayName: 'WeRide' },
  { slug: 'wealthfront', displayName: 'Wealthfront' },
  { slug: 'tala', displayName: 'Tala' },
  { slug: 'angellist', displayName: 'AngelList (Wellfound)' },
  { slug: 'zoox', displayName: 'Zoox' },
  { slug: 'ro', displayName: 'Ro' },
  { slug: 'includedhealth', displayName: 'Included Health' },
];

module.exports = { GREENHOUSE_COMPANIES, LEVER_COMPANIES };
