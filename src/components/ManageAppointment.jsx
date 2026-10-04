import { useEffect, useState } from 'react';
import { appointmentError, serviceGroup, session } from '../care';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

function timeOptions(appointment) {
  const start = serviceGroup(appointment.service) === 'infant' ? 8 : 10;
  return Array.from({ length: (17 - start) * 2 }, (_, index) => `${String(start + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
}

export default function ManageAppointment({ appointment }) {
  const { data, save, refreshPatientData } = useStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [time, setTime] = useState(appointment.time || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const confirmed = appointment.status === 'Confirmed' || Boolean(appointment.motherConfirmedAt || appointment.mother_confirmed_at);
  const waitingForApproval = appointment.status === 'Rescheduled';

  useEffect(() => { setTime(appointment.time || ''); }, [appointment.id, appointment.time]);

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

  const reschedule = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const next = { ...appointment, time, status: 'Rescheduled', motherConfirmedAt: null };
    const validationError = appointmentError(data, next);
    if (validationError) { setBusy(false); return setError(validationError); }
    if (!session().demo && isUuid(appointment.id)) {
      const { error: problem } = await supabase.rpc('reschedule_my_appointment', { target_appointment_id: appointment.id, new_time_text: time });
      if (problem) { setBusy(false); return setError(problem.message); }
    }
    updateLocalAppointment({ time, status: 'Rescheduled', motherConfirmedAt: null });
    setRescheduling(false); setBusy(false); setNotice('Reschedule request sent to the health center.');
    await refreshPatientData?.();
  };

  return <section className="manage-appointment" aria-label="Manage appointment">
    <h3>Manage appointment</h3>
    {notice && <p className="care-success" role="status">{notice}</p>}
    {error && <p className="care-error" role="alert">{error}</p>}
    {!rescheduling ? <div className="manage-appointment-actions">
      {!confirmed && !waitingForApproval && <button type="button" onClick={confirm} disabled={busy}>{busy ? 'Saving...' : 'Confirm'}</button>}
      {confirmed && <span className="care-badge">Confirmed</span>}
      {waitingForApproval && <span className="care-badge">Reschedule requested</span>}
      {!waitingForApproval && <button type="button" onClick={() => { setError(''); setNotice(''); setRescheduling(true); }} disabled={busy}>Reschedule</button>}
    </div> : <form className="manage-appointment-form" onSubmit={reschedule}>
      <label>Choose a new time<select value={time} onChange={event => setTime(event.target.value)} required>{timeOptions(appointment).map(option => <option key={option}>{option}</option>)}</select></label>
      <div className="manage-appointment-actions"><button type="button" onClick={() => setRescheduling(false)} disabled={busy}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Submit reschedule'}</button></div>
    </form>}
  </section>;
}
