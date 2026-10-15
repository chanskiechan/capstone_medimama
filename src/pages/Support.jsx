import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { FamilyHeader } from './FamilyPortal';
import { PageStyles } from '../components/PageStyles';
import { useStore } from '../store';
import { family, session, today } from '../care';
import { supabase } from '../lib/supabase';
import { healthResources } from '../healthResources';
import { assistantReply, dueReminders, reportRows, csvCell } from '../lib/support';
import './Support.css';
import ConcernReports from './ConcernReports';

export default function Support({ admin = false, view }) {
  const params = useParams(), section = view || params.section || 'education';
  const { storageError } = useStore();
  if (section === 'assistant') return <Navigate to="/support/education" replace />;
  const content = <main className={admin ? 'main-content directory-page' : 'family-page support-page'}><h1>{({ education: 'Health education', concerns: 'Reports', notifications: 'Notifications', archives: 'Patient archives', reports: 'Healthcare reports' })[section] || 'Family support'}</h1>{storageError && <p role="alert" className="support-message">{storageError}</p>}{section === 'education' ? <Education /> : section === 'concerns' ? <ConcernReports admin={admin || session().role === 'admin'} /> : section === 'notifications' ? <Notifications /> : section === 'reports' ? <HealthcareReports /> : <p>Choose a support page above.</p>}</main>;
  return admin ? <AdminShell page="reports">{content}</AdminShell> : <><PageStyles page="user" /><FamilyHeader />{content}</>;
}

function Education() {
  const [query,setQuery] = useState('');
  const icons = { pregnancy: 'fa-person-pregnant', postnatal: 'fa-baby', feeding: 'fa-heart-pulse', nutrition: 'fa-apple-whole', planning: 'fa-people-roof', vaccines: 'fa-syringe' };
  const results = healthResources.filter(r => `${r.title} ${r.text}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="education-content" aria-label="Health education resources"><div className="education-intro"><p>Learn about caring for yourself and your family. These resources support conversations with your health worker.</p><label className="education-search"><span>Search topics</span><span className="education-search-field"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search family planning, nutrition, vaccines..." /></span></label></div><div className="support-grid education-grid">{results.map(r => <article className="support-panel education-card" key={r.id}><div className="education-card-icon"><i className={`fa-solid ${icons[r.id] || 'fa-book-medical'}`} aria-hidden="true" /></div><h2>{r.title}</h2><p>{r.text}</p><a className="education-resource-link" href={r.url} target="_blank" rel="noreferrer">Read WHO resource <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></a></article>)}</div>{!results.length && <div className="education-empty"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><strong>No topics found</strong><span>Try another search term.</span></div>}</section>;
}

export function Assistant() {
  const { data, loadingRecords, storageError } = useStore();
  const [input,setInput] = useState(''), [messages,setMessages] = useState([{text:'Hi! I can help with education topics, appointments, and vaccine reminders. What would you like to know?',from:'assistant'}]);
  const log = useRef(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  const ask = question => { if (!question.trim()) return; const answer = assistantReply(question, data, session(), {loading:loadingRecords,error:storageError}); setMessages(previous => [...previous, {text:question,from:'user'}, {...answer,from:'assistant'}]); setInput(''); };
  const send = e => { e.preventDefault(); ask(input); };
  return <section className="support-panel"><p>Ask about education topics, your next appointment, or vaccine reminders. This guided assistant uses the resources and records in MediMama. It does not diagnose or prescribe treatment.</p><div className="assistant-quick-prompts">{["Next appointment", "Vaccines due", "Family planning", "Pagpapasuso", "Kailan ang bakuna ni baby?"].map(question => <button type="button" key={question} onClick={() => ask(question)}>{question}</button>)}</div><div ref={log} className="support-chat" role="log" aria-live="polite">{messages.map((m,i) => <p key={i} className={m.from}><strong>{m.from === 'user' ? 'You' : 'MediMama'}: </strong>{m.text}{m.url && <><br /><a href={m.url} target="_blank" rel="noreferrer">WHO source</a></>}</p>)}</div><form className="support-form" onSubmit={send}><label>Your question<input required maxLength={1000} value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your next check-up or vaccine..." /></label><button disabled={!input.trim()}>Send</button></form></section>;
}

function Notifications() {
  const { data } = useStore(), user = session();
  const [items, setItems] = useState([]), [announcements, setAnnouncements] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = async () => { if (user.demo) return; try { const [{ data: rows, error: notificationError }, { data: announcementRows, error: announcementError }] = await Promise.all([supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100), supabase.from('announcements').select('id,title,description,priority,created_at,pinned').eq('archived', false).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100)]); if (notificationError) throw notificationError; if (announcementError) throw announcementError; setItems(rows || []); setAnnouncements(announcementRows || []); setError(''); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);
  const markAllRead = async () => {
    const unread = items.some(item => !item.read_at);
    if (!unread || busy || user.demo) return;
    setBusy(true);
    const markedAt = new Date().toISOString();
    try {
      const { error: problem } = await supabase.from('notifications').update({ read_at: markedAt }).eq('user_id', user.id).is('read_at', null);
      if (problem) throw problem;
      setItems(previous => previous.map(item => item.read_at ? item : { ...item, read_at: markedAt }));
      setError('');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const reminders = dueReminders(data, user);
  const updates = [
    ...items.map(item => ({ ...item, type: 'Personal', kind: 'personal', title: '', link_path: item.link_path || '/support/notifications' })),
    ...announcements.map(item => ({ ...item, type: 'Announcement', kind: 'announcement', message: item.description, link_path: '/support/education' })),
    ...reminders.map(item => ({ ...item, id: `reminder-${item.id}`, type: 'Reminder', kind: 'reminder', title: 'Immunization reminder', message: item.message, created_at: `${item.date}T00:00:00+08:00`, link_path: '/user/records' }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const unreadCount = items.filter(item => !item.read_at).length;
  return <>{error && <p role="alert" className="support-message">{error}</p>}<section className="support-panel notification-panel"><header className="notification-header"><div><p className="notification-eyebrow">MediMama updates</p><h2>Notifications &amp; updates</h2><p>Personal messages, announcements, and health reminders appear in one place.</p></div><div className="notification-header-actions"><button className="notification-mark-all" onClick={markAllRead} disabled={!unreadCount || busy}>{busy ? 'Updating...' : 'Mark all as read'}</button><button className="notification-refresh" onClick={load} disabled={busy}><i className="fa-solid fa-rotate" aria-hidden="true" /> Refresh</button></div></header>{!updates.length ? <div className="notification-empty"><i className="fa-regular fa-bell-slash" aria-hidden="true" /><strong>No notifications yet</strong><span>Your updates will appear here.</span></div> : <div className="notification-list">{updates.map(item => { const appointment = item.kind === 'personal' && item.message?.toLowerCase().includes('appointment'); const unreadClass = item.kind === 'personal' && !item.read_at ? ' unread' : ''; const icon = item.kind === 'announcement' ? 'fa-bullhorn' : item.kind === 'reminder' ? 'fa-syringe' : appointment ? 'fa-calendar-check' : 'fa-heart-pulse'; return <article className={`notification-card ${item.kind} ${appointment ? 'appointment' : ''}${unreadClass}`} key={`${item.kind}-${item.id}`}><div className="notification-leading"><i className={`fa-solid ${icon}`} aria-hidden="true" /></div><div className="notification-content"><div className="notification-message-row">{item.kind === 'personal' && !item.read_at && <span className="notification-new">New</span>}<span className={`notification-type ${item.kind}`}>{item.type}</span></div>{item.title && <strong className="notification-title">{item.title}</strong>}<p className="notification-message">{item.message}</p><small><i className="fa-regular fa-clock" aria-hidden="true" /> {item.kind === 'reminder' ? `Due ${item.date}` : new Date(item.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</small>{item.link_path && <Link className="notification-link" to={item.link_path}>View details <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>}</div></article>; })}</div>}</section></>;
}

export function HealthcareReports() {
  const {data,loadingRecords,storageError} = useStore();
  const [start,setStart] = useState(today().slice(0,7)+'-01'), [end,setEnd] = useState(today()), [kind,setKind] = useState('All');
  const allRows = reportRows(data,start,end), rows = allRows.filter(r => kind === 'All' || r.type === kind);
  const download = () => { const header = ['date','patient','record','type','details']; const csv = [header.map(csvCell).join(','), ...rows.map(r => header.map(k => csvCell(r[k])).join(','))].join('\r\n'); const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})); const a = document.createElement('a'); a.href=url; a.download=`medimama-report-${start}-${end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
  return <><section className="support-panel"><div className="support-actions"><label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>To<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label><label>Activity<select value={kind} onChange={e=>setKind(e.target.value)}><option>All</option>{[...new Set(allRows.map(r=>r.type))].map(t=><option key={t}>{t}</option>)}</select></label><button onClick={download} disabled={!rows.length || loadingRecords || Boolean(storageError) || start>end}>Export CSV</button><button onClick={()=>window.print()}>Print / Save PDF</button></div>{start>end && <p role="alert">Choose an end date after the start date.</p>}<p>{rows.length} activities · {new Set(rows.map(r=>r.record)).size} patients in this report.</p><div className="support-grid">{[...new Set(allRows.map(r=>r.type))].map(type=><p key={type}><strong>{allRows.filter(r=>r.type===type).length}</strong> {type}</p>)}</div><div className="support-table-wrap"><table className="support-table"><thead><tr><th>Date</th><th>Patient</th><th>Activity</th><th>Details</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.patient}<br/><small>{r.record}</small></td><td>{r.type}</td><td>{r.details}</td></tr>)}</tbody></table></div>{!rows.length && <p>No activities in this period.</p>}</section></>;
}

