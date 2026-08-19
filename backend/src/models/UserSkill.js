'use strict';

const mongoose = require('mongoose');

/**
 * UserSkill collection — join table between User and Skill.
 *
 * Data-modeling note — why a separate collection (not embedded in User):
 *   A user can have many skills, and those skills need to be queried
 *   independently: the skill-gap engine fetches ALL skills for a user,
 *   the profile page renders them with proficiency levels, and admin
 *   analytics may aggregate across all users.
 *
 *   Embedding skills as an array inside the User document would work at
 *   small scale, but creates two problems:
 *     1. The User document grows unboundedly as skills are added.
 *     2. Querying "which users have skill X at proficiency Y" requires
 *        scanning all User documents and filtering the embedded array —
 *        much slower than an indexed query on this join collection.
 *
 *   The compound unique index { userId, skillId } ensures a user cannot
 *   add the same skill twice, while allowing the same skill to be in
 *   many users' profiles.
 */
const userSkillSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    skillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true,
    },
    proficiency: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    /**
     * status — finer-grained than proficiency; used by the skill-gap engine
     * to correctly classify "learning" skills as partially matched.
     */
    status: {
      type: String,
      enum: ['learning', 'proficient', 'expert'],
      default: 'learning',
    },
  },
  { timestamps: true }
);

// Compound unique index: one record per (user, skill) pair
userSkillSchema.index({ userId: 1, skillId: 1 }, { unique: true });
// Index on userId alone — fetching all skills for a user is the most common query
userSkillSchema.index({ userId: 1 });

module.exports = mongoose.model('UserSkill', userSkillSchema);
