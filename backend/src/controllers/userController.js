'use strict';

const User = require('../models/User');
const UserSkill = require('../models/UserSkill');
const Skill = require('../models/Skill');
const { computeGap } = require('../services/skillGap/gapEngine');
const { buildRoadmap } = require('../services/skillGap/roadmapLookup');
const { createError } = require('../middleware/errorHandler');

/**
 * GET /api/users/me/profile
 * Returns the current user's profile info.
 */
async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return next(createError(404, 'USER_NOT_FOUND', 'User not found.'));

    const userSkills = await UserSkill.find({ userId: req.user.id })
      .populate('skillId', 'name category')
      .lean();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        targetRole: user.targetRole,
        createdAt: user.createdAt,
      },
      skills: userSkills.map(us => ({
        userSkillId: us._id,
        skillId: us.skillId._id,
        name: us.skillId.name,
        category: us.skillId.category,
        proficiency: us.proficiency,
        status: us.status,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/users/me/profile
 * Updates name and/or targetRole for the current user.
 */
async function updateProfile(req, res, next) {
  try {
    const { name, targetRole } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (targetRole) updates.targetRole = targetRole.trim();

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    if (!user) return next(createError(404, 'USER_NOT_FOUND', 'User not found.'));

    res.json({
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
 * POST /api/users/me/skills
 * Adds or updates a skill in the user's profile.
 * Body: { skillId, proficiency, status }
 */
async function upsertUserSkill(req, res, next) {
  try {
    const { skillId, proficiency, status } = req.body;

    // Validate skill exists in taxonomy
    const skillDoc = await Skill.findById(skillId);
    if (!skillDoc) {
      return next(createError(404, 'SKILL_NOT_FOUND', 'The requested skill does not exist in the taxonomy.'));
    }

    // findOneAndUpdate with upsert — idempotent operation, same as company upsert in ingestion
    const userSkill = await UserSkill.findOneAndUpdate(
      { userId: req.user.id, skillId },
      {
        $set: {
          proficiency: proficiency || 'beginner',
          status: status || 'learning',
        },
      },
      { upsert: true, new: true }
    ).populate('skillId', 'name category');

    res.status(201).json({ userSkill });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/me/skills/:skillId
 * Removes a skill from the user's profile.
 */
async function removeUserSkill(req, res, next) {
  try {
    const result = await UserSkill.findOneAndDelete({
      userId: req.user.id,
      skillId: req.params.skillId,
    });

    if (!result) {
      return next(createError(404, 'SKILL_NOT_IN_PROFILE', 'This skill is not in your profile.'));
    }

    res.json({ message: 'Skill removed from profile.', skillId: req.params.skillId });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me/skill-gap
 * Returns the personalized skill-gap report for the authenticated user.
 */
async function getSkillGap(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return next(createError(404, 'USER_NOT_FOUND', 'User not found.'));

    const gap = await computeGap(req.user.id, user.targetRole);
    res.json({ gap });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me/roadmap
 * Returns the personalized roadmap: one resource per missing skill.
 */
async function getRoadmap(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return next(createError(404, 'USER_NOT_FOUND', 'User not found.'));

    const gap = await computeGap(req.user.id, user.targetRole);
    const roadmap = buildRoadmap(gap.missing);

    res.json({
      targetRole: gap.targetRole,
      gapPercent: gap.gapPercent,
      jobsAnalyzed: gap.jobsAnalyzed,
      roadmap,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  upsertUserSkill,
  removeUserSkill,
  getSkillGap,
  getRoadmap,
};
