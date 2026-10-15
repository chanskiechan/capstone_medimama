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
  const [notice, setNotice] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestBusy, setRequestBusy] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  useEffect(() => { refreshPatientData?.(); }, [refreshPatientData]);
  useEffect(() => {
    if (!cancelTarget) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setCancelTarget(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cancelTarget]);
  const appointments = useMemo(() => data.appointments
    .filter(item => !['Cancelled', 'cancelled'].includes(item.status) && (filter === 'all' || filterKey(item.status) === filter))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)), [data.appointments, filter]);
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
        appointments: decision === 'approved' ? current.appointments.map(item => item.id === request.appointment_id ? { ...item, date: schedule.date, time: schedule.time, status: 'Pending', motherConfirmedAt: null } : item) : current.appointments,
      }));
    }
    await refreshPatientData?.();
    if (decision === 'approved') void notifyEmailEvent('/api/email/appointment', { appointmentId: request.appointment_id });
    setRequestBusy(''); setNotice(decision === 'approved' ? 'Reschedule approved. The mother must confirm the new appointment.' : 'Reschedule request declined. The original appointment remains unchanged.');
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
    const problem = appointmentError(data, item);
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

  return <section className="appointment-approvals">
    <div className="appointment-page-action"><Link className="appointment-secondary-button appointment-archive-link" to="/system?tab=archives&category=appointments"><i className="fa-solid fa-box-archive" /> Appointment archive</Link><button className="appointment-primary-button" onClick={() => { setBookingError(''); setBooking(true); }}><i className="fa-solid fa-calendar-plus" /> Book appointment</button></div>
    <div className="appointment-approval-summary"><article><b>{data.appointments.filter(a => ['Pending', 'Scheduled', 'Approved'].includes(a.status)).length}</b><span>Pending confirmation</span></article><article><b>{data.appointments.filter(a => a.status === 'Confirmed').length}</b><span>Mother-confirmed</span></article><article><b>{data.appointments.filter(a => a.status === 'Completed').length}</b><span>Done appointments</span></article></div>
    {notice && <p className="appointment-notice" role="status">{notice}</p>}
    {requestError && <p className="appointment-form-error appointment-request-error" role="alert">{requestError}</p>}
    <section className="appointment-change-requests"><div className="appointment-change-heading"><div><p className="appointment-eyebrow">Mother requests</p><h2>Reschedule requests</h2><p>Review the requested Wednesday before changing the official appointment.</p></div><span>{changeRequests.length} pending</span></div>{changeRequests.length ? <div className="appointment-change-list">{changeRequests.map(request => { const schedule = requestSchedule(request.requested_scheduled_at); return <article key={request.id}><div><strong>{request.appointment?.patient || 'Linked patient'}</strong><small>{request.appointment?.service || 'Appointment change request'}</small><p>{request.appointment ? <>Current: {request.appointment.date} at {request.appointment.time}<br /></> : <>Current appointment details are unavailable.<br /></>}Requested: {requestDateLabel(request.requested_scheduled_at)} at {schedule.time}</p><em>{request.reason || 'No reason provided.'}</em></div><div className="appointment-change-actions"><button className="appointment-primary-button" type="button" disabled={requestBusy === request.id} onClick={() => decideChangeRequest(request, 'approved')}>Approve</button><button className="appointment-secondary-button" type="button" disabled={requestBusy === request.id} onClick={() => decideChangeRequest(request, 'declined')}>Decline</button></div></article>; })}</div> : <p className="appointment-change-empty">No pending reschedule requests. A request will appear here after a mother submits one.</p>}</section>
    <div className="appointment-approval-tools"><h2>Appointments</h2><label>Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="rescheduled">Rescheduled</option><option value="confirmed">Confirmed</option><option value="done">Done</option></select></label></div>
    <div className="appointment-table-wrap"><table><thead><tr><th>Patient</th><th>Appointment type</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{appointments.length ? appointments.map(item => <tr key={item.id}><td><strong>{item.patient || 'Linked patient'}</strong><small>{item.recordCode || ''}</small></td><td>{item.service}</td><td>{item.date} at {item.time}</td><td><span className={`appointment-status ${label(item.status).toLowerCase().replace(' ', '-')}`}>{label(item.status)}</span></td><td className="appointment-actions">{item.status === 'Completed' && <span>Completed</span>}{item.status === 'Confirmed' && <span>Confirmed by mother</span>}{item.status === 'Rescheduled' && <span>Review request above</span>}{['Pending', 'Scheduled', 'Approved'].includes(item.status) && <span>Waiting for mother</span>}{!['Completed', 'Cancelled'].includes(item.status) && <button type="button" className="appointment-cancel-button" disabled={requestBusy === `cancel:${item.id}`} onClick={() => cancelAppointment(item)}>{requestBusy === `cancel:${item.id}` ? 'Cancelling...' : 'Cancel'}</button>}</td></tr>) : <tr><td colSpan="5" className="appointment-empty">No appointments in this status.</td></tr>}</tbody></table></div>
    {booking && <div className="appointment-modal" onMouseDown={event => event.target === event.currentTarget && setBooking(false)}><form onSubmit={bookAppointment}><button className="appointment-modal-close" type="button" onClick={() => setBooking(false)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2>Book appointment</h2><p className="appointment-modal-copy">Choose the patient, appointment type, date, and preferred time.</p>{bookingError && <p className="appointment-form-error" role="alert">{bookingError}</p>}<label>Patient<select name="patientId" required defaultValue=""><option value="" disabled>Choose patient</option>{data.mothers.map(mother => <option key={mother.id} value={mother.id}>{mother.name} — Mother</option>)}{data.infants.filter(infant => infant.status === 'Active').map(infant => <option key={infant.id} value={infant.id}>{infant.name} — Infant</option>)}</select></label><label>Appointment type<select name="service" required defaultValue=""><option value="" disabled>Choose appointment type</option>{appointmentTypes.map(service => <option key={service}>{service}</option>)}</select></label><label>Date<input name="date" type="date" min={today()} defaultValue={nextWednesday()} required /></label><label>Preferred time<select name="time" defaultValue="" required><option value="" disabled>Choose time</option>{Array.from({ length: 18 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`).map(time => <option key={time}>{time}</option>)}</select></label><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setBooking(false)}>Cancel</button><button className="appointment-primary-button">Book appointment</button></div></form></div>}
    {cancelTarget && <div className="appointment-modal appointment-cancel-modal" onMouseDown={event => event.target === event.currentTarget && setCancelTarget(null)}><div className="appointment-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-appointment-title"><button className="appointment-modal-close" type="button" onClick={() => setCancelTarget(null)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2 id="cancel-appointment-title">Cancel appointment?</h2><p className="appointment-modal-copy">This will mark the appointment as cancelled and preserve it in the patient history.</p><div className="appointment-confirm-summary"><strong>{cancelTarget.patient || 'Linked patient'}</strong><span>{cancelTarget.service}</span><span>{cancelTarget.date} at {cancelTarget.time}</span></div><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setCancelTarget(null)} disabled={requestBusy === `cancel:${cancelTarget.id}`}>Keep appointment</button><button type="button" className="appointment-cancel-confirm" onClick={confirmCancelAppointment} disabled={requestBusy === `cancel:${cancelTarget.id}`}>{requestBusy === `cancel:${cancelTarget.id}` ? 'Cancelling...' : 'Cancel appointment'}</button></div></div></div>}
  </section>;
}
