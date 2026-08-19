'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for authentication endpoints only.
 *
 * Applied to /api/auth/* routes to limit brute-force attacks on login/register.
 * Not applied globally — that would unnecessarily penalise the public job search
 * and analytics endpoints which need to be fast and freely accessible.
 *
 * 15 requests per 15-minute window per IP is a common industry starting point:
 * generous enough for normal use (a student won't legitimately try to log in
 * 15 times in 15 minutes), restrictive enough to make brute-force impractical.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,  // Include rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
  },
  // Skip successful requests from the count (only count failures / all attempts)
  skipSuccessfulRequests: false,
});

/**
 * Rate limiter for the admin ingestion trigger endpoint.
 * Tighter limit — this endpoint is only called by cron or an admin manually.
 * 10 calls per hour is more than enough.
 */
const ingestionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Ingestion trigger rate limit exceeded. Maximum 10 triggers per hour.',
    },
  },
});

module.exports = { authRateLimiter, ingestionRateLimiter };
