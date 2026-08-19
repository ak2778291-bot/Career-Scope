'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const {
  getProfile,
  updateProfile,
  upsertUserSkill,
  removeUserSkill,
  getSkillGap,
  getRoadmap,
} = require('../controllers/userController');
const { authenticate } = require('../middleware/authenticate');
const { validate } = require('../middleware/validate');

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/me/profile', getProfile);

router.put(
  '/me/profile',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 100 }),
    body('targetRole').optional().trim().isLength({ max: 100 }),
  ],
  validate,
  updateProfile
);

router.post(
  '/me/skills',
  [
    body('skillId').notEmpty().withMessage('skillId is required').isMongoId().withMessage('Invalid skill ID'),
    body('proficiency').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('proficiency must be beginner, intermediate, or advanced'),
    body('status').optional().isIn(['learning', 'proficient', 'expert']).withMessage('status must be learning, proficient, or expert'),
  ],
  validate,
  upsertUserSkill
);

router.delete(
  '/me/skills/:skillId',
  [
    param('skillId').isMongoId().withMessage('Invalid skill ID'),
  ],
  validate,
  removeUserSkill
);

router.get('/me/skill-gap', getSkillGap);
router.get('/me/roadmap', getRoadmap);

module.exports = router;
