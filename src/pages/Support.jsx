import { useEffect, useRef, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { FamilyHeader } from './FamilyPortal';
import { PageStyles } from '../components/PageStyles';
import { useStore } from '../store';
import { family, session, today } from '../care';
import { supabase } from '../lib/supabase';
import { healthResources } from '../healthResources';
import { assistantReply, dueReminders, reportRows, csvCell } from '../lib/support';
import './Support.css';

export function SupportNav() {
  return <nav className="support-nav" aria-label="Family support">{[['education','Health education'],['concerns','Health concerns'],['notifications','Notifications'],['assistant','Health assistant']].map(([path,label]) => <NavLink key={path} to={`/support/${path}`}>{label}</NavLink>)}</nav>;
}

export default function Support({ admin = false, view }) {
  const params = useParams(), section = view || params.section || 'education';
  const { storageError, loadingRecords } = useStore();
  const content = <main className={admin ? 'main-content directory-page' : 'family-page'}><h1>{({ education: 'Health education', concerns: 'Health concerns', notifications: 'Notifications', assistant: 'MediMama Health Assistant', archives: 'Patient archives', reports: 'Healthcare reports' })[section] || 'Family support'}</h1>{!admin && <SupportNav />}{loadingRecords && <p role="status">Loading shared records…</p>}{storageError && <p role="alert" className="support-message">{storageError}</p>}{section === 'education' ? <Education /> : section === 'concerns' ? <Concerns admin={admin} /> : section === 'notifications' ? <Notifications /> : section === 'assistant' ? <Assistant /> : section === 'archives' ? <Archives /> : section === 'reports' ? <HealthcareReports /> : <p>Choose a support page above.</p>}</main>;
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

function Concerns({ admin }) {
  const { data } = useStore(), user = session(), scope = family(data,user);
  const patients = [...scope.mothers, ...scope.infants].filter(p => !p.archived);
  const [items,setItems] = useState([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [loaded,setLoaded] = useState(false);
  const load = async () => { if(user.demo) { setLoaded(true); return; } try { const {data: rows,error: problem} = await supabase.from('health_concerns').select('*').order('created_at',{ascending:false}); if(problem) throw problem; setItems(rows); setError(''); } catch(e) { setError(e.message); } finally { setLoaded(true); } };
  useEffect(() => { load(); }, []);
  const submit = async e => {
    e.preventDefault(); const form = e.currentTarget, values = Object.fromEntries(new FormData(form)), patient = patients.find(p => p.id === values.patient);
    if(!patient || user.demo) return;
    setBusy(true); setError('');
    try { const {error: problem} = await supabase.from('health_concerns').insert({ [patient.motherId ? 'infant_id' : 'mother_id']: patient.id, author_id:user.id, category:values.category, description:values.description.trim() }); if(problem) throw problem; form.reset(); await load(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const review = async (e,item) => { e.preventDefault(); setBusy(true); const values = Object.fromEntries(new FormData(e.currentTarget)); try { const {error:problem} = await supabase.from('health_concerns').update({status:values.status,response:values.response,reviewed_by:user.id}).eq('id',item.id); if(problem) throw problem; await load(); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  return <><p>This inbox is for non-emergency concerns. If you believe there is an emergency, seek immediate medical care instead of waiting for a reply.</p>{error && <p role="alert" className="support-message">{error}</p>}{user.demo && <p>Sign in with a registered account to submit concerns.</p>}{!admin && <section className="support-panel"><h2>Report a concern</h2><form className="support-form" onSubmit={submit}><label>Patient<select name="patient" required><option value="">Choose a linked patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Topic<select name="category"><option>Maternal health</option><option>Infant health</option><option>Post-vaccination</option></select></label><label>Describe your concern<textarea name="description" maxLength={3000} required /></label><button disabled={busy || user.demo || !patients.length}>{busy ? 'Saving…' : 'Submit concern'}</button></form></section>}<button onClick={load}>Refresh concerns</button>{!loaded ? <p>Loading…</p> : !items.length && <p>No concerns submitted yet.</p>}{items.map(item => <article className="support-panel" key={item.id}><h2>{item.category} · {item.status}</h2><p className="support-meta">{[...data.mothers,...data.infants].find(p => p.id === (item.mother_id || item.infant_id))?.name || 'Linked patient'} · {new Date(item.created_at).toLocaleString()}</p><p>{item.description}</p>{item.response && <p><strong>Health worker response:</strong> {item.response}</p>}{admin && <form className="support-form" onSubmit={e => review(e,item)}><label>Status<select name="status" defaultValue={item.status}><option>Open</option><option>Under review</option><option>Resolved</option></select></label><label>Response<textarea name="response" maxLength={3000} required defaultValue={item.response} /></label><button disabled={busy}>Save response</button></form>}</article>)}</>;
}

function Notifications() {
  const {data} = useStore(), user = session();
  const [items,setItems] = useState([]), [error,setError] = useState('');
  const load = async () => { if(user.demo) return; try { const {data:rows,error:problem} = await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(100); if(problem) throw problem; setItems(rows); setError(''); } catch(e) { setError(e.message); } };
  useEffect(() => { load(); const timer = setInterval(load,30000); return () => clearInterval(timer); }, []);
  const markRead = async id => { const {error:problem} = await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id); if(problem) setError(problem.message); else load(); };
  return <>{error && <p role="alert">{error}</p>}<section className="support-panel"><h2>Immunization reminders</h2>{dueReminders(data,user).length ? dueReminders(data,user).map(r => <p key={r.id}>{r.date}: {r.message}</p>) : <p>No vaccine reminders due in the next seven days in your loaded records.</p>}</section><section className="support-panel"><h2>Inbox</h2><p>Appointment updates, scheduled appointment reminders, and health concern replies appear here.</p><button onClick={load}>Refresh</button>{!items.length && <p>No messages yet.</p>}{items.map(item => <article key={item.id}><p><strong>{!item.read_at && 'New · '}</strong>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small>{!item.read_at && <button onClick={() => markRead(item.id)}>Mark read</button>}</article>)}</section></>;
}

function HealthcareReports() {
  const {data,loadingRecords,storageError} = useStore();
  const [start,setStart] = useState(today().slice(0,7)+'-01'), [end,setEnd] = useState(today()), [kind,setKind] = useState('All');
  const allRows = reportRows(data,start,end), rows = allRows.filter(r => kind === 'All' || r.type === kind);
  const download = () => { const header = ['date','patient','record','type','details']; const csv = [header.map(csvCell).join(','), ...rows.map(r => header.map(k => csvCell(r[k])).join(','))].join('\r\n'); const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})); const a = document.createElement('a'); a.href=url; a.download=`medimama-report-${start}-${end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
  return <><section className="support-panel"><div className="support-actions"><label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>To<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label><label>Activity<select value={kind} onChange={e=>setKind(e.target.value)}><option>All</option>{[...new Set(allRows.map(r=>r.type))].map(t=><option key={t}>{t}</option>)}</select></label><button onClick={download} disabled={!rows.length || loadingRecords || Boolean(storageError) || start>end}>Export CSV</button><button onClick={()=>window.print()}>Print / Save PDF</button></div>{start>end && <p role="alert">Choose an end date after the start date.</p>}<p>{rows.length} activities · {new Set(rows.map(r=>r.record)).size} patients in this report.</p><div className="support-grid">{[...new Set(allRows.map(r=>r.type))].map(type=><p key={type}><strong>{allRows.filter(r=>r.type===type).length}</strong> {type}</p>)}</div><div className="support-table-wrap"><table className="support-table"><thead><tr><th>Date</th><th>Patient</th><th>Activity</th><th>Details</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.patient}<br/><small>{r.record}</small></td><td>{r.type}</td><td>{r.details}</td></tr>)}</tbody></table></div>{!rows.length && <p>No activities in this period.</p>}</section></>;
}

function Archives() {
  const {data,refreshPatientData} = useStore();
  const [query,setQuery] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [show,setShow] = useState('Archived');
  const rows = [...data.mothers.map(p=>({...p,table:'mothers'})),...data.infants.map(p=>({...p,table:'infants'}))].filter(p=>(show==='Archived'?p.archived:!p.archived) && `${p.name} ${p.recordCode}`.toLowerCase().includes(query.toLowerCase()));
  const change = async p => { setBusy(true); try { const {error:problem} = await supabase.from(p.table).update({status:p.archived ? 'active' : 'archived'}).eq('id',p.id); if(problem) throw problem; await refreshPatientData(); setError(''); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  return <><p>Archive inactive records without deleting their clinical history. Restore a record when care resumes.</p><div className="support-form"><label>Search patients<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Show<select value={show} onChange={e=>setShow(e.target.value)}><option>Archived</option><option>Active</option></select></label></div>{error && <p role="alert">{error}</p>}{rows.map(p=><section className="support-panel" key={p.id}><h2>{p.name}</h2><p>{p.recordCode} · {p.table==='mothers'?'Mother':'Infant'}</p><details><summary>Clinical history</summary>{reportRows({...data,mothers:p.table==='mothers'?[p]:[],infants:p.table==='infants'?[p]:[],appointments:data.appointments.filter(a=>a.patientId===p.id)},'0000-01-01','9999-12-31').map((r,i)=><p key={i}>{r.date} · {r.type}: {r.details}</p>)}</details><button disabled={busy || p.status==='Pending approval'} onClick={()=>change(p)}>{p.archived?'Restore record':'Archive record'}</button></section>)}{!rows.length && <p>No matching records.</p>}</>;
}
