import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { appointmentError, session, today, uid } from '../care';
import './AppointmentApprovals.css';

const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const label = value => ({ Pending: 'Pending', Scheduled: 'Pending', Rescheduled: 'Pending', Approved: 'Approved', Completed: 'Done', Cancelled: 'Cancelled' }[value] || value);
const pending = value => ['Pending', 'Scheduled', 'Rescheduled'].includes(value);
const nextWednesday = () => { const date = new Date(`${today()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + ((3 - date.getUTCDay() + 7) % 7)); return date.toISOString().slice(0, 10); };
const appointmentTypes = ['Prenatal Checkup', 'Postnatal Checkup', 'Infant Immunization'];

export default function AppointmentApprovals() {
  const { data, save } = useStore();
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const appointments = useMemo(() => data.appointments
    .filter(item => filter === 'all' || label(item.status).toLowerCase() === filter)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [data.appointments, filter]);

  const changeStatus = async (item, status) => {
    if (isUuid(item.id)) {
      const databaseStatus = status === 'Approved' ? 'approved' : 'completed';
      const { error } = await supabase.from('appointments').update({ status: databaseStatus }).eq('id', item.id);
      if (error) return setNotice(`Could not update appointment: ${error.message}`);
    }
    save(current => ({ ...current, appointments: current.appointments.map(entry => entry.id === item.id ? { ...entry, status, completedAt: status === 'Completed' ? new Date().toISOString() : entry.completedAt } : entry) }));
    setNotice(status === 'Approved' ? 'Appointment approved.' : 'Appointment marked done.');
  };

  const bookAppointment = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const patient = [...data.mothers, ...data.infants].find(item => item.id === values.patientId);
    const item = { id: uid('APT'), patientId: values.patientId, patient: patient?.name, recordCode: patient?.recordCode || patient?.record_code || '', service: values.service, date: values.date, time: values.time, status: 'Approved', createdBy: session().id || null };
    const problem = appointmentError(data, item);
    if (problem) return setBookingError(problem);
    if (isUuid(patient?.id)) {
      const isInfant = Boolean(patient.motherId);
      const { data: saved, error } = await supabase.from('appointments').insert({ mother_id: isInfant ? null : patient.id, infant_id: isInfant ? patient.id : null, service: item.service, scheduled_at: `${item.date}T${item.time}:00+08:00`, status: 'approved', created_by: item.createdBy }).select().single();
      if (error) return setBookingError(`Could not book appointment: ${error.message}`);
      item.id = saved.id;
    }
    save(current => ({ ...current, appointments: [...current.appointments, item] }));
    setBooking(false); setBookingError(''); setNotice('Appointment booked and approved.');
  };

  return <section className="appointment-approvals">
    <div className="appointment-page-action"><button className="appointment-primary-button" onClick={() => { setBookingError(''); setBooking(true); }}><i className="fa-solid fa-calendar-plus" /> Book appointment</button></div>
    <div className="appointment-approval-summary"><article><b>{data.appointments.filter(a => pending(a.status)).length}</b><span>Pending requests</span></article><article><b>{data.appointments.filter(a => a.status === 'Approved').length}</b><span>Approved visits</span></article><article><b>{data.appointments.filter(a => a.status === 'Completed').length}</b><span>Done appointments</span></article></div>
    {notice && <p className="appointment-notice" role="status">{notice}</p>}
    <div className="appointment-approval-tools"><h2>Appointment requests</h2><label>Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="done">Done</option></select></label></div>
    <div className="appointment-table-wrap"><table><thead><tr><th>Patient</th><th>Appointment type</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{appointments.length ? appointments.map(item => <tr key={item.id}><td><strong>{item.patient || 'Linked patient'}</strong><small>{item.recordCode || ''}</small></td><td>{item.service}</td><td>{item.date} at {item.time}</td><td><span className={`appointment-status ${label(item.status).toLowerCase().replace(' ', '-')}`}>{label(item.status)}</span></td><td className="appointment-actions">{pending(item.status) && <button className="approve" onClick={() => changeStatus(item, 'Approved')}>Approve</button>}{item.status === 'Approved' && <button className="done" onClick={() => changeStatus(item, 'Completed')}>Mark done</button>}{item.status === 'Completed' && <span>Completed</span>}</td></tr>) : <tr><td colSpan="5" className="appointment-empty">No appointments in this status.</td></tr>}</tbody></table></div>
    {booking && <div className="appointment-modal" onMouseDown={event => event.target === event.currentTarget && setBooking(false)}><form onSubmit={bookAppointment}><button className="appointment-modal-close" type="button" onClick={() => setBooking(false)} aria-label="Close">×</button><p className="appointment-eyebrow">Appointment management</p><h2>Book appointment</h2><p className="appointment-modal-copy">Choose the patient, appointment type, date, and preferred time.</p>{bookingError && <p className="appointment-form-error" role="alert">{bookingError}</p>}<label>Patient<select name="patientId" required defaultValue=""><option value="" disabled>Choose patient</option>{data.mothers.map(mother => <option key={mother.id} value={mother.id}>{mother.name} — Mother</option>)}{data.infants.filter(infant => infant.status === 'Active').map(infant => <option key={infant.id} value={infant.id}>{infant.name} — Infant</option>)}</select></label><label>Appointment type<select name="service" required defaultValue=""><option value="" disabled>Choose appointment type</option>{appointmentTypes.map(service => <option key={service}>{service}</option>)}</select></label><label>Date<input name="date" type="date" min={today()} defaultValue={nextWednesday()} required /></label><label>Preferred time<select name="time" defaultValue="" required><option value="" disabled>Choose time</option>{Array.from({ length: 18 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`).map(time => <option key={time}>{time}</option>)}</select></label><div className="appointment-modal-actions"><button type="button" className="appointment-secondary-button" onClick={() => setBooking(false)}>Cancel</button><button className="appointment-primary-button">Book appointment</button></div></form></div>}
  </section>;
}
