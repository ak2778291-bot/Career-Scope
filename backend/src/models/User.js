'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User collection.
 *
 * Data-modeling note — why this is a separate collection (not embedded):
 *   Users have independent identity: they are queried directly (login, profile),
 *   referenced from multiple other documents (userSkills), and have their own
 *   lifecycle (register, update, delete). Embedding user data inside any other
 *   document would make these operations unnecessarily complex.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    /**
     * select: false — password is never returned in query results by default.
     * Must be explicitly requested with .select('+password') only when
     * authentication requires it (login endpoint). This prevents accidental
     * password hash leakage in any other query.
     */
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    /**
     * role — authorization concern, separate from authentication.
     * 'USER'  → standard student access (search, profile, skill-gap, roadmap)
     * 'ADMIN' → taxonomy management + manual ingestion trigger
     *
     * Design: authentication (JWT) and authorization (role check) are implemented
     * as two separate middleware functions — authenticate.js and authorize.js —
     * not conflated in a single middleware.
     */
    role: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
    },
    /**
     * targetRole — used by the skill-gap engine to determine which job postings
     * to compare the user's skills against. E.g., "Software Engineer", "Data Analyst".
     * Stored as free text to avoid forcing users into a rigid taxonomy,
     * used as a $text search query against jobs.title.
     */
    targetRole: {
      type: String,
      default: 'Software Engineer',
      trim: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving (on create and on password change)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method — compare a candidate password against the stored hash
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
