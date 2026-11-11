import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { appointmentError, session, today, uid } from '../care';
import './AppointmentApprovals.css';
import { notifyEmailEvent } from '../lib/emailNotifications';

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const label = value => ({ Pending: 'Pending', Scheduled: 'Pending', Approved: 'Pending', Rescheduled: 'Rescheduled', Confirmed: 'Confirmed', Completed: 'Done', Cancelled: 'Cancelled' }[value] || value);
const filterKey = value => ({ Pending: 'pending', Scheduled: 'pending', Approved: 'pending', Rescheduled: 'rescheduled', Confirmed: 'confirmed', Completed: 'done', Cancelled: 'cancelled' }[value] || value.toLowerCase());
const nextWednesday = () => { const date = new Date(`${today()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + ((3 - date.getUTCDay() + 7) % 7)); return date.toISOString().slice(0, 10); };
const appointmentTypes = ['Prenatal Checkup', 'Postnatal Checkup', 'Infant Immunization'];
const requestSchedule = value => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const parsed = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${parsed.year}-${parsed.month}-${parsed.day}`, time: `${parsed.hour}:${parsed.minute}` };
};
const requestDateLabel = value => new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

export default function AppointmentApprovals() {
  const { data, save, refreshPatientData } = useStore();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestBusy, setRequestBusy] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [changeRequestTarget, setChangeRequestTarget] = useState(null);
  const [recordTarget, setRecordTarget] = useState(null);
  const [recordError, setRecordError] = useState('');
  const [recordBusy, setRecordBusy] = useState(false);
  useEffect(() => { refreshPatientData?.(); }, [refreshPatientData]);
  useEffect(() => {
    if (!cancelTarget) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setCancelTarget(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cancelTarget]);
  useEffect(() => {
    if (!changeRequestTarget) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setChangeRequestTarget(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [changeRequestTarget]);
  useEffect(() => {
    if (!recordTarget) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setRecordTarget(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [recordTarget]);
  const appointments = useMemo(() => data.appointments
    .filter(item => !['Cancelled', 'cancelled'].includes(item.status) && (filter === 'all' || filterKey(item.status) === filter))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)), [data.appointments, filter]);
  const pageSize = 7;
  const totalPages = Math.max(1, Math.ceil(appointments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleAppointments = appointments.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeRequests = useMemo(() => (data.appointmentRequests || [])
    .filter(request => request.status === 'pending')
    .map(request => ({ ...request, appointment: data.appointments.find(item => item.id === request.appointment_id) })), [data.appointmentRequests, data.appointments]);

  const decideChangeRequest = async (request, decision) => {
    setRequestBusy(request.id); setRequestError(''); setNotice('');
    if (isUuid(request.id)) {
      const { error } = await supabase.rpc('review_appointment_reschedule', { request_id: request.id, decision });
      if (error) { setRequestBusy(''); return setRequestError(`Could not ${decision} the change request: ${error.message}`); }
    } else {
      const schedule = requestSchedule(request.requested_scheduled_at);
      save(current => ({
        ...current,
        appointmentRequests: (current.appointmentRequests || []).map(item => item.id === request.id ? { ...item, status: decision, reviewed_at: new Date().toISOString() } : item),
        appointments: decision === 'approved' ? current.appointments.map(item => item.id === request.appointment_id ? { ...item, date: schedule.date, time: schedule.time, status: 'Rescheduled', motherConfirmedAt: null } : item) : current.appointments,
      }));
    }
    await refreshPatientData?.();
    if (decision === 'approved') void notifyEmailEvent('/api/email/appointment', { appointmentId: request.appointment_id });
    setChangeRequestTarget(null); setRequestBusy(''); setNotice(decision === 'approved' ? 'Reschedule approved. The mother must confirm the new appointment.' : 'Reschedule request declined. The original appointment remains unchanged.');
  };

  const saveAppointmentRecord = async event => {
    event.preventDefault();
    const item = recordTarget;
    const mother = data.mothers.find(patient => patient.id === item?.patientId);
    if (!item || !mother) return setRecordError('The mother linked to this appointment could not be found.');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const recordDate = values.date || item.date;
    if (!recordDate || recordDate > today() || !Number.isFinite(Date.parse(`${recordDate}T00:00:00Z`))) return setRecordError('The record date must be today or an earlier valid date.');
    if (!isUuid(mother.id)) return setRecordError('This appointment is not connected to a saved mother record yet.');
    setRecordBusy(true); setRecordError(''); setNotice('');
    const recordType = String(item.service || '').toLowerCase().includes('postnatal') || mother.status === 'Postnatal' ? 'Postnatal check-up' : 'Prenatal check-up';
    const record = {
      mother_id: mother.id,
      record_date: recordDate,
      record_type: recordType,
      details: values.details || '',
      recorded_by: session().id || null,
      recorded_by_label: values.recordedBy,
    };
    const { error: clinicalError } = await supabase.from('maternal_records').insert(record);
    if (clinicalError) { setRecordBusy(false); return setRecordError(`Could not save the clinical record: ${clinicalError.message}`); }
    const { error: appointmentStatusError } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', item.id);
    if (appointmentStatusError) { setRecordBusy(false); return setRecordError(`The clinical record was saved, but the appointment status could not be updated: ${appointmentStatusError.message}`); }
    save(current => ({
      ...current,
      appointments: current.appointments.map(appointment => appointment.id === item.id ? { ...appointment, status: 'Completed', completedAt: new Date().toISOString() } : appointment),
      mothers: current.mothers.map(patient => patient.id === mother.id ? { ...patient, records: [...(patient.records || []), { date: recordDate, type: recordType, details: values.details || '', recordedBy: values.recordedBy, recorded_by_label: values.recordedBy }] } : patient),
    }));
    await refreshPatientData?.();
    setRecordBusy(false); setRecordTarget(null); setRecordError(''); setNotice('Clinical record saved. Appointment marked Done.');
  };

  const cancelAppointment = async item => {
    if (['Completed', 'Cancelled'].includes(item.status)) return;
    setCancelTarget(item);
  };

  const confirmCancelAppointment = async () => {
    const item = cancelTarget;
    if (!item) return;
    const busyKey = `cancel:${item.id}`;
    setRequestBusy(busyKey); setRequestError(''); setNotice('');
    if (isUuid(item.id)) {
      const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', item.id);
      if (error) { setRequestBusy(''); return setRequestError(`Could not cancel the appointment: ${error.message}`); }
    }
    save(current => ({ ...current, appointments: current.appointments.map(appointment => appointment.id === item.id ? { ...appointment, status: 'Cancelled' } : appointment) }));
    await refreshPatientData?.();
    setRequestBusy(''); setCancelTarget(null); setNotice('Appointment cancelled. You can now review the reschedule request.');
  };

  const bookAppointment = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const patient = [...data.mothers, ...data.infants].find(item => item.id === values.patientId);
    const item = { id: uid('APT'), patientId: values.patientId, patient: patient?.name, recordCode: patient?.recordCode || patient?.record_code || '', service: values.service, date: values.date, time: values.time, status: 'Pending', createdBy: session().id || null };
    const problem = appointmentError(data, item, today(), { rejectOccupiedTime: true, allowMultipleAppointments: true });
    if (problem) return setBookingError(problem);
    if (isUuid(patient?.id)) {
      const isInfant = Boolean(patient.motherId);
      const { data: saved, error } = await supabase.from('appointments').insert({ mother_id: isInfant ? null : patient.id, infant_id: isInfant ? patient.id : null, service: item.service, scheduled_at: `${item.date}T${item.time}:00+08:00`, status: 'pending', created_by: item.createdBy }).select().single();
      if (error) return setBookingError(`Could not book appointment: ${error.message}`);
      item.id = saved.id;
    }
    save(current => ({ ...current, appointments: [...current.appointments, item] }));
    setBooking(false); setBookingError(''); setNotice('Appointment booked. Waiting for mother confirmation.');
  };

  const changeRequestSchedule = changeRequestTarget ? requestSchedule(changeRequestTarget.requested_scheduled_at) : null;
  return <section className="appointment-approvals">
    <div className="appointment-page-action"><Link className="appointment-secondary-button appointment-archive-link" to="/system?tab=archives&category=appointments"><i className="fa-solid fa-box-archive" /> Appointment archive</Link><button className="appointment-primary-button" onClick={() => { setBookingError(''); setBooking(true); }}><i className="fa-solid fa-calendar-plus" /> Book appointment</button></div>
    <div className="appointment-approval-summary"><article><b>{data.appointments.filter(a => ['Pending', 'Scheduled', 'Approved'].includes(a.status)).length}</b><span>Pending confirmation</span></article><article><b>{data.appointments.filter(a => a.status === 'Confirmed').length}</b><span>Mother-confirmed</span></article><article><b>{data.appointments.filter(a => a.status === 'Completed').length}</b><span>Done appointments</span></article></div>
    {notice && <p className="appointment-notice" role="status">{notice}</p>}
    {requestError && <p className="appointment-form-error appointment-request-error" role="alert">{requestError}</p>}
    <section className="appointment-change-requests"><div className="appointment-change-heading"><div><p className="appointment-eyebrow">Mother requests</p><h2>Reschedule requests</h2><p>Review the requested Wednesday before changing the official appointment.</p></div><span>{changeRequests.length} pending</span></div>{changeRequests.length ? <div className="appointment-change-list">{changeRequests.map(request => { const schedule = requestSchedule(request.requested_scheduled_at); return <article key={request.id}><div><strong>{request.appointment?.patient || 'Linked patient'}</strong><small>{request.appointment?.service || 'Appointment change request'}</small></div><div className="appointment-change-actions"><button className="appointment-primary-button" type="button" onClick={() => { setRequestError(''); setChangeRequestTarget(request); }}>View details</button></div></article>; })}</div> : <p className="appointment-change-empty">No pending reschedule requests. A request will appear here after a mother submits one.</p>}</section>
    <div className="appointment-approval-tools"><h2>Appointments</h2><label>Status<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="rescheduled">Rescheduled</option><option value="confirmed">Confirmed</option><option value="done">Done</option></select></label></div>
    <div className="appointment-table-wrap"><table><thead><tr><th>Patient</th><th>Appointment type</th><th>Schedule</th><th>Status</th><th>Action</th><th>Record</th></tr></thead><tbody>{appointments.length ? visibleAppointments.map(item => <tr key={item.id}><td><strong>{item.patient || 'Linked patient'}</strong><small>{item.recordCode || ''}</small></td><td>{item.service}</td><td>{item.date} at {item.time}</td><td><span className={`appointment-status ${label(item.status).toLowerCase().replace(' ', '-')}`}>{label(item.status)}</span></td><td className="appointment-actions">{item.status === 'Completed' && <span>Completed</span>}{item.status === 'Confirmed' && <span>Confirmed by mother</span>}{item.status === 'Rescheduled' && <span>Awaiting mother confirmation</span>}{['Pending', 'Scheduled', 'Approved'].includes(item.status) && <span>Waiting for mother</span>}{!['Completed', 'Cancelled'].includes(item.status) && <button type="button" className="appointment-cancel-button" disabled={requestBusy === `cancel:${item.id}`} onClick={() => cancelAppointment(item)}>{requestBusy === `cancel:${item.id}` ? 'Cancelling...' : 'Cancel'}</button>}</td><td className="appointment-record-cell">{item.status === 'Completed' ? <span className="appointment-recorded-label"><i className="fa-solid fa-circle-check" aria-hidden="true" /> Checkup recorded</span> : !['Completed', 'Cancelled'].includes(item.status) && data.mothers.some(mother => mother.id === item.patientId) && <button type="button" className="appointment-record-button" disabled={item.date > today() || recordBusy} title={item.date > today() ? 'Available on or after the appointment date' : undefined} onClick={() => { setRecordError(''); setRecordTarget(item); }}>Record checkup</button>}</td></tr>) : <tr><td colSpan="6" className="appointment-empty">No appointments in this status.</td></tr>}</tbody></table></div>
    {appointments.length > 0 && <div className="appointment-pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, appointments.length)} of {appointments.length}</span><div><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><strong>Page {currentPage} of {totalPages}</strong><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></div></div>}
    {booking && <div className="appointment-modal" onMouseDown={event => event.target === event.currentTarget && setBooking(false)}><form onSubmit={bookAppointment}><button className="appointment-modal-close" type="button" onClick={() => setBooking(false)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2>Book appointment</h2><p className="appointment-modal-copy">Choose the patient, appointment type, date, and preferred time.</p>{bookingError && <p className="appointment-form-error" role="alert">{bookingError}</p>}<label>Patient<select name="patientId" required defaultValue=""><option value="" disabled>Choose patient</option>{data.mothers.map(mother => <option key={mother.id} value={mother.id}>{mother.name} — Mother</option>)}{data.infants.filter(infant => infant.status === 'Active').map(infant => <option key={infant.id} value={infant.id}>{infant.name} — Infant</option>)}</select></label><label>Appointment type<select name="service" required defaultValue=""><option value="" disabled>Choose appointment type</option>{appointmentTypes.map(service => <option key={service}>{service}</option>)}</select></label><label>Date<input name="date" type="date" min={today()} defaultValue={nextWednesday()} required /></label><label>Preferred time<select name="time" defaultValue="" required><option value="" disabled>Choose time</option>{Array.from({ length: 18 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`).map(time => <option key={time}>{time}</option>)}</select></label><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setBooking(false)}>Cancel</button><button className="appointment-primary-button">Book appointment</button></div></form></div>}
    {recordTarget && <div className="appointment-modal appointment-record-modal" onMouseDown={event => event.target === event.currentTarget && setRecordTarget(null)}><form onSubmit={saveAppointmentRecord}><button className="appointment-modal-close" type="button" onClick={() => setRecordTarget(null)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2>Record clinic visit</h2><p className="appointment-modal-copy">{recordTarget.patient || 'Linked patient'} · {recordTarget.service} · {recordTarget.date} at {recordTarget.time}</p>{recordError && <p className="appointment-form-error" role="alert">{recordError}</p>}<label>Record date<input name="date" type="date" max={today()} defaultValue={recordTarget.date || today()} required /></label><label className="appointment-record-findings">Clinical findings<textarea name="details" placeholder="Enter the findings or advice from the visit." /></label><label>Recorded by<select name="recordedBy" defaultValue="" required><option value="" disabled>Select recorder</option><option>Irene S. Andres</option><option>Health Center</option></select></label><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setRecordTarget(null)} disabled={recordBusy}>Cancel</button><button className="appointment-primary-button" disabled={recordBusy}>{recordBusy ? 'Saving...' : 'Save record'}</button></div></form></div>}
    {changeRequestTarget && <div className="appointment-modal appointment-change-request-modal" onMouseDown={event => event.target === event.currentTarget && setChangeRequestTarget(null)}><section className="appointment-confirm-dialog appointment-change-request-dialog" role="dialog" aria-modal="true" aria-labelledby="change-request-title"><button className="appointment-modal-close" type="button" onClick={() => setChangeRequestTarget(null)} aria-label="Close">×</button><p className="appointment-eyebrow">Mother request</p><h2 id="change-request-title">Reschedule request details</h2><p className="appointment-modal-copy">Review the request before changing the official appointment.</p><div className="appointment-change-request-details"><div><span>Mother</span><strong>{changeRequestTarget.appointment?.patient || 'Linked patient'}</strong></div><div><span>Appointment type</span><strong>{changeRequestTarget.appointment?.service || 'Appointment change request'}</strong></div><div><span>Current schedule</span><strong>{changeRequestTarget.appointment ? `${changeRequestTarget.appointment.date} at ${changeRequestTarget.appointment.time}` : 'Unavailable'}</strong></div><div><span>Requested schedule</span><strong>{requestDateLabel(changeRequestTarget.requested_scheduled_at)} at {changeRequestSchedule?.time || 'Unavailable'}</strong></div><div className="appointment-change-request-reason"><span>Reason</span><p>{changeRequestTarget.reason || 'No reason provided.'}</p></div></div>{requestError && <p className="appointment-form-error" role="alert">{requestError}</p>}<div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setChangeRequestTarget(null)} disabled={requestBusy === changeRequestTarget.id}>Close</button><button type="button" className="appointment-secondary-button appointment-change-decline" onClick={() => decideChangeRequest(changeRequestTarget, 'declined')} disabled={requestBusy === changeRequestTarget.id}>{requestBusy === changeRequestTarget.id ? 'Reviewing...' : 'Decline'}</button><button type="button" className="appointment-primary-button" onClick={() => decideChangeRequest(changeRequestTarget, 'approved')} disabled={requestBusy === changeRequestTarget.id}>{requestBusy === changeRequestTarget.id ? 'Reviewing...' : 'Approve'}</button></div></section></div>}
    {cancelTarget && <div className="appointment-modal appointment-cancel-modal" onMouseDown={event => event.target === event.currentTarget && setCancelTarget(null)}><div className="appointment-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-appointment-title"><button className="appointment-modal-close" type="button" onClick={() => setCancelTarget(null)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2 id="cancel-appointment-title">Cancel appointment?</h2><p className="appointment-modal-copy">This will mark the appointment as cancelled and preserve it in the patient history.</p><div className="appointment-confirm-summary"><strong>{cancelTarget.patient || 'Linked patient'}</strong><span>{cancelTarget.service}</span><span>{cancelTarget.date} at {cancelTarget.time}</span></div><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setCancelTarget(null)} disabled={requestBusy === `cancel:${cancelTarget.id}`}>Keep appointment</button><button type="button" className="appointment-cancel-confirm" onClick={confirmCancelAppointment} disabled={requestBusy === `cancel:${cancelTarget.id}`}>{requestBusy === `cancel:${cancelTarget.id}` ? 'Cancelling...' : 'Cancel appointment'}</button></div></div></div>}
  </section>;
}
