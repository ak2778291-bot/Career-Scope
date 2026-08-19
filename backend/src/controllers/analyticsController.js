'use strict';

const {
  getTopSkills,
  getPostingsByCompany,
  getPostingsByLocation,
  getPostingsTrend,
  getSkillCooccurrence,
} = require('../services/analytics/trends');

/**
 * GET /api/analytics/trends
 * Returns all five trend datasets: top skills, by company, by location,
 * over time, and skill co-occurrence.
 * All data is computed by MongoDB aggregation pipelines in trends.js — no loops here.
 * Public endpoint — no auth required (trends are not user-specific).
 */
async function getTrends(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const weeks = parseInt(req.query.weeks, 10) || 8;

    // Run all five aggregation queries in parallel — they are independent
    const [topSkills, byCompany, byLocation, overTime, cooccurrence] = await Promise.all([
      getTopSkills(days, 10),
      getPostingsByCompany(10),
      getPostingsByLocation(10),
      getPostingsTrend(weeks),
      getSkillCooccurrence(days, 10),
    ]);

    res.json({
      period: { days, weeks },
      topSkills,
      byCompany,
      byLocation,
      overTime,
      cooccurrence,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/skills
 * Returns top demanded skills for a configurable time window.
 * Used by the trending skills bar chart independently.
 */
async function getSkillTrends(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const limit = Math.min(20, parseInt(req.query.limit, 10) || 10);

    const topSkills = await getTopSkills(days, limit);
    res.json({ days, topSkills });
  } catch (err) {
    next(err);
  }
}

module.exports = { getTrends, getSkillTrends };
