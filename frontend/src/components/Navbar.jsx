import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Briefcase, BarChart2, CheckSquare, User, Shield, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <Briefcase size={22} color="#38bdf8" />
        <span>Career Connect</span>
      </Link>

      <ul className="nav-links">
        <li>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Jobs
          </NavLink>
        </li>
        <li>
          <NavLink to="/trends" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Trends
          </NavLink>
        </li>
        {user && (
          <li>
            <NavLink to="/skill-gap" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Skill Gap & Roadmap
            </NavLink>
          </li>
        )}
        {user?.role === 'ADMIN' && (
          <li>
            <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Admin
            </NavLink>
          </li>
        )}

        {user ? (
          <>
            <li>
              <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Profile ({user.name.split(' ')[0]})
              </NavLink>
            </li>
            <li>
              <button onClick={handleLogout} className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}>
                <LogOut size={14} /> Logout
              </button>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/login" className="nav-link">Login</Link>
            </li>
            <li>
              <Link to="/register" className="btn btn-primary" style={{ padding: '0.35rem 0.75rem' }}>
                Register
              </Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}
