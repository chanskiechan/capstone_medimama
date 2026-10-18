import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { useStore } from '../store';
import { addDays, appointmentError, completedDose, day, daysBetween, family, infantAgeStatus, nextPrenatal, pregnancy, serviceGroup, services, session, today, uid, vaccineDue, vaccineError, vaccineSchedule } from '../care';
import './CareWorkspace.css';
import { supabase } from '../lib/supabase';
import { notifyEmailEvent } from '../lib/emailNotifications';

const fields = event => Object.fromEntries(new FormData(event.currentTarget));
function Field({ label, name, type = 'text', value, ...props }) { return <label>{label}<input name={name} type={type} defaultValue={value ?? ''} {...props} /></label>; }
function Dialog({ title, close, children }) { return <div className="care-overlay" onMouseDown={e => e.target === e.currentTarget && close()}><section role="dialog" aria-modal="true" aria-label={title}><button className="care-close" type="button" onClick={close} aria-label="Close">×</button><h2>{title}</h2>{children}</section></div>; }
function Empty({ children }) { return <p className="care-empty">{children}</p>; }
const chronological = items => [...(items || [])].sort((a, b) => b.date.localeCompare(a.date));
const manilaDateTime = value => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded';
const appointmentLabel = status => ({ Pending: 'Pending', Scheduled: 'Pending', Approved: 'Pending', Rescheduled: 'Rescheduled', Confirmed: 'Confirmed', Completed: 'Done', Cancelled: 'Cancelled' }[status] || status);
const appointmentFilterStatus = status => ({ Scheduled: 'Pending', Approved: 'Pending' }[status] || status);
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const pdfValue = value => String(value ?? '').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
const pdfFileName = value => pdfValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patient';
function downloadHistoryPdf(patientName, records) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const columns = [
    { label: 'Date', width: 78 },
    { label: 'Record', width: 132 },
    { label: 'Details', width: 242 },
    { label: 'Recorded by', width: pageWidth - (margin * 2) - 78 - 132 - 242 },
  ];
  const ordered = chronological(records);
  let y = margin;
  const drawHeader = () => {
    doc.setFillColor(245, 248, 253);
    doc.rect(margin, y, pageWidth - (margin * 2), 24, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(82, 98, 125);
    let x = margin;
    columns.forEach(column => { doc.text(column.label, x + 6, y + 16); x += column.width; });
    y += 24;
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(23, 35, 61);
  doc.text('MediMama Record History', margin, y + 18);
  y += 38;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Patient: ${pdfValue(patientName)}`, margin, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${today()}`, margin, y);
  y += 22;
  drawHeader();
  ordered.forEach((record, index) => {
    const values = [
      pdfValue(record.date || 'Not recorded'),
      pdfValue(record.type || 'Clinical record'),
      pdfValue([record.details, record.notes].filter(Boolean).join(' · ') || 'No details recorded.'),
      pdfValue(record.actor || 'Not recorded'),
    ];
    const wrapped = values.map((value, columnIndex) => doc.splitTextToSize(value, columns[columnIndex].width - 12));
    const rowHeight = Math.max(30, ...wrapped.map(lines => lines.length * 11 + 12));
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    if (index % 2 === 0) {
      doc.setFillColor(251, 253, 255);
      doc.rect(margin, y, pageWidth - (margin * 2), rowHeight, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(64, 80, 106);
    let x = margin;
    wrapped.forEach((lines, columnIndex) => { doc.text(lines, x + 6, y + 16, { maxWidth: columns[columnIndex].width - 12 }); x += columns[columnIndex].width; });
    doc.setDrawColor(229, 235, 243);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  });
  doc.save(`${pdfFileName(patientName)}-record-history.pdf`);
}

export default function CareWorkspace({ section = 'overview', admin = false }) {
  const { data, save, storageError, loadingRecords, refreshPatientData } = useStore();
  const user = session();
  // Caregiver access can be granted while the app is open. Refresh live
  // assignments and family records whenever the caregiver opens a workspace.
  useEffect(() => { if (user.role === 'caregiver') refreshPatientData?.(); }, [user.role, refreshPatientData]);
  const canEdit = admin && user.role === 'admin';
  const linkedScope = family(data, user);
  const scope = { mothers: linkedScope.mothers.filter(p => !p.archived), infants: linkedScope.infants.filter(p => !p.archived && !data.mothers.find(m => m.id === p.motherId)?.archived) };
  const readOnly = user.role === 'caregiver';
  const loadingFamily = user.role === 'caregiver' && loadingRecords;
  // Pending registrations remain visible to the health center for review,
  // but active and follow-up records are shared with mothers and caregivers.
  const allowedInfants = canEdit ? scope.infants : scope.infants.filter(infant => infant.status !== 'Pending approval');
  const patients = [...scope.mothers, ...allowedInfants];
  const motherIsPostnatal = scope.mothers.some(mother => mother.status === 'Postnatal' || mother.maternal_status === 'postnatal');
  const canRegisterInfant = canEdit;
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [maternalPage, setMaternalPage] = useState(1);
  const [infantPage, setInfantPage] = useState(1);
  const [selectedMaternalRecord, setSelectedMaternalRecord] = useState(null);
  const [selectedImmunizationInfant, setSelectedImmunizationInfant] = useState(null);
  const open = value => { setError(''); setDialog(value); };
  const finish = message => { setDialog(null); setError(''); setNotice(message); };
  const updatePatient = async (collection, id, update) => {
    const current = data[collection].find(p => p.id === id), next = update(current);
    if (collection === 'infants' && next.status === 'Active') {
      const { error: problem } = await supabase.from('infants').update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', id);
      if (problem) { setError(problem.message); return false; }
      await refreshPatientData(); return true;
    }
    return false;
  };
  const matches = p => (!patientFilter || patientFilter === p.id) && `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase());
  const mothers = scope.mothers.filter(matches);
  const infants = allowedInfants.filter(matches);
  const maternalRecords = mothers.filter(m => section !== 'prenatal' && section !== 'postnatal' || (section === 'postnatal' ? m.status === 'Postnatal' : m.status !== 'Postnatal'));
  const pageSize = 7;
  const maternalTotalPages = Math.max(1, Math.ceil(maternalRecords.length / pageSize));
  const infantTotalPages = Math.max(1, Math.ceil(infants.length / pageSize));
  const currentMaternalPage = Math.min(maternalPage, maternalTotalPages);
  const currentInfantPage = Math.min(infantPage, infantTotalPages);
  const visibleMothers = maternalRecords.slice((currentMaternalPage - 1) * pageSize, currentMaternalPage * pageSize);
  const visibleInfants = infants.slice((currentInfantPage - 1) * pageSize, currentInfantPage * pageSize);
  const resetRecordPages = () => { setMaternalPage(1); setInfantPage(1); };
  const visibleAppointments = data.appointments.filter(a => patients.some(p => p.id === a.patientId) && (!patientFilter || a.patientId === patientFilter) && (!statusFilter || appointmentFilterStatus(a.status) === statusFilter) && `${a.patient} ${a.service} ${a.reason || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const booking = canEdit && patients.length > 0;
  // Appointment requests belong only in the Appointments tab.
  const canBookAppointments = booking && section === 'appointments';
  const showMothers = ['overview', 'records', 'prenatal', 'postnatal'].includes(section);
  const showInfants = ['overview', 'infants', 'immunization', 'records'].includes(section);
  const showAppointments = ['overview', 'appointments'].includes(section);
  const banner = { prenatal: ['Prenatal care', 'Record pregnancy assessments and prenatal visits.'], postnatal: ['Postnatal care', 'Record follow-up care after delivery and review maternal history.'], immunization: ['Infant immunizations', 'Review infant records and record administered vaccines.'], appointments: ['Appointments', 'Book, reschedule, and review care visits.'] }[section] || ['Shared care', 'Manage linked patient care records.'];

  const saveAppointment = async event => {
    event.preventDefault();
    const values = fields(event), old = dialog.item;
    if (old && !values.reason?.trim()) return setError('Enter a reason for rescheduling.');
    const patient = patients.find(p => p.id === values.patientId);
    const next = { ...old, ...values, patient: patient?.name, id: old?.id || uid('APT'), status: old ? 'Pending' : 'Pending', createdBy: old?.createdBy || user.id || user.email, history: [...(old?.history || []), ...(old ? [{ date: old.date, time: old.time, service: old.service, reason: values.reason.trim(), changedAt: new Date().toISOString(), actor: user.name }] : [])] };
    const problem = appointmentError(data, next);
    if (problem) return setError(problem);
    if (old && old.date === next.date && old.time === next.time) return setError('Choose a different date or time.');
    if (!user.demo) {
      const patientIsInfant = Boolean(patient?.motherId);
      const databaseValues = { mother_id: patientIsInfant ? null : patient.id, infant_id: patientIsInfant ? patient.id : null, service: next.service, reason: next.reason || null, scheduled_at: `${next.date}T${next.time}:00+08:00`, status: 'pending', created_by: user.id };
      const query = old ? supabase.from('appointments').update(databaseValues).eq('id', old.id).select().single() : supabase.from('appointments').insert(databaseValues).select().single();
      const { data: databaseAppointment, error: databaseError } = await query;
      if (databaseError) return setError(`Could not save appointment: ${databaseError.message}`);
      next.id = databaseAppointment.id;
    }
    if (!save(current => ({ ...current, appointments: old ? current.appointments.map(a => a.id === old.id ? next : a) : [...current.appointments, next] }))) return;
    // Pull the saved appointment back from Supabase straight away so the
    // appointment list and the admin dashboard use the same record.
    await refreshPatientData?.();
    void notifyEmailEvent('/api/email/appointment', { appointmentId: next.id });
    finish(old ? 'Appointment rescheduled. The reason and previous schedule are visible to the health center.' : 'Appointment booked.');
  };

  const saveInfant = async event => {
    event.preventDefault();
    const values = fields(event);
    if (user.role === 'mother' && !motherIsPostnatal) return setError('You can register an infant after your maternal status is updated to Postnatal.');
    if (!scope.mothers.some(m => m.id === values.motherId)) return setError('Choose a linked mother.');
    if (!Number.isFinite(day(values.birthDate)) || values.birthDate > today()) return setError('Birth date cannot be in the future.');
    if (values.measuredDate < values.birthDate || values.measuredDate > today()) return setError('Measurement date must be between birth and today.');
    values.guardianContact = String(values.guardianContact || '').replace(/\D/g, '');
    if (!/^09\d{9}$/.test(values.guardianContact)) return setError('Enter an 11-digit Philippine contact number starting with 09.');
    const name = [values.firstName, values.middleName, values.surname, values.suffix].filter(Boolean).join(' ').trim();
    if (!name) return setError('Enter the infant’s name.');
    const existingInfant = data.infants.find(i => i.motherId === values.motherId && i.name.toLowerCase() === name.toLowerCase() && i.birthDate === values.birthDate);
    const hasDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingInfant?.id || '');
    if (hasDatabaseId) return setError('This infant is already registered.');
    if (user.demo) return setError('Sign in with a registered account to save an infant.');
    const { error: infantError } = await supabase.rpc('register_care_infant', { values_json: { ...values, name } });
    if (infantError) return setError(infantError.message);
    await refreshPatientData();
    finish(canEdit ? 'Infant registered.' : 'Infant submitted for health center approval.');
  };

  const saveMaternal = async event => {
    event.preventDefault();
    const form = event.currentTarget, values = fields(event), file = form.elements.hospitalFile.files[0];
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
    if (!isUuid(dialog.patient.id)) return setError('Select a patient saved in the database.');
    const { error: intakeError } = await supabase.rpc('save_maternal_intake', { patient_id: dialog.patient.id, values_json: { ...values, attachments: [...(dialog.patient.attachments || []), ...(attachment ? [attachment] : [])] } });
    if (intakeError) return setError(intakeError.message);
    await refreshPatientData();
    finish('Maternal record saved to the shared patient history.');
    return;

  };

  const saveClinical = async event => {
    event.preventDefault();
    const values = fields(event), patient = dialog.patient;
    if (values.date > today() || !Number.isFinite(day(values.date)) || (patient.birthDate && values.date < patient.birthDate)) return setError('Enter a valid record date, no later than today.');
    const infant = Boolean(patient.motherId);
    if (!isUuid(patient.id)) return setError('Select a patient saved in the database.');
    let table, record;
    const author = { recorded_by: user.id };
    if (dialog.kind === 'growth') {
      table = 'growth_records'; record = { ...author, infant_id: patient.id, measured_at: values.date, weight_kg: Number(values.weight), length_cm: Number(values.length), muac_cm: values.muac ? Number(values.muac) : null, notes: values.notes };
    } else if (dialog.kind === 'vaccine') {
      const rule = vaccineSchedule.find(v => v.id === values.scheduleId);
      const problem = vaccineError(patient, rule, values.date);
      if (problem) return setError(problem);
      table = 'vaccinations'; record = { ...author, infant_id: patient.id, administered_at: values.date, vaccine: rule.vaccine, dose: rule.dose, provider: values.provider, notes: values.notes, batch: values.batch };
    } else {
      if (!infant && patient.status === 'Postnatal' && !patient.deliveryDate) return setError('Record the delivery date first.');
      table = infant ? 'infant_records' : 'maternal_records';
      record = { ...author, [infant ? 'infant_id' : 'mother_id']: patient.id, record_date: values.date, record_type: dialog.kind === 'screening' ? values.type : infant ? 'Infant review' : patient.deliveryDate && values.date >= patient.deliveryDate ? 'Postnatal check-up' : 'Prenatal check-up', details: [values.result || values.details, values.notes].filter(Boolean).join('\n') };
    }
    const { error: clinicalError } = await supabase.from(table).insert(record);
    if (clinicalError) return setError(clinicalError.message);
    await refreshPatientData();
    finish('Clinical record saved to the shared patient history.');
    return;

  };

  return <section className={`care-workspace${admin && section === 'overview' ? ' care-workspace-dashboard' : ''}`} data-section={section}>
    {selectedMaternalRecord && <MaternalRecordDialog mother={selectedMaternalRecord} canEdit={canEdit} onClose={() => setSelectedMaternalRecord(null)} onUpdate={() => { const mother = selectedMaternalRecord; setSelectedMaternalRecord(null); open({ kind: 'maternal', patient: mother }); }} onRecordVisit={() => { const mother = selectedMaternalRecord; setSelectedMaternalRecord(null); open({ kind: 'visit', patient: mother }); }} />}
    {selectedImmunizationInfant && <ImmunizationRecordDialog infant={selectedImmunizationInfant} mother={scope.mothers.find(mother => mother.id === selectedImmunizationInfant.motherId)} canEdit={canEdit} onClose={() => setSelectedImmunizationInfant(null)} onRecordDose={rule => { const infant = selectedImmunizationInfant; setSelectedImmunizationInfant(null); open({ kind: 'vaccine', patient: infant, rule }); }} />}
    {section !== 'records' && <div className="care-banner"><div><strong>{section === 'infants' ? 'Register an infant' : banner[0]}</strong><p>{section === 'infants' ? 'Add your baby’s details so the health center can review the record.' : banner[1]}</p></div><div className="care-actions">{canBookAppointments && <button onClick={() => open({ kind: 'appointment' })}>Book appointment</button>}{canRegisterInfant && section === 'immunization' && !readOnly && scope.mothers.length > 0 && <button onClick={() => open({ kind: 'infant' })}>Register infant</button>}{canEdit && section === 'postnatal' && <button onClick={() => open({ kind: 'links' })}>Account & caregiver links</button>}</div></div>}
    {storageError && <p className="care-error" role="alert">{storageError}</p>}{notice && !storageError && <p role="status" className="care-success">{notice}</p>}
    {loadingFamily && <p className="care-muted" role="status">Loading linked family records…</p>}
    {!loadingFamily && !patients.length && <Empty>No linked patient records yet. Ask the health center to link your account to your mother record. Caregiver access appears after approval.</Empty>}
    {!loadingFamily && user.role === 'mother' && section === 'infants' && <p className="care-muted">Infant registration is handled by the health center. Your linked infant records will appear here.</p>}
    {(readOnly || !['infants', 'records', 'appointments'].includes(section)) && <div className="care-filters"><label>Search patients or appointments<input value={query} onChange={e => { setQuery(e.target.value); resetRecordPages(); }} placeholder="Name, record ID, service, or reason" /></label><label>Patient<select value={patientFilter} onChange={e => { setPatientFilter(e.target.value); resetRecordPages(); }}><option value="">All linked patients</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>}
    {showAppointments && <section className="care-section"><h2>Appointments</h2><label className="care-status-filter">Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option>{['Pending', 'Rescheduled', 'Confirmed', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></label>{!visibleAppointments.length && <Empty>No appointments found.</Empty>}{visibleAppointments.map(a => <article className="care-card" key={a.id}><div className="care-card-heading"><div><h3>{a.patient}</h3><p>{a.service} · {a.date} at {a.time}</p></div><span className="care-badge">{appointmentLabel(a.status)}</span></div>{a.reason && <p><b>Reschedule reason:</b> {a.reason}</p>}{a.history?.length > 0 && <details><summary>Schedule history ({a.history.length})</summary>{a.history.map((h, index) => <p key={index}>{h.date} at {h.time} → changed {manilaDateTime(h.changedAt)} by {h.actor || 'Account holder'}: {h.reason}</p>)}</details>}<div className="care-actions">{booking && ['Pending', 'Rescheduled'].includes(a.status) && <button onClick={() => open({ kind: 'appointment', item: a })}>Reschedule</button>}{canEdit && ['Pending', 'Rescheduled', 'Confirmed'].includes(a.status) && <button disabled={a.date > today()} onClick={() => { save(c => ({ ...c, appointments: c.appointments.map(x => x.id === a.id ? { ...x, status: 'Completed', completedAt: new Date().toISOString() } : x) })); setNotice('Attendance marked completed. Add clinical findings to the patient record.'); }}>Mark attended</button>}</div></article>)}</section>}
    {showMothers && <section className="care-section"><h2>Maternal records</h2>{!loadingFamily && !maternalRecords.length && <Empty>No maternal records found.</Empty>}{visibleMothers.map(m => { const stage = pregnancy(m); const visits = (m.records || []).filter(r => r.type === 'Prenatal check-up').length + Number(m.priorVisits || 0); const deliveryLabel = m.status === 'Postnatal' ? 'Actual delivery date' : 'Expected delivery date'; return <article className="care-card" key={m.id}><div className="care-card-heading"><div><h3>{m.name}</h3><p>{m.id}</p><p className="care-patient-meta">Birthdate: {m.birthDate || 'Not recorded'} · Contact: {m.contact || 'Not recorded'} · Address: {m.address || 'Not recorded'}</p></div><span className="care-badge">{stage.label}</span></div><dl className="care-metrics"><div><dt>Pregnancy</dt><dd>{stage.weeks === null ? stage.label === 'Postnatal' ? 'Delivered' : `Awaiting assessment` : `${stage.weeks} weeks · approximately ${stage.months} months`}</dd></div><div><dt>{deliveryLabel}</dt><dd>{m.deliveryDate || 'Not recorded'}</dd></div><div><dt>Prenatal visits recorded</dt><dd>{visits}</dd></div><div><dt>Remaining planned visits</dt><dd>{stage.label === 'Postnatal' ? 'Prenatal plan closed' : `${Math.max(0, Number(m.plannedVisits || 8) - visits)} of ${m.plannedVisits || 8}`}</dd></div></dl>{nextPrenatal(m) && <p><b>Next monthly visit suggestion:</b> {nextPrenatal(m)}. Choose an available Wednesday when booking.</p>}<p><b>Hospital:</b> {m.hospital || 'Not recorded'}</p><p>{m.hospitalSummary || 'No hospital intake summary recorded.'}</p>{(m.attachments || []).map((file, i) => <a key={i} href={file.url} download={file.name}>Download {file.name}</a>)}{canEdit && <div className="care-actions"><button onClick={() => open({ kind: 'maternal', patient: m })}>Update intake / delivery</button><button onClick={() => open({ kind: 'visit', patient: m })}>Record checkup</button></div>}<History records={m.records} patientName={m.name} /></article>; })}<CarePagination page={currentMaternalPage} totalPages={maternalTotalPages} totalItems={maternalRecords.length} pageSize={pageSize} onChange={setMaternalPage} /></section>}
    {(section === 'prenatal' || section === 'postnatal') && <section className="care-section maternal-records-section"><h2>{section === 'prenatal' ? 'Prenatal records' : 'Postnatal records'}</h2><MaternalRecordsTable mothers={visibleMothers} onView={setSelectedMaternalRecord} /><CarePagination page={currentMaternalPage} totalPages={maternalTotalPages} totalItems={maternalRecords.length} pageSize={pageSize} onChange={setMaternalPage} /></section>}
    {showInfants && <section className="care-section"><h2>Infant records</h2>{!infants.length && <Empty>No infant records found.</Empty>}{visibleInfants.map(baby => { const age = daysBetween(baby.birthDate, today()); const latest = chronological(baby.growth)[0]; const firstVisit = [...(baby.records || []), ...data.appointments.filter(a => a.patientId === baby.id && a.status === 'Completed')].find(r => daysBetween(baby.birthDate, r.date) >= 0 && daysBetween(baby.birthDate, r.date) <= 42); return <article className="care-card" key={baby.id}><div className="care-card-heading"><div><h3>{baby.name}</h3><p>{baby.birthDate} · {Math.floor(age / 7)} weeks old · {baby.sex} · {infantAgeStatus(baby.birthDate)} · Mother: {data.mothers.find(m => m.id === baby.motherId)?.name}</p></div><span className="care-badge">{baby.status}</span></div>{canEdit && baby.status === 'Pending approval' && <button onClick={async () => { if (await updatePatient('infants', baby.id, b => ({ ...b, status: 'Active', approvedAt: new Date().toISOString() }))) setNotice('Infant registration approved.'); }}>Approve registration</button>}<dl className="care-metrics"><div><dt>Weight</dt><dd>{latest?.weight ? `${latest.weight} kg` : 'Not recorded'}</dd></div><div><dt>Height / length</dt><dd>{latest?.length ? `${latest.length} cm` : 'Not recorded'}</dd></div><div><dt>MUAC</dt><dd>{latest?.muac ? `${latest.muac} cm` : 'Not recorded'}</dd></div><div><dt>Last measurement</dt><dd>{latest?.date || 'Not recorded'}</dd></div></dl><details><summary>Birth and family information</summary><p>Place of birth: {baby.placeOfBirth || 'Not recorded'} · Birth weight: {baby.birthWeight || '—'} kg · Birth length: {baby.birthLength || '—'} cm</p><p>Father: {baby.fatherName || 'Not recorded'} · Address: {baby.address || 'Not recorded'} · Contact: {baby.guardianContact || 'Not recorded'}</p><p>Blood type: {baby.bloodType || 'Unknown'} · Allergies: {baby.allergies || 'Not recorded'} · Medical notes: {baby.medicalNotes || 'Not recorded'}</p></details><p className={firstVisit ? 'care-success' : 'care-reminder'}>{firstVisit ? `Visit within first six weeks recorded: ${firstVisit.date}` : `${age > 42 ? 'Follow-up needed: no visit recorded within the first six weeks.' : 'First-six-week visit due'} ${age <= 42 ? `by ${addDays(baby.birthDate, 42)}.` : ''}`}</p><div className="care-actions">{canEdit && baby.status !== 'Pending approval' && <><button onClick={() => open({ kind: 'growth', patient: baby })}>Add measurements</button><button onClick={() => open({ kind: 'visit', patient: baby })}>Record clinic visit</button><button onClick={() => open({ kind: 'screening', patient: baby })}>Record screening</button></>}{user.role === 'mother' && baby.status !== 'Pending approval' && <Link className="care-infant-access" to={`/user/caregivers?infant=${encodeURIComponent(baby.id)}`}><i className="fa-solid fa-people-group" aria-hidden="true" /> Manage caregiver access</Link>}</div><h4>Newborn screening & hearing test</h4>{['Newborn screening', 'Hearing test'].map(type => { const done = (baby.screenings || []).find(s => s.type === type && s.status === 'Completed'); return <p key={type}><input type="checkbox" checked={Boolean(done)} readOnly aria-label={`${type} completed`} /> {type}: {done ? `${done.date} · ${done.result}` : 'Not recorded — review with health worker'}</p>; })}<h4>Immunization checklist</h4><p className="care-muted">Eligibility dates use age and recorded dose intervals. The health worker confirms suitability and records administration.</p><div className="care-table-wrap"><table><thead><tr><th>Completed</th><th>Vaccine / dose</th><th>Earliest scheduled date</th><th>Administration / status</th><th>Action</th></tr></thead><tbody>{vaccineSchedule.map(rule => { const done = completedDose(baby, rule); const problem = vaccineError(baby, rule, today()); return <tr key={rule.id}><td><input type="checkbox" checked={Boolean(done)} readOnly aria-label={`${rule.vaccine} ${rule.dose} completed`} /></td><td>{rule.vaccine} · {rule.dose}</td><td>{vaccineDue(baby, rule)}</td><td>{done ? `${done.date} · ${done.provider || done.actor || 'Recorded'}` : problem || 'Due — health worker review'}</td><td>{canEdit && !done && baby.status !== 'Pending approval' && <button onClick={() => open({ kind: 'vaccine', patient: baby, rule })}>Record dose</button>}</td></tr>; })}</tbody></table></div><details><summary>Growth history ({baby.growth?.length || 0})</summary><div className="care-table-wrap"><table><thead><tr><th>Date</th><th>Weight (kg)</th><th>Length (cm)</th><th>MUAC (cm)</th><th>Notes / source</th></tr></thead><tbody>{chronological(baby.growth).map((g, i) => <tr key={g.id || i}><td>{g.date}</td><td>{g.weight}</td><td>{g.length}</td><td>{g.muac || 'Not recorded'}</td><td>{g.notes} · {g.source || g.actor || 'Existing record'}</td></tr>)}</tbody></table></div></details><History records={[...(baby.records || []), ...(baby.screenings || []).map(s => ({ ...s, details: s.result })), ...(baby.vaccines || []).filter(v => ['Complete', 'Completed'].includes(v.status)).map(v => ({ ...v, type: `${v.vaccine} ${v.dose}`, details: `${v.provider || ''} ${v.notes || ''}` }))]} growthRecords={baby.growth} patientName={baby.name} /></article>; })}<CarePagination page={currentInfantPage} totalPages={infantTotalPages} totalItems={infants.length} pageSize={pageSize} onChange={setInfantPage} /></section>}
    {section === 'immunization' && <section className="care-section immunization-records-section"><h2>Immunization records</h2><ImmunizationRecordsTable infants={visibleInfants} mothers={scope.mothers} onView={setSelectedImmunizationInfant} /><CarePagination page={currentInfantPage} totalPages={infantTotalPages} totalItems={infants.length} pageSize={pageSize} onChange={setInfantPage} /></section>}
    {dialog && <Dialog title={{ appointment: dialog.item ? 'Reschedule appointment' : 'Book appointment', infant: 'Register infant', maternal: 'Maternal intake & delivery', growth: 'Record growth measurements', vaccine: 'Record administered vaccine', screening: 'Record newborn screening', visit: 'Record clinic visit', links: 'Link accounts to patient records' }[dialog.kind]} close={() => setDialog(null)}>
      {(error || storageError) && <p className="care-error" role="alert">{error || storageError}</p>}
      {dialog.kind === 'appointment' && <AppointmentForm patients={patients} data={data} item={dialog.item} initialPatientId={dialog.patientId} submit={saveAppointment} />}
      {dialog.kind === 'infant' && <form className="care-form" onSubmit={saveInfant}>{!canEdit && !readOnly ? <label>Mother<input value={scope.mothers[0]?.name || user.name || 'My account'} readOnly /><input type="hidden" name="motherId" value={scope.mothers[0]?.id || ''} /></label> : <label>Mother<select name="motherId" required>{scope.mothers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}<Field label="First name" name="firstName" required /><Field label="Middle name" name="middleName" /><Field label="Surname" name="surname" required /><Field label="Suffix" name="suffix" /><Field label="Date of birth" name="birthDate" type="date" max={today()} required /><label>Sex<select name="sex"><option>Female</option><option>Male</option></select></label><Field label="Place of birth" name="placeOfBirth" required /><Field label="Father’s name" name="fatherName" /><Field label="Address" name="address" required /><Field label="Guardian contact" name="guardianContact" type="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength="11" placeholder="09XXXXXXXXX" required /><Field label="Blood type (if known)" name="bloodType" /><Field label="Birth weight (kg)" name="birthWeight" type="number" min="0.1" max="10" step="0.01" required /><Field label="Birth length (cm)" name="birthLength" type="number" min="1" max="100" step="0.1" required /><MeasurementFields /><Field label="Measurement date" name="measuredDate" type="date" value={today()} max={today()} required /><Field label="Allergies" name="allergies" /><label>Medical notes<textarea name="medicalNotes" /></label><button className="care-submit">{canEdit ? 'Register infant' : 'Submit for approval'}</button></form>}
      {dialog.kind === 'maternal' && <form className="care-form" onSubmit={saveMaternal}><label>Status<select name="status" defaultValue={dialog.patient.status}><option>Pregnant</option><option>Postnatal</option></select></label><Field label="Gestational age at assessment (weeks)" name="gestationWeeks" type="number" min="0" max="45" value={dialog.patient.gestationWeeks} /><Field label="Assessment date" name="gestationDate" type="date" max={today()} value={dialog.patient.gestationDate} /><Field label="Expected delivery date (Prenatal) / Actual delivery date (Postnatal)" name="deliveryDate" type="date" max={today()} value={dialog.patient.deliveryDate} /><Field label="Planned prenatal visits" name="plannedVisits" type="number" min="1" max="30" value={dialog.patient.plannedVisits || 8} required /><Field label="Previous hospital prenatal visits" name="priorVisits" type="number" min="0" max="30" value={dialog.patient.priorVisits || 0} required /><Field label="Referring hospital" name="hospital" value={dialog.patient.hospital} /><label>Hospital records / intake summary<textarea name="hospitalSummary" defaultValue={dialog.patient.hospitalSummary || ''} /></label><Field label="Hospital document (PDF or image, up to 1 MB)" name="hospitalFile" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /><p className="care-muted">Expected date is used while Prenatal; the health center records the actual delivery date after birth. Previous visits count toward the plan.</p><button className="care-submit">Save maternal record</button></form>}
      {['growth', 'vaccine', 'screening', 'visit'].includes(dialog.kind) && <form className="care-form" onSubmit={saveClinical}><Field label="Record date" name="date" type="date" value={today()} max={today()} min={dialog.patient.birthDate} required />{dialog.kind === 'growth' && <MeasurementFields />}{dialog.kind === 'vaccine' && <><input type="hidden" name="scheduleId" value={dialog.rule.id} /><p>{dialog.rule.vaccine} · {dialog.rule.dose}</p><Field label="Administered by / facility" name="provider" required /><Field label="Batch / lot number (if available)" name="batch" /><label className="care-check"><input type="checkbox" required /> I checked the immunization card and confirmed this dose was administered.</label></>}{dialog.kind === 'screening' && <><label>Screening<select name="type"><option>Newborn screening</option><option>Hearing test</option></select></label><Field label="Result / follow-up recommendation" name="result" required /></>}{dialog.kind === 'visit' && <label>Clinical findings<textarea name="details" required /></label>}<label>Notes<textarea name="notes" /></label><button className="care-submit">Save record</button></form>}
      {dialog.kind === 'links' && <AccountLinks data={data} save={save} finish={finish} setError={setError} />}
    </Dialog>}
  </section>;
}

function MeasurementFields() { return <><Field label="Current weight (kg)" name="weight" type="number" min="0.1" max="60" step="0.01" required /><Field label="Height / length (cm)" name="length" type="number" min="1" max="180" step="0.1" required /><Field label="MUAC (cm)" name="muac" type="number" min="1" max="40" step="0.1" required /></>; }
function History({ records = [], growthRecords = [], patientName = 'Patient' }) {
  const ordered = chronological(records);
  const growthForPdf = growthRecords.map(growth => ({
    id: `growth-${growth.id || growth.date}`,
    date: growth.date,
    type: 'Growth measurement',
    details: [['Weight', growth.weight, 'kg'], ['Length', growth.length, 'cm'], ['MUAC', growth.muac, 'cm']].filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value, unit]) => `${label}: ${value} ${unit}`).join(' · ') || 'No growth details recorded.',
    actor: growth.actor || growth.source || 'Existing record',
  }));
  const downloadableRecords = [...ordered, ...growthForPdf];
  return <details><summary>Record history ({records.length})</summary>{downloadableRecords.length ? <><div className="care-history-toolbar"><button type="button" className="care-history-download" onClick={() => downloadHistoryPdf(patientName, downloadableRecords)}><i className="fa-solid fa-file-pdf" aria-hidden="true" /> Download PDF</button></div>{ordered.length ? <div className="care-history-table-wrap"><table className="care-history-table"><thead><tr><th>Date</th><th>Record</th><th>Details</th><th>Recorded by</th></tr></thead><tbody>{ordered.map((record, index) => <tr key={record.id || index}><td>{record.date || 'Not recorded'}</td><td>{record.type || 'Clinical record'}</td><td>{[record.details, record.notes].filter(Boolean).join(' · ') || 'No details recorded.'}</td><td>{record.actor || 'Not recorded'}</td></tr>)}</tbody></table></div> : <p className="care-muted">Growth history will be included in the downloaded PDF.</p>}</> : <Empty>No clinical history recorded.</Empty>}</details>;
}
function CarePagination({ page, totalPages, totalItems, pageSize, onChange }) {
  if (!totalItems) return null;
  return <div className="care-record-pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}</span><div><button type="button" onClick={() => onChange(page - 1)} disabled={page === 1}>Previous</button><strong>Page {page} of {totalPages}</strong><button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages}>Next</button></div></div>;
}
function MaternalRecordsTable({ mothers, onView }) {
  return <div className="care-table-wrap maternal-records-table"><table><thead><tr><th>Mother</th><th>Birthdate</th><th>Status</th><th>Delivery date</th><th>Prenatal visits</th><th>Action</th></tr></thead><tbody>{mothers.length ? mothers.map(mother => <tr key={mother.id}><td><strong>{mother.name}</strong><small>{mother.recordCode || mother.id}</small></td><td>{mother.birthDate || 'Not recorded'}</td><td><span className="care-table-status">{mother.status}</span></td><td>{mother.deliveryDate || 'Not recorded'}</td><td>{(mother.records || []).filter(record => record.type === 'Prenatal check-up').length + Number(mother.priorVisits || 0)}</td><td><button type="button" className="care-view-record-button" onClick={() => onView(mother)}><i className="fa-solid fa-eye" aria-hidden="true" /> View record</button></td></tr>) : <tr><td colSpan="6" className="care-empty-cell">No maternal records found.</td></tr>}</tbody></table></div>;
}
function MaternalRecordDialog({ mother, canEdit, onClose, onUpdate, onRecordVisit }) {
  const visits = (mother.records || []).filter(record => record.type === 'Prenatal check-up').length + Number(mother.priorVisits || 0);
  return <Dialog title={`${mother.name}'s maternal record`} close={onClose}><p className="care-patient-meta">Birthdate: {mother.birthDate || 'Not recorded'} · Status: {mother.status} · Address: {mother.address || 'Not recorded'}</p><dl className="care-metrics"><div><dt>{mother.status === 'Postnatal' ? 'Actual delivery date' : 'Expected delivery date'}</dt><dd>{mother.deliveryDate || 'Not recorded'}</dd></div><div><dt>Pregnancy weeks</dt><dd>{mother.gestationWeeks !== null && mother.gestationWeeks !== undefined && mother.gestationWeeks !== '' ? mother.gestationWeeks : 'Not recorded'}</dd></div><div><dt>Prenatal visits</dt><dd>{visits}</dd></div><div><dt>Hospital</dt><dd>{mother.hospital || 'Not recorded'}</dd></div></dl><p>{mother.hospitalSummary || 'No hospital intake summary recorded.'}</p>{canEdit && <div className="care-actions"><button type="button" onClick={onUpdate}>Update intake / delivery</button><button type="button" onClick={onRecordVisit}>Record checkup</button></div>}<History records={mother.records} patientName={mother.name} /></Dialog>;
}
function ImmunizationRecordsTable({ infants, mothers, onView }) {
  return <div className="care-table-wrap immunization-records-table"><table><thead><tr><th>Infant</th><th>Birthdate / age stage</th><th>Mother</th><th>Record status</th><th>Action</th></tr></thead><tbody>{infants.length ? infants.map(infant => <tr key={infant.id}><td><strong>{infant.name}</strong><small>{infant.recordCode || infant.id}</small></td><td>{infant.birthDate || 'Not recorded'}<small>{infantAgeStatus(infant.birthDate)}</small></td><td>{mothers.find(mother => mother.id === infant.motherId)?.name || 'Unlinked'}</td><td><span className="care-table-status">{infant.status}</span></td><td><button type="button" className="care-view-record-button" onClick={() => onView(infant)}><i className="fa-solid fa-eye" aria-hidden="true" /> View record</button></td></tr>) : <tr><td colSpan="5" className="care-empty-cell">No infant records found.</td></tr>}</tbody></table></div>;
}
function ImmunizationRecordDialog({ infant, mother, canEdit, onClose, onRecordDose }) {
  const recordHistory = [
    ...(infant.records || []),
    ...(infant.screenings || []).map(screening => ({ ...screening, details: screening.result })),
    ...(infant.vaccines || []).filter(vaccine => ['Complete', 'Completed'].includes(vaccine.status)).map(vaccine => ({ ...vaccine, type: `${vaccine.vaccine} ${vaccine.dose}`, details: `${vaccine.provider || ''} ${vaccine.notes || ''}` })),
  ];
  return <Dialog title={`${infant.name}'s immunization record`} close={onClose}>
    <p className="care-patient-meta">Birthdate: {infant.birthDate || 'Not recorded'} · {infantAgeStatus(infant.birthDate)} · Mother: {mother?.name || 'Unlinked'}</p>
    <div className="care-table-wrap immunization-detail-table"><table><thead><tr><th>Vaccine / dose</th><th>Earliest date</th><th>Status</th><th>Action</th></tr></thead><tbody>{vaccineSchedule.map(rule => { const done = completedDose(infant, rule); const problem = vaccineError(infant, rule, today()); return <tr key={rule.id}><td>{rule.vaccine} · {rule.dose}</td><td>{vaccineDue(infant, rule)}</td><td>{done ? `Completed ${done.date}` : problem || 'Due — health worker review'}</td><td>{canEdit && !done && infant.status !== 'Pending approval' && <button type="button" className="care-record-dose-button" onClick={() => onRecordDose(rule)}><i className="fa-solid fa-syringe" aria-hidden="true" /> Record dose</button>}</td></tr>; })}</tbody></table></div>
    <h4>Newborn screening & hearing test</h4>
    {['Newborn screening', 'Hearing test'].map(type => { const done = (infant.screenings || []).find(screening => screening.type === type && screening.status === 'Completed'); return <p key={type}><input type="checkbox" checked={Boolean(done)} readOnly aria-label={`${type} completed`} /> {type}: {done ? `${done.date} · ${done.result}` : 'Not recorded'}</p>; })}
    <details open><summary>Growth history ({infant.growth?.length || 0})</summary>{infant.growth?.length ? <div className="care-table-wrap immunization-detail-table"><table><thead><tr><th>Date</th><th>Weight (kg)</th><th>Length (cm)</th><th>MUAC (cm)</th><th>Notes / source</th></tr></thead><tbody>{chronological(infant.growth).map((growth, index) => <tr key={growth.id || index}><td>{growth.date}</td><td>{growth.weight}</td><td>{growth.length}</td><td>{growth.muac || 'Not recorded'}</td><td>{growth.notes || growth.source || growth.actor || 'Existing record'}</td></tr>)}</tbody></table></div> : <Empty>No growth history recorded.</Empty>}</details>
    <History records={recordHistory} growthRecords={infant.growth} patientName={infant.name} />
  </Dialog>;
}
function AppointmentForm({ patients, data, item, initialPatientId, submit }) {
  const [patientId, setPatientId] = useState(item?.patientId || initialPatientId || patients[0]?.id || '');
  const [service, setService] = useState(item?.service || (data.infants.some(p => p.id === (initialPatientId || patients[0]?.id)) ? 'Infant Immunization' : 'Prenatal Checkup'));
  const infant = data.infants.some(p => p.id === patientId);
  const changeService = value => {
    setService(value);
    if (item) return;
    if (value === 'Infant Immunization') setPatientId(data.infants.find(p => patients.some(patient => patient.id === p.id))?.id || patientId);
    else setPatientId(data.mothers.find(p => patients.some(patient => patient.id === p.id))?.id || patientId);
  };
  const nextWednesday = () => { const value = new Date(`${today()}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + ((3 - value.getUTCDay() + 7) % 7)); return value.toISOString().slice(0, 10); };
  const date = item?.date || nextWednesday();
  const start = infant ? 8 : 10;
  return <form className="care-form" onSubmit={submit}><input name="date" type="hidden" value={date} /><label>Patient<select name="patientId" value={patientId} onChange={e => { const id = e.target.value; setPatientId(id); setService(data.infants.some(p => p.id === id) ? 'Infant Immunization' : 'Prenatal Checkup'); }} disabled={Boolean(item)}>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{item && <input name="patientId" type="hidden" value={patientId} />}</label><label>Service<select name="service" value={service} onChange={e => changeService(e.target.value)} disabled={Boolean(item)}><option>Prenatal Checkup</option><option>Postnatal Checkup</option><option disabled={!data.infants.some(p => patients.some(patient => patient.id === p.id))}>Infant Immunization</option></select></label><label>Preferred time<select name="time" defaultValue={item?.time || ''} required><option value="">Select a time</option>{Array.from({ length: (17 - start) * 2 }, (_, i) => `${String(start + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`).map(t => <option key={t}>{t}</option>)}</select></label>{service === 'Infant Immunization' && <p className="care-muted">The selected infant will receive this immunization appointment.</p>}<p className="care-muted">Your appointment will be scheduled for {date}, the next available Wednesday.</p>{item && <label>Reason for rescheduling<textarea name="reason" required placeholder="For example: feeling unwell" /></label>}<button className="care-submit">{item ? 'Save new schedule' : 'Book appointment'}</button></form>;
}

function AccountLinks({ data, finish, setError }) {
  const { refreshPatientData } = useStore();
  const [accounts,setAccounts] = useState([]), [accountId,setAccountId] = useState(''), [busy,setBusy] = useState(false);
  useEffect(() => { supabase.from('profiles').select('id,full_name,role').then(({data:rows,error}) => { if(error) setError(error.message); else setAccounts(rows || []); }); }, []);
  const account = accounts.find(a=>a.id===accountId);
  const submit = async event => {
    event.preventDefault(); const values=fields(event);
    if(!account || !values.motherId) return setError('Choose an account and mother record.');
    setBusy(true);
    try {
      const result = account.role==='caregiver'
        ? await supabase.from('caregiver_assignments').upsert({caregiver_id:account.id,mother_id:values.motherId,relationship:values.relationship,consent_confirmed_at:new Date().toISOString(),status:'approved',revoked_at:null},{onConflict:'caregiver_id,mother_id'})
        : await supabase.from('mother_accounts').insert({user_id:account.id,mother_id:values.motherId});
      if(result.error) throw result.error;
      await refreshPatientData(); finish('Account linked to shared patient records.');
    } catch(error) { setError(error.message); } finally { setBusy(false); }
  };
  const revoke = async id => { setBusy(true); try { const {error}=await supabase.from('caregiver_assignments').update({status:'revoked',revoked_at:new Date().toISOString()}).eq('id',id); if(error) throw error; await refreshPatientData(); finish('Caregiver access revoked.'); } catch(error) { setError(error.message); } finally { setBusy(false); } };
  return <><form className="care-form" onSubmit={submit}><label>Registered account<select value={accountId} onChange={e=>setAccountId(e.target.value)} required><option value="">Choose account</option>{accounts.filter(a=>['mother','caregiver'].includes(a.role)).map(a=><option key={a.id} value={a.id}>{a.full_name} - {a.role}</option>)}</select></label><label>Mother record<select name="motherId" required><option value="">Choose mother</option>{data.mothers.filter(m=>!m.archived).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{account?.role==='caregiver' && <><Field label="Relationship" name="relationship" required/><label className="care-check"><input type="checkbox" required/>I contacted the mother and verified consent for caregiver access.</label></>}<button disabled={busy} className="care-submit">Approve and link account</button></form><h3>Approved caregiver links</h3>{data.caregivers.filter(c=>c.status==='Approved').map(c=><p key={c.id}>{accounts.find(a=>a.id===c.accountId)?.full_name || 'Caregiver'} - {data.mothers.find(m=>m.id===c.motherId)?.name} <button disabled={busy} onClick={()=>revoke(c.id)}>Revoke access</button></p>)}</>;
}
