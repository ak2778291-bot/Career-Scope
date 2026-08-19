import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import SkillBadge from '../components/SkillBadge';
import { Plus, Trash2, Save, User, Target } from 'lucide-react';

export default function Profile() {
  const { user, updateUserProfileState } = useAuth();
  const [profile, setProfile] = useState(null);
  const [userSkills, setUserSkills] = useState([]);
  const [allSkills, setAllSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [targetRole, setTargetRole] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [proficiency, setProficiency] = useState('beginner');
  const [status, setStatus] = useState('learning');

  const loadProfileData = async () => {
    try {
      const [profRes, skillsRes] = await Promise.all([
        api.get('/users/me/profile'),
        api.get('/skills'),
      ]);
      setProfile(profRes.data.user);
      setUserSkills(profRes.data.skills);
      setTargetRole(profRes.data.user.targetRole || '');
      setAllSkills(skillsRes.data.skills);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  const handleUpdateTargetRole = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await api.put('/users/me/profile', { targetRole });
      setProfile(res.data.user);
      updateUserProfileState(res.data.user);
      setSuccess('Target role updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update target role.');
    }
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    if (!selectedSkillId) return;
    setError('');
    setSuccess('');
    try {
      await api.post('/users/me/skills', { skillId: selectedSkillId, proficiency, status });
      setSelectedSkillId('');
      setSuccess('Skill added to profile.');
      loadProfileData();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add skill.');
    }
  };

  const handleRemoveSkill = async (skillId) => {
    setError('');
    setSuccess('');
    try {
      await api.delete(`/users/me/skills/${skillId}`);
      setSuccess('Skill removed from profile.');
      loadProfileData();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to remove skill.');
    }
  };

  if (loading) return <div className="container" style={{ padding: '3rem', textAlign: 'center' }}>Loading user profile...</div>;

  return (
    <div className="container">
      <h1 style={{ fontSize: '1.75rem', marginBottom: '1.5rem' }}>Student Skill Profile</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="grid-2">
        {/* Target Role Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={18} color="var(--primary)" /> Placement Target Setting
          </h2>

          <form onSubmit={handleUpdateTargetRole}>
            <div className="form-group">
              <label>Target Role for Skill-Gap Analysis</label>
              <input
                type="text"
                className="input"
                value={targetRole}
                placeholder="e.g. Software Engineer, SDE Intern, Backend Engineer"
                onChange={(e) => setTargetRole(e.target.value)}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                The skill-gap engine compares your skills against live postings matching this exact title keyword.
              </p>
            </div>
            <button type="submit" className="btn btn-primary">
              <Save size={14} /> Update Target Role
            </button>
          </form>
        </div>

        {/* Add Skill Form */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} color="var(--accent-green)" /> Add Skill to Profile
          </h2>

          <form onSubmit={handleAddSkill}>
            <div className="form-group">
              <label>Select Taxonomy Skill</label>
              <select
                className="select"
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                required
              >
                <option value="">-- Choose a skill --</option>
                {allSkills.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid-2" style={{ marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Proficiency</label>
                <select className="select" value={proficiency} onChange={(e) => setProficiency(e.target.value)}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Current Status</label>
                <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="learning">In Progress (Learning)</option>
                  <option value="proficient">Proficient</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-outline" style={{ width: '100%' }}>
              Add / Update Skill
            </button>
          </form>
        </div>
      </div>

      {/* User Current Skills List */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Your Current Skills ({userSkills.length})</h2>

        {userSkills.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No skills added to your profile yet. Use the form above to add your current technical skills.
          </p>
        ) : (
          <div className="grid-2">
            {userSkills.map((us) => (
              <div key={us.userSkillId} className="flex-between" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-primary)', borderRadius: '0.375rem' }}>
                <div>
                  <SkillBadge name={us.name} category={us.category} status={us.status} />
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Proficiency: {us.proficiency} | Status: {us.status}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveSkill(us.skillId)}
                  className="btn btn-outline"
                  style={{ padding: '0.3rem 0.5rem', color: 'var(--accent-red)' }}
                  title="Remove skill"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
