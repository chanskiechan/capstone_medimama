import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { family, session, today } from '../care';
import { checkImageFiles, reportCategories, reportStatuses, reportReference, validateReport } from '../lib/concernReports';
import './ConcernReports.css';

const stamp = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const statusClass = value => value.toLowerCase().replaceAll(' ', '-');
async function allRows(table, configure = query => query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await configure(supabase.from(table).select('*')).order('created_at', { ascending: false }).order('id').range(offset,offset+499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function uploadPhotos(reportId, files, userId) {
  const failures = [];
  for (const file of files) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const path = `${userId}/${reportId}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error } = await supabase.storage.from('concern-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const saved = await supabase.from('concern_attachments').insert({ concern_id: reportId, uploader_id: userId, storage_path: path, file_name: file.name.slice(0,200) });
      if (saved.error) {
        await supabase.storage.from('concern-images').remove([path]);
        throw saved.error;
      }
    } catch (error) { failures.push(`${file.name}: ${error.message}`); }
  }
  return failures;
}

export default function ConcernReports({ admin = false }) {
  const user = session(), { data, loadingRecords, storageError } = useStore();
  const scope = family(data,user);
  const patients = [...scope.mothers,...scope.infants].filter(p => !p.archived);
  const [params,setParams] = useSearchParams(), selectedId = params.get('report');
  const [items,setItems] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [query,setQuery] = useState(''), [status,setStatus] = useState('All'), [topic,setTopic] = useState('All');
  const [compose,setCompose] = useState(false), [notice,setNotice] = useState('');
  const active = useRef(true), request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    if (user.demo) { setLoading(false); return; }
    try {
      const rows = await allRows('health_concerns');
      if (active.current && version === request.current) { setItems(rows); setError(''); }
    } catch (e) { if (active.current && version === request.current) setError(`Could not load reports. ${e.message}`); }
    finally { if (active.current && version === request.current) setLoading(false); }
  }, [user.id,user.demo]);
  useEffect(() => { active.current = true; load(); const timer = setInterval(load,15000); return () => { active.current = false; ++request.current; clearInterval(timer); }; },[load]);
  const selectReport = id => { const next = new URLSearchParams(params); if (id) next.set('report',id); else next.delete('report'); setParams(next); setCompose(false); };
  const patientName = item => [...data.mothers,...data.infants].find(p => p.id === (item.mother_id || item.infant_id))?.name || 'Linked patient';
  const shown = items.filter(r => (status === 'All' || r.status === status) && (topic === 'All' || r.category === topic) && `${r.subject} ${r.description} ${r.reporter_name} ${patientName(r)} ${reportReference(r.id)}`.toLowerCase().includes(query.toLowerCase()));
  const selected = items.find(r => r.id === selectedId);
  const onCreated = async (id,message) => { setNotice(message); await load(); selectReport(id); };

  return <section className="concern-workspace" aria-label="Health concern reports">
    <div className="concern-heading"><div><p className="concern-eyebrow">{admin ? 'Family care inbox' : 'Your health center'}</p><h2>{admin ? 'Reports from mothers & caregivers' : 'Report a concern'}</h2><p>{admin ? 'Review reported symptoms, view photos and reply to the family.' : 'Share a concern about yourself or your baby and receive a reply from a health worker.'}</p></div>{!admin && <button className="concern-primary" onClick={() => { selectReport(null); setCompose(true); setNotice(''); }}>+ New report</button>}</div>
    {!admin && <p className="concern-advisory"><strong>For non-emergency concerns.</strong> This inbox is not monitored continuously. If you need urgent medical help, seek immediate care instead of waiting for a reply.</p>}
    <div className="concern-stats">{reportStatuses.map(value => <button key={value} aria-pressed={status===value} onClick={() => setStatus(status===value?'All':value)}><span className={`concern-dot ${statusClass(value)}`} /><span>{value}</span><strong>{items.filter(r=>r.status===value).length}</strong></button>)}</div>
    {notice && <p className="concern-notice" role="status">{notice}</p>}{error && <p className="concern-error" role="alert">{error} <button onClick={load}>Try again</button></p>}
    {user.demo && !admin && <p className="concern-notice">Sign in with a registered account to submit a report. Demo reports are not sent.</p>}
    {compose && !admin && <ReportForm patients={patients} disabled={user.demo || loadingRecords || Boolean(storageError)} user={user} onCreated={onCreated} onCancel={()=>setCompose(false)} />}
    <div className={`concern-layout${selectedId?' has-detail':''}`}>
      <section className="concern-list-panel" aria-label="Report list"><div className="concern-list-heading"><h3>{admin ? 'Incoming reports' : 'My reports'}</h3><button className="concern-quiet" onClick={load} disabled={loading}>Refresh</button></div>
        <div className="concern-filters"><label>Search reports<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={admin?'Patient, reporter or subject':'Subject or report number'} /></label><div><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option>{reportStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Topic<select value={topic} onChange={e=>setTopic(e.target.value)}><option>All</option>{reportCategories.map(s=><option key={s}>{s}</option>)}</select></label></div></div>
        {loading?<p className="concern-empty" role="status">Loading reports…</p>:!shown.length?<div className="concern-empty"><h3>{items.length?'No matching reports':'No reports yet'}</h3><p>{admin?'Submitted concerns will appear here.':'Use New report to contact your health center.'}</p></div>:<ul className="concern-list">{shown.map(item=><li key={item.id}><button className={`concern-list-item${item.id===selectedId?' selected':''}`} onClick={()=>selectReport(item.id)} aria-pressed={item.id===selectedId}><div><span className={`concern-status ${statusClass(item.status)}`}>{item.status}</span><small>{reportReference(item.id)}</small></div><h3>{item.subject || item.category}</h3><p>{patientName(item)} · {item.category}</p>{admin&&<p>From {item.reporter_name||'Family member'} · {item.reporter_role||'Reporter'}</p>}<p className="concern-excerpt">{item.description}</p><small>Updated {stamp(item.updated_at)}</small></button></li>)}</ul>}
      </section>
      {selected?<ReportDetail key={selected.id} item={selected} patientName={patientName(selected)} admin={admin} user={user} reload={load} close={()=>selectReport(null)}/>:selectedId&&!loading?<section className="concern-detail"><p>This report is not available to this account.</p><button onClick={()=>selectReport(null)}>Back to reports</button></section>:null}
    </div>
  </section>;
}

function PhotoPicker({ files,setFiles,existing=0,disabled=false }) {
  const [previews,setPreviews] = useState([]), [error,setError] = useState('');
  useEffect(()=>{const next=files.map(file=>({name:file.name,url:URL.createObjectURL(file)}));setPreviews(next);return()=>next.forEach(p=>URL.revokeObjectURL(p.url));},[files]);
  const choose=async e=>{const selected=Array.from(e.target.files||[]);e.target.value='';try{await checkImageFiles([...files,...selected],existing);setFiles([...files,...selected]);setError('');}catch(e){setError(e.message);}};
  return <div className="concern-photo-picker"><label>Photos <span>(optional)</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={disabled||files.length+existing>=3}/></label><small>Up to 3 JPG, PNG or WebP photos, 5 MB each. Only you and authorized health workers can view your report photos.</small>{error&&<p role="alert" className="concern-error">{error}</p>}<div className="concern-photos">{previews.map((p,i)=><figure key={p.url}><img src={p.url} alt={`Selected photo: ${p.name}`}/><figcaption>{p.name}</figcaption><button type="button" disabled={disabled} onClick={()=>setFiles(files.filter((_,index)=>index!==i))}>Remove</button></figure>)}</div></div>;
}

function ReportForm({patients,disabled,user,onCreated,onCancel}) {
  const [category,setCategory]=useState('Infant health'),[files,setFiles]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false);
  const submit=async e=>{
    e.preventDefault();if(disabled||submitting.current)return;
    const values=Object.fromEntries(new FormData(e.currentTarget)); const problem=validateReport(values,patients);
    if(problem)return setError(problem);
    submitting.current=true;setBusy(true);setError('');
    try{
      await checkImageFiles(files);
      const patient=patients.find(p=>p.id===values.patient);
      const {data:report,error:problem}=await supabase.from('health_concerns').insert({[patient.motherId?'infant_id':'mother_id']:patient.id,author_id:user.id,category,subject:values.subject.trim(),description:values.description.trim(),symptoms:values.symptoms.trim(),started_at:values.started_at?`${values.started_at}:00+08:00`:null,vaccine_name:category==='Post-vaccination'?values.vaccine_name.trim():'',vaccination_date:category==='Post-vaccination'?(values.vaccination_date||null):null,actions_taken:values.actions_taken.trim(),contact_number:values.contact_number.trim()}).select('id').single();
      if(problem)throw problem;
      const failures=await uploadPhotos(report.id,files,user.id);
      await onCreated(report.id,failures.length?`Report submitted. Some photos could not be attached: ${failures.join('; ')}. Add them again from the report details; do not resubmit the report.`:'Report submitted. Your health center can now review it. Replies will appear in this report and your notifications.');
    }catch(e){setError(e.message);}finally{submitting.current=false;setBusy(false);}
  };
  return <section className="concern-compose"><div className="concern-list-heading"><h3>New health concern</h3><button className="concern-quiet" disabled={busy} onClick={onCancel}>Cancel</button></div><form className="concern-form" onSubmit={submit}><fieldset disabled={busy||disabled}><div className="concern-form-grid"><label>Patient <span>*</span><select name="patient" required><option value="">Choose a linked patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}{p.motherId?' (Infant)':' (Mother)'}</option>)}</select></label><label>Topic <span>*</span><select name="category" value={category} onChange={e=>setCategory(e.target.value)}>{reportCategories.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Subject <span>*</span><input name="subject" maxLength={160} required placeholder="Briefly describe your concern"/></label><div className="concern-form-grid"><label>When did it start? <span>(Philippine time, optional)</span><input name="started_at" type="datetime-local"/></label><label>Contact number <span>(optional)</span><input name="contact_number" type="tel" maxLength={40} placeholder="Number the health center can reach"/></label></div><label>Symptoms or changes noticed <span>(optional)</span><input name="symptoms" maxLength={1000} placeholder="Describe what you noticed"/></label>{category==='Post-vaccination'&&<div className="concern-vaccine-fields"><h4>Vaccination details</h4><div className="concern-form-grid"><label>Vaccine / dose <span>(if known)</span><input name="vaccine_name" maxLength={120} placeholder="As written on the immunization card"/></label><label>Date given <span>(if known)</span><input name="vaccination_date" type="date" max={today()}/></label></div></div>}<label>Description <span>*</span><textarea name="description" maxLength={3000} rows={5} required placeholder="Tell the health worker what happened, when you noticed it, and how the patient is now."/></label><label>Actions already taken <span>(optional)</span><textarea name="actions_taken" maxLength={1000} rows={2} placeholder="For example, whether you have already contacted a health worker."/></label><PhotoPicker files={files} setFiles={setFiles} disabled={busy||disabled}/></fieldset>{error&&<p className="concern-error" role="alert">{error}</p>}<div className="concern-form-footer"><small>Fields marked * are required.</small><button className="concern-primary" disabled={busy||disabled||!patients.length}>{busy?'Submitting report…':'Submit report'}</button></div></form></section>;
}

function ReportDetail({item,patientName,admin,user,reload,close}) {
  const [messages,setMessages]=useState([]),[attachments,setAttachments]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reply,setReply]=useState(''),[status,setStatus]=useState(item.status),[files,setFiles]=useState([]),[notice,setNotice]=useState('');
  const mounted=useRef(true), sequence=useRef(0);
  useEffect(()=>setStatus(item.status),[item.status]);
  const load=useCallback(async()=>{
    const version=++sequence.current;
    try{
      const [thread,photos]=await Promise.all([allRows('concern_messages',q=>q.eq('concern_id',item.id)),allRows('concern_attachments',q=>q.eq('concern_id',item.id))]);
      const images=await Promise.all(photos.map(async photo=>{const {data,error}=await supabase.storage.from('concern-images').createSignedUrl(photo.storage_path,300);return {...photo,url:data?.signedUrl,imageError:error?.message};}));
      if(mounted.current&&version===sequence.current){setMessages(thread.reverse());setAttachments(images);setError('');}
    }catch(e){if(mounted.current&&version===sequence.current)setError(`Could not load conversation or photos. ${e.message}`);}finally{if(mounted.current&&version===sequence.current)setLoading(false);}
  },[item.id]);
  useEffect(()=>{mounted.current=true;load();const timer=setInterval(load,30000);return()=>{mounted.current=false;++sequence.current;clearInterval(timer);};},[load]);
  const send=async e=>{e.preventDefault();if(busy||!reply.trim())return;setBusy(true);setError('');try{const {error:problem}=await supabase.rpc('reply_to_concern',{target:item.id,message_body:reply.trim(),next_status:admin?status:null});if(problem)throw problem;setReply('');setNotice(admin?'Reply sent to the reporter.':'Follow-up sent to the health center.');await Promise.all([load(),reload()]);}catch(e){setError(e.message);}finally{setBusy(false);}};
  const addPhotos=async()=>{setBusy(true);setError('');try{await checkImageFiles(files,attachments.length);const failures=await uploadPhotos(item.id,files,user.id);setFiles([]);await load();if(failures.length)setError(`Some photos were not attached: ${failures.join('; ')}`);else setNotice('Photos attached to the report.');}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <section className="concern-detail" aria-label="Report details"><div className="concern-list-heading"><span className="concern-reference">{reportReference(item.id)}</span><button className="concern-quiet" onClick={close}>Close report</button></div><span className={`concern-status ${statusClass(item.status)}`}>{item.status}</span><h2>{item.subject||item.category}</h2><dl className="concern-facts"><div><dt>Patient</dt><dd>{patientName}</dd></div><div><dt>Topic</dt><dd>{item.category}</dd></div><div><dt>Reported by</dt><dd>{item.reporter_name||'Family member'} ({item.reporter_role||'Reporter'})</dd></div><div><dt>Submitted</dt><dd>{stamp(item.created_at)}</dd></div>{item.started_at&&<div><dt>Started</dt><dd>{stamp(item.started_at)}</dd></div>}{item.contact_number&&<div><dt>Contact</dt><dd>{item.contact_number}</dd></div>}{item.vaccine_name&&<div><dt>Vaccine / dose</dt><dd>{item.vaccine_name}</dd></div>}{item.vaccination_date&&<div><dt>Vaccination date</dt><dd>{item.vaccination_date}</dd></div>}</dl>{item.symptoms&&<><h3>Symptoms / changes</h3><p className="concern-prose">{item.symptoms}</p></>}<h3>Description</h3><p className="concern-prose">{item.description}</p>{item.actions_taken&&<><h3>Actions already taken</h3><p className="concern-prose">{item.actions_taken}</p></>}
    <h3>Attached photos ({attachments.length}/3)</h3>{loading?<p>Loading photos…</p>:!attachments.length&&<p className="concern-muted">No photos attached.</p>}<div className="concern-photos">{attachments.map(photo=><figure key={photo.id}>{photo.url?<a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.file_name}/><span>Open photo</span></a>:<p>Photo unavailable. <button onClick={load}>Retry</button></p>}<figcaption>{photo.file_name}</figcaption></figure>)}</div>{!admin&&item.author_id===user.id&&!loading&&attachments.length<3&&<div className="concern-add-photos"><PhotoPicker files={files} setFiles={setFiles} existing={attachments.length} disabled={busy}/>{files.length>0&&<button className="concern-secondary" onClick={addPhotos} disabled={busy}>Attach selected photos</button>}</div>}
    <div className="concern-conversation"><h3>Conversation with the health center</h3>{item.response&&<article className="concern-message staff"><strong>Health worker · Earlier response</strong><p>{item.response}</p></article>}{messages.map(message=><article className={`concern-message ${message.author_role==='admin'?'staff':'family'}`} key={message.id}><div><strong>{message.author_role==='admin'?'Health worker':message.author_name||'Reporter'}</strong><small>{stamp(message.created_at)}</small></div>{message.author_role==='admin'&&<small>{message.author_name}</small>}<p>{message.body}</p></article>)}{!loading&&!messages.length&&!item.response&&<p className="concern-muted">{admin?'Write the first reply below.':'Your report is waiting for a health worker reply.'}</p>}</div>
    {error&&<p role="alert" className="concern-error">{error}</p>}{notice&&<p role="status" className="concern-notice">{notice}</p>}<form className="concern-form concern-reply" onSubmit={send}><label>{admin?'Reply and guidance for the family':'Add a follow-up'}<textarea rows={4} required maxLength={3000} value={reply} onChange={e=>setReply(e.target.value)} placeholder={admin?'Write clear guidance, next steps, or questions for the reporter.':'Share an update or ask about the health worker’s reply.'}/></label>{admin&&<label>Report status<select value={status} onChange={e=>setStatus(e.target.value)}>{reportStatuses.map(s=><option key={s}>{s}</option>)}</select></label>}{!admin&&item.status==='Resolved'&&<p className="concern-muted">Sending a follow-up reopens this report for review.</p>}<button className="concern-primary" disabled={busy||loading||!reply.trim()}>{busy?'Sending…':admin?'Send reply':'Send follow-up'}</button></form>
  </section>;
}
