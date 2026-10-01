import { family, completedDose, vaccineDue, vaccineSchedule, today, addDays } from '../care.js';
import { healthResources } from '../healthResources.js';

export function dueReminders(data, user, now = today()) {
  const scope = family(data, user);
  return scope.infants.filter(i => !i.archived && !scope.mothers.find(m => m.id === i.motherId)?.archived && i.status === 'Active').flatMap(infant => vaccineSchedule
    .filter(rule => !completedDose(infant, rule))
    .map(rule => ({ id: `${infant.id}:${rule.id}`, date: vaccineDue(infant, rule), message: `${infant.name}: ${rule.vaccine} ${rule.dose} — confirm with your health worker.` }))
    .filter(item => item.date && item.date <= addDays(now, 7)));
}
export function assistantReply(question, data, user, availability = {}) {
  const q = question.toLowerCase();
  if (/pain|bleed|fever|sick|symptom|breath|unconscious|seizure|emergency|lagnat|masakit|dumudugo|hirap huminga|kombulsyon/.test(q)) return { text: 'I cannot assess symptoms or diagnose a condition. Contact a qualified health worker for medical advice. If you believe this is an emergency, seek immediate medical care; do not wait for a reply in MediMama.' };
  const appointmentQuestion = /appointment|next visit|schedule.*visit|check.?up|konsulta/.test(q);
  const vaccineQuestion = /due|next vaccine|susunod.*bakuna|kailan.*bakuna/.test(q);
  if ((appointmentQuestion || vaccineQuestion) && (availability.loading || availability.error)) return { text: availability.loading ? 'Your linked records are still loading. Please try this question again shortly. You can ask an education question in the meantime.' : 'I cannot check your linked records right now. Refresh the page or contact the health center if the problem continues. Education questions are still available.' };
  const scope = family(data, user), ids = [...scope.mothers, ...scope.infants].map(p => p.id);
  if (appointmentQuestion) {
    const next = data.appointments.filter(a => ids.includes(a.patientId) && Date.parse(`${a.date}T${a.time || '23:59'}:00+08:00`) >= Date.now() && !['Cancelled', 'Completed'].includes(a.status)).sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    return { text: next ? `Your next recorded appointment is ${next.service} for ${next.patient}, ${next.date} at ${next.time} (Philippine time). Status: ${next.status}.` : 'No upcoming appointment is recorded. Open Appointments to request a visit.' };
  }
  if (vaccineQuestion) {
    const reminders = dueReminders(data, user);
    return { text: reminders.length ? reminders.map(r => `${r.date}: ${r.message}`).join('\n') : 'No vaccine reminders are due in the next seven days in the loaded records. Open infant records for the full checklist; your health worker confirms the schedule.' };
  }
  const aliases = { pregnancy: ['buntis','pagbubuntis'], postnatal:['pagkapanganak','bagong panganak'], feeding:['pagpapasuso','gatas'], nutrition:['pagkain','nutrisyon'], planning:['pagpaplano','pagitan ng anak'], vaccines:['bakuna'] };
  const resource = healthResources.find(r => [...r.keywords,...(aliases[r.id]||[])].some(k => q.includes(k)));
  return resource ? { text: resource.text, url: resource.url } : { text: 'I can explain the education topics and look up appointments or vaccine reminders in your linked records. Try “family planning”, “infant feeding”, “next appointment”, or “vaccines due”. For a personal health concern, use Health concerns to contact the health center.' };
}
export function reportRows(data, start, end) {
  const rows = [];
  const add = (patient, type, date, details) => { if (date && date >= start && date <= end) rows.push({ date, patient: patient.name, record: patient.recordCode || patient.id, type, details }); };
  data.mothers.forEach(m => (m.records || []).forEach(r => add(m, r.type, r.date, r.details || '')));
  data.infants.forEach(i => {
    (i.records || []).forEach(r => add(i, r.type, r.date, r.details || ''));
    (i.screenings || []).forEach(r => add(i, r.type, r.date, r.result || ''));
    (i.growth || []).forEach(r => add(i, 'Growth measurement', r.date, `${r.weight} kg; ${r.length} cm; MUAC ${r.muac ?? '—'} cm`));
    (i.vaccines || []).filter(r => ['Complete', 'Completed'].includes(r.status)).forEach(r => add(i, 'Vaccination', r.date, `${r.vaccine} ${r.dose}; ${r.provider || ''}`));
  });
  data.appointments.forEach(a => add({ name: a.patient, id: a.patientId }, 'Appointment', a.date, `${a.service}; ${a.status}`));
  return rows.sort((a,b) => b.date.localeCompare(a.date));
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
