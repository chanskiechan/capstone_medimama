import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { useStore } from '../store';
import CareWorkspace from '../components/CareWorkspace';
import { today } from '../care';
import { supabase } from '../lib/supabase';
import AppointmentApprovals from './AppointmentApprovals';

export { AdminDashboard } from './AdminPages';

const Icon = ({ name }) => <i className={`fa-solid fa-${name}`} />;
const Toast = ({ message }) => message ? <p className="admin-toast" role="status"><Icon name="circle-check" /> {message}</p> : null;
function Modal({ title, children, close }) { return <div className="admin-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}><section role="dialog" aria-modal="true" aria-label={title}><button className="close" type="button" onClick={close} aria-label="Close">×</button><p className="eyebrow">MediMama Admin</p><h2>{title}</h2>{children}</section></div>; }

function PatientForm({ type, initial = {}, onSave, onCancel }) {
  const mother = type === 'mothers';
  const { data } = useStore();
  const [maternalStatus, setMaternalStatus] = useState(initial.status || 'Pregnant');
  const nameParts = String(initial.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = initial.firstName || nameParts[0] || '';
  const lastName = initial.lastName || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
  const middleInitial = initial.middleInitial || (nameParts.length > 2 ? nameParts[1].replace('.', '') : '');
  const blockLot = initial.blockLot || String(initial.address || '').replace(/,?\s*Imus City,?\s*Cavite\s*4103$/i, '');
  const linkedMother = Boolean(initial.motherId);
  return <form className="admin-form" onSubmit={(event) => { event.preventDefault(); onSave(Object.fromEntries(new FormData(event.currentTarget))); }}>
    {mother ? <><label>Contact number<input name="contact" required defaultValue={initial.contact || ''} placeholder="09XX XXX XXXX" /></label><label>Address<input name="address" defaultValue={initial.address || ''} /></label><label>Age<input name="age" type="number" min="12" max="70" defaultValue={initial.age || ''} /></label><label>Status<select name="status" value={maternalStatus} onChange={event => setMaternalStatus(event.target.value)}><option>Pregnant</option><option>Postnatal</option></select></label><label>Delivery date<input name="deliveryDate" type="date" max={today()} required={maternalStatus === "Postnatal"} defaultValue={initial.deliveryDate || ""} /></label></> : <><label>Mother{linkedMother ? <><input value={data.mothers.find(m => m.id === initial.motherId)?.name || 'Linked mother'} readOnly /><input type="hidden" name="motherId" value={initial.motherId || ''} /></> : <select name="motherId" required defaultValue=""><option value="">Select mother</option>{data.mothers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</label><label>First name<input name="firstName" required defaultValue={firstName} /></label><label>Middle initial (optional)<input name="middleInitial" maxLength="1" pattern="[A-Za-z]?" defaultValue={middleInitial} /></label><label>Last name<input name="lastName" required defaultValue={lastName} /></label><label>Suffix (optional)<input name="suffix" maxLength="10" defaultValue={initial.suffix || ''} /></label><label>Address (Block and Lot)<input name="blockLot" required placeholder="e.g., Block 1 Lot 2" defaultValue={blockLot} /><small>Imus City, Cavite 4103</small></label><label>Date of birth<input name="birthDate" type="date" max={today()} required defaultValue={initial.birthDate || ''} /></label><label>Gender<select name="sex" defaultValue={initial.sex || 'Female'}><option>Female</option><option>Male</option></select></label><label>Weight (kg)<input name="weight" type="number" min="0.1" max="60" step="0.01" required defaultValue={initial.weight || ''} /></label><label>Height (cm)<input name="height" type="number" min="1" max="180" step="0.1" required defaultValue={initial.height || initial.length || ''} /></label><label>MUAC (cm)<input name="muac" type="number" min="1" max="40" step="0.1" required defaultValue={initial.muac || ''} /></label><label>Status<select name="status" defaultValue={initial.status || 'Active'}><option>Pending approval</option><option>Active</option><option>Needs follow-up</option></select></label></>}
    <div className="admin-form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary-button">Save record</button></div>
  </form>;
}

export function Directory({ type }) {
  const { data, save, refreshPatientData } = useStore(); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [selected, setSelected] = useState(null); const [editing, setEditing] = useState(false); const [formType, setFormType] = useState(type); const [formRecord, setFormRecord] = useState(null); const [notice, setNotice] = useState('');
  const mother = type === 'mothers'; const rows = (data[type] || []).filter(p => !p.archived); const shown = rows.filter((item) => (status === 'all' || item.status === status) && JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
  // Keep UUIDs as internal database keys, but present short record codes in the table.
  useEffect(() => { document.querySelectorAll('.directory-page tbody tr td:nth-child(2)').forEach(cell => { const row = rows.find(item => item.id === cell.textContent.trim()); if (row) cell.textContent = row.recordCode || `${mother ? 'M' : 'I'}-${row.id.slice(0, 6).toUpperCase()}`; }); }, [rows, mother, shown]);
  const close = () => { setSelected(null); setEditing(false); setFormType(type); setFormRecord(null); };
  const approveInfant = async () => {
    if (mother || !selected || selected.status !== 'Pending approval') return;
    const isDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected.id);
    if (isDatabaseId) { const { error } = await supabase.from('infants').update({ status: 'active', approved_at: new Date().toISOString() }).eq('id', selected.id); if (error) return setNotice(`Could not approve infant: ${error.message}`); }
    const approved = { ...selected, status: 'Active', approvedAt: new Date().toISOString() };
    save(current => ({ ...current, infants: current.infants.map(item => item.id === approved.id ? approved : item) }));
    close(); setNotice('Infant record approved.');
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
      const payload = { full_name: fields.name, contact_number: fields.contact, address: fields.address,
        maternal_status: fields.status.toLowerCase(), delivery_date: fields.deliveryDate || null };
      const query = editingRecord ? supabase.from('mothers').update(payload).eq('id', editingRecord.id) : supabase.from('mothers').insert({ ...payload, record_code: `M-${crypto.randomUUID().slice(0,8).toUpperCase()}` });
      const { data: saved, error } = await query.select().single();
      if (error) return setNotice(`Could not save mother: ${error.message}`);
      const record = { ...editingRecord, ...fields, id: saved.id, recordCode: saved.record_code };
      save(current => ({ ...current, mothers: editingRecord ? current.mothers.map(m => m.id === editingRecord.id ? record : m) : [...current.mothers, record] }));
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
      const record = { ...editingRecord, ...fields, id: updated.id, recordCode: updated.record_code, name: updated.full_name, motherId: updated.mother_id, birthDate: updated.birth_date, sex: updated.sex[0].toUpperCase() + updated.sex.slice(1), status: databaseStatus === 'active' ? 'Active' : databaseStatus === 'needs_follow_up' ? 'Needs follow-up' : 'Pending approval' };
      save(current => ({ ...current, infants: current.infants.map(item => item.id === record.id ? record : item) }));
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
  const remove = async () => {
    const accountWarning = mother ? ' This also permanently deletes the linked login account, if there is one.' : '';
    if (!selected || !window.confirm(`Remove ${selected.name}'s record?${accountWarning}`)) return;
    const isDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected.id || '');
    if (isDatabaseId) {
      const { error } = await supabase.from(type).delete().eq('id', selected.id);
      if (error) return setNotice(`Could not remove record: ${error.message}`);
    }
    save((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== selected.id) }));
    close();
    setNotice('Record removed.');
  };
  const label = mother ? 'Mother' : 'Infant';
  return <AdminShell page={type}><main className="main-content directory-page">
    <header className="page-header"><div><p className="eyebrow">Patient management</p><h1>{label} Directory</h1><p>Search, review, and maintain patient records.</p></div><button className="primary-button" onClick={() => { setSelected(null); setFormRecord(null); setFormType(type); setEditing(true); }}><Icon name={mother ? 'user-plus' : 'baby'} /> Add {label.toLowerCase()}</button></header>
    <section className="summary-grid"><article><Icon name={mother ? 'users' : 'baby'} /><span><b>{rows.length}</b><small>Registered {mother ? 'mothers' : 'infants'}</small></span></article><article><Icon name={mother ? 'person-pregnant' : 'heart-pulse'} /><span><b>{rows.filter((item) => item.status === (mother ? 'Pregnant' : 'Active')).length}</b><small>{mother ? 'Currently pregnant' : 'Active records'}</small></span></article><article><Icon name="filter" /><span><b>{shown.length}</b><small>Matching records</small></span></article></section>
    <section className="directory-panel"><div className="directory-tools"><label className="search"><Icon name="magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()} records`} /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value={mother ? 'Pregnant' : 'Active'}>{mother ? 'Pregnant' : 'Active'}</option><option value={mother ? 'Postnatal' : 'Needs follow-up'}>{mother ? 'Postnatal' : 'Needs follow-up'}</option></select></div><div className="table-wrap"><table><thead><tr><th>{label}</th><th>Record ID</th><th>{mother ? 'Contact' : 'Sex'}</th><th>Status</th><th>Action</th></tr></thead><tbody>{shown.length ? shown.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.address || row.birthDate || 'No additional details'}</small></td><td>{row.id}</td><td>{mother ? row.contact : row.sex}</td><td><span className="status">{row.status}</span></td><td><button className="view-button" onClick={() => { setSelected(row); setEditing(false); }}>View profile <Icon name="arrow-right" /></button></td></tr>) : <tr><td colSpan="5" className="admin-empty">No records match the current filters.</td></tr>}</tbody></table></div></section>
    {(selected || editing) && <Modal title={editing ? `${formRecord?.id ? 'Edit' : 'Add'} ${formType === 'mothers' ? 'Mother' : 'Infant'}` : `${selected.name}'s profile`} close={close}>
      {editing ? <PatientForm type={formType} initial={formRecord || {}} onSave={saveRecord} onCancel={close} /> : <><div className="admin-profile"><span>{selected.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><strong>{selected.name}</strong><small>{selected.id} · {selected.status}</small></div></div><dl className="admin-details"><div><dt>{mother ? 'Contact' : 'Birth date'}</dt><dd>{mother ? selected.contact : selected.birthDate}</dd></div><div><dt>{mother ? 'Address' : 'Sex'}</dt><dd>{mother ? selected.address || 'Not recorded' : selected.sex}</dd></div></dl><div className="admin-form-actions">{mother && <button className="primary-button" onClick={() => { setFormType('infants'); setFormRecord({ motherId: selected.id, status: 'Active' }); setEditing(true); }}>Add infant</button>}<Link className="family-primary" to={mother ? "/healthcare?tab=" + (selected.status === "Postnatal" ? "postnatal" : "prenatal") : "/healthcare?tab=immunization"}>View clinical history</Link><button className="secondary" onClick={() => { setFormType(type); setFormRecord(selected); setEditing(true); }}>Edit profile</button><button className="danger-button" onClick={remove}>Delete record</button></div></>}
    </Modal>}
    <Toast message={notice} />
  </main></AdminShell>;
}

export function Healthcare() {
  const tab = new URLSearchParams(useLocation().search).get('tab') || 'prenatal';
  return <AdminShell page="healthcare"><main className="main-content care-admin"><header className="page-header"><div><p className="eyebrow">Healthcare services</p><h1>{tab === 'appointments' ? 'Appointment management' : 'Shared care records'}</h1><p>{tab === 'appointments' ? 'Schedule mother and infant visits, review confirmations, and mark completed care.' : 'Manage maternal visits, infant records, and Wednesday appointments.'}</p></div></header><nav className="care-actions">{['prenatal', 'postnatal', 'immunization', 'appointments'].map(name => <Link className="family-primary" key={name} to={'/healthcare?tab=' + name}>{name[0].toUpperCase() + name.slice(1)}</Link>)}</nav>{tab === 'appointments' ? <AppointmentApprovals /> : <CareWorkspace key={tab} section={tab} admin />}</main></AdminShell>;
}

export function Announcements() { const [items, setItems] = useState([{ id: 1, title: 'Free prenatal check-up this Friday', description: 'Mothers in their second and third trimester may visit the health center this Friday from 8:00 AM to 3:00 PM.', audience: 'Mothers & caregivers', priority: 'High', pinned: true, archived: false }, { id: 2, title: 'Immunization schedule is now available', description: 'Please check your child’s appointment date and bring the infant immunization card.', audience: 'Mothers & caregivers', priority: 'Normal', pinned: false, archived: false }]); const [query, setQuery] = useState(''); const [audience, setAudience] = useState('all'); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState(''); const shown = items.filter((item) => (audience === 'all' || item.audience === audience) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())); const close = () => setEditing(null); const saveItem = (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const item = { ...editing, ...values, id: editing?.id || Date.now(), pinned: editing?.pinned || false, archived: editing?.archived || false }; setItems((current) => editing?.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); close(); setNotice('Announcement published.'); };
  return <AdminShell page="announcements"><main className="main-content announcements-page"><header className="page-header"><div><p className="eyebrow">Communication center</p><h1>Announcements</h1><p className="page-description">Create, edit, and archive community updates.</p></div><button className="primary-button" onClick={() => setEditing({})}><Icon name="plus" /> New announcement</button></header><section className="announcement-stats"><article><b>{items.filter((item) => !item.archived).length}</b><span>Published</span></article><article><b>{items.filter((item) => item.archived).length}</b><span>Archived</span></article><article><b>{items.filter((item) => item.pinned).length}</b><span>Pinned</span></article></section><section className="toolbar"><label className="search"><Icon name="magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements" /></label><select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">All audiences</option><option>Mothers & caregivers</option><option>Everyone</option></select></section><section className="announcement-list">{shown.map((item) => <article className={`announcement-card${item.archived ? ' archived' : ''}`} key={item.id}><div className="card-content"><div className="card-top"><h2>{item.title}</h2>{item.pinned && <Icon name="thumbtack" />}<span className={`pill ${item.priority.toLowerCase()}`}>{item.priority} priority</span></div><div className="card-meta"><span><Icon name="users" /> {item.audience}</span><span>{item.archived ? 'Archived' : 'Published today'}</span></div><p className="card-description">{item.description}</p></div><div className="card-actions"><button className="icon-button" title="Edit announcement" onClick={() => setEditing(item)}><Icon name="pen" /></button><button className="icon-button" title={item.archived ? 'Restore announcement' : 'Archive announcement'} onClick={() => { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, archived: !entry.archived } : entry)); setNotice(item.archived ? 'Announcement restored.' : 'Announcement archived.'); }}><Icon name={item.archived ? 'box-open' : 'box-archive'} /></button></div></article>)}</section>{editing && <Modal title={editing.id ? 'Edit announcement' : 'New announcement'} close={close}><form className="admin-form" onSubmit={saveItem}><label className="full">Title<input name="title" required defaultValue={editing.title || ''} /></label><label className="full">Message<textarea name="description" required defaultValue={editing.description || ''} /></label><label>Audience<select name="audience" defaultValue={editing.audience || 'Mothers & caregivers'}><option>Mothers & caregivers</option><option>Everyone</option></select></label><label>Priority<select name="priority" defaultValue={editing.priority || 'Normal'}><option>Low</option><option>Normal</option><option>High</option></select></label><div className="admin-form-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary-button">Publish</button></div></form></Modal>}<Toast message={notice} /></main></AdminShell>; }
