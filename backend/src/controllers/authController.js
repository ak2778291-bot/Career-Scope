'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { config } = require('../config/env');
const { createError } = require('../middleware/errorHandler');

/**
 * Generates a signed JWT for an authenticated user.
 * Payload includes only id and role — minimal surface area.
 */
function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * POST /api/auth/register
 * Creates a new USER account. Validation is handled upstream by express-validator.
 */
async function register(req, res, next) {
  try {
    const { name, email, password, targetRole } = req.body;

    // Check for existing email before creating (gives a cleaner error than the
    // Mongoose duplicate-key error, which is caught by errorHandler anyway as backup)
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return next(createError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'));
    }

    const user = await User.create({ name, email, password, targetRole });

    const token = signToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        targetRole: user.targetRole,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticates an existing user. Returns JWT on success.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // select('+password') — password field has select:false in the schema;
    // must be explicitly requested here for comparison.
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      // Use the same error message for "user not found" and "wrong password"
      // to prevent user enumeration attacks.
      return next(createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(createError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'));
    }

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        targetRole: user.targetRole,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
