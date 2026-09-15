export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const day = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
};
export const daysBetween = (a, b) => Math.floor((day(b) - day(a)) / 86400000);
export const addDays = (date, amount) => new Date(day(date) + amount * 86400000).toISOString().slice(0, 10);
export function addMonths(date, amount) {
  const start = new Date(day(date));
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + amount, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(start.getUTCDate(), last))).toISOString().slice(0, 10);
}
export const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
export function session() { try { return JSON.parse(localStorage.getItem('medimama-current-session')) || {}; } catch { return {}; } }
export function normalize(data) {
  const next = { ...data, mothers: data.mothers || [], infants: data.infants || [], caregivers: data.caregivers || [], appointments: data.appointments || [], settings: { dailyCapacity: 20, capacityMode: 'per-service', ...data.settings } };
  // Only migrate an old appointment when its patient name has one exact match.
  next.appointments = next.appointments.map(a => {
    if (a.patientId) return a;
    const patients = [...next.mothers, ...next.infants].filter(p => p.name === a.patient);
    return patients.length === 1 ? { ...a, patientId: patients[0].id } : a;
  });
  return next;
}
export function family(data, user) {
  if (user.role === 'admin') return { mothers: data.mothers, infants: data.infants };
  let mothers = [];
  if (user.role === 'mother') mothers = data.mothers.filter(m => (user.id && m.accountId === user.id) || (user.motherId && m.id === user.motherId) || (m.email && m.email === user.email));
  if (user.role === 'caregiver') {
    const links = data.caregivers.filter(c => c.status === 'Approved' && ((user.id && c.accountId === user.id) || (c.email && c.email === user.email)));
    const motherIds = links.map(c => c.motherId || data.infants.find(i => i.id === c.infantId)?.motherId);
    mothers = data.mothers.filter(m => motherIds.includes(m.id));
  }
  return { mothers, infants: data.infants.filter(i => mothers.some(m => m.id === i.motherId)) };
}
export const serviceGroup = service => /immunization|infant|newborn/i.test(service) ? 'infant' : 'maternal';
export const services = ['Prenatal Checkup', 'Postnatal Checkup', 'Infant Immunization', 'Newborn Review', 'Infant Growth Review'];
export function appointmentError(data, item, now = today()) {
  if (!services.includes(item.service)) return 'Select a supported service.';
  const infant = data.infants.find(p => p.id === item.patientId);
  const mother = data.mothers.find(p => p.id === item.patientId);
  if (!infant && !mother) return 'Select a registered patient.';
  if ((serviceGroup(item.service) === 'infant') !== Boolean(infant)) return 'Choose a service for this patient type.';
  if (infant?.status === 'Pending approval') return 'Infant registration must be approved before booking.';
  if (item.service === 'Prenatal Checkup' && mother.status === 'Postnatal') return 'This mother needs a postnatal appointment.';
  if (item.service === 'Postnatal Checkup' && mother.status !== 'Postnatal') return 'Delivery must be recorded before booking postnatal care.';
  if (!Number.isFinite(day(item.date)) || item.date < now) return 'Choose today or a future date.';
  if (new Date(day(item.date)).getUTCDay() !== 3) return 'Clinic appointments are available on Wednesdays only.';
  const start = serviceGroup(item.service) === 'infant' ? '08:00' : '10:00';
  if (!/^\d{2}:\d{2}$/.test(item.time) || item.time < start || item.time > '16:30' || !['00', '30'].includes(item.time.slice(3))) return `Choose a 30-minute slot between ${start} and 16:30; the clinic closes at 17:00.`;
  if (item.date === now) {
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    if (item.time <= clock) return 'This time has already passed.';
  }
  const sameDay = data.appointments.filter(a => a.id !== item.id && a.status !== 'Cancelled' && a.date === item.date);
  const counted = data.settings.capacityMode === 'per-service' ? sameDay.filter(a => serviceGroup(a.service) === serviceGroup(item.service)) : sameDay;
  if (counted.length >= Number(data.settings.dailyCapacity)) return 'This Wednesday is full. Choose another Wednesday.';
  if (sameDay.some(a => a.patientId === item.patientId && a.service === item.service)) return 'This patient already has this service booked on that date.';
  if (sameDay.some(a => a.time === item.time && a.patientId === item.patientId)) return 'This patient already has an appointment at that time.';
  if (sameDay.filter(a => a.time === item.time && serviceGroup(a.service) === serviceGroup(item.service)).length >= 2) return 'This time slot is full. Choose another time.';
  return '';
}
export const vaccineSchedule = [
  { id: 'bcg', vaccine: 'BCG', dose: 'Birth dose', days: 0 },
  { id: 'hepb', vaccine: 'Hepatitis B', dose: 'Birth dose', days: 0 },
  ...['Pentavalent', 'OPV', 'PCV'].flatMap(vaccine => [1, 2, 3].map((dose, i) => ({ id: `${vaccine.toLowerCase()}-${dose}`, vaccine, dose: `Dose ${dose}`, days: 42 + i * 28, previous: i ? `${vaccine.toLowerCase()}-${dose - 1}` : null, interval: 28 }))),
  { id: 'ipv-1', vaccine: 'IPV', dose: 'Dose 1', days: 98 },
  { id: 'ipv-2', vaccine: 'IPV', dose: 'Dose 2', months: 9, previous: 'ipv-1', intervalMonths: 4 },
  { id: 'mmr-1', vaccine: 'MMR', dose: 'Dose 1', months: 9 },
  { id: 'mmr-2', vaccine: 'MMR', dose: 'Dose 2', months: 12, previous: 'mmr-1', interval: 28 },
];
export const completedDose = (baby, rule) => (baby.vaccines || []).find(v => (v.scheduleId === rule.id || (v.vaccine === rule.vaccine && v.dose === rule.dose)) && ['Complete', 'Completed'].includes(v.status));
export function vaccineDue(baby, rule) {
  if (!Number.isFinite(day(baby.birthDate))) return '';
  let date = addDays(baby.birthDate, rule.days || 0);
  if (rule.months) date = addMonths(baby.birthDate, rule.months);
  const previous = rule.previous && completedDose(baby, vaccineSchedule.find(v => v.id === rule.previous));
  if (previous?.date) date = [date, rule.intervalMonths ? addMonths(previous.date, rule.intervalMonths) : addDays(previous.date, rule.interval)].sort().at(-1);
  return date;
}
export function vaccineError(baby, rule, date) {
  if (!rule) return 'Select a vaccine dose.';
  if (completedDose(baby, rule)) return 'This dose is already recorded.';
  if (!Number.isFinite(day(date)) || date > today() || date < baby.birthDate) return 'Enter a valid administration date between birth and today.';
  if (rule.previous && !completedDose(baby, vaccineSchedule.find(v => v.id === rule.previous))) return 'Record the previous dose first.';
  const due = vaccineDue(baby, rule);
  if (!due || date < due) return `This dose is not eligible before ${due || 'a valid birth date is recorded'}.`;
  return '';
}
export function pregnancy(mother, date = today()) {
  if (mother.status === 'Postnatal') return { label: 'Postnatal', weeks: null, months: null };
  const weeks = mother.gestationDate ? Math.max(0, Number(mother.gestationWeeks || 0) + Math.floor(daysBetween(mother.gestationDate, date) / 7)) : null;
  return { label: 'Prenatal', weeks, months: weeks === null ? null : Math.floor(weeks / 4.345) };
}

export function nextPrenatal(mother) {
  if (mother.status === 'Postnatal') return '';
  const last = [...(mother.records || [])].filter(r => r.type === 'Prenatal check-up').map(r => r.date).sort().at(-1) || mother.gestationDate;
  if (!last || !Number.isFinite(day(last))) return '';
  const monthly = addMonths(last, 1);
  const target = monthly < today() ? today() : monthly;
  return addDays(target, (3 - new Date(day(target)).getUTCDay() + 7) % 7);
}
