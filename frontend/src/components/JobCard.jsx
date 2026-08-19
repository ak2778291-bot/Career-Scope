import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Building, Calendar, Globe } from 'lucide-react';

export default function JobCard({ job }) {
  const formattedDate = new Date(job.postedDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="card">
      <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>
          <Link to={`/jobs/${job._id}`} style={{ color: 'inherit' }}>
            {job.title}
          </Link>
        </h3>
        <span className="badge badge-blue">
          {job.sources?.length > 1 ? `${job.sources.length} sources merged` : job.sources?.[0]?.name || 'Ingested'}
        </span>
      </div>

      <div className="flex-gap" style={{ flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        <span className="flex-gap"><Building size={14} /> {job.company?.name || 'Company'}</span>
        <span>•</span>
        <span className="flex-gap"><MapPin size={14} /> {job.location}</span>
        <span>•</span>
        <span className="flex-gap"><Calendar size={14} /> {formattedDate}</span>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {job.description}
      </p>

      <div className="flex-between">
        <Link to={`/jobs/${job._id}`} className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
          View Details
        </Link>
        {job.sourceUrl && (
          <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-gap" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Globe size={13} /> Original Source
          </a>
        )}
      </div>
    </div>
  );
}
