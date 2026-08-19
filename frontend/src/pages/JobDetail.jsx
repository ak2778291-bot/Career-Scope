import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import SkillBadge from '../components/SkillBadge';
import { MapPin, Building, Calendar, Globe, ArrowLeft, Layers } from 'lucide-react';

export default function JobDetail() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/jobs/${id}`)
      .then((res) => setJob(res.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Job posting not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>Loading job details...</div>;
  if (error) return <div className="container" style={{ padding: '2rem' }}><div className="alert alert-error">{error}</div></div>;
  if (!job) return null;

  const formattedDate = new Date(job.postedDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="container">
      <Link to="/" className="btn btn-outline" style={{ marginBottom: '1.5rem', display: 'inline-flex' }}>
        <ArrowLeft size={16} /> Back to Job List
      </Link>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{job.title}</h1>
            <p style={{ color: 'var(--primary)', fontSize: '1.1rem', fontWeight: 600 }}>
              {job.company?.name}
            </p>
          </div>
          {job.sourceUrl && (
            <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <Globe size={16} /> Apply on Source Site
            </a>
          )}
        </div>

        <div className="flex-gap" style={{ flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          <span className="flex-gap"><MapPin size={16} /> {job.location}</span>
          <span>•</span>
          <span className="flex-gap"><Calendar size={16} /> Posted {formattedDate}</span>
          <span>•</span>
          <span className="flex-gap"><Layers size={16} /> {job.sources?.length || 1} Source(s) Merged</span>
        </div>

        {/* Required Extracted Skills */}
        <div style={{ marginBottom: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Extracted Skill Requirements</h3>
          {job.skills && job.skills.length > 0 ? (
            <div>
              {job.skills.map((s) => (
                <SkillBadge key={s.skillId} name={s.name} category={s.category} type="blue" />
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No specific skills extracted from description.</p>
          )}
        </div>

        {/* Full Description */}
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Job Description</h3>
          <div style={{ whiteSpace: 'pre-line', color: 'var(--text-main)', lineHeight: 1.6, fontSize: '0.95rem' }}>
            {job.description}
          </div>
        </div>

        {/* Source Attribution & Data Lineage */}
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '0.375rem' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Data Lineage & Source Merging
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Deduplication Hash: <code>{job.dedupeHash}</code>
          </p>
          <div style={{ marginTop: '0.5rem' }}>
            {job.sources?.map((src, i) => (
              <span key={i} className="badge badge-blue" style={{ marginRight: '0.5rem' }}>
                {src.name} ({new Date(src.fetchedAt).toLocaleDateString()})
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
