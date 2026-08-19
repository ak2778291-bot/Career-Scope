'use strict';

const { Router } = require('express');
const { getJobs, getJobById } = require('../controllers/jobController');

const router = Router();

// Public routes — no authentication required
router.get('/', getJobs);
router.get('/:id', getJobById);

module.exports = router;
