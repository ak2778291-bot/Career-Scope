'use strict';

/**
 * Unit tests for skill extraction logic.
 *
 * Tests the extractSkillIds function in isolation — no database required.
 * The skillsCache parameter is mocked with synthetic skill objects that
 * match the shape returned by Skill.find().
 */

const { extractSkillIds } = require('../src/services/normalization/skillExtractor');

// Mock skill objects — shape mirrors what Skill.find({}, 'name aliases').lean() returns
const mockSkills = [
  { _id: 'id-js',     name: 'JavaScript',  aliases: ['JS', 'ECMAScript', 'ES6', 'vanilla js'] },
  { _id: 'id-ts',     name: 'TypeScript',  aliases: ['TS'] },
  { _id: 'id-py',     name: 'Python',      aliases: ['python3', 'py'] },
  { _id: 'id-java',   name: 'Java',        aliases: ['core java', 'java se'] },
  { _id: 'id-cpp',    name: 'C++',         aliases: ['CPP', 'C/C++', 'c plus plus'] },
  { _id: 'id-react',  name: 'React',       aliases: ['ReactJS', 'React.js', 'react js'] },
  { _id: 'id-node',   name: 'Node.js',     aliases: ['NodeJS', 'node', 'node js'] },
  { _id: 'id-sql',    name: 'SQL',         aliases: [] },
  { _id: 'id-dsa',    name: 'Data Structures & Algorithms', aliases: ['DSA', 'data structures', 'algorithms'] },
  { _id: 'id-git',    name: 'Git',         aliases: ['github', 'gitlab', 'version control'] },
  { _id: 'id-docker', name: 'Docker',      aliases: ['containerization'] },
  { _id: 'id-rest',   name: 'REST APIs',   aliases: ['REST', 'REST API', 'RESTful', 'RESTful APIs'] },
  { _id: 'id-c',      name: 'C',           aliases: ['c programming', 'c language'] },
];

describe('extractSkillIds', () => {
  // ── Alias matching ─────────────────────────────────────────────────────────

  test('matches skill by canonical name', () => {
    const result = extractSkillIds('We need Python developers', mockSkills);
    expect(result).toContain('id-py');
  });

  test('matches skill by alias — JS → JavaScript', () => {
    const result = extractSkillIds('Proficiency in JS required', mockSkills);
    expect(result).toContain('id-js');
  });

  test('matches skill by alias — CPP → C++', () => {
    const result = extractSkillIds('Experience with CPP preferred', mockSkills);
    expect(result).toContain('id-cpp');
  });

  test('matches skill by alias — C/C++ → C++', () => {
    const result = extractSkillIds('Knowledge of C/C++ required', mockSkills);
    expect(result).toContain('id-cpp');
  });

  test('matches skill by alias — DSA → Data Structures & Algorithms', () => {
    const result = extractSkillIds('Strong DSA fundamentals needed', mockSkills);
    expect(result).toContain('id-dsa');
  });

  test('matches skill by alias — ReactJS → React', () => {
    const result = extractSkillIds('Build UI components with ReactJS', mockSkills);
    expect(result).toContain('id-react');
  });

  test('matches skill by alias — NodeJS → Node.js', () => {
    const result = extractSkillIds('Backend with NodeJS', mockSkills);
    expect(result).toContain('id-node');
  });

  // ── Case insensitivity ─────────────────────────────────────────────────────

  test('matching is case-insensitive', () => {
    const result = extractSkillIds('PYTHON and REACT experience', mockSkills);
    expect(result).toContain('id-py');
    expect(result).toContain('id-react');
  });

  // ── Word-boundary matching — no false positives ────────────────────────────

  test('Java does NOT match inside JavaScript', () => {
    const result = extractSkillIds('Experience with JavaScript', mockSkills);
    expect(result).toContain('id-js');
    expect(result).not.toContain('id-java'); // "Java" is a substring of "JavaScript"
    // but the word-boundary regex prevents it from matching
  });

  test('C does NOT match inside Docker or React or CSS', () => {
    const result = extractSkillIds('Experience with Docker, React, CSS', mockSkills);
    expect(result).not.toContain('id-c'); // "C" appears inside "Docker" and "React"
    expect(result).toContain('id-docker');
    expect(result).toContain('id-react');
  });

  test('SQL does NOT match inside NoSQL', () => {
    const result = extractSkillIds('Experience with NoSQL databases preferred', mockSkills);
    // "SQL" is a substring of "NoSQL" — word boundary should prevent false match
    expect(result).not.toContain('id-sql');
  });

  // ── Multiple skills ────────────────────────────────────────────────────────

  test('extracts multiple skills from one description', () => {
    const desc = 'We are looking for a developer with React, Node.js, and SQL experience.';
    const result = extractSkillIds(desc, mockSkills);
    expect(result).toContain('id-react');
    expect(result).toContain('id-node');
    expect(result).toContain('id-sql');
  });

  test('does not return duplicate skill IDs when canonical + alias both appear', () => {
    // "JavaScript" and "JS" both appear — should only return 'id-js' once
    const desc = 'Strong JavaScript (JS) skills required';
    const result = extractSkillIds(desc, mockSkills);
    expect(result.filter(id => id === 'id-js').length).toBe(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  test('returns empty array for empty description', () => {
    expect(extractSkillIds('', mockSkills)).toEqual([]);
  });

  test('returns empty array for null description', () => {
    expect(extractSkillIds(null, mockSkills)).toEqual([]);
  });

  test('returns empty array for empty skills cache', () => {
    expect(extractSkillIds('Python developer needed', [])).toEqual([]);
  });

  test('returns empty array when no skills match', () => {
    const result = extractSkillIds('Looking for a project manager with PMP certification', mockSkills);
    expect(result).toEqual([]);
  });
});
