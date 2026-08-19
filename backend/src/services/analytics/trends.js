'use strict';

const Job = require('../../models/Job');
const JobSkill = require('../../models/JobSkill');

/**
 * Trend analytics — four aggregation pipeline queries.
 *
 * ALL computations happen entirely inside MongoDB.
 *
 * Why aggregation pipeline instead of application-code loops:
 *   The naive alternative is to fetch all JobSkill documents into Node.js,
 *   then loop over them to group and count. At 10,000+ job-skill pairs this
 *   means transferring megabytes of data from Atlas to Render, then doing
 *   O(n) work in JavaScript that MongoDB's $group operator does in optimised C++,
 *   using its own in-memory indexes.
 *
 *   The aggregation-pipeline approach:
 *   - Runs where the data lives (no network transfer of raw rows)
 *   - Uses MongoDB's optimised $group/$sort operators
 *   - Returns only the aggregated result (typically 10-20 documents) to Node.js
 *   - Scales to 1M+ documents without changing application code
 *
 * Each pipeline below has a comment on every stage explaining what it does
 * and why it appears at that position in the pipeline.
 */

/**
 * getTopSkills — top N most-demanded skills in the last `days` days.
 *
 * Pipeline shape:
 *   JobSkill → $lookup(jobs) → $unwind → $match(date) → $group(skillId) → $lookup(skills) → $project → $sort → $limit
 *
 * @param {number} days  - Look-back window in days (default 30)
 * @param {number} limit - Maximum skills to return (default 10)
 */
async function getTopSkills(days = 30, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return JobSkill.aggregate([
    // Stage 1: Join each JobSkill record with its Job document.
    // We need postedDate from the Job to apply the date filter in Stage 3.
    // Without this lookup, JobSkill has no date field to filter on.
    {
      $lookup: {
        from: 'jobs',
        localField: 'jobId',
        foreignField: '_id',
        as: 'job',
      },
    },

    // Stage 2: Unwind the joined array (lookup always returns an array).
    // Since each JobSkill has exactly one jobId, this produces one document
    // per JobSkill with job as an object (not a 1-element array).
    { $unwind: '$job' },

    // Stage 3: Filter to the date window.
    // Placed after $lookup/$unwind so we only aggregate skills from recent postings.
    // Note: placing $match after $lookup is intentional — we can't filter on
    // job.postedDate until the lookup has made it available on this document.
    { $match: { 'job.postedDate': { $gte: since }, 'job.isActive': true } },

    // Stage 4: Group by skillId, counting how many job postings demand each skill.
    // This is the core aggregation: one output document per unique skillId.
    {
      $group: {
        _id: '$skillId',
        count: { $sum: 1 },
      },
    },

    // Stage 5: Join with the skills collection to get skill name and category.
    // Can't include name/category in Stage 4 because $group drops non-grouped fields.
    {
      $lookup: {
        from: 'skills',
        localField: '_id',
        foreignField: '_id',
        as: 'skill',
      },
    },
    { $unwind: '$skill' },

    // Stage 6: Shape the output — drop MongoDB internals, expose only what the
    // frontend chart needs.
    {
      $project: {
        _id: 0,
        skillId: '$_id',
        name: '$skill.name',
        category: '$skill.category',
        count: 1,
      },
    },

    // Stage 7 + 8: Sort descending by count, take top N.
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
}

/**
 * getPostingsByCompany — posting counts grouped by company.
 *
 * Pipeline shape:
 *   Job → $match(active) → $group(company) → $lookup(companies) → $project → $sort → $limit
 */
async function getPostingsByCompany(limit = 10) {
  return Job.aggregate([
    // Stage 1: Only count active jobs
    { $match: { isActive: true } },

    // Stage 2: Group by the company ObjectId reference.
    // Each output document represents one company with its posting count.
    {
      $group: {
        _id: '$company',
        count: { $sum: 1 },
      },
    },

    // Stage 3: Join company details (need the name for display).
    {
      $lookup: {
        from: 'companies',
        localField: '_id',
        foreignField: '_id',
        as: 'company',
      },
    },
    { $unwind: '$company' },

    {
      $project: {
        _id: 0,
        companyId: '$_id',
        name: '$company.name',
        count: 1,
      },
    },

    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
}

/**
 * getPostingsByLocation — posting counts grouped by location string.
 *
 * Pipeline shape:
 *   Job → $match(active) → $group(location) → $project → $sort → $limit
 */
async function getPostingsByLocation(limit = 10) {
  return Job.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$location',
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        location: { $ifNull: ['$_id', 'Remote'] },
        count: 1,
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
}

/**
 * getPostingsTrend — posting counts grouped by ISO year+week for the last N weeks.
 * Used by the "postings over time" line chart.
 *
 * Pipeline shape:
 *   Job → $match(date) → $group(year+week) → $project(label) → $sort
 */
async function getPostingsTrend(weeks = 8) {
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  return Job.aggregate([
    { $match: { postedDate: { $gte: since } } },

    // Group by year AND week number.
    // $week returns 0-53 (0 = days before the first Sunday of the year).
    // We need both year and week to avoid week-12-of-2023 colliding with
    // week-12-of-2024 in the grouping.
    {
      $group: {
        _id: {
          year: { $year: '$postedDate' },
          week: { $week: '$postedDate' },
        },
        count: { $sum: 1 },
      },
    },

    // Build a human-readable label ("2024-W03") for the Recharts x-axis.
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        week: '$_id.week',
        count: 1,
        label: {
          $concat: [
            { $toString: '$_id.year' },
            '-W',
            {
              $cond: {
                if: { $lt: ['$_id.week', 10] },
                then: { $concat: ['0', { $toString: '$_id.week' }] },
                else: { $toString: '$_id.week' },
              },
            },
          ],
        },
      },
    },

    { $sort: { year: 1, week: 1 } },
  ]);
}

/**
 * getSkillCooccurrence — which pairs of skills are demanded together most often.
 *
 * Answers the question in §6.6 of the spec: "React is often paired with Node.js".
 * For a student, this is the most directly actionable trend on the dashboard —
 * it says "if you are learning X, employers asking for X usually also ask for Y",
 * which turns a flat list of in-demand skills into a study order.
 *
 * Pipeline shape:
 *   JobSkill → $lookup(jobs) → $unwind → $match(date/active)
 *            → $group(by job, collecting its skill set)
 *            → self-cross-join the set into unordered pairs
 *            → $group(by pair, count) → $sort → $limit
 *            → $lookup(skills) ×2 for display names → $project
 *
 * Why the pair generation is done with $unwind ×2 + $lt rather than in JavaScript:
 *   The naive implementation pulls every job's skill array into Node and builds
 *   pairs with a nested for-loop. That is exactly the application-code looping
 *   this project deliberately avoids. Unwinding the same array twice produces the
 *   full cross product in-database; the { $lt: [a, b] } guard then keeps only one
 *   of each unordered pair and drops self-pairs (a === b) in a single comparison.
 *   ObjectIds have a well-defined BSON sort order, so $lt is a valid, stable way
 *   to pick a canonical direction for each pair.
 *
 * @param {number} days  - Look-back window in days (default 30)
 * @param {number} limit - Maximum pairs to return (default 10)
 */
async function getSkillCooccurrence(days = 30, limit = 10) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return JobSkill.aggregate([
    // Stage 1 + 2: attach each JobSkill's parent job so we can filter on its date.
    {
      $lookup: {
        from: 'jobs',
        localField: 'jobId',
        foreignField: '_id',
        as: 'job',
      },
    },
    { $unwind: '$job' },

    // Stage 3: restrict to recent, active postings.
    { $match: { 'job.postedDate': { $gte: since }, 'job.isActive': true } },

    // Stage 4: collapse back to one document per job, carrying its set of skills.
    // $addToSet (not $push) guards against a skill being linked twice to one job.
    {
      $group: {
        _id: '$jobId',
        skills: { $addToSet: '$skillId' },
      },
    },

    // Stage 5: a pair needs at least two skills on the job.
    // Filtering here keeps single-skill jobs out of the cross product entirely.
    { $match: { 'skills.1': { $exists: true } } },

    // Stage 6: duplicate the skill set so it can be crossed with itself.
    { $project: { skillA: '$skills', skillB: '$skills' } },

    // Stage 7 + 8: the cross product. After both unwinds each document is one
    // (skillA, skillB) combination drawn from a single job.
    { $unwind: '$skillA' },
    { $unwind: '$skillB' },

    // Stage 9: keep one canonical ordering per unordered pair.
    // $lt is strict, so self-pairs (React, React) are dropped as well —
    // both the (X,Y)/(Y,X) duplication and the diagonal go in one stage.
    { $match: { $expr: { $lt: ['$skillA', '$skillB'] } } },

    // Stage 10: count how many jobs demand each pair together.
    {
      $group: {
        _id: { skillA: '$skillA', skillB: '$skillB' },
        count: { $sum: 1 },
      },
    },

    // Stage 11 + 12: strongest pairings first, capped at N.
    // Sorting and limiting BEFORE the name lookups below means we only resolve
    // names for the handful of pairs we are actually returning.
    { $sort: { count: -1 } },
    { $limit: limit },

    // Stage 13 + 14: resolve both ends of the pair to their display names.
    {
      $lookup: {
        from: 'skills',
        localField: '_id.skillA',
        foreignField: '_id',
        as: 'a',
      },
    },
    {
      $lookup: {
        from: 'skills',
        localField: '_id.skillB',
        foreignField: '_id',
        as: 'b',
      },
    },
    { $unwind: '$a' },
    { $unwind: '$b' },

    // Stage 15: shape for the frontend — a readable "React + Node.js" label
    // plus the individual names, so the chart can use either.
    {
      $project: {
        _id: 0,
        skillA: '$a.name',
        skillB: '$b.name',
        pair: { $concat: ['$a.name', ' + ', '$b.name'] },
        count: 1,
      },
    },
  ]);
}

module.exports = {
  getTopSkills,
  getPostingsByCompany,
  getPostingsByLocation,
  getPostingsTrend,
  getSkillCooccurrence,
};
