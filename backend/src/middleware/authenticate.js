'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

/**
 * authenticate — answers "who is this request from?"
 *
 * Verifies the JWT sent in the Authorization header.
 * On success, attaches { id, role } to req.user and calls next().
 * On failure, returns a structured 401 — never calls next() with an error
 * so the error handler isn't invoked for auth failures (they are expected
 * control-flow, not unexpected errors).
 *
 * Design note:
 *   This middleware is authentication ONLY. Whether the authenticated user
 *   is allowed to perform the requested action is a separate concern handled
 *   by authorize.js, applied as a second middleware in the route chain.
 *   Keeping these two concerns separate makes it easy to add new roles or
 *   change authorization rules without touching authentication logic.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'MISSING_TOKEN',
        message: 'Authentication token required. Include "Authorization: Bearer <token>" in the request header.',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    // Attach only what downstream middleware/controllers need
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired. Please log in again.',
        },
      });
    }
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token.',
      },
    });
  }
};

module.exports = { authenticate };
