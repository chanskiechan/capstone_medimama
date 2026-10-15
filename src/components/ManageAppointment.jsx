import { useEffect, useMemo, useState } from 'react';
import { appointmentCapacity, appointmentError, availableAppointmentDates, availableAppointmentTimes, serviceGroup, session, today } from '../care';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const displayDate = value => value ? new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function ManageAppointment({ appointment }) {
  const { data, save, refreshPatientData } = useStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState(appointment.time || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const confirmed = appointment.status === 'Confirmed' || Boolean(appointment.motherConfirmedAt || appointment.mother_confirmed_at);
  const pending = !confirmed && ['Pending', 'Scheduled', 'Approved'].includes(appointment.status);
  const pendingRequest = (data.appointmentRequests || []).find(request => request.appointment_id === appointment.id && request.status === 'pending');
  const canRequestChange = !['Completed', 'Cancelled'].includes(appointment.status) && !pendingRequest;
  const availableDates = useMemo(() => availableAppointmentDates(data, appointment), [data, appointment]);
  const availableTimes = useMemo(() => availableAppointmentTimes(data, appointment, date), [data, appointment, date]);
  const remainingFor = value => appointmentCapacity - data.appointments.filter(item => item.date === value && !['Cancelled', 'cancelled'].includes(item.status) && serviceGroup(item.service) === serviceGroup(appointment.service)).length;

  useEffect(() => {
    setTime(appointment.time || '');
    setDate('');
  }, [appointment.id, appointment.time]);

  const updateLocalAppointment = update => save(current => ({
    ...current,
    appointments: current.appointments.map(item => item.id === appointment.id ? { ...item, ...update } : item),
  }));

  const confirm = async () => {
    setBusy(true); setError(''); setNotice('');
    if (!session().demo && isUuid(appointment.id)) {
      const { error: problem } = await supabase.rpc('confirm_my_appointment', { target_appointment_id: appointment.id });
      if (problem) { setBusy(false); return setError(problem.message); }
    }
    updateLocalAppointment({ status: 'Confirmed', motherConfirmedAt: new Date().toISOString() });
    setBusy(false); setNotice('Appointment confirmed.');
    await refreshPatientData?.();
  };

  const startReschedule = () => {
    setError(''); setNotice('');
    const firstDate = availableDates[0] || '';
    setDate(firstDate);
    setTime(availableAppointmentTimes(data, appointment, firstDate)[0] || '');
    setRescheduling(true);
  };

  const requestReschedule = async event => {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason')?.toString().trim();
    if (!date || !time) return setError('Choose an available Wednesday and time.');
    if (!reason) return setError('Explain why the appointment needs to be moved.');
    const next = { ...appointment, date, time, status: 'Pending' };
    const validationError = appointmentError(data, next, today(), { allowReschedule: true });
    if (validationError) return setError(validationError);
    setBusy(true); setError(''); setNotice('');
    if (!session().demo && isUuid(appointment.id)) {
      const { error: problem } = await supabase.rpc('request_appointment_reschedule', {
        target_appointment_id: appointment.id,
        requested_date: date,
        requested_time_text: time,
        reason_text: reason,
      });
      if (problem) { setBusy(false); return setError(problem.message); }
    } else {
      save(current => ({
        ...current,
        appointmentRequests: [...(current.appointmentRequests || []), {
          id: `REQ-${Date.now()}`, appointment_id: appointment.id, requested_by: session().id || null,
          requested_scheduled_at: `${date}T${time}:00+08:00`, reason, status: 'pending', created_at: new Date().toISOString(),
        }],
      }));
    }
    setRescheduling(false); setBusy(false); setNotice('Reschedule request sent. The health center must confirm the new Wednesday.');
    await refreshPatientData?.();
  };

  const changeDate = value => {
    setDate(value);
    setTime(availableAppointmentTimes(data, appointment, value)[0] || '');
  };

  return <section className="manage-appointment" aria-label="Manage appointment">
    <h3>Appointment response</h3>
    {notice && <p className="care-success" role="status">{notice}</p>}
    {error && <p className="care-error" role="alert">{error}</p>}
    {pendingRequest && <p className="care-muted">A change request for {displayDate(pendingRequest.requested_scheduled_at?.slice(0, 10))} is waiting for health center confirmation.</p>}
    {!rescheduling ? <div className="manage-appointment-actions">
      {pending && !pendingRequest && <button type="button" onClick={confirm} disabled={busy}>{busy ? 'Saving...' : 'Confirm appointment'}</button>}
      {confirmed && !pendingRequest && <span className="care-badge">Confirmed</span>}
      {canRequestChange && <button type="button" onClick={startReschedule} disabled={busy || !availableDates.length}>Request another Wednesday</button>}
      {!availableDates.length && canRequestChange && <span className="care-muted">No future Wednesday has an open {serviceGroup(appointment.service)} slot.</span>}
    </div> : <form className="manage-appointment-form" onSubmit={requestReschedule}>
      <p className="care-muted">Choose a Wednesday that still has capacity. Your current appointment stays unchanged until the health center approves this request.</p>
      <label>Available Wednesday<select value={date} onChange={event => changeDate(event.target.value)} required>{availableDates.map(option => <option key={option} value={option}>{displayDate(option)} · {remainingFor(option)} {serviceGroup(appointment.service)} spaces left</option>)}</select></label>
      <label>Available time<select value={time} onChange={event => setTime(event.target.value)} required>{availableTimes.map(option => <option key={option}>{option}</option>)}</select></label>
      <label>Reason for moving the appointment<textarea name="reason" required placeholder="For example: I am not available on the scheduled Wednesday." /></label>
      <div className="manage-appointment-actions"><button type="button" onClick={() => setRescheduling(false)} disabled={busy}>Cancel</button><button type="submit" disabled={busy || !availableTimes.length}>{busy ? 'Sending...' : 'Send request to admin'}</button></div>
    </form>}
  </section>;
}
