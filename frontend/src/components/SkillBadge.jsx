import React from 'react';

export default function SkillBadge({ name, category, status, type = 'blue' }) {
  let badgeClass = 'badge-blue';
  if (type === 'green' || status === 'proficient' || status === 'expert') badgeClass = 'badge-green';
  if (type === 'orange' || status === 'learning') badgeClass = 'badge-orange';
  if (type === 'red') badgeClass = 'badge-red';

  return (
    <span className={`badge ${badgeClass}`} style={{ marginRight: '0.35rem', marginBottom: '0.35rem' }}>
      {name} {category ? `(${category})` : ''}
    </span>
  );
}
