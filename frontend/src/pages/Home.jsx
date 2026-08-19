import React, { useState, useEffect } from 'react';
import api from '../api/client';
import JobCard from '../components/JobCard';
import Pagination from '../components/Pagination';
import { Search, Filter, RefreshCw } from 'lucide-react';

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [company, setCompany] = useState('');
  const [skill, setSkill] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters are passed in explicitly rather than read from state, so callers that
  // clear the filters and fetch in the same handler (Reset) query the cleared
  // values instead of the pre-reset ones still held by this render's closure.
  const fetchJobs = async (overrides = {}) => {
    const filters = { search, location, company, skill, page, ...overrides };
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/jobs', {
        params: { ...filters, limit: 10 }
      });
      setJobs(res.data.jobs);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load job postings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    // A new search always starts from page 1, regardless of which page was showing.
    fetchJobs({ page: 1 });
  };

  const handleReset = () => {
    setSearch('');
    setLocation('');
    setCompany('');
    setSkill('');
    setPage(1);
    // Pass the cleared values through directly — the state setters above have not
    // been applied to this closure yet, so reading them here would re-send the
    // filters the user just asked to clear.
    fetchJobs({ search: '', location: '', company: '', skill: '', page: 1 });
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Aggregated Job Opportunities</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Explore normalized and deduplicated job postings ingested from multiple platforms on a schedule.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearchSubmit}>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Text Search</label>
              <input
                type="text"
                className="input"
                placeholder="Title, description, keywords (e.g. SDE, Backend)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Location</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Bangalore, Remote, Hyderabad..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Company</label>
              <input
                type="text"
                className="input"
                placeholder="Filter by company name..."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Skill Requirement</label>
              <input
                type="text"
                className="input"
                placeholder="Filter by skill (e.g. React, SQL, Java)..."
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-between">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {jobs.length} of {total} postings
            </span>
            <div className="flex-gap">
              <button type="button" onClick={handleReset} className="btn btn-outline" style={{ fontSize: '0.85rem' }}>
                <RefreshCw size={14} /> Reset
              </button>
              <button type="submit" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                <Search size={14} /> Search
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Error state */}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading jobs dataset...
        </div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No job postings found matching your search criteria.</p>
        </div>
      ) : (
        <div>
          {jobs.map((job) => (
            <JobCard key={job._id} job={job} />
          ))}
          <Pagination page={page} pages={pages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
