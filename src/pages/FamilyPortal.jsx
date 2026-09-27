import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import CareWorkspace from '../components/CareWorkspace';
import FamilyOverview from '../components/FamilyOverview';
import MotherAnnouncements from '../components/MotherAnnouncements';
import CaregiverNotes from '../components/CaregiverNotes';
import { session } from '../care';
import { supabase } from '../lib/supabase';

export function FamilyHeader() {
  const user = session(), navigate = useNavigate();
  const caregiver = user.role === 'caregiver';
  const [avatarUrl, setAvatarUrl] = useState('');
  const links = caregiver ? [['/caregiver', 'hand-holding-heart', 'Care workspace']] : [['/user', 'house', 'Home'], ['/user/appointments', 'calendar-days', 'Appointments'], ['/user/records', 'clipboard', 'Records'], ['/user/infants', 'baby', 'My Infants']];
  const initials = (user.name || 'M').split(' ').map(p => p[0]).join('').slice(0, 2);
  useEffect(() => {
    if (!user.id) return undefined;
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
  return <header className={`app-header${caregiver ? " caregiver-header" : ""}`}><Link className="brand" to={caregiver ? '/caregiver' : '/user'}><img src="/medimama/medimamalogo.png" alt="MediMama" /></Link>{!caregiver && <nav className="main-nav" aria-label="Mother pages">{links.map(([to, icon, label]) => <NavLink key={to} to={to} end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}><i className={'fa-solid fa-' + icon} aria-hidden="true" /><span>{label}</span></NavLink>)}</nav>}<div className="header-actions"><Link className="user-pill" to={caregiver ? '/caregiver/profile' : '/user/profile'} aria-label="Open my profile"><span className="avatar">{photo}</span><span><strong>{user.name}</strong><small>{caregiver ? 'Caregiver' : 'Mother'}</small></span></Link><button type="button" className="family-primary" onClick={() => { localStorage.removeItem('medimama-current-session'); navigate('/login'); }}>Log out</button></div></header>;
}

export default function FamilyPortal({ page }) {
  const [params, setParams] = useSearchParams();
  const tab = ['overview', 'appointments', 'records', 'notes'].includes(params.get('tab')) ? params.get('tab') : 'overview';
  const caregiver = page === 'caregiver';
  const titles = { appointments: 'Appointments', records: 'Maternal health records', infants: 'My infants', caregiver: 'Linked family care' };
  const descriptions = { appointments: 'Book a Wednesday visit, reschedule, and review your appointment history.', records: 'Your hospital records, pregnancy progress, and maternal checkup history.', infants: 'Baby profiles, growth measurements, immunizations, and screenings.', caregiver: 'Keep track of your linked family’s care in one place.' };
  return <><PageStyles page="user" /><FamilyHeader /><main className="family-page"><header><div><p>MediMama care</p><h1>{titles[page]}</h1><span>{descriptions[page]}</span></div></header>{caregiver ? <><nav className="caregiver-tabs" aria-label="Caregiver sections">{['overview', 'appointments', 'records', 'notes'].map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setParams({ tab: name })}>{name === 'notes' ? 'Care notes' : name[0].toUpperCase() + name.slice(1)}</button>)}</nav>{tab === 'overview' ? <><FamilyOverview caregiver /><MotherAnnouncements /></> : tab === 'notes' ? <CaregiverNotes /> : <CareWorkspace key={tab} section={tab} />}</> : <CareWorkspace key={page} section={page} />}</main></>;
}
