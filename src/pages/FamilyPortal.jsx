import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import CareWorkspace from '../components/CareWorkspace';
import FamilyOverview from '../components/FamilyOverview';
import MotherAnnouncements from '../components/MotherAnnouncements';
import CaregiverNotes from '../components/CaregiverNotes';
import { session } from '../care';
import { supabase } from '../lib/supabase';
import './FamilyHeader.css';

export function FamilyHeader() {
  const user = session(), navigate = useNavigate();
  const caregiver = user.role === 'caregiver';
  const [avatarUrl, setAvatarUrl] = useState('');
  const profileMenu = useRef(null), location = useLocation();
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => { if (profileMenu.current) profileMenu.current.open = false; }, [location.pathname]);
  useEffect(() => {
    const close = event => { if (profileMenu.current && !profileMenu.current.contains(event.target)) profileMenu.current.open = false; };
    const escape = event => { if (event.key === 'Escape' && profileMenu.current?.open) { profileMenu.current.open = false; profileMenu.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  const logout = async () => {
    if (!user.demo) { const { error } = await supabase.auth.signOut(); if (error) { setLogoutError('Could not log out. Please try again.'); return; } }
    localStorage.removeItem('medimama-current-session'); navigate('/login', { replace: true });
  };
  const links = caregiver ? [['/caregiver', 'hand-holding-heart', 'Care workspace']] : [['/user', 'house', 'Home'], ['/user/appointments', 'calendar-days', 'Appointments'], ['/user/records', 'clipboard', 'Records'], ['/user/infants', 'baby', 'My Infants']];
  const initials = (user.name || 'M').split(' ').map(p => p[0]).join('').slice(0, 2);
  useEffect(() => {
    if (!user.id || user.demo) return undefined;
    let active = true;
    const loadAvatar = async () => {
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single();
      if (active) setAvatarUrl(data?.avatar_url || '');
    };
    const applyAvatar = event => setAvatarUrl(event.detail || '');
    loadAvatar();
    window.addEventListener('medimama-avatar-updated', applyAvatar);
    return () => { active = false; window.removeEventListener('medimama-avatar-updated', applyAvatar); };
  }, [caregiver, user.id]);
  const photo = avatarUrl ? <img className="header-avatar-image" src={avatarUrl} alt="" /> : initials;
  return <header className="app-header family-header">
    <Link className="family-brand" to={caregiver ? '/caregiver' : '/user'} aria-label="MediMama home"><img src="/medimama/medimamalogo.png" alt="MediMama" /></Link>
    <nav className="family-navigation" aria-label="Main navigation">
      {links.map(([to, icon, label]) => <NavLink key={to} to={to} end className="family-nav-item"><i className={'fa-solid fa-' + icon} aria-hidden="true" /><span>{label}</span></NavLink>)}
      <NavLink to="/support/concerns" className="family-nav-item"><i className="fa-solid fa-file-lines" aria-hidden="true" /><span>Reports</span></NavLink>
      <NavLink to="/support/education" className={() => 'family-nav-item' + ((location.pathname.startsWith('/support/') && location.pathname !== '/support/concerns') ? ' active' : '')} aria-current={(location.pathname.startsWith('/support/') && location.pathname !== '/support/concerns') ? 'page' : undefined}><i className="fa-solid fa-hand-holding-heart" aria-hidden="true" /><span>Family Support</span></NavLink>
    </nav>
    <div className="family-header-actions">
      <NavLink to="/support/notifications" className="family-notification" aria-label="Notifications" title="Notifications"><i className="fa-solid fa-bell" aria-hidden="true" /></NavLink>
      <details className="family-profile" ref={profileMenu}>
        <summary aria-label="Open account options"><span className="family-avatar">{photo}</span><span className="family-account-name"><strong>{user.name}</strong><small>{caregiver ? 'Caregiver' : 'Mother'}</small></span><i className="fa-solid fa-chevron-down" aria-hidden="true" /></summary>
        <div className="family-profile-menu"><p>My account</p><Link to={caregiver ? '/caregiver/profile' : '/user/profile'}><i className="fa-solid fa-user" aria-hidden="true" />View profile</Link><button type="button" onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Log out</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
      </details>
    </div>
  </header>;
}

export default function FamilyPortal({ page }) {
  const [params, setParams] = useSearchParams();
  const tab = ['overview', 'appointments', 'records', 'notes'].includes(params.get('tab')) ? params.get('tab') : 'overview';
  const caregiver = page === 'caregiver';
  const titles = { appointments: 'Appointments', records: 'Maternal health records', infants: 'My infants', caregiver: 'Linked family care' };
  const descriptions = { appointments: 'Book a Wednesday visit, reschedule, and review your appointment history.', records: 'Your hospital records, pregnancy progress, and maternal checkup history.', infants: 'Baby profiles, growth measurements, immunizations, and screenings.', caregiver: 'Keep track of your linked family’s care in one place.' };
  return <><PageStyles page="user" /><FamilyHeader /><main className="family-page"><header><div><p>MediMama care</p><h1>{titles[page]}</h1><span>{descriptions[page]}</span></div></header>{caregiver ? <><nav className="caregiver-tabs" aria-label="Caregiver sections">{['overview', 'appointments', 'records', 'notes'].map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setParams({ tab: name })}>{name === 'notes' ? 'Care notes' : name[0].toUpperCase() + name.slice(1)}</button>)}</nav>{tab === 'overview' ? <><FamilyOverview caregiver /><MotherAnnouncements /></> : tab === 'notes' ? <CaregiverNotes /> : <CareWorkspace key={tab} section={tab} />}</> : <CareWorkspace key={page} section={page} />}</main></>;
}
