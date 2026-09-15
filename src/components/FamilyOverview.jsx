import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { completedDose, family, pregnancy, session, today, vaccineDue, vaccineSchedule } from '../care';
import './CareWorkspace.css';

export default function FamilyOverview({ caregiver = false }) {
  const { data } = useStore();
  const scope = family(data, session());
  const ids = [...scope.mothers, ...scope.infants].map(p => p.id);
  const appointments = data.appointments.filter(a => ids.includes(a.patientId) && ['Scheduled', 'Rescheduled'].includes(a.status) && a.date >= today()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const next = appointments[0];
  const recordsLink = caregiver ? '/caregiver?tab=records' : '/user/records';
  const infantsLink = caregiver ? recordsLink : '/user/infants';
  const appointmentsLink = caregiver ? '/caregiver?tab=appointments' : '/user/appointments';
  const reminders = scope.infants.flatMap(baby => {
    if (baby.status === 'Pending approval') return [{ id: baby.id, text: `${baby.name}: registration awaiting approval.` }];
    const pending = vaccineSchedule.filter(rule => !completedDose(baby, rule)).map(rule => ({ rule, date: vaccineDue(baby, rule) })).filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date));
    const dose = pending[0];
    return dose ? [{ id: baby.id, text: `${baby.name}: ${dose.rule.vaccine} ${dose.rule.dose} ${dose.date <= today() ? 'needs health worker review' : `scheduled from ${dose.date}`}.` }] : [];
  });
  return <section className="care-workspace family-overview" aria-label="Family care overview">
    {!ids.length ? <p className="care-empty">No linked records yet. Your health center can link your account to the correct family.</p> : <>
      <div className="family-overview-grid">
        <article className="care-card"><span className="overview-icon"><i className="fa-solid fa-calendar-days" aria-hidden="true" /></span><h2>Next appointment</h2>{next ? <><h3>{next.date} at {next.time}</h3><p>{next.patient} · {next.service}</p><span className="care-badge">{next.status}</span></> : <p>No upcoming appointments.</p>}<Link to={appointmentsLink}>{caregiver ? 'View appointments' : next ? 'Manage appointments' : 'Book an appointment'} →</Link></article>
        <article className="care-card"><span className="overview-icon"><i className="fa-solid fa-heart-pulse" aria-hidden="true" /></span><h2>Maternal care</h2>{scope.mothers.map(m => { const stage = pregnancy(m); return <div key={m.id}><h3>{m.name}</h3><p>{stage.label}{stage.weeks !== null ? ` · ${stage.weeks} weeks` : ''}{m.deliveryDate ? ` · Delivered ${m.deliveryDate}` : ''}</p></div>; })}<Link to={recordsLink}>View maternal records →</Link></article>
        <article className="care-card"><span className="overview-icon"><i className="fa-solid fa-baby" aria-hidden="true" /></span><h2>{caregiver ? 'Linked infants' : 'My infants'}</h2><h3>{scope.infants.length} {scope.infants.length === 1 ? 'infant' : 'infants'}</h3><p>{scope.infants.map(b => b.name).join(', ') || 'No infants registered yet.'}</p><Link to={infantsLink}>{caregiver ? 'View infant records' : 'View my infants'} →</Link></article>
      </div>
      <article className="care-card"><h2>Reminders</h2>{reminders.length ? <ul className="overview-reminders">{reminders.map(r => <li key={r.id}>{r.text}</li>)}</ul> : <p>No pending infant reminders.</p>}<p className="care-muted">Wednesday clinic: infant services from 8 AM, maternal care from 10 AM. Both close at 5 PM.</p><Link to={infantsLink}>View immunization details →</Link></article>
    </>}
  </section>;
}
