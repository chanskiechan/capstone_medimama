import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PageStyles } from './PageStyles';

const navClass = ({ isActive }) => `menu-link${isActive ? ' active' : ''}`;
export function AdminShell({ page, children }) {
  const location = useLocation();
  const isPatientPage = location.pathname === '/mothers' || location.pathname === '/infants';
  const isHealthcarePage = location.pathname === '/healthcare';
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === null ? !isPatientPage && !isHealthcarePage : saved === 'true';
  });
  const [patients, setPatients] = useState(isPatientPage); const [profile, setProfile] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { localStorage.setItem('sidebarCollapsed', String(collapsed)); }, [collapsed]);
  return <><PageStyles page={page} /><aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
    <div className="sidebar-header"><button className="logo" type="button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><img className="logo-image" src="/medimama/medimama logo1.png" alt="MediMama" /><img className="logo-wordmark" src="/medimama/medimama logo2.png" alt="MediMama" /></button></div>
    <nav className="sidebar-menu">
      <div className="menu-item"><NavLink className={navClass} to="/"><i className="fas fa-home" /><span className="menu-text">Dashboard</span></NavLink></div>
      <div className={`menu-item has-submenu${patients ? ' open' : ''}`}><a className="menu-link" href="#patients" onClick={(e) => { e.preventDefault(); setCollapsed(false); setPatients(!patients); }}><i className="fas fa-users" /><span className="menu-text">Patient Management</span><i className="fas fa-chevron-down arrow" /></a><div className={`submenu${patients ? ' open' : ''}`}><NavLink className="submenu-link" to="/mothers"><i className="fas fa-female" /><span>Mother</span></NavLink><NavLink className="submenu-link" to="/infants"><i className="fas fa-baby" /><span>Infant</span></NavLink></div></div>
      <div className="menu-item"><NavLink className={navClass} to="/healthcare"><i className="fas fa-hospital" /><span className="menu-text">Healthcare Services</span></NavLink></div>
      <div className="menu-item"><a className="menu-link" href="#reports" onClick={(e) => e.preventDefault()}><i className="fas fa-chart-bar" /><span className="menu-text">Reports</span></a></div>
      <div className="menu-item"><NavLink className={navClass} to="/announcements"><i className="fas fa-bullhorn" /><span className="menu-text">Announcements</span></NavLink></div>
      <div className="menu-item"><NavLink className={navClass} to="/system"><i className="fas fa-cog" /><span className="menu-text">System</span></NavLink></div>
    </nav>
    <div className="sidebar-footer"><div className={`profile-item${profile ? ' open' : ''}`}><button className="profile-link" onClick={() => setProfile(!profile)}><i className="fas fa-user-circle" /><span className="menu-text">Profile</span><i className="fas fa-chevron-up profile-arrow" /></button><div className="profile-menu"><NavLink className="profile-menu-link" to="/profile"><i className="fas fa-user-gear" /><span>Profile Settings</span></NavLink><a className="profile-menu-link logout-link" href="#logout" onClick={(e) => { e.preventDefault(); localStorage.removeItem('medimama-current-session'); navigate('/login', { replace: true }); }}><i className="fas fa-right-from-bracket" /><span>Log out</span></a></div></div></div>
  </aside>{children}</>;
}
