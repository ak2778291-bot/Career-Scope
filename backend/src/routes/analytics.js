'use strict';

const { Router } = require('express');
const { getTrends, getSkillTrends } = require('../controllers/analyticsController');

const router = Router();

// Public — trends are not user-specific
router.get('/trends', getTrends);
router.get('/skills', getSkillTrends);

module.exports = router;
