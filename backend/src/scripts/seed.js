'use strict';

/**
 * Seed script — populates initial database state.
 *
 * Seeds:
 *   - 31 canonical skills with aliases and categories
 *   - 5 companies
 *   - 6 realistic job postings matching common SDE/Backend roles
 *   - JobSkill join records for each job
 *   - 1 Admin user (admin@careerconnect.dev / Admin123!)
 *   - 1 Standard student user (student@careerconnect.dev / Student123!) with initial userSkills
 *
 * Note on the job list: two of the six postings ("Software Development Engineer I"
 * and "SDE 1 - Backend" at ExampleCorp/Bangalore) are deliberately the same
 * underlying role described differently by two sources. Both normalize to the
 * same canonical title, so the seed exercises the real dedup path and finishes
 * with 5 job documents, one of which carries two entries in sources[]. That gives
 * a demoable, non-zero dedup rate on a fresh database without any live API calls.
 *
 * Usage:
 *   npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Job = require('../models/Job');
const Skill = require('../models/Skill');
const UserSkill = require('../models/UserSkill');
const JobSkill = require('../models/JobSkill');
const IngestionLog = require('../models/IngestionLog');

const skillAliases = require('../../data/skillAliases');
const { computeDedupeHash, normalizeForHash } = require('../services/dedup/dedup');
const { normalizeTitle } = require('../services/normalization/titleNorm');
const { extractSkillIds } = require('../services/normalization/skillExtractor');

// Initial canonical skills list
const INITIAL_SKILLS = [
  { name: 'JavaScript', category: 'Language' },
  { name: 'TypeScript', category: 'Language' },
  { name: 'Python', category: 'Language' },
  { name: 'Java', category: 'Language' },
  { name: 'C++', category: 'Language' },
  { name: 'C', category: 'Language' },
  { name: 'Go', category: 'Language' },
  { name: 'Rust', category: 'Language' },
  { name: 'React', category: 'Framework' },
  { name: 'Node.js', category: 'Framework' },
  { name: 'Express.js', category: 'Framework' },
  { name: 'Next.js', category: 'Framework' },
  { name: 'Vue.js', category: 'Framework' },
  { name: 'Angular', category: 'Framework' },
  { name: 'SQL', category: 'Database' },
  { name: 'PostgreSQL', category: 'Database' },
  { name: 'MySQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database' },
  { name: 'Redis', category: 'Database' },
  { name: 'REST APIs', category: 'Concept' },
  { name: 'GraphQL', category: 'Concept' },
  { name: 'Data Structures & Algorithms', category: 'Concept' },
  { name: 'System Design', category: 'Concept' },
  { name: 'OOP', category: 'Concept' },
  { name: 'Git', category: 'Tool' },
  { name: 'Docker', category: 'Tool' },
  { name: 'Kubernetes', category: 'Tool' },
  { name: 'AWS', category: 'Cloud' },
  { name: 'Linux', category: 'OS' },
  { name: 'Machine Learning', category: 'AI/ML' },
  { name: 'Agile', category: 'Methodology' },
];

const INITIAL_COMPANIES = [
  'ExampleCorp',
  'TechFlow Solutions',
  'Nexus Systems',
  'CloudScale Labs',
  'DataPulse Innovations',
];

const INITIAL_JOBS = [
  {
    title: 'Software Development Engineer I',
    company: 'ExampleCorp',
    location: 'Bangalore',
    description: 'Looking for an entry-level SDE 1. Requirements: Strong Java or C++ background, solid Data Structures & Algorithms (DSA), knowledge of SQL databases, and experience building REST APIs.',
    postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    sourceName: 'adzuna',
    sourceUrl: 'https://example.com/jobs/sde1-adzuna',
  },
  {
    title: 'SDE 1 - Backend',
    company: 'ExampleCorp',
    location: 'Bangalore', // Same company/location/similar title -> tests exact match deduplication
    description: 'SDE 1 Backend position. Required: Java, Data Structures & Algorithms, REST APIs, SQL, System Design basics.',
    postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    sourceName: 'remoteok',
    sourceUrl: 'https://example.com/jobs/sde1-remoteok',
  },
  {
    title: 'Frontend Engineer Intern',
    company: 'TechFlow Solutions',
    location: 'Remote',
    description: 'Frontend internship role. Must know JavaScript, React, HTML/CSS, Git, and REST APIs integration.',
    postedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    sourceName: 'remoteok',
    sourceUrl: 'https://example.com/jobs/frontend-intern',
  },
  {
    title: 'Full Stack Developer',
    company: 'Nexus Systems',
    location: 'Hyderabad',
    description: 'We are hiring a Full Stack Engineer. Tech stack: Node.js, Express.js, React, MongoDB, TypeScript, Git, Docker.',
    postedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    sourceName: 'adzuna',
    sourceUrl: 'https://example.com/jobs/fullstack-nexus',
  },
  {
    title: 'Backend Engineer (Node.js)',
    company: 'CloudScale Labs',
    location: 'Bangalore',
    description: 'Backend engineer needed. Must be proficient in Node.js, Express.js, PostgreSQL, Redis, REST APIs, and Docker.',
    postedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    sourceName: 'remoteok',
    sourceUrl: 'https://example.com/jobs/backend-cloudscale',
  },
  {
    title: 'Data Engineer',
    company: 'DataPulse Innovations',
    location: 'Gurgaon',
    description: 'Data engineering position. Required skills: Python, SQL, PostgreSQL, AWS, Linux, Data Structures & Algorithms.',
    postedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    sourceName: 'adzuna',
    sourceUrl: 'https://example.com/jobs/data-eng-datapulse',
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('[Seed] Connected to MongoDB');

    // Clean existing data
    await Promise.all([
      User.deleteMany({}),
      Company.deleteMany({}),
      Job.deleteMany({}),
      Skill.deleteMany({}),
      UserSkill.deleteMany({}),
      JobSkill.deleteMany({}),
      IngestionLog.deleteMany({}),
    ]);
    console.log('[Seed] Cleared existing collection data');

    // 1. Seed Skills & invert alias mapping
    const skillDocsToInsert = INITIAL_SKILLS.map(s => {
      const aliases = Object.entries(skillAliases)
        .filter(([alias, canonical]) => canonical.toLowerCase() === s.name.toLowerCase() && alias.toLowerCase() !== s.name.toLowerCase())
        .map(([alias]) => alias);

      return {
        name: s.name,
        category: s.category,
        aliases: [...new Set(aliases)],
      };
    });

    const createdSkills = await Skill.insertMany(skillDocsToInsert);
    console.log(`[Seed] Created ${createdSkills.length} Skills`);

    // 2. Seed Companies
    const companyDocs = INITIAL_COMPANIES.map(name => ({
      name,
      normalizedName: normalizeForHash(name),
    }));
    const createdCompanies = await Company.insertMany(companyDocs);
    const companyMap = new Map(createdCompanies.map(c => [c.normalizedName, c._id]));
    console.log(`[Seed] Created ${createdCompanies.length} Companies`);

    // 3. Seed Users
    const adminUser = await User.create({
      name: 'Platform Admin',
      email: 'admin@careerconnect.dev',
      password: 'Admin123!',
      role: 'ADMIN',
      targetRole: 'Software Engineer',
    });

    const studentUser = await User.create({
      name: 'Student Job Seeker',
      email: 'student@careerconnect.dev',
      password: 'Student123!',
      role: 'USER',
      targetRole: 'Software Engineer',
    });
    console.log('[Seed] Created Admin (admin@careerconnect.dev) and Student (student@careerconnect.dev) users');

    // 4. Seed User Skills (Student user)
    const javaSkill = createdSkills.find(s => s.name === 'Java');
    const sqlSkill = createdSkills.find(s => s.name === 'SQL');
    const dsaSkill = createdSkills.find(s => s.name === 'Data Structures & Algorithms');

    if (javaSkill && sqlSkill && dsaSkill) {
      await UserSkill.insertMany([
        { userId: studentUser._id, skillId: javaSkill._id, proficiency: 'intermediate', status: 'proficient' },
        { userId: studentUser._id, skillId: sqlSkill._id, proficiency: 'beginner', status: 'proficient' },
        { userId: studentUser._id, skillId: dsaSkill._id, proficiency: 'beginner', status: 'learning' },
      ]);
      console.log('[Seed] Created initial userSkills profile for student user');
    }

    // 5. Seed Jobs & JobSkills
    const skillsCache = createdSkills.map(s => ({ _id: s._id, name: s.name, aliases: s.aliases }));
    let insertedJobsCount = 0;
    let dedupedJobsCount = 0;

    for (const rawJob of INITIAL_JOBS) {
      const normalizedTitle = normalizeTitle(rawJob.title);
      const normalizedCompName = normalizeForHash(rawJob.company);
      const normalizedLoc = normalizeForHash(rawJob.location);
      const companyId = companyMap.get(normalizedCompName);

      const dedupeHash = computeDedupeHash(normalizedTitle, normalizedCompName, normalizedLoc);

      const existing = await Job.findOne({ dedupeHash });
      if (existing) {
        // Mirrors the dedup branch in ingestionRunner.js: one entry per distinct
        // source name, updated in place rather than appended, so sources[] stays
        // bounded. See models/Job.js for why that invariant matters.
        const touched = await Job.updateOne(
          { _id: existing._id, 'sources.name': rawJob.sourceName },
          { $set: { 'sources.$.fetchedAt': new Date(), 'sources.$.url': rawJob.sourceUrl } }
        );

        if (touched.matchedCount === 0) {
          await Job.updateOne(
            { _id: existing._id },
            {
              $push: {
                sources: {
                  name: rawJob.sourceName,
                  url: rawJob.sourceUrl,
                  fetchedAt: new Date(),
                },
              },
            }
          );
        }
        dedupedJobsCount++;
      } else {
        const job = await Job.create({
          title: rawJob.title,
          normalizedTitle,
          company: companyId,
          location: rawJob.location,
          description: rawJob.description,
          postedDate: rawJob.postedDate,
          sourceUrl: rawJob.sourceUrl,
          dedupeHash,
          isActive: true,
          sources: [
            {
              name: rawJob.sourceName,
              url: rawJob.sourceUrl,
              fetchedAt: new Date(),
            },
          ],
        });

        insertedJobsCount++;

        // Extract skills & link via JobSkill
        const matchedSkillIds = extractSkillIds(job.description, skillsCache);
        if (matchedSkillIds.length > 0) {
          const jsDocs = matchedSkillIds.map(skillId => ({
            jobId: job._id,
            skillId,
          }));
          await JobSkill.insertMany(jsDocs, { ordered: false }).catch(() => {});
        }
      }
    }

    console.log(`[Seed] Jobs processed — Inserted: ${insertedJobsCount}, Deduplicated: ${dedupedJobsCount}`);

    // Create synthetic IngestionLog entry for the seed run
    await IngestionLog.create({
      source: 'seed',
      recordsFetched: INITIAL_JOBS.length,
      recordsInserted: insertedJobsCount,
      recordsDeduplicated: dedupedJobsCount,
      errors: [],
      durationMs: 450,
      triggeredBy: 'seed',
    });

    console.log('[Seed] Database seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Seeding failed:', err);
    process.exit(1);
  }
}

seed();
