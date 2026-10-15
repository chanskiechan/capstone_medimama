import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { completedDose, daysBetween, family, pregnancy, session, today, vaccineDue, vaccineSchedule } from '../care';
import ManageAppointment from './ManageAppointment';
import './CareWorkspace.css';

function remindersFor(infants) {
  return infants.flatMap(baby => {
    if (baby.status === 'Pending approval') return [{ id: baby.id, text: `${baby.name}: registration awaiting approval.` }];
    const dose = vaccineSchedule.filter(rule => !completedDose(baby, rule)).map(rule => ({ rule, date: vaccineDue(baby, rule) })).filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date))[0];
    return dose ? [{ id: baby.id, text: `${baby.name}: ${dose.rule.vaccine} ${dose.rule.dose} ${dose.date <= today() ? 'needs health worker review' : `scheduled from ${dose.date}`}.` }] : [];
  });
}

const appointmentStatus = status => ({ Scheduled: 'Pending', Approved: 'Pending' }[status] || status);

function ReminderCard({ reminders, infantsLink }) {
  return <article className="care-card"><h2>Reminders</h2>{reminders.length ? <ul className="overview-reminders">{reminders.map(reminder => <li key={reminder.id}>{reminder.text}</li>)}</ul> : <p>No pending infant reminders.</p>}<p className="care-muted">Wednesday clinic: infant services from 8 AM, maternal care from 10 AM. Both close at 5 PM.</p><Link to={infantsLink}>View immunization details →</Link></article>;
}

export default function FamilyOverview({ caregiver = false, showReminders = true }) {
  const { data, storageError } = useStore();
  const scope = family(data, session());
  const ids = [...scope.mothers, ...scope.infants].map(patient => patient.id);
  const appointments = data.appointments.filter(appointment => ids.includes(appointment.patientId) && ['Pending', 'Scheduled', 'Rescheduled', 'Approved', 'Confirmed'].includes(appointment.status) && appointment.date >= today()).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const next = appointments[0];
  const recordsLink = caregiver ? '/caregiver?tab=records' : '/user/records';
  const infantsLink = caregiver ? recordsLink : '/user/records';
  const reminders = remindersFor(scope.infants);
  const hasPostnatalMother = scope.mothers.some(mother => mother.status === 'Postnatal');
  const showInfantCard = caregiver || scope.infants.length > 0 || hasPostnatalMother;

  return <section className="care-workspace family-overview" aria-label="Family care overview">
    {storageError && <p role="alert" className="care-error">{storageError}</p>}
    {ids.length > 0 && <>
      <div className="family-overview-grid">
        <article className="care-card">
          <span className="overview-icon"><i className="fa-solid fa-calendar-days" aria-hidden="true" /></span>
          <h2>Next appointment</h2>
          {next ? <><h3>{next.date} at {next.time}</h3><p>{next.patient} · {next.service}</p><span className="care-badge">{appointmentStatus(next.status)}</span>{!caregiver && <ManageAppointment appointment={next} />}</> : <><p>No upcoming appointments.</p><p className="care-muted">Appointments are scheduled by the health center.</p></>}
        </article>
        <article className="care-card"><span className="overview-icon"><i className="fa-solid fa-heart-pulse" aria-hidden="true" /></span><h2>Maternal care</h2>{scope.mothers.map(mother => { const stage = pregnancy(mother); const deliveryLabel = mother.status === 'Postnatal' ? 'Delivered' : 'Expected delivery'; return <div key={mother.id}><h3>{mother.name}</h3><p>{stage.label}{stage.weeks !== null ? ` · ${stage.weeks} weeks` : ''}{mother.deliveryDate ? ` · ${deliveryLabel} ${mother.deliveryDate}` : ''}</p></div>; })}<Link to={recordsLink}>View maternal records →</Link></article>
        {!showInfantCard && scope.mothers.map(mother => { const stage = pregnancy(mother); return <article className="care-card pregnancy-overview-card" key={`pregnancy-${mother.id}`}><span className="overview-icon"><i className="fa-solid fa-person-pregnant" aria-hidden="true" /></span><h2>Pregnancy progress</h2><h3>{mother.name}</h3><span className="care-badge">{stage.label}</span><dl className="care-metrics"><div><dt>Pregnancy weeks</dt><dd>{stage.weeks !== null ? `${stage.weeks} weeks` : 'Not recorded'}</dd></div><div><dt>Expected delivery</dt><dd>{mother.deliveryDate || 'Not recorded'}</dd></div></dl></article>; })}
        {showInfantCard && <article className="care-card infant-overview-card">
          <span className="overview-icon"><i className="fa-solid fa-baby" aria-hidden="true" /></span>
          <h2>{caregiver ? 'Linked infants' : 'My infants'}</h2>
          {scope.infants.length ? <div className="infant-overview-list">
            {scope.infants.map(baby => {
              const growth = [...(baby.growth || [])].filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date));
              const latest = growth.at(-1);
              const ageDays = daysBetween(baby.birthDate, today());
              const age = Number.isFinite(ageDays) && ageDays >= 0 ? `${Math.floor(ageDays / 7)} weeks` : 'Age not recorded';
              return <div className="infant-overview-item" key={baby.id}>
                <h3>{baby.name}</h3>
                <div className="infant-overview-baby-icon"><i className="fa-solid fa-baby" aria-hidden="true" /></div>
                <dl className="infant-overview-metrics">
                  <div><dt>Age</dt><dd>{age}</dd></div>
                  <div><dt>Height</dt><dd>{latest?.length != null ? `${latest.length} cm` : baby.birthLength != null ? `${baby.birthLength} cm` : '—'}</dd></div>
                  <div><dt>Weight</dt><dd>{latest?.weight != null ? `${latest.weight} kg` : baby.birthWeight != null ? `${baby.birthWeight} kg` : '—'}</dd></div>
                  <div><dt>MUAC</dt><dd>{latest?.muac != null ? `${latest.muac} cm` : '—'}</dd></div>
                </dl>
              </div>;
            })}
          </div> : <p>No infants registered yet.</p>}
          <Link to={infantsLink}>View infant records →</Link>
        </article>}
      </div>
      {showReminders && <ReminderCard reminders={reminders} infantsLink={infantsLink} />}
    </>}
  </section>;
}

export function FamilyReminders({ caregiver = false }) {
  const { data } = useStore();
  const scope = family(data, session());
  const infantsLink = caregiver ? '/caregiver?tab=records' : '/user/records';
  return <section className="care-workspace family-overview" aria-label="Family care reminders"><ReminderCard reminders={remindersFor(scope.infants)} infantsLink={infantsLink} /></section>;
}
