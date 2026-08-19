'use strict';

const { validationResult } = require('express-validator');

/**
 * validate — runs express-validator checks accumulated by prior middleware,
 * and short-circuits with a 400 if any fail.
 *
 * Usage pattern (express-validator's recommended approach):
 *
 *   router.post('/register',
 *     body('email').isEmail().normalizeEmail(),
 *     body('password').isLength({ min: 6 }),
 *     validate,          ← collect and return any errors before the controller runs
 *     authController.register
 *   );
 *
 * Returning errors here instead of in the controller keeps controllers clean —
 * by the time a controller function runs, req.body has already been validated
 * and sanitized.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: errors
          .array()
          .map(e => e.msg)
          .join('. '),
        fields: errors.array().map(e => ({ field: e.path, message: e.msg })),
      },
    });
  }
  next();
};

module.exports = { validate };
