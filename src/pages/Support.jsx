import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
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

export function SupportNav() {
  return <nav className="support-nav" aria-label="Family support">{[['education','Health education'],['concerns','Reports'],['notifications','Notifications'],['assistant','Health assistant']].map(([path,label]) => <NavLink key={path} to={`/support/${path}`}>{label}</NavLink>)}</nav>;
}

export default function Support({ admin = false, view }) {
  const params = useParams(), section = view || params.section || 'education';
  const { storageError } = useStore();
  const content = <main className={admin ? 'main-content directory-page' : 'family-page'}><h1>{({ education: 'Health education', concerns: 'Reports', notifications: 'Notifications', assistant: 'MediMama Health Assistant', archives: 'Patient archives', reports: 'Healthcare reports' })[section] || 'Family support'}</h1>{!admin && <SupportNav />}{storageError && <p role="alert" className="support-message">{storageError}</p>}{section === 'education' ? <Education /> : section === 'concerns' ? <ConcernReports admin={admin || session().role === 'admin'} /> : section === 'notifications' ? <Notifications /> : section === 'assistant' ? <Assistant />  : section === 'reports' ? <HealthcareReports /> : <p>Choose a support page above.</p>}</main>;
  return admin ? <AdminShell page="reports">{content}</AdminShell> : <><PageStyles page="user" /><FamilyHeader />{content}</>;
}

function Education() {
  const [query,setQuery] = useState('');
  return <><p>Learn about caring for yourself and your family. These resources support conversations with your health worker.</p><label className="support-form">Search topics<input value={query} onChange={e => setQuery(e.target.value)} placeholder="For example: family planning" /></label><div className="support-grid">{healthResources.filter(r => `${r.title} ${r.text}`.toLowerCase().includes(query.toLowerCase())).map(r => <article className="support-panel" key={r.id}><h2>{r.title}</h2><p>{r.text}</p><a href={r.url} target="_blank" rel="noreferrer">Read the WHO resource</a></article>)}</div></>;
}

export function Assistant() {
  const { data, loadingRecords, storageError } = useStore();
  const [input,setInput] = useState(''), [messages,setMessages] = useState([]);
  const log = useRef(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages]);
  const ask = question => { if (!question.trim()) return; const answer = assistantReply(question, data, session(), {loading:loadingRecords,error:storageError}); setMessages(previous => [...previous, {text:question,from:'user'}, {...answer,from:'assistant'}]); setInput(''); };
  const send = e => { e.preventDefault(); ask(input); };
  return <section className="support-panel"><p>Ask about education topics, your next appointment, or vaccine reminders. This guided assistant uses the resources and records in MediMama. It does not diagnose or prescribe treatment.</p><div className="assistant-quick-prompts">{["Next appointment", "Vaccines due", "Family planning", "Pagpapasuso"].map(question => <button type="button" key={question} onClick={() => ask(question)}>{question}</button>)}</div><div ref={log} className="support-chat" role="log" aria-live="polite">{messages.map((m,i) => <p key={i} className={m.from}><strong>{m.from === 'user' ? 'You' : 'MediMama'}: </strong>{m.text}{m.url && <><br /><a href={m.url} target="_blank" rel="noreferrer">WHO source</a></>}</p>)}</div><form className="support-form" onSubmit={send}><label>Your question<input required maxLength={1000} value={input} onChange={e => setInput(e.target.value)} placeholder="When is my next appointment?" /></label><button disabled={!input.trim()}>Send</button></form></section>;
}

function Notifications() {
  const {data} = useStore(), user = session();
  const [items,setItems] = useState([]), [error,setError] = useState('');
  const load = async () => { if(user.demo) return; try { const {data:rows,error:problem} = await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100); if(problem) throw problem; setItems(rows); setError(''); } catch(e) { setError(e.message); } };
  useEffect(() => { load(); const timer = setInterval(load,30000); return () => clearInterval(timer); }, []);
  const reminders = dueReminders(data,user);
  return <>{error && <p role="alert" className="support-message">{error}</p>}<section className="support-panel notification-reminders"><div className="notification-section-heading"><div><p className="notification-eyebrow">Health updates</p><h2>Immunization reminders</h2></div><i className="fa-solid fa-syringe" aria-hidden="true" /></div>{reminders.length ? <div className="reminder-list">{reminders.map(reminder => <div className="reminder-item" key={reminder.id}><i className="fa-solid fa-circle-check" aria-hidden="true" /><span><strong>{reminder.date}</strong>{reminder.message}</span></div>)}</div> : <p className="notification-empty-copy">No vaccine reminders due in the next seven days.</p>}</section><section className="support-panel notification-panel"><header className="notification-header"><div><p className="notification-eyebrow">MediMama updates</p><h2>Inbox</h2><p>Appointment updates, reminders, and health concern replies appear here.</p></div><button className="notification-refresh" onClick={load}><i className="fa-solid fa-rotate" aria-hidden="true" /> Refresh</button></header>{!items.length ? <div className="notification-empty"><i className="fa-regular fa-bell-slash" aria-hidden="true" /><strong>No messages yet</strong><span>Your updates will appear here.</span></div> : <div className="notification-list">{items.map(item => { const appointment = item.message?.toLowerCase().includes('appointment'); return <article className={`notification-card ${appointment ? 'appointment' : 'health'}${item.read_at ? '' : ' unread'}`} key={item.id}><div className="notification-leading"><i className={`fa-solid ${appointment ? 'fa-calendar-check' : 'fa-heart-pulse'}`} aria-hidden="true" /></div><div className="notification-content"><div className="notification-message-row">{!item.read_at && <span className="notification-new">New</span>}<p className="notification-message">{item.message}</p></div><small><i className="fa-regular fa-clock" aria-hidden="true" /> {new Date(item.created_at).toLocaleString()}</small>{item.link_path && <Link className="notification-link" to={item.link_path}>View details <i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>}</div></article>; })}</div>}</section></>;
}

export function HealthcareReports() {
  const {data,loadingRecords,storageError} = useStore();
  const [start,setStart] = useState(today().slice(0,7)+'-01'), [end,setEnd] = useState(today()), [kind,setKind] = useState('All');
  const allRows = reportRows(data,start,end), rows = allRows.filter(r => kind === 'All' || r.type === kind);
  const download = () => { const header = ['date','patient','record','type','details']; const csv = [header.map(csvCell).join(','), ...rows.map(r => header.map(k => csvCell(r[k])).join(','))].join('\r\n'); const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})); const a = document.createElement('a'); a.href=url; a.download=`medimama-report-${start}-${end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
  return <><section className="support-panel"><div className="support-actions"><label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>To<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label><label>Activity<select value={kind} onChange={e=>setKind(e.target.value)}><option>All</option>{[...new Set(allRows.map(r=>r.type))].map(t=><option key={t}>{t}</option>)}</select></label><button onClick={download} disabled={!rows.length || loadingRecords || Boolean(storageError) || start>end}>Export CSV</button><button onClick={()=>window.print()}>Print / Save PDF</button></div>{start>end && <p role="alert">Choose an end date after the start date.</p>}<p>{rows.length} activities · {new Set(rows.map(r=>r.record)).size} patients in this report.</p><div className="support-grid">{[...new Set(allRows.map(r=>r.type))].map(type=><p key={type}><strong>{allRows.filter(r=>r.type===type).length}</strong> {type}</p>)}</div><div className="support-table-wrap"><table className="support-table"><thead><tr><th>Date</th><th>Patient</th><th>Activity</th><th>Details</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.patient}<br/><small>{r.record}</small></td><td>{r.type}</td><td>{r.details}</td></tr>)}</tbody></table></div>{!rows.length && <p>No activities in this period.</p>}</section></>;
}

