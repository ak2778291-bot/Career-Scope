import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Play, Plus, RefreshCw, Activity, Database } from 'lucide-react';

export default function Admin() {
  const [skills, setSkills] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // New Skill form state
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('Language');
  const [newSkillAliases, setNewSkillAliases] = useState('');

  const loadAdminData = async () => {
    try {
      const [skillsRes, logsRes] = await Promise.all([
        api.get('/skills'),
        api.get('/admin/ingestion-logs'),
      ]);
      setSkills(skillsRes.data.skills);
      setLogs(logsRes.data.logs);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleTriggerIngestion = async () => {
    setTriggering(true);
    setMessage('');
    setError('');
    try {
      const res = await api.post('/admin/trigger-ingestion');
      setMessage(res.data.message || 'Ingestion run started asynchronously.');
      // Refresh logs after a short delay
      setTimeout(loadAdminData, 2000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to trigger ingestion.');
    } finally {
      setTriggering(false);
    }
  };

  const handleCreateSkill = async (e) => {
    e.preventDefault();
    if (!newSkillName) return;
    setMessage('');
    setError('');
    try {
      const aliasesArray = newSkillAliases.split(',').map((a) => a.trim()).filter(Boolean);
      await api.post('/admin/skills', {
        name: newSkillName,
        category: newSkillCategory,
        aliases: aliasesArray,
      });
      setNewSkillName('');
      setNewSkillAliases('');
      setMessage(`Skill "${newSkillName}" created successfully.`);
      loadAdminData();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create skill.');
    }
  };

  if (loading) return <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>Loading admin controls...</div>;

  return (
    <div className="container">
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>Admin Settings & Taxonomy Management</h1>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Manual Ingestion Trigger Section */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-between">
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Play size={18} color="var(--primary)" /> Manual Pipeline Re-Ingestion Trigger
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Triggers the <code>runIngestion()</code> workflow asynchronously across both external job APIs.
            </p>
          </div>
          <button onClick={handleTriggerIngestion} disabled={triggering} className="btn btn-primary">
            <RefreshCw size={14} className={triggering ? 'spin' : ''} />
            {triggering ? 'Starting Pipeline...' : 'Trigger Ingestion Run'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        {/* Ingestion Logs */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} color="var(--accent-orange)" /> Recent Ingestion Logs
          </h2>
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No ingestion runs logged yet.</p>
          ) : (
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {logs.map((log) => (
                <div key={log._id} style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                  <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                    <span className="badge badge-blue">{log.source}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {new Date(log.runAt).toLocaleTimeString()} ({log.durationMs || 0}ms)
                    </span>
                  </div>
                  <div>
                    Fetched: <strong>{log.recordsFetched}</strong> | Inserted: <strong>{log.recordsInserted}</strong> | Deduped: <strong>{log.recordsDeduplicated}</strong>
                  </div>
                  {log.errors?.length > 0 && (
                    <div style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Warnings/Errors: {log.errors.length}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Skill to Taxonomy */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} color="var(--accent-green)" /> Add Skill to Canonical Taxonomy
          </h2>
          <form onSubmit={handleCreateSkill}>
            <div className="form-group">
              <label>Skill Name (Canonical)</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Rust, GraphQL, Docker"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Category</label>
              <select className="select" value={newSkillCategory} onChange={(e) => setNewSkillCategory(e.target.value)}>
                <option value="Language">Language</option>
                <option value="Framework">Framework</option>
                <option value="Database">Database</option>
                <option value="Concept">Concept</option>
                <option value="Tool">Tool</option>
                <option value="Cloud">Cloud</option>
              </select>
            </div>

            <div className="form-group">
              <label>Aliases (Comma separated)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. k8s, kube (for Kubernetes)"
                value={newSkillAliases}
                onChange={(e) => setNewSkillAliases(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-outline" style={{ width: '100%' }}>
              Add Skill to Taxonomy
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
