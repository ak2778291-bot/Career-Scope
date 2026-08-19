'use strict';

const Skill = require('../models/Skill');
const { createError } = require('../middleware/errorHandler');

/**
 * escapeRegex — treats a user-supplied filter value as a literal string rather
 * than a pattern. Same rationale as the helper in jobController.js: a skill search
 * for "C++" would otherwise throw on an invalid quantifier, and a hand-crafted
 * pattern could force catastrophic backtracking.
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/skills
 * Returns all skills in the taxonomy. Optionally filtered by search term.
 * Public — used by the profile skill selector and admin taxonomy UI.
 */
async function getAllSkills(req, res, next) {
  try {
    const { search, category } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { aliases: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    if (category) {
      query.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };
    }

    const skills = await Skill.find(query).sort({ name: 1 }).lean();
    res.json({ skills });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/skills
 * Creates a new skill in the taxonomy. Admin only.
 * Validation (name required, unique) handled by express-validator + DB unique index.
 */
async function createSkill(req, res, next) {
  try {
    const { name, aliases, category } = req.body;

    const skill = await Skill.create({
      name: name.trim(),
      aliases: Array.isArray(aliases) ? aliases.map(a => a.trim()) : [],
      category: category?.trim() || 'General',
    });

    res.status(201).json({ skill });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/skills/:id
 * Updates an existing skill (name, aliases, category). Admin only.
 */
async function updateSkill(req, res, next) {
  try {
    const { name, aliases, category } = req.body;

    const skill = await Skill.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.trim() }),
        ...(aliases !== undefined && { aliases: aliases.map(a => a.trim()) }),
        ...(category && { category: category.trim() }),
      },
      { new: true, runValidators: true }
    );

    if (!skill) {
      return next(createError(404, 'SKILL_NOT_FOUND', 'The requested skill does not exist.'));
    }

    res.json({ skill });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/skills/:id
 * Removes a skill from the taxonomy. Admin only.
 * Note: does not cascade-delete JobSkill/UserSkill records — those remain as
 * orphaned references until the next ingestion re-run. This is acceptable for v1.
 */
async function deleteSkill(req, res, next) {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);
    if (!skill) {
      return next(createError(404, 'SKILL_NOT_FOUND', 'The requested skill does not exist.'));
    }
    res.json({ message: 'Skill deleted successfully.', skillId: req.params.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllSkills, createSkill, updateSkill, deleteSkill };
