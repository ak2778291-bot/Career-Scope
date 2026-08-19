'use strict';

const roadmapResources = require('../../../data/roadmapResources');

/**
 * buildRoadmap — maps an array of missing skills to curated prep resources.
 *
 * For each missing skill from computeGap(), looks up the roadmapResources table.
 * If no entry exists for a skill, returns a generic search suggestion rather than
 * returning nothing — every missing skill should have some actionable output.
 *
 * Design:
 *   - Static lookup, not generative. "Why did the roadmap suggest this resource?"
 *     is always answerable: because the skill name appears as a key in roadmapResources.js.
 *   - The roadmap is only as good as the curation in roadmapResources.js — maintenance
 *     is a known, scoped cost, not a hidden complexity.
 *
 * @param {Array} missingSkills - Array of { skillId, name, category } from gapEngine
 * @returns {Array} Array of roadmap items with skill info + resource
 */
function buildRoadmap(missingSkills) {
  if (!Array.isArray(missingSkills) || missingSkills.length === 0) {
    return [];
  }

  return missingSkills.map(skill => {
    const resource = roadmapResources[skill.name];

    if (resource) {
      return {
        skillId: skill.skillId,
        skillName: skill.name,
        category: skill.category,
        resource: {
          title: resource.title,
          url: resource.url,
          type: resource.type,
          description: resource.description,
        },
      };
    }

    // Generic fallback for skills not yet in the lookup table.
    // Still actionable — tells the user exactly what to search for.
    return {
      skillId: skill.skillId,
      skillName: skill.name,
      category: skill.category,
      resource: {
        title: `Learn ${skill.name} — Search for tutorials`,
        url: `https://www.google.com/search?q=${encodeURIComponent(skill.name + ' tutorial for beginners')}`,
        type: 'search',
        description: `No curated resource yet for "${skill.name}". Use this search to find beginner tutorials.`,
      },
    };
  });
}

module.exports = { buildRoadmap };
