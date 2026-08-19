import React, { useState, useEffect } from 'react';
import api from '../api/client';
import SkillBadge from '../components/SkillBadge';
import { CheckCircle2, AlertCircle, BookOpen, ExternalLink, RefreshCw, Clock } from 'lucide-react';

export default function SkillGap() {
  const [gapData, setGapData] = useState(null);
  const [roadmapData, setRoadmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const [gapRes, roadmapRes] = await Promise.all([
        api.get('/users/me/skill-gap'),
        api.get('/users/me/roadmap'),
      ]);
      setGapData(gapRes.data.gap);
      setRoadmapData(roadmapRes.data.roadmap);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to compute skill-gap report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalysis();
  }, []);

  if (loading) return <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>Computing personalized skill gap against live database...</div>;
  if (error) return <div className="container" style={{ padding: '2rem' }}><div className="alert alert-error">{error}</div></div>;

  return (
    <div className="container">
      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Personalized Placement Skill Gap</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Target Role: <strong>{gapData.targetRole}</strong> | Analyzed against {gapData.jobsAnalyzed} live postings in database
          </p>
        </div>
        <button onClick={loadAnalysis} className="btn btn-outline">
          <RefreshCw size={14} /> Recompute
        </button>
      </div>

      {gapData.noDataMessage ? (
        <div className="alert alert-info">{gapData.noDataMessage}</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 700, color: gapData.gapPercent > 50 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                {gapData.gapPercent}%
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Computed Skill Gap</div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                {gapData.matched.length}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Matched Skills</div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--accent-orange)' }}>
                {(gapData.partiallyMatched || []).length}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>In Progress</div>
            </div>

            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--accent-red)' }}>
                {gapData.missing.length}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Missing Required Skills</div>
            </div>
          </div>

          {/* Matched / In-Progress / Missing Detail Grids */}
          <div className="grid-3" style={{ marginBottom: '2rem' }}>
            {/* Matched Skills Card */}
            <div className="card">
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-green)' }}>
                <CheckCircle2 size={18} /> Matched Skills ({gapData.matched.length})
              </h2>
              {gapData.matched.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No skills currently match the target role requirements.</p>
              ) : (
                <div>
                  {gapData.matched.map((s) => (
                    <div key={s.skillId} style={{ marginBottom: '0.5rem' }}>
                      <SkillBadge name={s.name} category={s.category} status={s.status} type="green" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Partially Matched (In Progress) Skills Card */}
            <div className="card">
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-orange)' }}>
                <Clock size={18} /> In Progress ({(gapData.partiallyMatched || []).length})
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                Demanded skills you have started but marked as still learning. These do not count toward your gap score.
              </p>
              {(gapData.partiallyMatched || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No skills currently marked as in progress.</p>
              ) : (
                <div>
                  {gapData.partiallyMatched.map((s) => (
                    <div key={s.skillId} style={{ marginBottom: '0.5rem' }}>
                      <SkillBadge name={s.name} category={s.category} status={s.status} type="orange" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Missing Skills Card */}
            <div className="card">
              <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-red)' }}>
                <AlertCircle size={18} /> Missing Demanded Skills ({gapData.missing.length})
              </h2>
              {gapData.missing.length === 0 ? (
                <p style={{ color: 'var(--accent-green)', fontSize: '0.85rem' }}>Great job! You have all skills demanded for your target role.</p>
              ) : (
                <div>
                  {gapData.missing.map((s) => (
                    <div key={s.skillId} style={{ marginBottom: '0.5rem' }}>
                      <SkillBadge name={s.name} category={s.category} type="red" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Personalized Preparation Roadmap */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={20} color="var(--primary)" /> Actionable Preparation Roadmap
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Curated preparation guides mapped specifically to your missing skill set.
            </p>

            {roadmapData.length === 0 ? (
              <div style={{ color: 'var(--accent-green)', padding: '1rem', textAlign: 'center' }}>
                No preparation roadmap needed — your skill set completely covers target role postings.
              </div>
            ) : (
              <div className="grid-2">
                {roadmapData.map((item) => (
                  <div key={item.skillId} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem', backgroundColor: 'var(--bg-primary)' }}>
                    <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                      <h4 style={{ color: 'var(--primary)', fontSize: '1rem' }}>{item.skillName}</h4>
                      <span className="badge badge-blue">{item.resource.type}</span>
                    </div>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>{item.resource.title}</p>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{item.resource.description}</p>
                    <a
                      href={item.resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                    >
                      Open Resource <ExternalLink size={12} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
