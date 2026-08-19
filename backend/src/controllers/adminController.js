'use strict';

const { runIngestion } = require('../services/ingestion/ingestionRunner');
const IngestionLog = require('../models/IngestionLog');
const { config } = require('../config/env');

/**
 * POST /api/admin/trigger-ingestion
 *
 * Manually triggers an ingestion run. Called by:
 *   - Admin UI (authenticated ADMIN user)
 *   - External cron trigger (Render Cron Job / cron-job.org)
 *
 * Authentication:
 *   - If the request carries a valid JWT with ADMIN role → authorized.
 *   - If the request carries the INGESTION_SECRET header → also authorized.
 *     This allows the external cron trigger to call the endpoint without needing
 *     a user JWT, using the shared secret configured in .env.
 *   - Both paths produce the same ingestion run — the triggeredBy field distinguishes them.
 *
 * Design note on scheduling:
 *   This endpoint is the single entry point for ALL ingestion runs (manual + scheduled).
 *   The scheduler is external (Render Cron Job or cron-job.org hitting this URL every 6h),
 *   NOT an in-process node-cron timer. See DESIGN.md for the full rationale.
 */
async function triggerIngestion(req, res, next) {
  try {
    // Determine how this was triggered
    const triggeredBy = req.user ? 'admin' : 'cron';

    console.log(`[Admin] Ingestion triggered — by: ${triggeredBy}`);

    // Run ingestion asynchronously — respond immediately with 202 Accepted
    // so the HTTP request doesn't time out on slow sources.
    res.status(202).json({
      message: 'Ingestion run started.',
      triggeredBy,
    });

    // Run AFTER response is sent (fire-and-forget with logging)
    runIngestion(triggeredBy).then(results => {
      console.log('[Admin] Ingestion run complete:', JSON.stringify(results.map(r => ({
        source: r.source,
        inserted: r.recordsInserted,
        deduped: r.recordsDeduplicated,
        errors: r.errors.length,
      }))));
    }).catch(err => {
      console.error('[Admin] Ingestion run failed:', err.message);
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/ingestion-logs
 * Returns recent ingestion logs. Admin only.
 */
async function getIngestionLogs(req, res, next) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const logs = await IngestionLog.find()
      .sort({ runAt: -1 })
      .limit(limit)
      .lean();

    res.json({ logs });
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware to allow ingestion endpoint access via INGESTION_SECRET header.
 * Used by external cron triggers that can't carry a user JWT.
 * Applied before authenticate/authorize on the trigger route.
 */
function allowIngestionSecret(req, res, next) {
  const secret = req.headers['x-ingestion-secret'];
  if (config.ingestionSecret && secret === config.ingestionSecret) {
    // Mark as cron-authenticated — bypass JWT check
    req.cronAuthenticated = true;
    return next();
  }
  // Fall through to normal JWT auth
  next();
}

module.exports = { triggerIngestion, getIngestionLogs, allowIngestionSecret };
