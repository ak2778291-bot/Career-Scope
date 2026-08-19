'use strict';

/**
 * authorize — answers "is this user allowed to do this?"
 *
 * Role-check middleware factory. Used as a second middleware in the route chain,
 * always after authenticate:
 *
 *   router.post('/admin/skills', authenticate, authorize('ADMIN'), adminController.addSkill);
 *
 * Design note:
 *   Authorization is a SEPARATE concern from authentication (authenticate.js).
 *   authenticate answers "who is this?" — authorize answers "what can they do?"
 *   Keeping them separate means:
 *     - A route can require auth without any role restriction (just use authenticate alone)
 *     - New roles or permission changes are made in one place (here), not scattered
 *       through controller logic
 *     - Both concerns are independently unit-testable
 *
 * @param {...string} roles - One or more allowed role strings (e.g. 'ADMIN', 'USER')
 */
const authorize = (...roles) => (req, res, next) => {
  // If authenticate didn't run (shouldn't happen if routes are set up correctly,
  // but guard anyway), treat as unauthenticated
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: `This action requires ${roles.join(' or ')} role. Your role is ${req.user.role}.`,
      },
    });
  }

  next();
};

module.exports = { authorize };
