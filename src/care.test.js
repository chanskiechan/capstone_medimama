import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentError, completedDose, day, family, nextPrenatal, normalize, pregnancy, vaccineDue, vaccineError, vaccineSchedule } from './care.js';

const mother = { id: 'm1', name: 'Mother', accountId: 'u1', status: 'Pregnant' };
const infant = { id: 'i1', name: 'Baby', motherId: 'm1', status: 'Active', birthDate: '2025-01-01', vaccines: [] };
const base = () => normalize({ mothers: [mother], infants: [infant], appointments: [] });
const appointment = { id: 'a1', patientId: 'm1', service: 'Prenatal Checkup', date: '2099-01-07', time: '10:00' };
const rule = id => vaccineSchedule.find(v => v.id === id);

test('Wednesday booking accepts the correct patient, service, and time', () => assert.equal(appointmentError(base(), appointment, '2099-01-01'), ''));
test('rejects other weekdays and times outside the clinic window', () => {
  for (const values of [{ date: '2099-01-08' }, { time: '09:30' }, { time: '17:00' }, { time: '10:15' }]) assert.ok(appointmentError(base(), { ...appointment, ...values }, '2099-01-01'));
});
test('infant clinic opens at 8; maternal clinic opens at 10', () => {
  assert.equal(appointmentError(base(), { ...appointment, patientId: 'i1', service: 'Infant Immunization', time: '08:00' }, '2099-01-01'), '');
  assert.ok(appointmentError(base(), { ...appointment, patientId: 'i1' }, '2099-01-01'));
});
test('20-per-group limit does not consume the other group capacity', () => {
  const data = base();
  data.appointments = Array.from({ length: 20 }, (_, i) => ({ ...appointment, id: `busy-${i}`, patientId: `m-${i}`, time: '12:00' }));
  assert.match(appointmentError(data, appointment, '2099-01-01'), /full/);
  assert.equal(appointmentError(data, { ...appointment, patientId: 'i1', service: 'Infant Immunization', time: '08:00' }, '2099-01-01'), '');
});
test('rescheduling excludes itself and cancelled appointments release capacity', () => {
  const data = base(); data.appointments = [appointment];
  assert.equal(appointmentError(data, appointment, '2099-01-01'), '');
  data.appointments = [{ ...appointment, id: 'other', status: 'Cancelled' }];
  assert.equal(appointmentError(data, appointment, '2099-01-01'), '');
});
test('blocks duplicate patient services and full time slots', () => {
  const data = base(); data.appointments = [{ ...appointment, id: 'other' }];
  assert.match(appointmentError(data, appointment, '2099-01-01'), /already/);
  data.appointments = [1, 2].map(i => ({ ...appointment, id: `other${i}`, patientId: `other${i}` }));
  assert.match(appointmentError(data, appointment, '2099-01-01'), /slot is full/);
});
test('pending infants cannot book and delivered mothers cannot book prenatal care', () => {
  const data = base(); data.infants = [{ ...infant, status: 'Pending approval' }];
  assert.match(appointmentError(data, { ...appointment, patientId: 'i1', service: 'Infant Immunization' }, '2099-01-01'), /approved/);
  data.mothers = [{ ...mother, status: 'Postnatal' }];
  assert.match(appointmentError(data, appointment, '2099-01-01'), /postnatal/);
});
test('age floor rejects early pentavalent, permits due and late administration', () => {
  assert.equal(vaccineDue(infant, rule('pentavalent-1')), '2025-02-12');
  assert.ok(vaccineError(infant, rule('pentavalent-1'), '2025-02-11'));
  assert.equal(vaccineError(infant, rule('pentavalent-1'), '2025-02-12'), '');
  assert.equal(vaccineError(infant, rule('pentavalent-1'), '2025-05-01'), '');
});
test('dose order and minimum intervals follow actual previous administration', () => {
  assert.match(vaccineError(infant, rule('pentavalent-2'), '2025-06-01'), /previous/);
  const baby = { ...infant, vaccines: [{ scheduleId: 'pentavalent-1', date: '2025-05-01', status: 'Complete' }] };
  assert.equal(vaccineDue(baby, rule('pentavalent-2')), '2025-05-29');
  assert.ok(vaccineError(baby, rule('pentavalent-2'), '2025-05-28'));
  assert.equal(vaccineError(baby, rule('pentavalent-2'), '2025-05-29'), '');
});
test('legacy completed doses are recognized; due placeholders are not completion', () => {
  const baby = { ...infant, vaccines: [{ vaccine: 'BCG', dose: 'Birth dose', date: '2025-01-01', status: 'Complete' }, { vaccine: 'Pentavalent', dose: 'Dose 1', status: 'Due' }] };
  assert.ok(completedDose(baby, rule('bcg')));
  assert.match(vaccineError(baby, rule('bcg'), '2025-01-01'), /already/);
  assert.equal(completedDose(baby, rule('pentavalent-1')), undefined);
});
test('calendar-month thresholds handle end-of-month births', () => assert.equal(vaccineDue({ ...infant, birthDate: '2024-05-31' }, rule('mmr-1')), '2025-02-28'));
test('invalid and future vaccine dates are rejected', () => {
  assert.ok(Number.isNaN(day('2025-02-30')));
  assert.ok(vaccineError(infant, rule('bcg'), '2099-01-01'));
});
test('mother and caregiver access uses verified IDs, not shared names', () => {
  const data = base(); data.mothers.push({ id: 'm2', name: 'Mother' });
  assert.deepEqual(family(data, { role: 'mother', id: 'u1' }).mothers.map(m => m.id), ['m1']);
  assert.equal(family(data, { role: 'mother', name: 'Mother' }).mothers.length, 0);
  data.caregivers = [{ accountId: 'c1', motherId: 'm1', status: 'Approved' }];
  assert.equal(family(data, { role: 'caregiver', id: 'c1' }).infants.length, 1);
  data.caregivers[0].status = 'Revoked';
  assert.equal(family(data, { role: 'caregiver', id: 'c1' }).infants.length, 0);
});
test('gestational progress advances and delivery closes the prenatal stage', () => {
  assert.equal(pregnancy({ ...mother, gestationDate: '2025-01-01', gestationWeeks: 12 }, '2025-01-15').weeks, 14);
  assert.equal(pregnancy({ ...mother, status: 'Postnatal' }).label, 'Postnatal');
  assert.equal(nextPrenatal({ ...mother, status: 'Postnatal' }), '');
});
test('legacy name migration only links unambiguous patients', () => {
  const data = normalize({ mothers: [mother], appointments: [{ patient: 'Mother' }] });
  assert.equal(data.appointments[0].patientId, 'm1');
  assert.equal(normalize({ mothers: [mother, { ...mother, id: 'm2' }], appointments: [{ patient: 'Mother' }] }).appointments[0].patientId, undefined);
});
