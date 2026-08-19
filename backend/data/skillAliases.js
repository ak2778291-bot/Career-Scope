'use strict';

/**
 * Skill alias lookup table.
 *
 * Maps known non-canonical skill names/shorthands to their canonical form.
 * Used by normalization/skillExtractor.js during ingestion — when a job description
 * mentions an alias, it is matched to the canonical skill name and linked via JobSkill.
 *
 * IMPORTANT: These aliases must correspond 1-to-1 with the 'aliases' field on the
 * Skills collection in MongoDB. Both sources of truth (this file and the DB) are
 * seeded together by src/scripts/seed.js. If you add a skill to the DB via the admin
 * UI, also add its aliases here (or vice versa) so skillExtractor.js can match them.
 *
 * Format: { alias: 'Canonical Skill Name' }
 * Aliases are case-insensitive in skillExtractor.js (matched with /i flag).
 */
const skillAliases = {
  // ── JavaScript ────────────────────────────────────────────────────────────
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ecmascript': 'JavaScript',
  'es6': 'JavaScript',
  'es2015': 'JavaScript',
  'vanilla js': 'JavaScript',

  // ── TypeScript ────────────────────────────────────────────────────────────
  'ts': 'TypeScript',
  'typescript': 'TypeScript',

  // ── Python ────────────────────────────────────────────────────────────────
  'python': 'Python',
  'python3': 'Python',
  'py': 'Python',

  // ── Java ──────────────────────────────────────────────────────────────────
  'java': 'Java',
  'core java': 'Java',
  'java se': 'Java',
  'java ee': 'Java',

  // ── C++ ───────────────────────────────────────────────────────────────────
  'c++': 'C++',
  'cpp': 'C++',
  'c/c++': 'C++',
  'c plus plus': 'C++',

  // ── C ─────────────────────────────────────────────────────────────────────
  'c programming': 'C',
  'c language': 'C',

  // ── Go ────────────────────────────────────────────────────────────────────
  'go': 'Go',
  'golang': 'Go',

  // ── Rust ──────────────────────────────────────────────────────────────────
  'rust': 'Rust',

  // ── React ─────────────────────────────────────────────────────────────────
  'react': 'React',
  'reactjs': 'React',
  'react.js': 'React',
  'react js': 'React',

  // ── Node.js ───────────────────────────────────────────────────────────────
  'node': 'Node.js',
  'nodejs': 'Node.js',
  'node.js': 'Node.js',
  'node js': 'Node.js',

  // ── Express ───────────────────────────────────────────────────────────────
  'express': 'Express.js',
  'expressjs': 'Express.js',
  'express.js': 'Express.js',

  // ── Next.js ───────────────────────────────────────────────────────────────
  'nextjs': 'Next.js',
  'next.js': 'Next.js',
  'next js': 'Next.js',

  // ── Vue ───────────────────────────────────────────────────────────────────
  'vue': 'Vue.js',
  'vuejs': 'Vue.js',
  'vue.js': 'Vue.js',

  // ── Angular ───────────────────────────────────────────────────────────────
  'angular': 'Angular',
  'angularjs': 'Angular',

  // ── SQL ───────────────────────────────────────────────────────────────────
  'sql': 'SQL',
  'mysql': 'MySQL',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'sqlite': 'SQLite',

  // ── MongoDB ───────────────────────────────────────────────────────────────
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'mongo db': 'MongoDB',

  // ── Redis ─────────────────────────────────────────────────────────────────
  'redis': 'Redis',

  // ── REST APIs ─────────────────────────────────────────────────────────────
  'rest': 'REST APIs',
  'rest api': 'REST APIs',
  'restful': 'REST APIs',
  'restful api': 'REST APIs',
  'rest apis': 'REST APIs',
  'restful apis': 'REST APIs',

  // ── GraphQL ───────────────────────────────────────────────────────────────
  'graphql': 'GraphQL',

  // ── Data Structures & Algorithms ─────────────────────────────────────────
  'dsa': 'Data Structures & Algorithms',
  'data structures': 'Data Structures & Algorithms',
  'algorithms': 'Data Structures & Algorithms',
  'data structures and algorithms': 'Data Structures & Algorithms',
  'ds & algorithms': 'Data Structures & Algorithms',

  // ── System Design ─────────────────────────────────────────────────────────
  'system design': 'System Design',
  'distributed systems': 'System Design',
  'hld': 'System Design',
  'lld': 'System Design',

  // ── Git ───────────────────────────────────────────────────────────────────
  'git': 'Git',
  'github': 'Git',
  'gitlab': 'Git',
  'version control': 'Git',

  // ── Docker ────────────────────────────────────────────────────────────────
  'docker': 'Docker',
  'containerization': 'Docker',

  // ── Kubernetes ────────────────────────────────────────────────────────────
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',

  // ── AWS ───────────────────────────────────────────────────────────────────
  'aws': 'AWS',
  'amazon web services': 'AWS',

  // ── Machine Learning ─────────────────────────────────────────────────────
  'ml': 'Machine Learning',
  'machine learning': 'Machine Learning',

  // ── OOP ───────────────────────────────────────────────────────────────────
  'oop': 'OOP',
  'object oriented': 'OOP',
  'object-oriented programming': 'OOP',
  'object oriented programming': 'OOP',

  // ── Linux ─────────────────────────────────────────────────────────────────
  'linux': 'Linux',
  'unix': 'Linux',

  // ── Agile ─────────────────────────────────────────────────────────────────
  'agile': 'Agile',
  'scrum': 'Agile',
};

module.exports = skillAliases;
