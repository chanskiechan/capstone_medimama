import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { reportRows } from '../lib/support';

const categories = [['mothers', 'Mother'], ['infants', 'Infant'], ['caregivers', 'Caregiver'], ['appointments', 'Appointments']];
const appointmentIsArchived = appointment => ['Cancelled', 'cancelled'].includes(appointment.status);

export default function Archives() {
  const { data, refreshPatientData, storageError, loadingRecords } = useStore();
  const [params, setParams] = useSearchParams();
  const requestedCategory = params.get('category');
  const [category, setCategory] = useState(() => categories.some(([key]) => key === requestedCategory) ? requestedCategory : 'mothers');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('Archived');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadCaregivers = async () => {
    setLoading(true); setError('');
    try {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('caregiver_requests').select('*').order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) break;
      }
      setCaregivers(rows);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { if (category === 'caregivers') loadCaregivers(); }, [category]);

  const appointmentSource = data.appointments.map(appointment => ({
    ...appointment,
    name: appointment.patient || 'Linked patient',
    recordCode: `${appointment.service} · ${appointment.date} at ${appointment.time}`,
    archived: appointmentIsArchived(appointment),
  }));
  const source = category === 'caregivers'
    ? caregivers.map(caregiver => ({ ...caregiver, name: caregiver.full_name, archived: Boolean(caregiver.archived_at) }))
    : category === 'appointments' ? appointmentSource : data[category];
  const rows = source.filter(item => (show === 'Archived' ? item.archived : !item.archived) && `${item.name} ${item.recordCode || ''} ${item.contact_number || ''} ${item.service || ''}`.toLowerCase().includes(query.toLowerCase()));

  const selectCategory = key => {
    setCategory(key); setQuery(''); setError(''); setNotice('');
    setParams({ tab: 'archives', category: key });
  };

  const change = async item => {
    if (category === 'appointments') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = category === 'caregivers'
        ? await supabase.rpc('set_caregiver_archived', { request_id: item.id, archive_record: !item.archived })
        : await supabase.from(category).update({ status: item.archived ? 'active' : 'archived' }).eq('id', item.id);
      if (result.error) throw result.error;
      await refreshPatientData();
      if (category === 'caregivers') await loadCaregivers();
      setNotice(item.archived
        ? (category === 'caregivers' ? 'Caregiver restored to pending approval. Approve the request before family access resumes.' : 'Record restored.')
        : (category === 'caregivers' ? 'Caregiver archived and family access revoked.' : 'Record archived.'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return <section aria-label="Archives">
    <h2>Archives</h2>
    <nav className="support-nav" aria-label="Archive categories">{categories.map(([key, label]) => <button key={key} className="family-primary" aria-pressed={category === key} onClick={() => selectCategory(key)}>{label}</button>)}</nav>
    <p>{category === 'appointments' ? 'Cancelled appointments stay here for history and audit purposes. Active appointments remain under Healthcare Services.' : category === 'caregivers' ? 'Archiving removes family access while keeping the caregiver record. Restored caregivers return to pending approval.' : 'Archive inactive records without deleting their clinical history.'}</p>
    <div className="support-actions"><label>Search<input value={query} onChange={event => setQuery(event.target.value)} placeholder={category === 'appointments' ? 'Patient, service, or date' : 'Name or record number'} /></label><label>Show<select value={show} onChange={event => setShow(event.target.value)}><option>Archived</option><option>Active</option></select></label></div>
    {(error || storageError) && <p role="alert" className="support-message">{error || storageError}</p>}
    {notice && <p role="status">{notice}</p>}
    {(loading || loadingRecords) && <p role="status">Loading records…</p>}
    {rows.map(item => <article className={`support-panel archive-record-card${category === 'appointments' ? ' appointment-archive-card' : ''}`} key={item.id}>
      <h3>{item.name}</h3>
      <p>{category === 'caregivers' ? `${item.relationship} · ${item.contact_number || 'No contact number'}` : item.recordCode}</p>
      {category === 'caregivers'
        ? <p>Requested patient: {item.requested_patient_name}<br />Status: {item.archived ? 'Archived' : item.status}</p>
        : category === 'appointments'
          ? <><div className="archive-record-status"><span className="archive-status-pill">Cancelled</span><span>Retained for history</span></div><p className="archive-record-note">This appointment is not available for booking.</p></>
          : <details><summary>Clinical history</summary>{reportRows({ ...data, mothers: category === 'mothers' ? [item] : [], infants: category === 'infants' ? [item] : [], appointments: data.appointments.filter(appointment => appointment.patientId === item.id) }, '0000-01-01', '9999-12-31').map((row, index) => <p key={index}>{row.date} · {row.type}: {row.details}</p>)}</details>}
      {category !== 'appointments' && <button disabled={busy || loading} onClick={() => change(item)}>{item.archived ? 'Restore record' : 'Archive record'}</button>}
    </article>)}
    {!loading && !loadingRecords && !error && !rows.length && <p>No {show.toLowerCase()} {category} match your search.</p>}
  </section>;
}
