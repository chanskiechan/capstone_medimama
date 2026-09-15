import { useState } from 'react';
import { useStore } from '../store';
import { addDays, appointmentError, completedDose, day, daysBetween, family, nextPrenatal, pregnancy, serviceGroup, services, session, today, uid, vaccineDue, vaccineError, vaccineSchedule } from '../care';
import './CareWorkspace.css';

const fields = event => Object.fromEntries(new FormData(event.currentTarget));
function Field({ label, name, type = 'text', value, ...props }) { return <label>{label}<input name={name} type={type} defaultValue={value ?? ''} {...props} /></label>; }
function Dialog({ title, close, children }) { return <div className="care-overlay" onMouseDown={e => e.target === e.currentTarget && close()}><section role="dialog" aria-modal="true" aria-label={title}><button className="care-close" type="button" onClick={close} aria-label="Close">×</button><h2>{title}</h2>{children}</section></div>; }
function Empty({ children }) { return <p className="care-empty">{children}</p>; }
const chronological = items => [...(items || [])].sort((a, b) => b.date.localeCompare(a.date));

export default function CareWorkspace({ section = 'overview', admin = false }) {
  const { data, save, storageError } = useStore();
  const user = session();
  const canEdit = admin && user.role === 'admin';
  const scope = family(data, user);
  const patients = [...scope.mothers, ...scope.infants];
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const open = value => { setError(''); setDialog(value); };
  const finish = message => { setDialog(null); setError(''); setNotice(message); };
  const updatePatient = (collection, id, update) => save(current => ({ ...current, [collection]: current[collection].map(p => p.id === id ? update(p) : p) }));
  const matches = p => (!patientFilter || patientFilter === p.id) && `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase());
  const mothers = scope.mothers.filter(matches);
  const infants = scope.infants.filter(matches);
  const visibleAppointments = data.appointments.filter(a => patients.some(p => p.id === a.patientId) && (!patientFilter || a.patientId === patientFilter) && (!statusFilter || a.status === statusFilter) && `${a.patient} ${a.service} ${a.reason || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const readOnly = user.role === 'caregiver';
  const booking = !readOnly && patients.length > 0;
  const showMothers = ['overview', 'records', 'prenatal', 'postnatal'].includes(section);
  const showInfants = ['overview', 'infants', 'immunization'].includes(section) || (section === 'records' && readOnly);
  const showAppointments = ['overview', 'appointments'].includes(section);

  const saveAppointment = event => {
    event.preventDefault();
    const values = fields(event), old = dialog.item;
    if (old && !values.reason?.trim()) return setError('Enter a reason for rescheduling.');
    const patient = patients.find(p => p.id === values.patientId);
    const next = { ...old, ...values, patient: patient?.name, id: old?.id || uid('APT'), status: old ? 'Rescheduled' : 'Scheduled', createdBy: old?.createdBy || user.id || user.email, history: [...(old?.history || []), ...(old ? [{ date: old.date, time: old.time, service: old.service, reason: values.reason.trim(), changedAt: new Date().toISOString(), actor: user.name }] : [])] };
    const problem = appointmentError(data, next);
    if (problem) return setError(problem);
    if (old && old.date === next.date && old.time === next.time) return setError('Choose a different date or time.');
    if (!save(current => ({ ...current, appointments: old ? current.appointments.map(a => a.id === old.id ? next : a) : [...current.appointments, next] }))) return;
    finish(old ? 'Appointment rescheduled. The reason and previous schedule are visible to the health center.' : 'Appointment booked.');
  };

  const saveInfant = event => {
    event.preventDefault();
    const values = fields(event);
    if (!scope.mothers.some(m => m.id === values.motherId)) return setError('Choose a linked mother.');
    if (!Number.isFinite(day(values.birthDate)) || values.birthDate > today()) return setError('Birth date cannot be in the future.');
    if (values.measuredDate < values.birthDate || values.measuredDate > today()) return setError('Measurement date must be between birth and today.');
    const name = [values.firstName, values.middleName, values.surname, values.suffix].filter(Boolean).join(' ').trim();
    if (!name) return setError('Enter the infant’s name.');
    if (data.infants.some(i => i.motherId === values.motherId && i.name.toLowerCase() === name.toLowerCase() && i.birthDate === values.birthDate)) return setError('This infant is already registered.');
    const id = uid('I');
    const infant = { ...values, id, name, status: canEdit ? 'Active' : 'Pending approval', vaccines: [], records: [], screenings: [], growth: [{ id: uid('G'), date: values.measuredDate, weight: values.weight, length: values.length, muac: values.muac, notes: 'Registration measurements', source: canEdit ? 'Health center' : 'Mother reported', actor: user.name }] };
    if (!save(current => ({ ...current, infants: [...current.infants, infant], mothers: current.mothers.map(m => m.id === values.motherId ? { ...m, infantIds: [...(m.infantIds || []), id] } : m) }))) return;
    finish(canEdit ? 'Infant registered.' : 'Infant submitted for health center approval.');
  };

  const saveMaternal = async event => {
    event.preventDefault();
    const form = event.currentTarget, values = fields(event), file = form.elements.hospitalFile.files[0];
    if (values.deliveryDate) values.status = 'Postnatal';
    if (values.gestationDate > today() || values.deliveryDate > today()) return setError('Clinical dates cannot be in the future.');
    if (values.status === 'Pregnant' && (!values.gestationDate || values.gestationWeeks === '')) return setError('Record gestational weeks and the assessment date.');
    if (values.status === 'Postnatal' && !values.deliveryDate) return setError('Record the delivery date for postnatal care.');
    let attachment;
    if (file?.size) {
      if (file.size > 1024 * 1024) return setError('Choose an image or PDF smaller than 1 MB.');
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('Choose a PDF, PNG, JPEG, or WebP file.');
      try { attachment = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve({ name: file.name, url: r.result }); r.onerror = reject; r.readAsDataURL(file); }); } catch { return setError('The file could not be read.'); }
    }
    delete values.hospitalFile;
    if (!updatePatient('mothers', dialog.patient.id, m => ({ ...m, ...values, attachments: [...(m.attachments || []), ...(attachment ? [attachment] : [])], records: [...(m.records || []), { id: uid('R'), date: today(), type: values.status === 'Postnatal' ? 'Postnatal intake / update' : 'Prenatal intake / update', details: values.hospitalSummary || 'Maternal profile updated', actor: user.name, gestationWeeks: values.gestationWeeks, deliveryDate: values.deliveryDate }] }))) return;
    finish('Maternal record updated.');
  };

  const saveClinical = event => {
    event.preventDefault();
    const values = fields(event), patient = dialog.patient;
    if (values.date > today() || !Number.isFinite(day(values.date)) || (patient.birthDate && values.date < patient.birthDate)) return setError('Enter a valid record date, no later than today.');
    const infant = Boolean(patient.motherId);
    if (dialog.kind === 'growth') {
      if ((patient.growth || []).some(g => g.date === values.date)) return setError('Measurements are already recorded for this date.');
      if (!updatePatient('infants', patient.id, p => ({ ...p, growth: [...(p.growth || []), { ...values, id: uid('G'), actor: user.name, source: 'Health center' }] }))) return;
    } else if (dialog.kind === 'vaccine') {
      const rule = vaccineSchedule.find(v => v.id === values.scheduleId), latest = data.infants.find(i => i.id === patient.id);
      const problem = vaccineError(latest, rule, values.date);
      if (problem) return setError(problem);
      if (!updatePatient('infants', patient.id, p => ({ ...p, vaccines: [...(p.vaccines || []).filter(v => !(v.vaccine === rule.vaccine && v.dose === rule.dose && !['Complete', 'Completed'].includes(v.status))), { ...values, id: uid('V'), vaccine: rule.vaccine, dose: rule.dose, status: 'Complete', actor: user.name }] }))) return;
    } else if (dialog.kind === 'screening') {
      if ((patient.screenings || []).some(s => s.type === values.type && s.status === 'Completed')) return setError('This screening is already recorded as completed.');
      if (!updatePatient('infants', patient.id, p => ({ ...p, screenings: [...(p.screenings || []), { ...values, id: uid('S'), status: 'Completed', actor: user.name }] }))) return;
    } else {
      if (!infant && patient.status === 'Postnatal' && !patient.deliveryDate) return setError('Record the delivery date in maternal intake before adding a postnatal checkup.');
      const stage = infant ? 'Infant review' : patient.deliveryDate && values.date >= patient.deliveryDate ? 'Postnatal check-up' : 'Prenatal check-up';
      if (!updatePatient(infant ? 'infants' : 'mothers', patient.id, p => ({ ...p, records: [...(p.records || []), { ...values, id: uid('R'), type: stage, actor: user.name }] }))) return;
    }
    finish('Clinical record saved to the patient history.');
  };

  return <section className="care-workspace">
    <div className="care-banner"><div><strong>Wednesday clinic</strong><p>Infant services 8 AM–5 PM · Maternal care 10 AM–5 PM · Up to 20 patients per service group.</p></div><div className="care-actions">{booking && (canEdit || showAppointments) && <button onClick={() => open({ kind: 'appointment' })}>Book appointment</button>}{!readOnly && scope.mothers.length > 0 && (canEdit || showInfants) && <button onClick={() => open({ kind: 'infant' })}>Register infant</button>}{canEdit && <button onClick={() => open({ kind: 'links' })}>Account & caregiver links</button>}</div></div>
    {storageError && <p className="care-error" role="alert">{storageError}</p>}{notice && !storageError && <p role="status" className="care-success">{notice}</p>}
    {!patients.length && <Empty>No linked patient records yet. Ask the health center to link your account to your mother record. Caregiver access appears after approval.</Empty>}
    <div className="care-filters"><label>Search patients or appointments<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, record ID, service, or reason" /></label><label>Patient<select value={patientFilter} onChange={e => setPatientFilter(e.target.value)}><option value="">All linked patients</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    {showAppointments && <section className="care-section"><h2>Appointments</h2><label className="care-status-filter">Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{['Scheduled', 'Rescheduled', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></label>{!visibleAppointments.length && <Empty>No appointments found.</Empty>}{visibleAppointments.map(a => <article className="care-card" key={a.id}><div className="care-card-heading"><div><h3>{a.patient}</h3><p>{a.service} · {a.date} at {a.time}</p></div><span className="care-badge">{a.status}</span></div>{a.reason && <p><b>Reschedule reason:</b> {a.reason}</p>}{a.history?.length > 0 && <details><summary>Schedule history ({a.history.length})</summary>{a.history.map((h, index) => <p key={index}>{h.date} at {h.time} → changed {h.changedAt.slice(0, 10)} by {h.actor || 'Account holder'}: {h.reason}</p>)}</details>}<div className="care-actions">{booking && ['Scheduled', 'Rescheduled'].includes(a.status) && <button onClick={() => open({ kind: 'appointment', item: a })}>Reschedule</button>}{canEdit && ['Scheduled', 'Rescheduled'].includes(a.status) && <button disabled={a.date > today()} onClick={() => { save(c => ({ ...c, appointments: c.appointments.map(x => x.id === a.id ? { ...x, status: 'Completed', completedAt: new Date().toISOString() } : x) })); setNotice('Attendance marked completed. Add clinical findings to the patient record.'); }}>Mark attended</button>}</div></article>)}</section>}
    {showMothers && <section className="care-section"><h2>Maternal records</h2>{!mothers.length && <Empty>No maternal records found.</Empty>}{mothers.filter(m => section !== 'prenatal' && section !== 'postnatal' || (section === 'postnatal' ? m.status === 'Postnatal' : m.status !== 'Postnatal')).map(m => { const stage = pregnancy(m); const visits = (m.records || []).filter(r => r.type === 'Prenatal check-up').length + Number(m.priorVisits || 0); return <article className="care-card" key={m.id}><div className="care-card-heading"><div><h3>{m.name}</h3><p>{m.id}</p></div><span className="care-badge">{stage.label}</span></div><dl className="care-metrics"><div><dt>Pregnancy</dt><dd>{stage.weeks === null ? stage.label === 'Postnatal' ? 'Delivered' : 'Awaiting assessment' : `${stage.weeks} weeks · approximately ${stage.months} months`}</dd></div><div><dt>Delivery date</dt><dd>{m.deliveryDate || 'Not recorded'}</dd></div><div><dt>Prenatal visits recorded</dt><dd>{visits}</dd></div><div><dt>Remaining planned visits</dt><dd>{stage.label === 'Postnatal' ? 'Prenatal plan closed' : `${Math.max(0, Number(m.plannedVisits || 8) - visits)} of ${m.plannedVisits || 8}`}</dd></div></dl>{nextPrenatal(m) && <p><b>Next monthly visit suggestion:</b> {nextPrenatal(m)}. Choose an available Wednesday when booking.</p>}<p><b>Hospital:</b> {m.hospital || 'Not recorded'}</p><p>{m.hospitalSummary || 'No hospital intake summary recorded.'}</p>{(m.attachments || []).map((file, i) => <a key={i} href={file.url} download={file.name}>Download {file.name}</a>)}{canEdit && <div className="care-actions"><button onClick={() => open({ kind: 'maternal', patient: m })}>Update intake / delivery</button><button onClick={() => open({ kind: 'visit', patient: m })}>Record checkup</button></div>}<History records={m.records} /></article>; })}</section>}
    {showInfants && <section className="care-section"><h2>Infant records</h2>{!infants.length && <Empty>No infant records found.</Empty>}{infants.map(baby => { const age = daysBetween(baby.birthDate, today()); const latest = chronological(baby.growth)[0]; const firstVisit = [...(baby.records || []), ...data.appointments.filter(a => a.patientId === baby.id && a.status === 'Completed')].find(r => daysBetween(baby.birthDate, r.date) >= 0 && daysBetween(baby.birthDate, r.date) <= 42); return <article className="care-card" key={baby.id}><div className="care-card-heading"><div><h3>{baby.name}</h3><p>{baby.birthDate} · {Math.floor(age / 7)} weeks old · {baby.sex} · Mother: {data.mothers.find(m => m.id === baby.motherId)?.name}</p></div><span className="care-badge">{baby.status}</span></div>{canEdit && baby.status === 'Pending approval' && <button onClick={() => { updatePatient('infants', baby.id, b => ({ ...b, status: 'Active', approvedAt: new Date().toISOString() })); setNotice('Infant registration approved.'); }}>Approve registration</button>}<dl className="care-metrics"><div><dt>Weight</dt><dd>{latest?.weight ? `${latest.weight} kg` : 'Not recorded'}</dd></div><div><dt>Height / length</dt><dd>{latest?.length ? `${latest.length} cm` : 'Not recorded'}</dd></div><div><dt>MUAC</dt><dd>{latest?.muac ? `${latest.muac} cm` : 'Not recorded'}</dd></div><div><dt>Last measurement</dt><dd>{latest?.date || 'Not recorded'}</dd></div></dl><details><summary>Birth and family information</summary><p>Place of birth: {baby.placeOfBirth || 'Not recorded'} · Birth weight: {baby.birthWeight || '—'} kg · Birth length: {baby.birthLength || '—'} cm</p><p>Father: {baby.fatherName || 'Not recorded'} · Address: {baby.address || 'Not recorded'} · Contact: {baby.guardianContact || 'Not recorded'}</p><p>Blood type: {baby.bloodType || 'Unknown'} · Allergies: {baby.allergies || 'Not recorded'} · Medical notes: {baby.medicalNotes || 'Not recorded'}</p></details><p className={firstVisit ? 'care-success' : 'care-reminder'}>{firstVisit ? `Visit within first six weeks recorded: ${firstVisit.date}` : `${age > 42 ? 'Follow-up needed: no visit recorded within the first six weeks.' : 'First-six-week visit due'} ${age <= 42 ? `by ${addDays(baby.birthDate, 42)}.` : ''}`}</p><div className="care-actions">{canEdit && baby.status !== 'Pending approval' && <><button onClick={() => open({ kind: 'growth', patient: baby })}>Add measurements</button><button onClick={() => open({ kind: 'visit', patient: baby })}>Record clinic visit</button><button onClick={() => open({ kind: 'screening', patient: baby })}>Record screening</button></>}</div><h4>Newborn screening & hearing test</h4>{['Newborn screening', 'Hearing test'].map(type => { const done = (baby.screenings || []).find(s => s.type === type && s.status === 'Completed'); return <p key={type}><input type="checkbox" checked={Boolean(done)} readOnly aria-label={`${type} completed`} /> {type}: {done ? `${done.date} · ${done.result}` : 'Not recorded — review with health worker'}</p>; })}<h4>Immunization checklist</h4><p className="care-muted">Eligibility dates use age and recorded dose intervals. The health worker confirms suitability and records administration.</p><div className="care-table-wrap"><table><thead><tr><th>Completed</th><th>Vaccine / dose</th><th>Earliest scheduled date</th><th>Administration / status</th><th>Action</th></tr></thead><tbody>{vaccineSchedule.map(rule => { const done = completedDose(baby, rule); const problem = vaccineError(baby, rule, today()); return <tr key={rule.id}><td><input type="checkbox" checked={Boolean(done)} readOnly aria-label={`${rule.vaccine} ${rule.dose} completed`} /></td><td>{rule.vaccine} · {rule.dose}</td><td>{vaccineDue(baby, rule)}</td><td>{done ? `${done.date} · ${done.provider || done.actor || 'Recorded'}` : problem || 'Due — health worker review'}</td><td>{canEdit && !done && baby.status !== 'Pending approval' && <button onClick={() => open({ kind: 'vaccine', patient: baby, rule })}>Record dose</button>}</td></tr>; })}</tbody></table></div><details><summary>Growth history ({baby.growth?.length || 0})</summary><div className="care-table-wrap"><table><thead><tr><th>Date</th><th>Weight (kg)</th><th>Length (cm)</th><th>MUAC (cm)</th><th>Notes / source</th></tr></thead><tbody>{chronological(baby.growth).map((g, i) => <tr key={g.id || i}><td>{g.date}</td><td>{g.weight}</td><td>{g.length}</td><td>{g.muac || 'Not recorded'}</td><td>{g.notes} · {g.source || g.actor || 'Existing record'}</td></tr>)}</tbody></table></div></details><History records={[...(baby.records || []), ...(baby.screenings || []).map(s => ({ ...s, details: s.result })), ...(baby.vaccines || []).filter(v => ['Complete', 'Completed'].includes(v.status)).map(v => ({ ...v, type: `${v.vaccine} ${v.dose}`, details: `${v.provider || ''} ${v.notes || ''}` }))]} /></article>; })}</section>}
    {dialog && <Dialog title={{ appointment: dialog.item ? 'Reschedule appointment' : 'Book appointment', infant: 'Register infant', maternal: 'Maternal intake & delivery', growth: 'Record growth measurements', vaccine: 'Record administered vaccine', screening: 'Record newborn screening', visit: 'Record clinic visit', links: 'Link accounts to patient records' }[dialog.kind]} close={() => setDialog(null)}>
      {(error || storageError) && <p className="care-error" role="alert">{error || storageError}</p>}
      {dialog.kind === 'appointment' && <AppointmentForm patients={patients} data={data} item={dialog.item} submit={saveAppointment} />}
      {dialog.kind === 'infant' && <form className="care-form" onSubmit={saveInfant}><label>Mother<select name="motherId" required>{scope.mothers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><Field label="First name" name="firstName" required /><Field label="Middle name" name="middleName" /><Field label="Surname" name="surname" required /><Field label="Suffix" name="suffix" /><Field label="Date of birth" name="birthDate" type="date" max={today()} required /><label>Sex<select name="sex"><option>Female</option><option>Male</option></select></label><Field label="Place of birth" name="placeOfBirth" required /><Field label="Father’s name" name="fatherName" /><Field label="Address" name="address" required /><Field label="Guardian contact" name="guardianContact" type="tel" required /><Field label="Blood type (if known)" name="bloodType" /><Field label="Birth weight (kg)" name="birthWeight" type="number" min="0.1" max="10" step="0.01" required /><Field label="Birth length (cm)" name="birthLength" type="number" min="1" max="100" step="0.1" required /><MeasurementFields /><Field label="Measurement date" name="measuredDate" type="date" value={today()} max={today()} required /><Field label="Allergies" name="allergies" /><label>Medical notes<textarea name="medicalNotes" /></label><button className="care-submit">{canEdit ? 'Register infant' : 'Submit for approval'}</button></form>}
      {dialog.kind === 'maternal' && <form className="care-form" onSubmit={saveMaternal}><label>Status<select name="status" defaultValue={dialog.patient.status}><option>Pregnant</option><option>Postnatal</option></select></label><Field label="Gestational age at assessment (weeks)" name="gestationWeeks" type="number" min="0" max="45" value={dialog.patient.gestationWeeks} /><Field label="Assessment date" name="gestationDate" type="date" max={today()} value={dialog.patient.gestationDate} /><Field label="Delivery date (if delivered)" name="deliveryDate" type="date" max={today()} value={dialog.patient.deliveryDate} /><Field label="Planned prenatal visits" name="plannedVisits" type="number" min="1" max="30" value={dialog.patient.plannedVisits || 8} required /><Field label="Previous hospital prenatal visits" name="priorVisits" type="number" min="0" max="30" value={dialog.patient.priorVisits || 0} required /><Field label="Referring hospital" name="hospital" value={dialog.patient.hospital} /><label>Hospital records / intake summary<textarea name="hospitalSummary" defaultValue={dialog.patient.hospitalSummary || ''} /></label><Field label="Hospital document (PDF or image, up to 1 MB)" name="hospitalFile" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /><p className="care-muted">Previous visits count toward the plan. Visit frequency and additional follow-ups are set by the health worker.</p><button className="care-submit">Save maternal record</button></form>}
      {['growth', 'vaccine', 'screening', 'visit'].includes(dialog.kind) && <form className="care-form" onSubmit={saveClinical}><Field label="Record date" name="date" type="date" value={today()} max={today()} min={dialog.patient.birthDate} required />{dialog.kind === 'growth' && <MeasurementFields />}{dialog.kind === 'vaccine' && <><input type="hidden" name="scheduleId" value={dialog.rule.id} /><p>{dialog.rule.vaccine} · {dialog.rule.dose}</p><Field label="Administered by / facility" name="provider" required /><Field label="Batch / lot number (if available)" name="batch" /><label className="care-check"><input type="checkbox" required /> I checked the immunization card and confirmed this dose was administered.</label></>}{dialog.kind === 'screening' && <><label>Screening<select name="type"><option>Newborn screening</option><option>Hearing test</option></select></label><Field label="Result / follow-up recommendation" name="result" required /></>}{dialog.kind === 'visit' && <label>Clinical findings<textarea name="details" required /></label>}<label>Notes<textarea name="notes" /></label><button className="care-submit">Save record</button></form>}
      {dialog.kind === 'links' && <AccountLinks data={data} save={save} finish={finish} setError={setError} />}
    </Dialog>}
  </section>;
}

function MeasurementFields() { return <><Field label="Current weight (kg)" name="weight" type="number" min="0.1" max="60" step="0.01" required /><Field label="Height / length (cm)" name="length" type="number" min="1" max="180" step="0.1" required /><Field label="MUAC (cm)" name="muac" type="number" min="1" max="40" step="0.1" required /></>; }
function History({ records = [] }) { return <details><summary>Record history ({records.length})</summary>{records.length ? chronological(records).map((r, i) => <div className="care-history" key={r.id || i}><strong>{r.date} · {r.type}</strong><p>{r.details} {r.notes}</p>{r.actor && <small>Recorded by {r.actor}</small>}</div>) : <Empty>No clinical history recorded.</Empty>}</details>; }
function AppointmentForm({ patients, data, item, submit }) {
  const [patientId, setPatientId] = useState(item?.patientId || patients[0]?.id || '');
  const infant = data.infants.some(p => p.id === patientId);
  const patient = patients.find(p => p.id === patientId);
  const options = services.filter(s => infant ? serviceGroup(s) === 'infant' : s === (patient?.status === 'Postnatal' ? 'Postnatal Checkup' : 'Prenatal Checkup'));
  const [date, setDate] = useState(item?.date || '');
  const start = infant ? 8 : 10;
  const count = data.appointments.filter(a => a.id !== item?.id && a.date === date && a.status !== 'Cancelled' && serviceGroup(a.service) === (infant ? 'infant' : 'maternal')).length;
  return <form className="care-form" onSubmit={submit}><label>Patient<select name="patientId" value={patientId} onChange={e => setPatientId(e.target.value)} disabled={Boolean(item)}>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{item && <input name="patientId" type="hidden" value={patientId} />}</label><label>Service<select key={patientId} name="service" defaultValue={item?.service || options[0]}>{options.map(s => <option key={s}>{s}</option>)}</select></label><label>Wednesday date<input name="date" type="date" value={date} min={today()} required onChange={e => setDate(e.target.value)} /></label><label>Preferred time<select name="time" defaultValue={item?.time || ''} required><option value="">Select a time</option>{Array.from({ length: (17 - start) * 2 }, (_, i) => `${String(start + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).map(t => <option key={t}>{t}</option>)}</select></label>{date && <p className="care-muted">{Math.max(0, 20 - count)} daily places remaining for {infant ? 'infant' : 'maternal'} services. Two patients maximum per time slot.</p>}{item && <label>Reason for rescheduling<textarea name="reason" required placeholder="For example: feeling unwell" /></label>}<button className="care-submit">{item ? 'Save new schedule' : 'Book appointment'}</button></form>;
}

function AccountLinks({ data, save, finish, setError }) {
  let accounts;
  try { accounts = JSON.parse(localStorage.getItem('medimama-accounts')) || []; } catch { accounts = []; }
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const account = accounts.find(a => a.id === accountId);
  const submit = event => {
    event.preventDefault(); const values = fields(event);
    if (!account || !data.mothers.some(m => m.id === values.motherId)) return setError('Choose an account and mother record.');
    if (account.role === 'mother' && data.mothers.some(m => m.accountId === account.id && m.id !== values.motherId)) return setError('This account is already linked to a different mother.');
    if (account.role === 'mother' && data.mothers.some(m => m.id === values.motherId && m.accountId && m.accountId !== account.id)) return setError('This mother is already linked to another account.');
    if (!save(current => account.role === 'caregiver' ? { ...current, caregivers: [...current.caregivers.filter(c => c.accountId !== account.id), { id: uid('C'), accountId: account.id, email: account.email, name: account.name, motherId: values.motherId, relationship: values.relationship, status: 'Approved' }] } : { ...current, mothers: current.mothers.map(m => m.id === values.motherId ? { ...m, accountId: account.id, email: account.email } : m) })) return;
    localStorage.setItem('medimama-accounts', JSON.stringify(accounts.map(a => a.id === account.id ? { ...a, status: 'approved' } : a)));
    try { const pending = JSON.parse(localStorage.getItem('medimama-pending-approvals')) || []; localStorage.setItem('medimama-pending-approvals', JSON.stringify(pending.filter(p => p.accountId !== account.id))); } catch {}
    finish('Account approved and linked. Shared patient records are available at the next login.');
  };
  return <><form className="care-form" onSubmit={submit}><label>Registered account<select value={accountId} onChange={e => setAccountId(e.target.value)} required><option value="">Choose account</option>{accounts.filter(a => ['mother', 'caregiver'].includes(a.role)).map(a => <option key={a.id} value={a.id}>{a.name} · {a.email} · {a.role} · {a.status}</option>)}</select></label><label>Mother record<select name="motherId" required><option value="">Choose mother</option>{data.mothers.map(m => <option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>{account?.role === 'caregiver' && <><Field label="Relationship" name="relationship" required /><label className="care-check"><input type="checkbox" required /> I contacted the mother and verified consent for caregiver access.</label></>}<button className="care-submit">Approve & link account</button></form><h3>Approved caregiver links</h3>{data.caregivers.filter(c => c.accountId && c.status === 'Approved').map(c => <p key={c.id}>{c.name} → {data.mothers.find(m => m.id === c.motherId)?.name} <button onClick={() => { save(current => ({ ...current, caregivers: current.caregivers.map(x => x.id === c.id ? { ...x, status: 'Revoked' } : x) })); finish('Caregiver access revoked.'); }}>Revoke access</button></p>)}</>;
}
