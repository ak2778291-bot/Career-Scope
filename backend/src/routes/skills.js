'use strict';

const { Router } = require('express');
const { getAllSkills } = require('../controllers/skillController');

const router = Router();

// Public — used by profile skill selector and admin UI
router.get('/', getAllSkills);

module.exports = router;
