import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { useStore } from '../store';
import CareWorkspace from '../components/CareWorkspace';
import { today } from '../care';
import { supabase } from '../lib/supabase';
import { notifyEmailEvent } from '../lib/emailNotifications';
import AppointmentApprovals from './AppointmentApprovals';
import './AdminWorkspace.css';

export { AdminDashboard } from './AdminPages';

const Icon = ({ name }) => <i className={`fa-solid fa-${name}`} />;
const Toast = ({ message }) => message ? <p className="admin-toast" role="status"><Icon name="circle-check" /> {message}</p> : null;
function Modal({ title, children, close, showClose = true }) {
  const canClose = showClose;
  return <div className="admin-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && canClose && close()}><section role="dialog" aria-modal="true" aria-label={title}>{canClose && <button className="close" type="button" onClick={() => close()} aria-label="Close">×</button>}<p className="eyebrow">MediMama Admin</p><h2>{title}</h2>{children}</section></div>;
}

function MotherPicker({ mothers, value, onChange }) {
  const selected = mothers.find(mother => mother.id === value);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  const results = mothers
    .filter(mother => !mother.archived && mother.status !== 'Archived')
    .filter(mother => `${mother.name} ${mother.recordCode || mother.id} ${mother.address || ''}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);
  const choose = mother => { onChange(mother.id); setQuery(mother.name); setOpen(false); };
  return <div className="mother-picker">
    <input name="motherSearch" type="search" value={query} required={!value} placeholder="Search mother or record ID" autoComplete="off" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); onChange(''); setOpen(true); }} />
    <input type="hidden" name="motherId" value={value || ''} />
    {open && <div className="mother-picker-results" role="listbox" aria-label="Mother results">
      {results.length ? results.map(mother => <button type="button" role="option" aria-selected={mother.id === value} key={mother.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(mother)}><strong>{mother.name}</strong><small>{mother.recordCode || mother.id} · {mother.status}</small></button>) : <p>No mothers found.</p>}
    </div>}
    {selected && <small className="mother-picker-selected">Selected: {selected.name} · {selected.recordCode || selected.id}</small>}
  </div>;
}

function InfantPatientForm({ data, initial, onSave, onCancel }) {
  const latestGrowth = [...(initial.growth || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).at(-1);
  const nameParts = String(initial.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = initial.firstName || nameParts[0] || '';
  const lastName = initial.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
  const middleInitial = initial.middleInitial || (nameParts.length > 2 ? nameParts[1].replace('.', '') : '');
  const [motherId, setMotherId] = useState(initial.motherId || '');
  const [blockLot, setBlockLot] = useState(initial.blockLot || String(initial.address || '').replace(/,?\s*Imus City,?\s*Cavite\s*4103$/i, ''));
  const handleMotherChange = id => {
    setMotherId(id);
    const mother = data.mothers.find(item => item.id === id);
    setBlockLot(mother ? String(mother.address || '').replace(/,?\s*Imus City,?\s*Cavite\s*4103$/i, '').trim() : '');
  };
  return <form className="admin-form" onSubmit={event => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))); }}>
    <label className="admin-form-full">Mother<MotherPicker mothers={data.mothers} value={motherId} onChange={handleMotherChange} /></label>
    <label>First name<input name="firstName" required defaultValue={firstName} /></label>
    <label>Middle initial (optional)<input name="middleInitial" maxLength="1" pattern="[A-Za-z]?" defaultValue={middleInitial} /></label>
    <label>Last name<input name="lastName" required defaultValue={lastName} /></label>
    <label>Suffix (optional)<input name="suffix" maxLength="10" defaultValue={initial.suffix || ''} /></label>
    <label>Address (Block and Lot)<input name="blockLot" required placeholder="e.g., Block 1 Lot 2" value={blockLot} onChange={event => setBlockLot(event.target.value)} /><small>Imus City, Cavite 4103</small></label>
    <label>Date of birth<input name="birthDate" type="date" max={today()} required defaultValue={initial.birthDate || ''} /></label>
    <label>Gender<select name="sex" defaultValue={initial.sex || 'Female'}><option>Female</option><option>Male</option></select></label>
    <label>Weight (kg)<input name="weight" type="number" min="0.1" max="60" step="0.01" required defaultValue={initial.weight ?? latestGrowth?.weight ?? ''} /></label>
    <label>Height (cm)<input name="height" type="number" min="1" max="180" step="0.1" required defaultValue={initial.height ?? initial.length ?? latestGrowth?.length ?? ''} /></label>
    <label>MUAC (cm)<input name="muac" type="number" min="1" max="40" step="0.1" required defaultValue={initial.muac ?? latestGrowth?.muac ?? ''} /></label>
    <label>Record status<select name="status" defaultValue={initial.status || 'Active'}><option>Active</option><option>Needs follow-up</option></select><small>Choose “Needs follow-up” only when the midwife requests another check or more information.</small></label>
    <div className="admin-form-actions"><button type="button" className="secondary" onClick={() => onCancel(Boolean(initial.id))}><Icon name={initial.id ? 'arrow-left' : 'xmark'} /> {initial.id ? 'Back to profile' : 'Cancel'}</button><button className="primary-button"><Icon name="floppy-disk" /> Save record</button></div>
  </form>;
}

function MotherPatientForm({ initial = {}, onSave, onCancel, cancelLabel = 'Cancel' }) {
  const [maternalStatus, setMaternalStatus] = useState(initial.status || 'Pregnant');
  const nameParts = String(initial.name || '').trim().split(/\s+/).filter(Boolean);
  const suffixTokens = ['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V'];
  const parsedSuffix = suffixTokens.includes(nameParts.at(-1)) ? nameParts.at(-1) : '';
  const motherNameParts = parsedSuffix ? nameParts.slice(0, -1) : nameParts;
  const firstName = initial.firstName || motherNameParts[0] || '';
  const lastName = initial.lastName || (motherNameParts.length > 1 ? motherNameParts.at(-1) : '');
  const middleName = initial.middleName || (motherNameParts.length > 2 ? motherNameParts.slice(1, -1).join(' ') : '');
  const suffix = initial.suffix || parsedSuffix;
  const resolvedCancelLabel = cancelLabel === 'Cancel' && initial.id ? 'Back to profile' : cancelLabel;
  return <form className="admin-form" onSubmit={event => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))); }}>
    <label>First name<input name="firstName" required defaultValue={firstName} /></label>
    <label>Middle name (optional)<input name="middleName" defaultValue={middleName} /></label>
    <label>Last name<input name="lastName" required defaultValue={lastName} /></label>
    <label>Suffix (optional)<input name="suffix" maxLength="10" defaultValue={suffix} /></label>
    <label>Address<input name="address" required defaultValue={initial.address || ''} /></label>
    <label>Birthdate<input name="birthDate" type="date" max={today()} required defaultValue={initial.birthDate || ''} /></label>
    <label>Status<select name="status" value={maternalStatus} onChange={event => setMaternalStatus(event.target.value)} required><option>Pregnant</option><option>Postnatal</option></select></label>
    <label>{maternalStatus === 'Postnatal' ? 'Actual delivery date' : 'Expected delivery date'}<input name="deliveryDate" type="date" max={maternalStatus === 'Postnatal' ? today() : undefined} required defaultValue={initial.deliveryDate || ''} /></label>
    <label>Pregnancy weeks (optional)<input name="gestationWeeks" type="number" min="0" max="45" defaultValue={initial.gestationWeeks ?? ''} /></label>
    <div className="admin-form-actions"><button type="button" className="secondary admin-form-back" onClick={() => onCancel(Boolean(initial.id))}><Icon name={resolvedCancelLabel === 'Cancel' ? 'xmark' : 'arrow-left'} /> {resolvedCancelLabel}</button><button className="primary-button"><Icon name="floppy-disk" /> Save record</button></div>
  </form>;
}

function PatientForm({ type, initial = {}, onSave, onCancel, cancelLabel = 'Cancel' }) {
  const mother = type === 'mothers';
  const { data } = useStore();
  const resolvedCancelLabel = cancelLabel === 'Cancel' && initial.id ? 'Back to profile' : cancelLabel;
  const [maternalStatus, setMaternalStatus] = useState(initial.status || 'Pregnant');
  const latestGrowth = !mother ? [...(initial.growth || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).at(-1) : null;
  const nameParts = String(initial.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = initial.firstName || nameParts[0] || '';
  const lastName = initial.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
  const middleInitial = initial.middleInitial || (nameParts.length > 2 ? nameParts[1].replace('.', '') : '');
  const suffixTokens = ['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V'];
  const parsedMotherSuffix = suffixTokens.includes(nameParts.at(-1)) ? nameParts.at(-1) : '';
  const motherNameParts = parsedMotherSuffix ? nameParts.slice(0, -1) : nameParts;
  const motherFirstName = initial.firstName || motherNameParts[0] || '';
  const motherLastName = initial.lastName || (motherNameParts.length > 1 ? motherNameParts.at(-1) : '');
  const motherMiddleName = initial.middleName || (motherNameParts.length > 2 ? motherNameParts.slice(1, -1).join(' ') : '');
  const motherSuffix = initial.suffix || parsedMotherSuffix;
  const blockLot = initial.blockLot || String(initial.address || '').replace(/,?\s*Imus City,?\s*Cavite\s*4103$/i, '');
  const linkedMother = Boolean(initial.motherId);
  if (!mother && !linkedMother) return <InfantPatientForm data={data} initial={initial} onSave={onSave} onCancel={onCancel} />;
  if (mother) return <MotherPatientForm initial={initial} onSave={onSave} onCancel={onCancel} cancelLabel={cancelLabel} />;
  return <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))); }}>
    {mother ? <><label>First name<input name="firstName" required defaultValue={motherFirstName} /></label><label>Middle name (optional)<input name="middleName" defaultValue={motherMiddleName} /></label><label>Last name<input name="lastName" required defaultValue={motherLastName} /></label><label>Suffix (optional)<input name="suffix" maxLength="10" defaultValue={motherSuffix} /></label><label>Address<input name="address" required defaultValue={initial.address || ''} /></label><label>Birthdate<input name="birthDate" type="date" max={today()} defaultValue={initial.birthDate || ''} /></label><label>Contact number<input name="contact" required inputMode="numeric" pattern="09[0-9]{9}" maxLength="11" defaultValue={initial.contact || ''} placeholder="09XXXXXXXXX" /></label><label>Status<select name="status" value={maternalStatus} onChange={event => setMaternalStatus(event.target.value)}><option>Pregnant</option><option>Postnatal</option></select></label><label>{maternalStatus === 'Postnatal' ? 'Actual delivery date' : 'Expected delivery date'}<input name="deliveryDate" type="date" max={maternalStatus === 'Postnatal' ? today() : undefined} required={maternalStatus === 'Postnatal'} defaultValue={initial.deliveryDate || ''} /></label><label>Pregnancy weeks (optional)<input name="gestationWeeks" type="number" min="0" max="45" defaultValue={initial.gestationWeeks ?? ''} /></label><label>Assessment date (optional)<input name="gestationDate" type="date" max={today()} defaultValue={initial.gestationDate || ''} /></label></> : <><label>Mother{linkedMother ? <><input value={data.mothers.find(m => m.id === initial.motherId)?.name || 'Linked mother'} readOnly /><input type="hidden" name="motherId" value={initial.motherId || ''} /></> : <select name="motherId" required defaultValue=""><option value="">Select mother</option>{data.mothers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</label><label>First name<input name="firstName" required defaultValue={firstName} /></label><label>Middle initial (optional)<input name="middleInitial" maxLength="1" pattern="[A-Za-z]?" defaultValue={middleInitial} /></label><label>Last name<input name="lastName" required defaultValue={lastName} /></label><label>Suffix (optional)<input name="suffix" maxLength="10" defaultValue={initial.suffix || ''} /></label><label>Address (Block and Lot)<input name="blockLot" required placeholder="e.g., Block 1 Lot 2" defaultValue={blockLot} /><small>Imus City, Cavite 4103</small></label><label>Date of birth<input name="birthDate" type="date" max={today()} required defaultValue={initial.birthDate || ''} /></label><label>Gender<select name="sex" defaultValue={initial.sex || 'Female'}><option>Female</option><option>Male</option></select></label><label>Weight (kg)<input name="weight" type="number" min="0.1" max="60" step="0.01" required defaultValue={initial.weight ?? latestGrowth?.weight ?? ''} /></label><label>Height (cm)<input name="height" type="number" min="1" max="180" step="0.1" required defaultValue={initial.height ?? initial.length ?? latestGrowth?.length ?? ''} /></label><label>MUAC (cm)<input name="muac" type="number" min="1" max="40" step="0.1" required defaultValue={initial.muac ?? latestGrowth?.muac ?? ''} /></label><label>Status<select name="status" defaultValue={initial.status || 'Active'}><option>Pending approval</option><option>Active</option><option>Needs follow-up</option></select></label></>}
    <div className="admin-form-actions"><button type="button" className="secondary admin-form-back" onClick={() => onCancel(Boolean(initial.id))}><Icon name={resolvedCancelLabel === 'Cancel' ? 'xmark' : 'arrow-left'} /> {resolvedCancelLabel}</button><button className="primary-button"><Icon name="floppy-disk" /> Save record</button></div>
  </form>;
}

function ClinicalHistoryModal({ record, mother, onBack }) {
  const formatDate = value => value ? new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not recorded';
  const entries = mother
    ? (record.records || []).map(item => ({ date: item.date, title: item.type || 'Maternal visit', details: item.details || item.notes || 'No additional details recorded.' }))
    : [
        ...(record.growth || []).map(item => ({ date: item.date, title: 'Growth measurement', details: [['Weight', item.weight, 'kg'], ['Height', item.length, 'cm'], ['MUAC', item.muac, 'cm']].filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value, unit]) => `${label}: ${value} ${unit}`).join(', ') || 'No measurement details recorded.' })),
        ...(record.vaccines || []).map(item => ({ date: item.date, title: item.vaccine || 'Vaccination', details: item.dose ? `Dose: ${item.dose}` : item.notes || 'Completed immunization.' })),
        ...(record.records || []).map(item => ({ date: item.date, title: item.type || 'Infant visit', details: item.details || item.notes || 'No additional details recorded.' })),
        ...(record.screenings || []).map(item => ({ date: item.date, title: item.type || 'Screening', details: item.result || item.details || 'Completed screening.' })),
      ].filter(item => item.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return <div className="admin-modal clinical-history-modal" role="presentation" onMouseDown={event => event.target === event.currentTarget && onBack()}>
    <section role="dialog" aria-modal="true" aria-label={`${record.name} clinical history`}>
      <button className="close" type="button" onClick={onBack} aria-label="Close">×</button>
      <p className="eyebrow">Clinical history</p>
      <h2>{record.name}</h2>
      <p className="clinical-history-copy">{mother ? 'Maternal care records and visit history.' : 'Growth, immunization, and screening records.'}</p>
      <div className="clinical-history-list">
        {entries.length ? entries.map((entry, index) => <article className="clinical-history-entry" key={`${entry.date}-${entry.title}-${index}`}><div className="clinical-history-entry-head"><h3>{entry.title}</h3><time>{formatDate(entry.date)}</time></div><p>{entry.details}</p></article>) : <p className="admin-empty">No clinical records have been recorded yet.</p>}
      </div>
      <div className="admin-form-actions"><button type="button" className="secondary" onClick={onBack}><Icon name="arrow-left" /> Back to profile</button></div>
    </section>
  </div>;
}

export function Directory({ type }) {
  const { data, save, refreshPatientData } = useStore(); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [selected, setSelected] = useState(null); const [editing, setEditing] = useState(false); const [formType, setFormType] = useState(type); const [formRecord, setFormRecord] = useState(null); const [notice, setNotice] = useState(''); const [page, setPage] = useState(1);
  const [clinicalOpen, setClinicalOpen] = useState(false);
  const mother = type === 'mothers';
  const accountStatus = item => mother && item.approvalStatus === 'pending_approval' ? 'Pending approval' : item.status;
  const rows = (data[type] || []).filter(p => !p.archived);
  const shown = rows.filter((item) => (status === 'all' || accountStatus(item) === status) && JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
  const pageSize = 7;
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = mother ? shown : shown.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const close = (keepSelection = false) => { setClinicalOpen(false); setEditing(false); if (!keepSelection) { setSelected(null); setFormType(type); setFormRecord(null); } };
  const approveInfant = async () => {
    if (mother || !selected || selected.status !== 'Pending approval') return;
    const isDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected.id);
    if (isDatabaseId) { const { error } = await supabase.from('infants').update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', selected.id); if (error) return setNotice(`Could not approve infant: ${error.message}`); }
    const approved = { ...selected, status: 'Active', approvedAt: new Date().toISOString() };
    save(current => ({ ...current, infants: current.infants.map(item => item.id === approved.id ? approved : item) }));
    close(); setNotice('Infant record approved.');
  };
  const approveMother = async (record = selected) => {
    if (!mother || !record || record.approvalStatus !== 'pending_approval') return;
    const { data: appointmentId, error } = await supabase.rpc('approve_mother_and_schedule', { target_mother_id: record.id });
    if (error) {
      const missingApprovalFunction = error.code === 'PGRST202' || /approve_mother_and_schedule.*schema cache/i.test(error.message || '');
      return setNotice(missingApprovalFunction
        ? 'Mother approval is not ready in Supabase. Run supabase/migrations/032_auto_schedule_mother_approval.sql in the SQL Editor, then refresh this page.'
        : `Could not approve mother: ${error.message}`);
    }
    save(current => ({ ...current, mothers: current.mothers.map(item => item.id === record.id ? { ...item, approvalStatus: 'active' } : item) }));
    await refreshPatientData?.();
    void notifyEmailEvent('/api/email/mother-approval', { motherId: record.id, decision: 'approved' });
    close(); setNotice(`Mother account approved. Initial Wednesday appointment scheduled${appointmentId ? '.' : ''} The mother can now log in.`);
  };
  const declineMother = async (record = selected) => {
    if (!mother || !record || record.approvalStatus !== 'pending_approval') return;
    if (!window.confirm(`Decline and archive ${record.name}'s registration? The record will remain available in Archives.`)) return;
    const { error } = await supabase.from('mothers').update({ status: 'archived' }).eq('id', record.id);
    if (error) return setNotice(`Could not archive mother registration: ${error.message}`);
    await refreshPatientData?.();
    void notifyEmailEvent('/api/email/mother-approval', { motherId: record.id, decision: 'declined' });
    close(); setNotice('Mother registration declined and archived. A notification email is being sent.');
  };
  useEffect(() => {
    if (mother || !selected || editing || selected.status !== 'Pending approval') return;
    const actions = document.querySelector('.admin-modal .admin-form-actions');
    if (!actions || actions.querySelector('.approve-infant-button')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'primary-button approve-infant-button'; button.innerHTML = '<i class="fa-solid fa-check"></i> Approve infant'; button.onclick = approveInfant; actions.prepend(button);
    return () => button.remove();
  }, [selected, editing, mother]);
  const saveRecord = async (fields) => {
    const formMother = formType === 'mothers';
    const editingRecord = formRecord;
    const infantName = [fields.firstName, fields.middleInitial, fields.lastName, fields.suffix].filter(Boolean).join(' ').trim();
    const infantAddress = `${String(fields.blockLot || '').trim()}, Imus City, Cavite 4103`;
    if (formMother) {
      const motherName = [fields.firstName, fields.middleName, fields.lastName, fields.suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const payload = { full_name: motherName, birth_date: fields.birthDate || null, address: fields.address,
        maternal_status: fields.status.toLowerCase(), delivery_date: fields.deliveryDate || null,
        gestation_weeks: fields.gestationWeeks === '' ? null : Number(fields.gestationWeeks),
        };
      const query = editingRecord ? supabase.from('mothers').update(payload).eq('id', editingRecord.id) : supabase.from('mothers').insert({ ...payload, record_code: `M-${crypto.randomUUID().slice(0,8).toUpperCase()}` });
      const { data: saved, error } = await query.select().single();
      if (error) return setNotice(`Could not save mother: ${error.message}`);
      if (editingRecord?.accountId) {
        const { error: profileError } = await supabase.from('profiles').update({ full_name: motherName }).eq('id', editingRecord.accountId);
        if (profileError) return setNotice(`Mother record saved, but the login profile could not be updated: ${profileError.message}`);
      }
      const record = { ...editingRecord, ...fields, id: saved.id, recordCode: saved.record_code, name: saved.full_name, birthDate: saved.birth_date, contact: saved.contact_number, address: saved.address, status: saved.maternal_status === 'postnatal' ? 'Postnatal' : 'Pregnant', deliveryDate: saved.delivery_date, gestationWeeks: saved.gestation_weeks, gestationDate: saved.gestation_date, approvalStatus: saved.status };
      save(current => ({ ...current, mothers: editingRecord ? current.mothers.map(m => m.id === editingRecord.id ? record : m) : [...current.mothers, record] }));
      await refreshPatientData?.();
      close(); return setNotice('Mother record saved to Supabase.');
    }
    if (!formMother && !editingRecord) {
      const { error } = await supabase.rpc('register_care_infant', { values_json: {
        motherId: fields.motherId,
        name: infantName,
        birthDate: fields.birthDate,
        sex: fields.sex,
        address: infantAddress,
        weight: fields.weight,
        length: fields.height,
        muac: fields.muac,
        measuredDate: today(),
      } });
      if (error) return setNotice(`Could not save infant: ${error.message}`);
      await refreshPatientData?.();
      close(); return setNotice('Infant record saved to Supabase.');
    }
    // Updates to a submitted infant must be persisted too. Without this,
    // changing its status to Active only changed the browser copy and linked
    // caregivers could never receive access to the approved infant.
    const isDatabaseInfant = !formMother && editingRecord && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(editingRecord.id);
    if (isDatabaseInfant) {
      const databaseStatus = fields.status === 'Active' ? 'active' : fields.status === 'Needs follow-up' ? 'needs_follow_up' : 'pending_approval';
      const payload = {
        full_name: infantName,
        birth_date: fields.birthDate,
        sex: String(fields.sex || '').toLowerCase(),
        address: infantAddress,
        status: databaseStatus,
        ...(databaseStatus === 'active' ? { approved_at: new Date().toISOString() } : {}),
      };
      const { data: updated, error } = await supabase.from('infants').update(payload).eq('id', editingRecord.id).select().single();
      if (error) return setNotice(`Could not update infant: ${error.message}`);
      const measuredAt = today();
      const growthRecord = { infant_id: editingRecord.id, measured_at: measuredAt, weight_kg: Number(fields.weight), length_cm: Number(fields.height), muac_cm: Number(fields.muac), notes: 'Updated by the health center' };
      const { error: growthError } = await supabase.from('growth_records').upsert(growthRecord, { onConflict: 'infant_id,measured_at' });
      if (growthError) return setNotice(`Infant profile was saved, but the growth record could not be saved: ${growthError.message}`);
      const growth = [...(editingRecord.growth || []).filter(item => item.date !== measuredAt), { ...growthRecord, date: measuredAt, weight: Number(fields.weight), length: Number(fields.height), muac: Number(fields.muac) }].sort((a, b) => a.date.localeCompare(b.date));
      const record = { ...editingRecord, ...fields, id: updated.id, recordCode: updated.record_code, name: updated.full_name, motherId: updated.mother_id, birthDate: updated.birth_date, sex: updated.sex[0].toUpperCase() + updated.sex.slice(1), status: databaseStatus === 'active' ? 'Active' : databaseStatus === 'needs_follow_up' ? 'Needs follow-up' : 'Pending approval', weight: Number(fields.weight), height: Number(fields.height), muac: Number(fields.muac), growth };
      save(current => ({ ...current, infants: current.infants.map(item => item.id === record.id ? record : item) }));
      await refreshPatientData?.();
      close();
      return setNotice(databaseStatus === 'active' ? 'Infant approved and shared with the linked caregiver.' : 'Infant record updated.');
    }
    // Older browser-only infant records were created before Supabase infant
    // persistence existed. Saving one from the admin directory migrates it so
    // every approved caregiver can see it as part of the linked family.
    const hasDatabaseMother = !formMother && editingRecord && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(editingRecord.motherId || '');
    if (hasDatabaseMother) {
      const databaseStatus = fields.status === 'Active' ? 'active' : fields.status === 'Needs follow-up' ? 'needs_follow_up' : 'pending_approval';
      const payload = { record_code: editingRecord.recordCode || `I-${String(Date.now()).slice(-8)}`, mother_id: editingRecord.motherId, full_name: infantName, birth_date: fields.birthDate, sex: String(fields.sex || '').toLowerCase(), address: infantAddress, status: databaseStatus, ...(databaseStatus === 'active' ? { approved_at: new Date().toISOString() } : {}) };
      const { data: created, error } = await supabase.from('infants').insert(payload).select().single();
      if (error) return setNotice(`Could not sync infant: ${error.message}`);
      const record = { ...selected, ...fields, id: created.id, recordCode: created.record_code, name: created.full_name, motherId: created.mother_id, birthDate: created.birth_date, sex: created.sex[0].toUpperCase() + created.sex.slice(1), status: databaseStatus === 'active' ? 'Active' : databaseStatus === 'needs_follow_up' ? 'Needs follow-up' : 'Pending approval' };
      save(current => ({ ...current, infants: current.infants.map(item => item.id === editingRecord.id ? record : item) }));
      close();
      return setNotice(databaseStatus === 'active' ? 'Infant synced to Supabase and shared with the linked caregiver.' : 'Infant synced to Supabase.');
    }
    const id = editingRecord?.id || `${formMother ? 'M' : 'I'}-${Date.now()}`; const record = { ...editingRecord, ...fields, id, records: editingRecord?.records || [], infantIds: editingRecord?.infantIds || [], vaccines: editingRecord?.vaccines || [], growth: editingRecord?.growth || [] }; save((current) => ({ ...current, [formType]: current[formType].some((item) => item.id === id) ? current[formType].map((item) => item.id === id ? record : item) : [...current[formType], record] })); close(); setNotice(`${formMother ? 'Mother' : 'Infant'} record saved.`);
  };
  const archiveRecord = async () => {
    if (!selected || !window.confirm(`Archive ${selected.name}'s record? It will remain available in Archives and can be restored later.`)) return;
    const isDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected.id || '');
    if (isDatabaseId) {
      const { error } = await supabase.from(type).update({ status: 'archived' }).eq('id', selected.id);
      if (error) return setNotice(`Could not archive record: ${error.message}`);
      await refreshPatientData?.();
    }
    save((current) => ({ ...current, [type]: current[type].map((item) => item.id === selected.id ? { ...item, archived: true, status: 'Archived' } : item) }));
    close();
    setNotice('Record archived. It remains available in Archives.');
  };
  const label = mother ? 'Mother' : 'Infant';
  return <AdminShell page={type}><main className="main-content directory-page">
    <header className="page-header"><div><p className="eyebrow">Patient management</p><h1>{label} Directory</h1><p>Search, review, and maintain patient records.</p></div><button className="primary-button" onClick={() => { setSelected(null); setFormRecord(null); setFormType(type); setEditing(true); }}><Icon name={mother ? 'user-plus' : 'baby'} /> Add {label.toLowerCase()}</button></header>
    <section className="summary-grid"><article><Icon name={mother ? 'users' : 'baby'} /><span><b>{rows.length}</b><small>Registered {mother ? 'mothers' : 'infants'}</small></span></article><article><Icon name={mother ? 'person-pregnant' : 'heart-pulse'} /><span><b>{rows.filter((item) => item.status === (mother ? 'Pregnant' : 'Active')).length}</b><small>{mother ? 'Currently pregnant' : 'Active records'}</small></span></article><article><Icon name="filter" /><span><b>{shown.length}</b><small>Matching records</small></span></article></section>
    {mother && rows.some(item => item.approvalStatus === 'pending_approval') && <section className="directory-panel"><div className="directory-tools"><div><h2>Pending mother approvals</h2><p>Review new mother registrations before allowing account access.</p></div><span>{rows.filter(item => item.approvalStatus === 'pending_approval').length} pending</span></div><div className="table-wrap"><table><thead><tr><th>Mother</th><th>Record ID</th><th>Contact</th><th>Action</th></tr></thead><tbody>{rows.filter(item => item.approvalStatus === 'pending_approval').map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.address || 'No address'}</small></td><td>{row.recordCode || row.id}</td><td>{row.contact || 'Not recorded'}</td><td><div className="mother-approval-actions"><button className="primary-button" onClick={() => approveMother(row)}>Approve mother</button><button className="danger-button" onClick={() => declineMother(row)}>Decline and archive</button></div></td></tr>)}</tbody></table></div></section>}<section className="directory-panel"><div className="directory-tools"><label className="search"><Icon name="magnifying-glass" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Search ${label.toLowerCase()} records`} /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value={mother ? 'Pregnant' : 'Active'}>{mother ? 'Pregnant' : 'Active'}</option><option value={mother ? 'Postnatal' : 'Needs follow-up'}>{mother ? 'Postnatal' : 'Needs follow-up'}</option></select></div><div className="table-wrap"><table><thead><tr><th>{label}</th><th>Record ID</th><th>{mother ? 'Contact' : 'Sex'}</th><th>Status</th><th>Action</th></tr></thead><tbody>{shown.length ? visibleRows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.address || row.birthDate || 'No additional details'}</small></td><td>{row.recordCode || `${mother ? 'M' : 'I'}-${String(row.id).slice(0, 6).toUpperCase()}`}</td><td>{mother ? row.contact : row.sex}</td><td><span className="status">{row.status}</span></td><td><button className="view-button" onClick={() => { setSelected(row); setEditing(false); }}>View profile <Icon name="arrow-right" /></button></td></tr>) : <tr><td colSpan="5" className="admin-empty">No records match the current filters.</td></tr>}</tbody></table></div></section>{!mother && shown.length > 0 && <div className="directory-pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, shown.length)} of {shown.length}</span><div><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><strong>Page {currentPage} of {totalPages}</strong><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></div></div>}
    {(selected || editing) && <Modal title={editing ? `${formRecord?.id ? 'Edit' : 'Add'} ${formType === 'mothers' ? 'Mother' : 'Infant'}` : `${selected.name}'s profile`} close={close} showClose={!editing}>
      {editing ? <PatientForm type={formType} initial={formRecord || {}} onSave={saveRecord} onCancel={close} /> : <><div className="admin-profile"><span>{selected.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{selected.name}</strong><small>{selected.id} · {selected.status}</small></div></div><dl className="admin-details"><div><dt>{mother ? 'Contact' : 'Birth date'}</dt><dd>{mother ? selected.contact : selected.birthDate}</dd></div><div><dt>{mother ? 'Address' : 'Sex'}</dt><dd>{mother ? selected.address || 'Not recorded' : selected.sex}</dd></div></dl><div className="admin-form-actions">{mother && <button className="primary-button" onClick={() => { setFormType('infants'); setFormRecord({ motherId: selected.id, status: 'Active' }); setEditing(true); }}>Add infant</button>}<button type="button" className="family-primary" onClick={() => setClinicalOpen(true)}>View clinical history <Icon name="arrow-right" /></button><button className="secondary" onClick={() => { setFormType(type); setFormRecord(selected); setEditing(true); }}>Edit profile</button><button type="button" className="secondary archive-record-button" onClick={archiveRecord}>Archive record</button></div></>}
      {!editing && mother && <p className="admin-profile-extra"><i className="fa-solid fa-cake-candles" aria-hidden="true" /> Birthdate: <strong>{selected.birthDate || 'Not recorded'}</strong></p>}
      {!editing && mother && <div className="admin-maternal-summary"><div><span>Maternal status</span><strong>{selected.status}</strong></div><div><span>{selected.status === 'Postnatal' ? 'Actual delivery date' : 'Expected delivery date'}</span><strong>{selected.deliveryDate || 'Not recorded'}</strong></div><div><span>Pregnancy weeks</span><strong>{selected.gestationWeeks !== null && selected.gestationWeeks !== undefined && selected.gestationWeeks !== '' ? `${selected.gestationWeeks} weeks` : 'Not recorded'}</strong></div></div>}
    </Modal>}
    {clinicalOpen && selected && <ClinicalHistoryModal record={selected} mother={mother} onBack={() => setClinicalOpen(false)} />}
    <Toast message={notice} />
  </main></AdminShell>;
}

export function Healthcare() {
  const tab = new URLSearchParams(useLocation().search).get('tab') || 'prenatal';
  const tabs = [['prenatal', 'Prenatal care'], ['postnatal', 'Postnatal care'], ['immunization', 'Immunizations'], ['appointments', 'Appointments']];
  return <AdminShell page="healthcare"><main className="main-content care-admin"><header className="page-header"><div><p className="eyebrow">Healthcare services</p><h1>{tab === 'appointments' ? 'Appointment management' : 'Shared care records'}</h1><p>{tab === 'appointments' ? 'Schedule mother and infant visits, view mother responses, and mark completed care.' : 'Manage maternal visits, infant records, and Wednesday appointments.'}</p></div></header><nav className="healthcare-tabs" aria-label="Healthcare sections">{tabs.map(([name, label]) => <Link className={`healthcare-tab${tab === name ? ' active' : ''}`} aria-current={tab === name ? 'page' : undefined} key={name} to={'/healthcare?tab=' + name}>{label}</Link>)}</nav>{tab === 'appointments' ? <AppointmentApprovals /> : <CareWorkspace key={tab} section={tab} admin />}</main></AdminShell>;
}

export function Announcements() { const [items, setItems] = useState([{ id: 1, title: 'Free prenatal check-up this Friday', description: 'Mothers in their second and third trimester may visit the health center this Friday from 8:00 AM to 3:00 PM.', audience: 'Mothers & caregivers', priority: 'High', pinned: true, archived: false }, { id: 2, title: 'Immunization schedule is now available', description: 'Please check your child’s appointment date and bring the infant immunization card.', audience: 'Mothers & caregivers', priority: 'Normal', pinned: false, archived: false }]); const [query, setQuery] = useState(''); const [audience, setAudience] = useState('all'); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState(''); const shown = items.filter((item) => (audience === 'all' || item.audience === audience) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())); const close = () => setEditing(null); const saveItem = (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const item = { ...editing, ...values, id: editing?.id || Date.now(), pinned: editing?.pinned || false, archived: editing?.archived || false }; setItems((current) => editing?.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); close(); setNotice('Announcement published.'); };
  return <AdminShell page="announcements"><main className="main-content announcements-page"><header className="page-header"><div><p className="eyebrow">Communication center</p><h1>Announcements</h1><p className="page-description">Create, edit, and archive community updates.</p></div><button className="primary-button" onClick={() => setEditing({})}><Icon name="plus" /> New announcement</button></header><section className="announcement-stats"><article><b>{items.filter((item) => !item.archived).length}</b><span>Published</span></article><article><b>{items.filter((item) => item.archived).length}</b><span>Archived</span></article><article><b>{items.filter((item) => item.pinned).length}</b><span>Pinned</span></article></section><section className="toolbar"><label className="search"><Icon name="magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements" /></label><select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">All audiences</option><option>Mothers & caregivers</option><option>Everyone</option></select></section><section className="announcement-list">{shown.map((item) => <article className={`announcement-card${item.archived ? ' archived' : ''}`} key={item.id}><div className="card-content"><div className="card-top"><h2>{item.title}</h2>{item.pinned && <Icon name="thumbtack" />}<span className={`pill ${item.priority.toLowerCase()}`}>{item.priority} priority</span></div><div className="card-meta"><span><Icon name="users" /> {item.audience}</span><span>{item.archived ? 'Archived' : 'Published today'}</span></div><p className="card-description">{item.description}</p></div><div className="card-actions"><button className="icon-button" title="Edit announcement" onClick={() => setEditing(item)}><Icon name="pen" /></button><button className="icon-button" title={item.archived ? 'Restore announcement' : 'Archive announcement'} onClick={() => { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, archived: !entry.archived } : entry)); setNotice(item.archived ? 'Announcement restored.' : 'Announcement archived.'); }}><Icon name={item.archived ? 'box-open' : 'box-archive'} /></button></div></article>)}</section>{editing && <Modal title={editing.id ? 'Edit announcement' : 'New announcement'} close={close}><form className="admin-form" onSubmit={saveItem}><label className="full">Title<input name="title" required defaultValue={editing.title || ''} /></label><label className="full">Message<textarea name="description" required defaultValue={editing.description || ''} /></label><label>Audience<select name="audience" defaultValue={editing.audience || 'Mothers & caregivers'}><option>Mothers & caregivers</option><option>Everyone</option></select></label><label>Priority<select name="priority" defaultValue={editing.priority || 'Normal'}><option>Low</option><option>Normal</option><option>High</option></select></label><div className="admin-form-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary-button">Publish</button></div></form></Modal>}<Toast message={notice} /></main></AdminShell>; }
