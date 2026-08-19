'use strict';

/**
 * Centralized error handler — Express's four-argument error middleware.
 *
 * All routes call next(err) or next(createError(...)) to land here.
 * Every failure mode from §8 of the spec produces a response in this shape:
 *
 *   { "error": { "code": "STRING_CODE", "message": "Human-readable message." } }
 *
 * Keeping error formatting in one place means:
 *   - All API consumers get consistent error shapes
 *   - Adding a new error type requires one change here, not N changes in controllers
 *   - Logging happens in one place
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Always log to server console (structured enough for Render log streaming)
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // ── Mongoose validation error ──────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: messages.join('. ') },
    });
  }

  // ── MongoDB duplicate key ──────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      error: { code: 'DUPLICATE_ENTRY', message: `A record with that ${field} already exists.` },
    });
  }

  // ── Mongoose CastError (invalid ObjectId) ─────────────────────────────────
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid resource identifier format.' },
    });
  }

  // ── JWT errors (shouldn't reach here if authenticate.js is correct, ────────
  //    but guard for belt-and-suspenders safety)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token.' },
    });
  }

  // ── Custom application errors created by createError() ───────────────────
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: { code: err.code || 'APPLICATION_ERROR', message: err.message },
    });
  }

  // ── Default: unexpected 500 ───────────────────────────────────────────────
  // Never expose internal error details in production
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'An unexpected error occurred. Please try again later.';

  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message },
  });
};

/**
 * Factory for typed application errors.
 * Usage: next(createError(404, 'JOB_NOT_FOUND', 'The requested job posting does not exist.'))
 *
 * @param {number} statusCode - HTTP status code
 * @param {string} code       - Machine-readable error code (SCREAMING_SNAKE_CASE)
 * @param {string} message    - Human-readable error message
 */
const createError = (statusCode, code, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

module.exports = { errorHandler, createError };
