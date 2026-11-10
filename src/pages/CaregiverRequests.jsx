import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { supabase } from '../lib/supabase';
import { notifyEmailEvent } from '../lib/emailNotifications';
import './CaregiverRequests.css';

function DetailsModal({ request, mothers, assignment, close, onSave, onArchive, onDecide }) {
  const [busy, setBusy] = useState(false);
  const [validIdUrl, setValidIdUrl] = useState('');
  const simplify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const requestedName = simplify(request.requested_patient_name);
  const inferredMother = mothers.find(mother => {
    const name = simplify(mother.full_name);
    return requestedName && name && (requestedName.includes(name) || name.includes(requestedName));
  });
  const linkedMother = mothers.find(mother => mother.id === assignment?.mother_id) || inferredMother;
  const [motherId, setMotherId] = useState(linkedMother?.id || '');

  useEffect(() => {
    let active = true;
    if (!request.valid_id_path) { setValidIdUrl(''); return undefined; }
    supabase.storage.from('caregiver-ids').createSignedUrl(request.valid_id_path, 600).then(({ data }) => {
      if (active) setValidIdUrl(data?.signedUrl || '');
    });
    return () => { active = false; };
  }, [request.valid_id_path]);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    await onSave(request, Object.fromEntries(new FormData(event.currentTarget)));
    setBusy(false);
  };

  const archive = async () => {
    if (!window.confirm(`Archive ${request.full_name}'s caregiver registration? Family access will be revoked, but the record can be restored from Archives.`)) return;
    setBusy(true);
    await onArchive(request);
    setBusy(false);
  };

  const decide = async status => {
    setBusy(true);
    await onDecide(request, status, motherId);
    setBusy(false);
  };

  return <div className="admin-modal" role="dialog" aria-modal="true">
    <section>
      <button className="close" type="button" onClick={close} aria-label="Close">×</button>
      <h2>Caregiver details</h2>
      <div className="admin-profile"><span>{request.full_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><strong>{request.full_name}</strong><small>{request.status === 'approved' ? 'Approved caregiver' : `${request.status} request`}</small></div></div>
      <dl className="admin-details">
        <div><dt>Email</dt><dd>{request.email || 'Not recorded'}</dd></div>
        <div><dt>Birthdate</dt><dd>{request.birth_date || 'Not recorded'}</dd></div>
        <div><dt>Address</dt><dd>{request.address || 'Not recorded'}</dd></div>
        <div><dt>Valid ID</dt><dd>{validIdUrl ? <a href={validIdUrl} target="_blank" rel="noreferrer">View {request.valid_id_name || 'uploaded ID'}</a> : request.valid_id_name || 'Not uploaded'}</dd></div>
      </dl>
      <form className="admin-form" onSubmit={submit}>
        <label>Contact number<input name="contact_number" defaultValue={request.contact_number || ''} inputMode="numeric" pattern="9[0-9]{9}" maxLength="10" required /></label>
        <label>Relationship<input name="relationship" defaultValue={request.relationship || ''} required /></label>
        <label className="full">Requested mother or patient<input name="requested_patient_name" value={linkedMother?.full_name || request.requested_patient_name || ''} readOnly /></label>
        {request.status === 'approved'
          ? <label className="full">Linked mother record<input value={linkedMother?.full_name || 'No linked mother record'} readOnly /><input type="hidden" name="mother_id" value={linkedMother?.id || ''} /></label>
          : <label className="full">Linked mother record<select name="mother_id" value={motherId} onChange={event => setMotherId(event.target.value)}><option value="">Choose mother record</option>{mothers.map(mother => <option key={mother.id} value={mother.id}>{mother.full_name}</option>)}</select></label>}
        <p className="caregiver-detail-note">Review the identity document and mother link before approval. Saving updates the contact number and caregiver link.</p>
        <div className="admin-form-actions">
          <button type="button" className="secondary archive-record-button" disabled={busy} onClick={archive}>Archive record</button>
          <span className="admin-form-spacer" />
          {request.status === 'pending' && <><button type="button" className="caregiver-decline modal-action" disabled={busy} onClick={() => decide('declined')}>Decline</button><button type="button" className="primary-button" disabled={busy} onClick={() => decide('approved')}>{busy ? 'Reviewing...' : 'Approve request'}</button></>}
          <button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button>
          <button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
        </div>
      </form>
    </section>
  </div>;
}

export default function CaregiverRequests() {
  const [requests, setRequests] = useState([]);
  const [mothers, setMothers] = useState([]);
  const [pendingMothers, setPendingMothers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [motherApprovalBusyId, setMotherApprovalBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const { data: { session } = {}, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      setRequests([]);
      setMothers([]);
      setPendingMothers([]);
      setAssignments([]);
      setLoadError('Log in with the real Supabase administrator account to view live user requests. Demo Admin cannot access the database queue.');
      setLoading(false);
      return;
    }
    const [requestsResult, mothersResult, assignmentsResult] = await Promise.all([
      supabase.from('caregiver_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('mothers').select('id, full_name, record_code, birth_date, contact_number, address, status, created_at').order('created_at', { ascending: false }),
      supabase.from('caregiver_assignments').select('id, caregiver_id, mother_id, relationship, status'),
    ]);
    const problem = requestsResult.error || mothersResult.error || assignmentsResult.error;
    setLoadError(problem?.message || '');
    setRequests((requestsResult.data || []).filter(request => !request.archived_at));
    setMothers(mothersResult.data || []);
    setPendingMothers((mothersResult.data || []).filter(mother => mother.status === 'pending_approval'));
    setAssignments(assignmentsResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const assignmentFor = request => assignments.find(assignment => assignment.caregiver_id === request.caregiver_id);
  const linkedMotherFor = request => {
    const simplify = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const requested = simplify(request.requested_patient_name);
    return mothers.find(mother => {
      const name = simplify(mother.full_name);
      return requested && name && (requested.includes(name) || name.includes(requested));
    });
  };
  const writeAssignment = (request, motherId, relationship) => {
    const old = assignmentFor(request);
    const values = { caregiver_id: request.caregiver_id, mother_id: motherId, relationship, consent_confirmed_at: new Date().toISOString(), status: 'approved' };
    return old ? supabase.from('caregiver_assignments').update(values).eq('id', old.id) : supabase.from('caregiver_assignments').insert(values);
  };

  const decide = async (request, status, selectedMotherId = '') => {
    const motherId = selectedMotherId || linkedMotherFor(request)?.id;
    if (status === 'approved' && !motherId) return setNotice('The requested mother name did not match a mother record. Please verify the name first.');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setNotice('Your admin session expired. Please log in again.');
    if (status === 'approved') {
      const { error } = await writeAssignment(request, motherId, request.relationship);
      if (error) return setNotice(error.message);
    }
    const { error } = await supabase.from('caregiver_requests').update({ status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() }).eq('id', request.id);
    if (error) return setNotice(error.message);
    if (status === 'approved') void notifyEmailEvent('/api/email/caregiver-approved', { requestId: request.id });
    setSelected(null);
    setNotice(status === 'approved' ? 'Request approved. Approval emails are being sent to the caregiver and mother.' : `Request ${status}.`);
    await load();
  };

  const saveDetails = async (request, values) => {
    const phone = values.contact_number.replace(/\D/g, '');
    if (!/^9\d{9}$/.test(phone)) return setNotice('Enter a valid 10-digit Philippine mobile number.');
    if (request.status === 'approved' && !values.mother_id) return setNotice('Choose the linked mother record before saving.');
    const { error: profileError } = await supabase.from('profiles').update({ phone }).eq('id', request.caregiver_id);
    if (profileError) return setNotice(profileError.message);
    const { error } = await supabase.from('caregiver_requests').update({ contact_number: phone, relationship: values.relationship, requested_patient_name: values.requested_patient_name }).eq('id', request.id);
    if (error) return setNotice(error.message);
    if (request.status === 'approved') {
      const { error: assignmentError } = await writeAssignment(request, values.mother_id, values.relationship);
      if (assignmentError) return setNotice(assignmentError.message);
    }
    setSelected(null);
    setNotice('Caregiver record saved.');
    await load();
  };

  const archiveRecord = async request => {
    const { error } = await supabase.rpc('set_caregiver_archived', { request_id: request.id, archive_record: true });
    if (error) return setNotice(error.message);
    setSelected(null);
    setNotice('Caregiver record archived and family access revoked.');
    await load();
  };

  const approveMother = async mother => {
    if (!mother || mother.status !== 'pending_approval' || motherApprovalBusyId) return;
    setMotherApprovalBusyId(mother.id);
    const { data: appointmentId, error } = await supabase.rpc('approve_mother_and_schedule', { target_mother_id: mother.id });
    if (error) {
      const missingApprovalFunction = error.code === 'PGRST202' || /approve_mother_and_schedule.*schema cache/i.test(error.message || '');
      setNotice(missingApprovalFunction
        ? 'Mother approval is not ready in Supabase. Run supabase/migrations/032_auto_schedule_mother_approval.sql in the SQL Editor, then refresh this page.'
        : `Could not approve mother: ${error.message}`);
      setMotherApprovalBusyId('');
      return;
    }
    void notifyEmailEvent('/api/email/mother-approval', { motherId: mother.id, decision: 'approved' });
    setNotice(`Mother account approved${appointmentId ? ' and initial appointment scheduled' : ''}. The mother can now log in.`);
    setMotherApprovalBusyId('');
    await load();
  };

  const declineMother = async mother => {
    if (!mother || mother.status !== 'pending_approval' || motherApprovalBusyId) return;
    if (!window.confirm(`Decline and archive ${mother.full_name}'s registration? The record will remain available in Archives.`)) return;
    setMotherApprovalBusyId(mother.id);
    const { error } = await supabase.from('mothers').update({ status: 'archived' }).eq('id', mother.id);
    if (error) {
      setNotice(`Could not archive mother registration: ${error.message}`);
      setMotherApprovalBusyId('');
      return;
    }
    void notifyEmailEvent('/api/email/mother-approval', { motherId: mother.id, decision: 'declined' });
    setNotice('Mother registration declined and archived. A notification email is being sent.');
    setMotherApprovalBusyId('');
    await load();
  };

  const pending = requests.filter(request => request.status === 'pending').length + pendingMothers.length;
  return <AdminShell page="mothers">
    <main className="main-content directory-page caregiver-requests-page">
      <header className="page-header"><div><p className="eyebrow">User management</p><h1>User Request</h1><p>Review new user registrations and caregiver access requests.</p></div><div className="caregiver-page-actions"><Link className="view-button caregiver-archive-link" to="/system?tab=archives&category=caregivers"><i className="fa-solid fa-box-archive" /> Archives</Link><button className="view-button" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button></div></header>
      {notice && <p className="admin-toast">{notice}</p>}
      {loadError && <p className="admin-toast caregiver-load-error" role="alert">Could not load user requests: {loadError}</p>}
      <section className="summary-grid caregiver-summary"><article><i className="fa-solid fa-clock" /><span><b>{pending}</b><small>Pending approvals</small></span></article><article><i className="fa-solid fa-user-check" /><span><b>{requests.filter(request => request.status === 'approved').length}</b><small>Approved caregivers</small></span></article><article><i className="fa-solid fa-users" /><span><b>{mothers.filter(mother => mother.status !== 'archived').length}</b><small>Available mother records</small></span></article></section>
      <section className="directory-panel caregiver-table-panel mother-approval-panel"><div className="caregiver-table-head"><div><h2>Mother account approvals</h2><p>New mother registrations appear here while they are waiting for admin confirmation.</p></div><span>{pendingMothers.length} pending</span></div><div className="table-wrap"><table><thead><tr><th>Mother</th><th>Birthdate</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td className="admin-empty" colSpan="5">Loading mother registrations...</td></tr> : pendingMothers.length ? pendingMothers.map(mother => { const busy = motherApprovalBusyId === mother.id; return <tr key={mother.id}><td><div className="caregiver-person"><span>{mother.full_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><strong>{mother.full_name}</strong><small>{mother.address || mother.record_code || 'No address recorded'}</small></div></div></td><td>{mother.birth_date || 'Not recorded'}</td><td>{mother.contact_number || 'Not recorded'}</td><td><span className="caregiver-status pending">Pending approval</span></td><td><div className="mother-approval-actions"><button className="view-button caregiver-approve" type="button" disabled={Boolean(motherApprovalBusyId)} onClick={() => approveMother(mother)}><i className="fa-solid fa-check" /> {busy ? 'Approving...' : 'Approve'}</button><button className="caregiver-decline" type="button" disabled={Boolean(motherApprovalBusyId)} onClick={() => declineMother(mother)}><i className="fa-solid fa-xmark" /> Decline</button></div></td></tr>; }) : <tr><td className="admin-empty" colSpan="5">No mother registrations are waiting for approval.</td></tr>}</tbody></table></div></section>
      <section className="directory-panel caregiver-table-panel"><div className="caregiver-table-head"><div><h2>Registration queue</h2><p>Pending requests need identity and mother-link review. Approved caregivers can be archived without deleting their history.</p></div><span>{requests.length} active records</span></div><div className="table-wrap"><table><thead><tr><th>Caregiver</th><th>Relationship</th><th>Requested patient</th><th>Status</th><th>Review action</th></tr></thead><tbody>{loading ? <tr><td className="admin-empty" colSpan="5">Loading user requests...</td></tr> : requests.length ? requests.map(request => <tr key={request.id}><td><div className="caregiver-person"><span>{request.full_name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><div><strong>{request.full_name}</strong><small>{request.contact_number || 'No contact number'}</small></div></div></td><td>{request.relationship}</td><td>{request.requested_patient_name}</td><td><span className={`caregiver-status ${request.status}`}>{request.status}</span></td><td><div className="caregiver-row-actions">{request.status === 'pending' ? <div className="caregiver-actions"><button className="view-button" type="button" onClick={() => setSelected(request)}>Review details</button><div><button className="view-button caregiver-approve" type="button" onClick={() => decide(request, 'approved')}><i className="fa-solid fa-check" /> Approve</button><button className="caregiver-decline" type="button" onClick={() => decide(request, 'declined')}><i className="fa-solid fa-xmark" /> Decline</button></div></div> : <><button className="view-button" type="button" onClick={() => setSelected(request)}>View details</button><span className={`caregiver-reviewed${request.status === 'declined' ? ' declined-review' : ''}`}><i className={`fa-solid ${request.status === 'approved' ? 'fa-circle-check' : 'fa-circle-xmark'}`} /> Reviewed</span></>}</div></td></tr>) : <tr><td className="admin-empty" colSpan="5">No user registrations yet.</td></tr>}</tbody></table></div></section>
      {selected && <DetailsModal request={selected} mothers={mothers} assignment={assignmentFor(selected)} close={() => setSelected(null)} onSave={saveDetails} onArchive={archiveRecord} onDecide={decide} />}
    </main>
  </AdminShell>;
}
