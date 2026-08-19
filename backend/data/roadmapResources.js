'use strict';

/**
 * Roadmap resource lookup table.
 *
 * Maps canonical skill names to a curated preparation resource.
 * Used by skillGap/roadmapLookup.js to generate the personalized roadmap
 * for skills identified as missing in a user's gap report.
 *
 * Design:
 *   - Deliberately a static lookup, not a generative system.
 *   - "Why did the roadmap suggest X?" has a direct, traceable answer:
 *     because skill Y maps to resource X in this file.
 *   - Resources are curated for quality, not scraped/generated.
 *   - If a skill has no entry, roadmapLookup.js returns a generic fallback.
 *
 * Maintenance: add entries when new skills are added to the taxonomy.
 */
const roadmapResources = {
  'JavaScript': {
    title: 'JavaScript.info — The Modern JavaScript Tutorial',
    url: 'https://javascript.info/',
    type: 'tutorial',
    description: 'Comprehensive, well-structured free tutorial from basics to advanced JS.',
  },
  'TypeScript': {
    title: 'TypeScript Official Handbook',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
    type: 'documentation',
    description: 'Official typed-JavaScript handbook with examples.',
  },
  'Python': {
    title: 'Python Official Tutorial',
    url: 'https://docs.python.org/3/tutorial/',
    type: 'tutorial',
    description: 'The standard starting point for learning Python.',
  },
  'Java': {
    title: 'Java Programming and Software Engineering Fundamentals (Coursera)',
    url: 'https://www.coursera.org/specializations/java-programming',
    type: 'course',
    description: 'Duke University\'s Java specialisation — well-regarded for placement prep.',
  },
  'C++': {
    title: 'learncpp.com',
    url: 'https://www.learncpp.com/',
    type: 'tutorial',
    description: 'Free, detailed C++ tutorial widely recommended by competitive programmers.',
  },
  'Go': {
    title: 'A Tour of Go',
    url: 'https://go.dev/tour/welcome/1',
    type: 'tutorial',
    description: 'Official interactive Go language tour.',
  },
  'React': {
    title: 'React Official Docs — Learn React',
    url: 'https://react.dev/learn',
    type: 'documentation',
    description: 'The redesigned official React docs with interactive examples.',
  },
  'Node.js': {
    title: 'Node.js Official Learn Guide',
    url: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
    type: 'tutorial',
    description: 'Official Node.js beginner-to-intermediate guide.',
  },
  'Express.js': {
    title: 'Express.js Official Guide',
    url: 'https://expressjs.com/en/guide/routing.html',
    type: 'documentation',
    description: 'Official Express routing, middleware, and error-handling guide.',
  },
  'Next.js': {
    title: 'Next.js Official Learn Course',
    url: 'https://nextjs.org/learn',
    type: 'course',
    description: 'Interactive official course covering App Router, data fetching, and deployment.',
  },
  'SQL': {
    title: 'SQLZoo — Interactive SQL Practice',
    url: 'https://sqlzoo.net/',
    type: 'practice',
    description: 'Browser-based SQL exercises from basic SELECT to window functions.',
  },
  'PostgreSQL': {
    title: 'PostgreSQL Official Tutorial',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
    type: 'documentation',
    description: 'Official PostgreSQL tutorial covering installation, queries, and data types.',
  },
  'MongoDB': {
    title: 'MongoDB University — MongoDB for Developers',
    url: 'https://learn.mongodb.com/',
    type: 'course',
    description: 'Free official MongoDB courses including aggregation pipelines and data modeling.',
  },
  'REST APIs': {
    title: 'RESTful API Design — Best Practices',
    url: 'https://restfulapi.net/',
    type: 'tutorial',
    description: 'Concise guide to REST constraints, resource design, and HTTP semantics.',
  },
  'GraphQL': {
    title: 'How to GraphQL',
    url: 'https://www.howtographql.com/',
    type: 'tutorial',
    description: 'Free fullstack tutorial covering GraphQL fundamentals, queries, and mutations.',
  },
  'Data Structures & Algorithms': {
    title: 'Striver\'s A2Z DSA Sheet',
    url: 'https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/',
    type: 'practice',
    description: 'Widely-used structured DSA practice sheet for SDE placement prep.',
  },
  'System Design': {
    title: 'System Design Primer (GitHub)',
    url: 'https://github.com/donnemartin/system-design-primer',
    type: 'guide',
    description: 'Comprehensive open-source system design study guide with diagrams.',
  },
  'Git': {
    title: 'Pro Git (free book)',
    url: 'https://git-scm.com/book/en/v2',
    type: 'book',
    description: 'The definitive free Git reference — chapters 1-3 cover 90% of daily use.',
  },
  'Docker': {
    title: 'Docker Official Get Started Guide',
    url: 'https://docs.docker.com/get-started/',
    type: 'tutorial',
    description: 'Official hands-on guide from containers to multi-container apps.',
  },
  'Kubernetes': {
    title: 'Kubernetes Basics (official tutorial)',
    url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/',
    type: 'tutorial',
    description: 'Interactive official tutorial covering deployments, services, and scaling.',
  },
  'AWS': {
    title: 'AWS Cloud Practitioner Essentials (free)',
    url: 'https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/',
    type: 'course',
    description: 'Free official AWS intro course — good foundation before diving into specific services.',
  },
  'Machine Learning': {
    title: 'fast.ai Practical Deep Learning for Coders',
    url: 'https://course.fast.ai/',
    type: 'course',
    description: 'Top-rated practical ML course — code-first, project-focused.',
  },
  'OOP': {
    title: 'Object-Oriented Design — Refactoring.guru',
    url: 'https://refactoring.guru/design-patterns',
    type: 'guide',
    description: 'Clear explanations of OOP principles and design patterns with real examples.',
  },
  'Linux': {
    title: 'The Linux Command Line (free book)',
    url: 'https://linuxcommand.org/tlcl.php',
    type: 'book',
    description: 'Comprehensive free book covering shell, scripting, and Linux internals.',
  },
  'Agile': {
    title: 'Scrum Guide (official)',
    url: 'https://scrumguides.org/scrum-guide.html',
    type: 'guide',
    description: 'The official Scrum Guide — essential reading before any Agile interview question.',
  },
  'Vue.js': {
    title: 'Vue.js Official Guide',
    url: 'https://vuejs.org/guide/introduction.html',
    type: 'documentation',
    description: 'Official Vue 3 guide with Composition API and reactive data model.',
  },
  'Angular': {
    title: 'Angular Official Tutorial',
    url: 'https://angular.io/tutorial',
    type: 'tutorial',
    description: 'Official tour-of-heroes tutorial covering Angular fundamentals.',
  },
  'Redis': {
    title: 'Redis University — RU101: Introduction to Redis Data Structures',
    url: 'https://university.redis.com/courses/ru101/',
    type: 'course',
    description: 'Free official Redis course covering data types, commands, and use cases.',
  },
};

module.exports = roadmapResources;
