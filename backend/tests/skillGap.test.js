'use strict';

/**
 * Unit tests for the skill gap computation engine.
 *
 * Tests the gap calculation logic in isolation using mock data shaped like
 * what computeGap() internally builds before returning.
 *
 * Since computeGap() makes DB calls, we test the pure computation logic
 * directly by extracting it. The gap calculation is purely set-arithmetic —
 * no external dependencies needed to test it.
 */

/**
 * Pure gap computation logic extracted for testability.
 * This mirrors exactly what computeGap() does in gapEngine.js after loading data.
 *
 * @param {Array|Map} userSkills - either an array of skill IDs (treated as fully
 *   proficient) or a Map of skillId → { status }, matching the userSkillById map
 *   gapEngine builds from the userSkills collection.
 * @param {Map} demandedSkillMap - skillId → { skillId, name, category }
 */
function computeGapLogic(userSkills, demandedSkillMap) {
  // Accept a plain array of IDs as shorthand for "user is proficient in all of these",
  // so the older two-bucket tests below stay readable.
  const userSkillById = userSkills instanceof Map
    ? userSkills
    : new Map(userSkills.map(id => [id, { status: 'proficient' }]));

  const matched = [];
  const partiallyMatched = [];
  const missing = [];

  for (const [skillIdStr, skillInfo] of demandedSkillMap) {
    const userEntry = userSkillById.get(skillIdStr);

    if (!userEntry) {
      missing.push(skillInfo);
    } else if ((userEntry.status || 'learning') === 'learning') {
      partiallyMatched.push(skillInfo);
    } else {
      matched.push(skillInfo);
    }
  }

  const total = demandedSkillMap.size;
  const gapPercent = total > 0 ? Math.round((missing.length / total) * 100) : 0;

  return { matched, partiallyMatched, missing, gapPercent };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const allSkillIds = ['id-js', 'id-react', 'id-node', 'id-sql', 'id-dsa', 'id-docker'];

// Build a demandedSkillMap (as computeGap does internally) for a set of demanded skills
function buildDemandedMap(skillIds) {
  const map = new Map();
  skillIds.forEach(id => {
    map.set(id, { skillId: id, name: `Skill ${id}`, category: 'Test' });
  });
  return map;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('computeGapLogic', () => {
  test('0% gap when user has all demanded skills', () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-node']);
    const { matched, missing, gapPercent } = computeGapLogic(
      ['id-js', 'id-react', 'id-node'],
      demandedMap
    );
    expect(matched.length).toBe(3);
    expect(missing.length).toBe(0);
    expect(gapPercent).toBe(0);
  });

  test('100% gap when user has no skills', () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-node']);
    const { matched, missing, gapPercent } = computeGapLogic([], demandedMap);
    expect(matched.length).toBe(0);
    expect(missing.length).toBe(3);
    expect(gapPercent).toBe(100);
  });

  test('partial gap — correct percentage and split', () => {
    // User has 2 of 4 demanded skills → 50% gap
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-sql', 'id-dsa']);
    const { matched, missing, gapPercent } = computeGapLogic(
      ['id-js', 'id-react'],
      demandedMap
    );
    expect(matched.length).toBe(2);
    expect(missing.length).toBe(2);
    expect(gapPercent).toBe(50);
  });

  test('user has skills not in the demanded set — only demanded skills affect the gap', () => {
    // User has extra skills beyond what's demanded — gap should still be 0
    const demandedMap = buildDemandedMap(['id-js', 'id-react']);
    const { matched, missing, gapPercent } = computeGapLogic(
      ['id-js', 'id-react', 'id-docker', 'id-sql'], // extra skills
      demandedMap
    );
    expect(matched.length).toBe(2);
    expect(missing.length).toBe(0);
    expect(gapPercent).toBe(0);
  });

  test('1 of 3 skills → 67% gap (rounds correctly)', () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-sql']);
    const { gapPercent } = computeGapLogic(['id-js'], demandedMap);
    // 2/3 missing = 66.67% → rounded to 67%
    expect(gapPercent).toBe(67);
  });

  test('0% gap when no skills are demanded (empty demanded set)', () => {
    const { matched, missing, gapPercent } = computeGapLogic(
      ['id-js', 'id-react'],
      new Map() // no demanded skills
    );
    expect(matched.length).toBe(0);
    expect(missing.length).toBe(0);
    expect(gapPercent).toBe(0);
  });

  test('matched skills are correctly identified by ID', () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-sql']);
    const { matched } = computeGapLogic(['id-js', 'id-sql'], demandedMap);
    const matchedIds = matched.map(s => s.skillId);
    expect(matchedIds).toContain('id-js');
    expect(matchedIds).toContain('id-sql');
    expect(matchedIds).not.toContain('id-react');
  });

  test('missing skills are correctly identified by ID', () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-react', 'id-sql']);
    const { missing } = computeGapLogic(['id-js'], demandedMap);
    const missingIds = missing.map(s => s.skillId);
    expect(missingIds).toContain('id-react');
    expect(missingIds).toContain('id-sql');
    expect(missingIds).not.toContain('id-js');
  });
});

// ── Three-bucket classification (matched / partially matched / missing) ──────
// Covers §4 of the project plan, where a skill the student marked "in progress"
// is reported as partially matched rather than as a plain match.

describe('computeGapLogic — partial matches', () => {
  test("a skill with status 'learning' is partially matched, not matched", () => {
    const demandedMap = buildDemandedMap(['id-dsa']);
    const userSkills = new Map([['id-dsa', { status: 'learning' }]]);

    const { matched, partiallyMatched, missing } = computeGapLogic(userSkills, demandedMap);

    expect(matched.length).toBe(0);
    expect(partiallyMatched.length).toBe(1);
    expect(partiallyMatched[0].skillId).toBe('id-dsa');
    expect(missing.length).toBe(0);
  });

  test("'proficient' and 'expert' both count as fully matched", () => {
    const demandedMap = buildDemandedMap(['id-js', 'id-sql']);
    const userSkills = new Map([
      ['id-js', { status: 'proficient' }],
      ['id-sql', { status: 'expert' }],
    ]);

    const { matched, partiallyMatched } = computeGapLogic(userSkills, demandedMap);

    expect(matched.length).toBe(2);
    expect(partiallyMatched.length).toBe(0);
  });

  test('a partially matched skill does NOT count toward the gap percentage', () => {
    // 4 demanded: 1 proficient, 1 in progress, 2 absent → gap is 2/4 = 50%,
    // not 3/4 — the in-progress skill is present in the profile, just unfinished.
    const demandedMap = buildDemandedMap(['id-js', 'id-dsa', 'id-react', 'id-docker']);
    const userSkills = new Map([
      ['id-js', { status: 'proficient' }],
      ['id-dsa', { status: 'learning' }],
    ]);

    const { gapPercent } = computeGapLogic(userSkills, demandedMap);
    expect(gapPercent).toBe(50);
  });

  test('the three buckets are disjoint and cover every demanded skill', () => {
    const demandedMap = buildDemandedMap(allSkillIds);
    const userSkills = new Map([
      ['id-js', { status: 'expert' }],
      ['id-react', { status: 'proficient' }],
      ['id-node', { status: 'learning' }],
    ]);

    const { matched, partiallyMatched, missing } = computeGapLogic(userSkills, demandedMap);

    expect(matched.length + partiallyMatched.length + missing.length).toBe(allSkillIds.length);

    // No skill may appear in more than one bucket.
    const allReported = [...matched, ...partiallyMatched, ...missing].map(s => s.skillId);
    expect(new Set(allReported).size).toBe(allSkillIds.length);
  });

  test('§4 worked example: Java + SQL known, DSA in progress, REST APIs missing', () => {
    const demandedMap = buildDemandedMap(['id-java', 'id-dsa', 'id-sql', 'id-rest']);
    const userSkills = new Map([
      ['id-java', { status: 'proficient' }],
      ['id-sql', { status: 'proficient' }],
      ['id-dsa', { status: 'learning' }], // "DSA (in progress)"
    ]);

    const { matched, partiallyMatched, missing, gapPercent } = computeGapLogic(userSkills, demandedMap);

    expect(matched.map(s => s.skillId).sort()).toEqual(['id-java', 'id-sql']);
    expect(partiallyMatched.map(s => s.skillId)).toEqual(['id-dsa']);
    expect(missing.map(s => s.skillId)).toEqual(['id-rest']);
    expect(gapPercent).toBe(25); // 1 of 4 demanded skills absent
  });
});
