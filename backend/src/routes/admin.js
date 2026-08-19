'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const {
  triggerIngestion,
  getIngestionLogs,
  allowIngestionSecret,
} = require('../controllers/adminController');
const {
  createSkill,
  updateSkill,
  deleteSkill,
} = require('../controllers/skillController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ingestionRateLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

const router = Router();

/**
 * POST /api/admin/trigger-ingestion
 *
 * Dual-auth route: accepts either:
 *   (a) JWT with ADMIN role  — for manual trigger from admin UI
 *   (b) X-Ingestion-Secret header — for external cron trigger
 *
 * allowIngestionSecret runs first. If the cron secret matches, req.cronAuthenticated
 * is set to true. The subsequent authenticate + authorize middleware only runs if
 * cronAuthenticated is not set, so we need the OR guard below.
 */
router.post(
  '/trigger-ingestion',
  ingestionRateLimiter,
  allowIngestionSecret,
  (req, res, next) => {
    // If authenticated by cron secret, skip JWT auth
    if (req.cronAuthenticated) return next();
    authenticate(req, res, next);
  },
  (req, res, next) => {
    // If authenticated by cron secret, skip role check
    if (req.cronAuthenticated) return next();
    authorize('ADMIN')(req, res, next);
  },
  triggerIngestion
);

// Remaining admin routes — require JWT + ADMIN role
router.use(authenticate, authorize('ADMIN'));

router.get('/ingestion-logs', getIngestionLogs);

router.post(
  '/skills',
  [
    body('name').trim().notEmpty().withMessage('Skill name is required').isLength({ max: 100 }),
    body('aliases').optional().isArray().withMessage('aliases must be an array'),
    body('category').optional().trim().isLength({ max: 50 }),
  ],
  validate,
  createSkill
);

router.put(
  '/skills/:id',
  [
    param('id').isMongoId().withMessage('Invalid skill ID'),
    body('name').optional().trim().notEmpty().withMessage('Skill name cannot be empty'),
    body('aliases').optional().isArray().withMessage('aliases must be an array'),
    body('category').optional().trim(),
  ],
  validate,
  updateSkill
);

router.delete(
  '/skills/:id',
  [param('id').isMongoId().withMessage('Invalid skill ID')],
  validate,
  deleteSkill
);

module.exports = router;
