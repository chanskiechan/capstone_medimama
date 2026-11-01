import { family, completedDose, vaccineDue, vaccineSchedule, today, addDays, infantAgeStatus } from '../care.js';
import { healthResources } from '../healthResources.js';

export function dueReminders(data, user, now = today()) {
  const scope = family(data, user);
  return scope.infants.filter(i => !i.archived && !scope.mothers.find(m => m.id === i.motherId)?.archived && i.status === 'Active').flatMap(infant => vaccineSchedule
    .filter(rule => !completedDose(infant, rule))
    .map(rule => ({ id: `${infant.id}:${rule.id}`, date: vaccineDue(infant, rule), message: `${infant.name}: ${rule.vaccine} ${rule.dose} — confirm with your health worker.` }))
    .filter(item => item.date && item.date <= addDays(now, 7)));
}
function legacyAssistantReply(question, data, user, availability = {}) {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/pain|ache|bleed|bleeding|fever|sick|symptom|breath|breathing|unconscious|faint|seizure|emergency|vomit|vomiting|cough|dizzy|lagnat|masakit|sakit|dumudugo|hirap huminga|hindi makahinga|nahimatay|kombulsyon|sumusuka|pagsusuka|ubo|nahihilo/.test(q)) return { text: 'I cannot assess symptoms or diagnose a condition. Hindi ligtas magbigay ng diagnosis dito. Contact a qualified health worker for medical advice. If you believe this is an emergency, seek immediate medical care; do not wait for a reply in MediMama.' };
  const appointmentQuestion = /appointment|next visit|schedule|scheduled|check.?up|konsulta|iskedyul|susunod na (pagbisita|check|appointment)|kailan.*(visit|check|appointment)|schedule ko/.test(q);
  const vaccineTopic = /vaccine|vaccination|immuniz|bakuna|bakunahan/.test(q);
  const vaccineQuestion = vaccineTopic && /due|next|susunod|kailan|schedule|iskedyul|missed|late|nakaligtaan|kailangan/.test(q);
  if ((appointmentQuestion || vaccineQuestion) && (availability.loading || availability.error)) return { text: availability.loading ? 'Your linked records are still loading. Please try this question again shortly. You can ask an education question in the meantime.' : 'I cannot check your linked records right now. Refresh the page or contact the health center if the problem continues. Education questions are still available.' };
  const scope = family(data, user), ids = [...scope.mothers, ...scope.infants].map(p => p.id);
  if (appointmentQuestion) {
    const next = data.appointments.filter(a => ids.includes(a.patientId) && Date.parse(`${a.date}T${a.time || '23:59'}:00+08:00`) >= Date.now() && !['Cancelled', 'Completed'].includes(a.status)).sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    return { text: next ? `Your next recorded appointment is ${next.service} for ${next.patient}, ${next.date} at ${next.time} (Philippine time). Status: ${next.status}.` : 'No upcoming appointment is recorded. The health center will schedule your next visit.' };
  }
  if (vaccineQuestion) {
    const reminders = dueReminders(data, user);
    return { text: reminders.length ? reminders.map(r => `${r.date}: ${r.message}`).join('\n') : 'No vaccine reminders are due in the next seven days in the loaded records. Open infant records for the full checklist; your health worker confirms the schedule.' };
  }
  const aliases = { pregnancy: ['buntis','pagbubuntis','prenatal'], postnatal:['pagkapanganak','bagong panganak','pagkatapos manganak'], feeding:['pagpapasuso','pagpapadede','gatas','breastfeed'], nutrition:['pagkain','nutrisyon','diet'], planning:['pagpaplano','pagitan ng anak','contraceptive','birth control'], vaccines:['bakuna','bakunahan','immunization'] };
  const resource = healthResources.find(r => [...r.keywords,...(aliases[r.id]||[])].some(k => q.includes(k)));
  return resource ? { text: resource.text, url: resource.url } : { text: 'I can explain the education topics and look up appointments or vaccine reminders in your linked records. Try “family planning”, “infant feeding”, “next appointment”, or “vaccines due”. For a personal health concern, use Health concerns to contact the health center.' };
}
const assistantResourceText = {
  pregnancy: 'Para sa pangangalaga sa buntis, regular na magpa-check up at dalhin ang iyong MediMama records sa bawat pagbisita. Maaaring pag-usapan ninyo ng health worker ang iyong care plan, nararamdaman, at susunod na appointment.',
  postnatal: 'Ang pangangalaga pagkatapos manganak ay para sa kalagayan ng ina at sanggol. Humingi ng gabay tungkol sa pagpapakain, pag-recover, kalinisan, at mga follow-up visit mula sa health worker.',
  feeding: 'Para sa pagpapakain sa sanggol, itanong sa health worker ang tamang pagpapasuso o pagpapadede. Inirerekomenda ng WHO ang eksklusibong pagpapasuso sa unang anim na buwan kung maaari, pagkatapos ay angkop na pagkain kasama ng patuloy na pagpapasuso.',
  nutrition: 'Sa pagbubuntis, mahalaga ang sapat at iba-ibang pagkain. Ipaalam sa health worker ang iyong pangangailangan sa nutrisyon at itanong kung may supplement na angkop sa iyo.',
  planning: 'Ang pagpaplano ng pamilya ay tumutulong sa pamilya na makapagdesisyon kung kailan at gaano kalayo ang pagitan ng mga anak. Makipag-usap sa qualified health worker tungkol sa mga available na paraan.',
  vaccines: 'Para sa pagbabakuna, panatilihing maayos ang immunization card at itanong sa health worker ang susunod na bakuna o hindi pa nagawang dose. Makikita sa MediMama record ang mga dose na naitala ng health center.',
};

export function assistantReply(question, data, user, availability = {}) {
  const q = String(question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return { text: 'I-type ang iyong tanong para matulungan kita. Maaari kang magtanong tungkol sa appointment, bakuna, pangangalaga sa buntis, pangangalaga pagkatapos manganak, o status ng baby.' };
  if (/pain|ache|bleed|bleeding|fever|sick|symptom|breath|breathing|unconscious|faint|seizure|emergency|vomit|vomiting|cough|dizzy|headache|chest pain|lagnat|masakit|sakit|dumudugo|hirap huminga|hindi makahinga|hindi ako makahinga|di makahinga|nahihirapan huminga|nahimatay|kombulsyon|sumusuka|pagsusuka|ubo|nahihilo|masakit ang ulo/.test(q)) return { text: 'Hindi ko kayang suriin ang sintomas o magbigay ng diagnosis. Hindi ligtas mag-diagnose dito. Makipag-ugnayan agad sa qualified health worker. Kung emergency o lumalala ang kalagayan, pumunta agad sa pinakamalapit na health facility at huwag maghintay ng reply sa MediMama.' };
  if (/^(hi|hello|hey|kumusta|kamusta|good morning|good afternoon|good evening)\b/.test(q)) return { text: 'Kumusta! Ako ang MediMama Assistant. Maaari kitang tulungan sa health education, appointments, vaccine reminders, at status ng linked baby records.' };
  if (/help|ano.*kaya|what.*do|pwede.*itanong|maitutulong/.test(q)) return { text: 'Maaari akong tumulong sa:\n- susunod na appointment\n- mga paalala sa bakuna\n- pangangalaga sa buntis at pagkatapos manganak\n- pagpapasuso at nutrisyon\n- status ng linked baby records\nHindi ako nagdi-diagnose o nagrereseta ng gamot.' };

  const healthCenterQuestion = /(health center|healthcare center|clinic|center).*(bukas|open|oras|sarado|ngayon|tomorrow)|(bukas|open).*(health center|clinic|center)/.test(q);
  if (healthCenterQuestion) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long' }).format(new Date());
    const dayNames = { Sunday: 'Linggo', Monday: 'Lunes', Tuesday: 'Martes', Wednesday: 'Miyerkules', Thursday: 'Huwebes', Friday: 'Biyernes', Saturday: 'Sabado' };
    const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const openNow = weekday === 'Wednesday' && currentTime >= '08:00' && currentTime < '17:00';
    return { text: `Batay sa schedule ng MediMama, ang mga appointment ay tuwing Miyerkules lamang. Pangangalaga sa sanggol at bagong panganak: 8:00 AM hanggang 5:00 PM; pangangalaga sa ina: 10:00 AM hanggang 5:00 PM. Ngayon ay ${dayNames[weekday] || weekday}, kaya ${openNow ? 'bukas ang clinic sa oras na ito.' : 'sarado ang clinic ngayon ayon sa schedule ng system.'} Para makasiguro, tingnan ang schedule ng appointment o makipag-ugnayan sa health center.` };
  }

  const safeData = { mothers: [], infants: [], caregivers: [], appointments: [], ...data };
  const scope = family(safeData, user || {});
  const ids = [...scope.mothers, ...scope.infants].map(patient => patient.id);
  const appointmentQuestion = /appointment|next visit|schedule|scheduled|check.?up|follow.?up|konsulta|iskedyul|susunod na (pagbisita|check|appointment)|kailan.*(visit|check|appointment)|schedule ko/.test(q);
  const vaccineTopic = /vaccine|vaccination|immuniz|bakuna|bakunahan|turok|tinuturok/.test(q);
  const vaccineQuestion = vaccineTopic && /due|next|susunod|kailan|schedule|iskedyul|missed|late|nakaligtaan|kailangan|reminder|reminders|anong|ano.*turok|what.*vaccine/.test(q);
  const babyStatusQuestion = /status ng baby|baby status|newborn pa|infant na|toddler na|ilang buwan|how old|edad ng baby|weeks old|months old/.test(q);

  if ((appointmentQuestion || vaccineQuestion || babyStatusQuestion) && (availability.loading || availability.error)) return { text: availability.loading ? 'Nilo-load pa ang linked records. Subukan muli pagkalipas ng ilang sandali. Maaari ka munang magtanong tungkol sa health education.' : 'Hindi ko ma-check ang linked records ngayon. I-refresh ang page o makipag-ugnayan sa health center kung magpapatuloy ang problema. Available pa rin ang health education topics.' };
  if (appointmentQuestion) {
    const upcoming = safeData.appointments.filter(appointment => ids.includes(appointment.patientId) && Date.parse(`${appointment.date}T${appointment.time || '23:59'}:00+08:00`) >= Date.now() && !['Cancelled', 'Completed'].includes(appointment.status)).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    const next = upcoming[0];
    return { text: next ? `Ang susunod mong appointment ay ${next.service} para kay ${next.patient} sa ${next.date}, ${next.time || 'walang nakatalang oras'} (oras sa Pilipinas). Status: ${next.status || 'Pending'}.` : 'Walang nakatalang susunod na appointment. Tingnan ang Appointments page o makipag-ugnayan sa health center.' };
  }
  if (vaccineQuestion) {
    const reminders = dueReminders(safeData, user || {});
    return { text: reminders.length ? `Narito ang mga paalala sa bakuna:\n${reminders.map(reminder => `${reminder.date}: ${reminder.message.replace(/confirm with your health worker/i, 'ipakumpirma sa iyong health worker')}`).join('\n')}\nKumpirmahin ang schedule sa iyong health worker.` : 'Walang due na paalala sa bakuna sa susunod na pitong araw ayon sa loaded records. Tingnan ang infant record para sa buong checklist.' };
  }
  if (babyStatusQuestion) {
    const infants = scope.infants.filter(infant => !infant.archived);
    return { text: infants.length ? `Status ng baby mula sa linked records:\n${infants.map(infant => `${infant.name}: ${infantAgeStatus(infant.birthDate)} (birthdate: ${infant.birthDate || 'hindi nakatala'})`).join('\n')}\nPara sa tanong tungkol sa development o concern, magtanong sa iyong health worker.` : 'Wala akong nakitang linked infant record. Makipag-ugnayan sa health center para ma-check ang registration.' };
  }

  const aliases = { pregnancy: ['buntis', 'pagbubuntis', 'prenatal', 'antenatal'], postnatal: ['pagkapanganak', 'bagong panganak', 'pagkatapos manganak', 'post natal'], feeding: ['pagpapasuso', 'pagpapadede', 'gatas', 'breastfeed', 'breast feeding'], nutrition: ['pagkain', 'nutrisyon', 'diet'], planning: ['pagpaplano', 'pagitan ng anak', 'contraceptive', 'birth control'], vaccines: ['bakuna', 'bakunahan', 'immunization'] };
  const resource = healthResources.find(item => [...item.keywords, ...(aliases[item.id] || [])].some(keyword => q.includes(keyword)));
  if (!resource) return { text: 'Maaari kitang tulungan sa health education, appointments, mga paalala sa bakuna, at status ng linked baby. Subukan ang “susunod na appointment”, “kailan ang susunod na bakuna”, “pagpapasuso”, o “status ng baby”. Para sa personal na health concern, gamitin ang Health concerns o makipag-ugnayan sa health worker.' };
  return resource ? { text: assistantResourceText[resource.id] || resource.text, url: resource.url } : { text: 'I can help with health education, appointments, vaccine reminders, and linked baby status. Subukan ang “next appointment”, “kailan ang susunod na bakuna”, “pagpapasuso”, o “status ng baby”. Para sa personal na health concern, gamitin ang Health concerns o makipag-ugnayan sa health worker.' };
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
