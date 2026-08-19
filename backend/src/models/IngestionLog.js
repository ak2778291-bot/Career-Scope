'use strict';

const mongoose = require('mongoose');

/**
 * IngestionLog collection — one document per source per ingestion run.
 *
 * Written by ingestionRunner.js after each source completes (or fails).
 * Per-source logging means a failure in one source produces its own error
 * log entry without affecting the success log of the other source.
 *
 * Used by:
 *   - The admin panel to show ingestion history
 *   - Resume/interview defence: "I can show the pipeline actually ran and
 *     what it processed" — not a theoretical claim
 */
const ingestionLogSchema = new mongoose.Schema({
  runAt: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    required: true,
    enum: ['adzuna', 'remoteok', 'greenhouse', 'lever', 'seed'],
  },
  recordsFetched: {
    type: Number,
    default: 0,
  },
  recordsInserted: {
    type: Number,
    default: 0,
  },
  recordsDeduplicated: {
    type: Number,
    default: 0,
  },
  /**
   * errors — array of string messages for non-fatal errors during this run
   * (e.g. malformed records, failed skill extractions).
   * A source-level fatal error (network down, auth failure) still produces
   * a log entry — just with errors[] populated and counts at 0.
   */
  errors: [{ type: String }],
  durationMs: {
    type: Number,
  },
  triggeredBy: {
    type: String,
    enum: ['cron', 'admin', 'seed'],
    default: 'cron',
  },
}, {
  // `errors` shadows a Mongoose-internal document property, which otherwise prints
  // a warning on every startup. It is safe as used here: these documents are only
  // created from plain objects and read back with .lean(), so the internal property
  // is never consulted on a hydrated document. The field name is kept because it is
  // what the API response and admin UI already use — renaming it would make the
  // meaning less obvious purely to silence a warning that does not apply.
  suppressReservedKeysWarning: true,
});

// Index for fetching recent logs efficiently (admin panel default sort)
ingestionLogSchema.index({ runAt: -1 });

module.exports = mongoose.model('IngestionLog', ingestionLogSchema);
