'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { register, login } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Apply rate limiter to all auth routes
router.use(authRateLimiter);

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
    body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('targetRole').optional().trim().isLength({ max: 100 }).withMessage('Target role cannot exceed 100 characters'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

module.exports = router;
