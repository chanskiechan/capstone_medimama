import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import CareWorkspace from '../components/CareWorkspace';
import FamilyOverview from '../components/FamilyOverview';
import MotherAnnouncements from '../components/MotherAnnouncements';
import { session } from '../care';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { dueReminders } from '../lib/support';
import './FamilyHeader.css';

export function FamilyHeader() {
  const user = session(), navigate = useNavigate();
  const { data } = useStore();
  const caregiver = user.role === 'caregiver';
  const [avatarUrl, setAvatarUrl] = useState('');
  const profileMenu = useRef(null), notificationMenu = useRef(null), location = useLocation();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    if (profileMenu.current) profileMenu.current.open = false;
    setNotificationOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = event => {
      if (profileMenu.current && !profileMenu.current.contains(event.target)) profileMenu.current.open = false;
      if (notificationMenu.current && !notificationMenu.current.contains(event.target)) setNotificationOpen(false);
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      if (profileMenu.current?.open) { profileMenu.current.open = false; profileMenu.current.querySelector('summary')?.focus(); }
      if (notificationOpen) setNotificationOpen(false);
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [notificationOpen]);
  useEffect(() => {
    if (!user.id || user.demo) return undefined;
    let active = true;
    const loadNotifications = async () => {
      const [{ data: rows }, { data: announcementRows }] = await Promise.all([
        supabase.from('notifications').select('id,message,created_at,read_at,link_path').order('created_at', { ascending: false }).limit(10),
        supabase.from('announcements').select('id,title,description,priority,created_at').eq('archived', false).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(10),
      ]);
      if (active) { setNotifications(rows || []); setAnnouncements(announcementRows || []); }
    };
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [user.id, user.demo]);
  const logout = async () => {
    if (!user.demo) { const { error } = await supabase.auth.signOut(); if (error) { setLogoutError('Could not log out. Please try again.'); return; } }
    localStorage.removeItem('medimama-current-session'); navigate('/login', { replace: true });
  };
  const links = caregiver ? [['/caregiver', 'hand-holding-heart', 'Care workspace']] : [['/user', 'house', 'Home'], ['/user/records', 'clipboard', 'Records']];
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
  const reminders = dueReminders(data, user);
  const hasUnread = notifications.some(item => !item.read_at) || announcements.length > 0 || reminders.length > 0;
  return <header className="app-header family-header">
    <Link className="family-brand" to={caregiver ? '/caregiver' : '/user'} aria-label="MediMama home"><img src="/medimama/medimamalogo.png" alt="MediMama" /></Link>
    <nav className="family-navigation" aria-label="Main navigation">
      {links.map(([to, icon, label]) => <NavLink key={to} to={to} end className="family-nav-item"><i className={'fa-solid fa-' + icon} aria-hidden="true" /><span>{label}</span></NavLink>)}
      <NavLink to="/support/concerns" className="family-nav-item"><i className="fa-solid fa-file-lines" aria-hidden="true" /><span>Reports</span></NavLink>
      <NavLink to="/support/education" className={() => 'family-nav-item' + ((location.pathname.startsWith('/support/') && location.pathname !== '/support/concerns') ? ' active' : '')} aria-current={(location.pathname.startsWith('/support/') && location.pathname !== '/support/concerns') ? 'page' : undefined}><i className="fa-solid fa-hand-holding-heart" aria-hidden="true" /><span>Family Support</span></NavLink>
    </nav>
    <div className="family-header-actions">
      <div className="family-notification-wrap" ref={notificationMenu}>
        <button type="button" className={`family-notification${notificationOpen ? ' open' : ''}`} aria-label="Notifications" aria-expanded={notificationOpen} title="Notifications" onClick={() => setNotificationOpen(open => !open)}>
          <i className="fa-solid fa-bell" aria-hidden="true" />
          {hasUnread && <span className="family-notification-dot" aria-label="Unread notifications" />}
        </button>
        {notificationOpen && <div className="family-notification-menu" role="dialog" aria-label="Recent notifications">
          <div className="family-notification-menu-head"><div><strong>Inbox</strong><small>Latest MediMama updates</small></div><Link to="/support/notifications" onClick={() => setNotificationOpen(false)}>View all</Link></div>
          {!notifications.length && !announcements.length && !reminders.length ? <p className="family-notification-empty">No messages or reminders yet.</p> : <div className="family-notification-list">
            {announcements.length > 0 && <section className="family-notification-group"><h3><i className="fa-solid fa-bullhorn" aria-hidden="true" /> Announcements</h3>{announcements.map(item => <Link key={`announcement-${item.id}`} className={`family-notification-item announcement ${item.priority?.toLowerCase() || ''}`} to="/support/education" onClick={() => setNotificationOpen(false)}><i className="fa-solid fa-bullhorn" aria-hidden="true" /><span><strong className="family-notification-title">{item.title}</strong><span className="family-notification-message">{item.description}</span><small>{new Date(item.created_at).toLocaleString()}</small></span></Link>)}</section>}
            {reminders.length > 0 && <section className="family-notification-group"><h3><i className="fa-solid fa-syringe" aria-hidden="true" /> Reminders</h3>{reminders.map(item => <Link key={`reminder-${item.id}`} className="family-notification-item reminder" to="/user/records" onClick={() => setNotificationOpen(false)}><i className="fa-solid fa-syringe" aria-hidden="true" /><span><strong className="family-notification-title">Immunization reminder</strong><span className="family-notification-message">{item.message}</span><small>Due {item.date}</small></span></Link>)}</section>}
            {notifications.length > 0 && <section className="family-notification-group"><h3><i className="fa-solid fa-inbox" aria-hidden="true" /> Inbox updates</h3>{notifications.map(item => { const appointment = item.message?.toLowerCase().includes('appointment'); return <Link key={item.id} className={`family-notification-item ${appointment ? 'appointment' : 'health'}${item.read_at ? '' : ' unread'}`} to={item.link_path || '/support/notifications'} onClick={() => setNotificationOpen(false)}><i className={`fa-solid ${appointment ? 'fa-calendar-check' : 'fa-heart-pulse'}`} aria-hidden="true" /><span><span className="family-notification-message">{item.message}</span><small>{new Date(item.created_at).toLocaleString()}</small></span>{!item.read_at && <b>New</b>}</Link>; })}</section>}
          </div>}
        </div>}
      </div>
      <details className="family-profile" ref={profileMenu}>
        <summary aria-label="Open account options"><span className="family-avatar">{photo}</span><span className="family-account-name"><strong>{user.name}</strong><small>{caregiver ? 'Caregiver' : 'Mother'}</small></span><i className="fa-solid fa-chevron-down" aria-hidden="true" /></summary>
        <div className="family-profile-menu"><p>My account</p><Link to={caregiver ? '/caregiver/profile' : '/user/profile'}><i className="fa-solid fa-user" aria-hidden="true" />View profile</Link><button type="button" onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />Log out</button>{logoutError && <p role="alert">{logoutError}</p>}</div>
      </details>
    </div>
  </header>;
}

export default function FamilyPortal({ page }) {
  const [params, setParams] = useSearchParams();
  const tab = ['overview', 'records'].includes(params.get('tab')) ? params.get('tab') : 'overview';
  const caregiver = page === 'caregiver';
  const titles = { appointments: 'Appointments', records: 'Maternal health records', infants: 'My infants', caregiver: 'Linked family care' };
  const descriptions = { appointments: 'Book a Wednesday visit, reschedule, and review your appointment history.', records: 'Your hospital records, pregnancy progress, and maternal checkup history.', infants: 'Baby profiles, growth measurements, immunizations, and screenings.', caregiver: 'Keep track of your linked family’s care in one place.' };
  return <><PageStyles page="user" /><FamilyHeader /><main className="family-page"><header><div><p>MediMama care</p><h1>{titles[page]}</h1><span>{descriptions[page]}</span></div></header>{caregiver ? <><nav className="caregiver-tabs" aria-label="Caregiver sections">{['overview', 'records'].map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setParams({ tab: name })}>{name[0].toUpperCase() + name.slice(1)}</button>)}</nav>{tab === 'overview' ? <><FamilyOverview caregiver /><MotherAnnouncements /></> : <CareWorkspace key={tab} section={tab} />}</> : <CareWorkspace key={page} section={page} />}</main></>;
}
