'use strict';

const Job = require('../models/Job');
const JobSkill = require('../models/JobSkill');
const { createError } = require('../middleware/errorHandler');

/**
 * escapeRegex — neutralises regex metacharacters in a user-supplied filter value.
 *
 * The location/company/skill filters build case-insensitive $regex queries from
 * query-string input. Without escaping, a value like "C++" throws (a dangling
 * quantifier), and a value like "(a+)+$" is a catastrophic-backtracking pattern
 * a client could use to pin the event loop. Per §9 of the spec — never trust data
 * received from the client — the value is treated as a literal string to match,
 * never as a pattern the caller gets to author.
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * GET /api/jobs
 * Search, filter, and paginate the jobs collection.
 *
 * Query params:
 *   search   - full-text search on title + description
 *   location - substring match on location field
 *   company  - substring match on company name (after $lookup)
 *   skill    - filter jobs that require a specific skill name
 *   from     - ISO date string (earliest postedDate)
 *   to       - ISO date string (latest postedDate)
 *   page     - page number (default 1)
 *   limit    - results per page (default 20, max 50)
 */
async function getJobs(req, res, next) {
  try {
    const {
      search,
      location,
      company,
      skill,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build the match stage
    const matchStage = { isActive: true };

    if (search) {
      matchStage.$text = { $search: search };
    }

    if (location) {
      matchStage.location = { $regex: escapeRegex(location), $options: 'i' };
    }

    if (from || to) {
      matchStage.postedDate = {};
      if (from) matchStage.postedDate.$gte = new Date(from);
      if (to) matchStage.postedDate.$lte = new Date(to);
    }

    // If filtering by company: resolve the name fragment to company ObjectIds first,
    // then filter jobs on the indexed `company` reference.
    //
    // Why this resolution happens BEFORE the query rather than filtering the
    // populated results afterwards: post-filtering can only ever see the current
    // page. Dropping non-matching jobs from a 20-document page would leave the
    // page short while `total` and `pages` still described the unfiltered set —
    // so page 1 might show 2 jobs and claim there were 500. Resolving to IDs up
    // front keeps the filter inside the single query that produces both the page
    // and the count, so pagination stays truthful.
    if (company) {
      const Company = require('../models/Company');
      const companyDocs = await Company.find(
        { name: { $regex: escapeRegex(company), $options: 'i' } },
        '_id'
      ).lean();

      if (companyDocs.length === 0) {
        // No such company — an empty result set, not an error.
        return res.json({ jobs: [], total: 0, page: pageNum, pages: 0 });
      }

      matchStage.company = { $in: companyDocs.map(c => c._id) };
    }

    // If filtering by skill: find jobIds that require the given skill,
    // then restrict the match to those jobs
    if (skill) {
      const Skill = require('../models/Skill');
      const skillDoc = await Skill.findOne({
        $or: [
          { name: { $regex: `^${escapeRegex(skill)}$`, $options: 'i' } },
          { aliases: { $regex: `^${escapeRegex(skill)}$`, $options: 'i' } },
        ],
      });

      if (skillDoc) {
        const jobSkillDocs = await JobSkill.find({ skillId: skillDoc._id }, 'jobId').lean();
        const jobIds = jobSkillDocs.map(js => js.jobId);
        matchStage._id = { $in: jobIds };
      } else {
        // Skill not in taxonomy — return empty result set (not an error)
        return res.json({ jobs: [], total: 0, page: pageNum, pages: 0 });
      }
    }

    // Run count and data queries in parallel for performance.
    // Both use the same matchStage, so `total` always describes the same filtered
    // set the returned page was drawn from.
    const [jobs, total] = await Promise.all([
      Job.find(matchStage)
        .populate('company', 'name')
        .sort(search ? { score: { $meta: 'textScore' } } : { postedDate: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Job.countDocuments(matchStage),
    ]);

    res.json({
      jobs,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/jobs/:id
 * Fetch a single job with company details and required skills.
 */
async function getJobById(req, res, next) {
  try {
    const job = await Job.findById(req.params.id)
      .populate('company', 'name normalizedName')
      .lean();

    if (!job) {
      return next(createError(404, 'JOB_NOT_FOUND', 'The requested job posting does not exist.'));
    }

    // Fetch required skills via JobSkill join
    const jobSkillDocs = await JobSkill.find({ jobId: job._id })
      .populate('skillId', 'name category')
      .lean();

    const skills = jobSkillDocs
      .filter(js => js.skillId)
      .map(js => ({ skillId: js.skillId._id, name: js.skillId.name, category: js.skillId.category }));

    res.json({ ...job, skills });
  } catch (err) {
    next(err);
  }
}

module.exports = { getJobs, getJobById };
