import React, { useState, useEffect } from 'react';
import api from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line
} from 'recharts';
import { BarChart2, TrendingUp, Building, MapPin, Link2 } from 'lucide-react';

export default function Trends() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/trends')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Failed to load placement trends.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>Executing aggregation pipelines in database...</div>;
  if (error) return <div className="container" style={{ padding: '2rem' }}><div className="alert alert-error">{error}</div></div>;
  if (!data) return null;

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>Placement Market Intelligence & Trends</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Aggregated in-database via MongoDB <code>$match/$group/$sort</code> aggregation pipelines over real job postings.
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Top Demanded Skills Chart */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={18} color="var(--primary)" /> Top Demanded Skills (Last 30 Days)
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data.topSkills} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="name" type="category" stroke="#f8fafc" width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Postings by Company Chart */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building size={18} color="var(--accent-green)" /> Top Hiring Companies
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data.byCompany}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#f8fafc" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="count" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Postings over Time Chart */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} color="var(--accent-orange)" /> Posting Volume Trend (Weekly)
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={data.overTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis stroke="#f8fafc" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Line type="monotone" dataKey="count" stroke="#fb923c" strokeWidth={2} dot={{ fill: '#fb923c' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Postings by Location Chart */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} color="#c084fc" /> Top Opportunity Locations
          </h2>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data.byLocation}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="location" stroke="#94a3b8" />
                <YAxis stroke="#f8fafc" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="count" fill="#c084fc" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Skill Co-occurrence — which skills employers ask for together */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link2 size={18} color="#f472b6" /> Most Common Skill Pairings
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Skills most frequently demanded <em>together</em> in the same posting — computed in-database by
          crossing each job&apos;s skill set against itself. Useful for deciding what to learn alongside a skill you already have.
        </p>

        {!data.cooccurrence || data.cooccurrence.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Not enough postings with two or more extracted skills yet to compute pairings.
          </p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={data.cooccurrence} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" allowDecimals={false} />
                <YAxis dataKey="pair" type="category" stroke="#f8fafc" width={190} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  formatter={(value) => [`${value} postings`, 'Demanded together in']}
                />
                <Bar dataKey="count" fill="#f472b6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
