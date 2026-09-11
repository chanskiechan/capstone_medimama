/* MediMama shared frontend data layer.
   This is intentionally a browser-demo repository. Replace this adapter with
   authenticated API calls before production use. */
(function () {
  'use strict';
  const KEY = 'medimama-records-v2';
  const isoNow = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const initials = (name = '') => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  const byId = (items, id) => items.find(item => item.id === id);

  const seed = {
    version: 2,
    mothers: [
      { id: 'M-2026-0001', name: 'Shaina Santos', initials: 'SS', birthDate: '1997-03-18', age: 29, contact: '09175552026', address: 'Barangay Bucandala II, Imus City, Cavite', bloodType: 'O+', status: 'Postnatal', pregnancy: { gravida: 1, para: 1, lmp: '2025-09-08', edd: '2026-06-15', riskLevel: 'Routine' }, emergencyContact: '09175552027', infantIds: ['I-2026-0001'], records: [{ id: 'MR-001', date: '2026-08-14', type: 'Postnatal check-up', details: 'Blood pressure stable; breastfeeding support provided.', status: 'Completed', author: 'Health worker' }] },
      { id: 'M-2026-0002', name: 'Liza Dela Cruz', initials: 'LD', birthDate: '1995-06-12', age: 31, contact: '09185550152', address: 'Purok 5, San Isidro', bloodType: 'A+', status: 'Pregnant', pregnancy: { gravida: 2, para: 1, lmp: '2026-01-10', edd: '2026-10-17', riskLevel: 'Routine' }, emergencyContact: '09185550153', infantIds: [], records: [{ id: 'MR-002', date: '2026-08-20', type: 'Prenatal check-up', details: '32-week prenatal assessment completed.', status: 'Completed', author: 'Health worker' }] }
    ],
    infants: [
      { id: 'I-2026-0001', name: 'Baby Patrick Ibanez', initials: 'PI', birthDate: '2026-06-15', sex: 'Male', motherId: 'M-2026-0001', guardianIds: [], bloodType: 'O+', placeOfBirth: 'Imus City', status: 'Active', birth: { weightKg: 3.4, lengthCm: 50, gestationalWeeks: 39, delivery: 'Normal delivery' }, growth: [{ id: 'GR-001', date: '2026-08-14', weightKg: 5.2, lengthCm: 58, headCm: 39, notes: 'Healthy growth curve.', author: 'Health worker' }], immunizations: [{ id: 'IM-001', vaccine: 'BCG', dose: 'Birth dose', date: '2026-06-15', status: 'Completed', facility: 'Barangay Health Center' }, { id: 'IM-002', vaccine: 'Hepatitis B', dose: 'Birth dose', date: '2026-06-15', status: 'Completed', facility: 'Barangay Health Center' }, { id: 'IM-003', vaccine: 'Pentavalent', dose: 'Dose 1', dueDate: '2026-08-28', status: 'Due' }], records: [], allergies: '', conditions: '' }
    ],
    caregivers: [
      { id: 'C-2026-0001', name: 'Juan Dela Cruz', initials: 'JD', contact: '09175552028', relationship: 'Father', patientIds: ['I-2026-0001'], permissions: ['view_records', 'care_notes', 'report_symptom', 'view_appointments'], status: 'Approved', expiresAt: '', createdAt: '2026-06-20' }
    ],
    appointments: [{ id: 'APT-001', patientType: 'infant', patientId: 'I-2026-0001', service: 'Infant Immunization', date: '2026-09-15', time: '09:00', facility: 'Barangay Health Center', status: 'Scheduled', notes: '', createdBy: 'Health worker' }],
    concerns: [],
    approvals: [],
    audit: []
  };

  function load() { try { const data = JSON.parse(localStorage.getItem(KEY)); return data?.version === 2 ? data : clone(seed); } catch { return clone(seed); } }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(data)); return data; }
  function audit(data, action, entity, entityId, details = '') { data.audit.unshift({ id: uid('AUD'), at: isoNow(), actor: MediMama.currentUser()?.name || 'System', action, entity, entityId, details }); data.audit = data.audit.slice(0, 200); }
  function mutate(action, entity, entityId, callback, details) { const data = load(); const result = callback(data); audit(data, action, entity, entityId, details); save(data); window.dispatchEvent(new CustomEvent('medimama:data-changed')); return result; }
  function patientName(data, type, id) { return (type === 'mother' ? byId(data.mothers, id) : byId(data.infants, id))?.name || 'Unknown patient'; }

  const MediMama = window.MediMama = {
    load, save, uid, initials,
    currentUser() { try { return JSON.parse(localStorage.getItem('medimama-current-session')) || null; } catch { return null; } },
    logout() { localStorage.removeItem('medimama-current-session'); window.location.href = 'medimama_admin/medimamaloginandsignup/medimamalogin.html'; },
    requireRole(...roles) { const user = this.currentUser(); if (!user || !roles.includes(user.role)) { window.location.href = location.pathname.includes('medimama_admin') ? '../medimamaloginandsignup/medimamalogin.html' : '../../medimama_admin/medimamaloginandsignup/medimamalogin.html'; return false; } return true; },
    getMother(id) { return clone(byId(load().mothers, id)); }, getInfant(id) { return clone(byId(load().infants, id)); },
    mothers() { return clone(load().mothers); }, infants() { return clone(load().infants); }, caregivers() { return clone(load().caregivers); },
    addMother(input) { return mutate('Created', 'Mother', input.id || uid('M'), data => { const mother = { id: input.id || `M-${new Date().getFullYear()}-${String(data.mothers.length + 1).padStart(4, '0')}`, initials: initials(input.name), infantIds: [], records: [], pregnancy: { gravida: '', para: '', lmp: '', edd: '', riskLevel: 'Routine', ...(input.pregnancy || {}) }, ...input }; data.mothers.push(mother); return clone(mother); }, input.name); },
    updateMother(id, input) { return mutate('Updated', 'Mother', id, data => { const mother = byId(data.mothers, id); if (!mother) throw new Error('Mother not found'); Object.assign(mother, input, { initials: initials(input.name || mother.name) }); return clone(mother); }, input.name); },
    addInfant(input) { return mutate('Created', 'Infant', input.id || uid('I'), data => { const infant = { id: input.id || `I-${new Date().getFullYear()}-${String(data.infants.length + 1).padStart(4, '0')}`, initials: initials(input.name.replace(/^Baby\s+/i, '')), guardianIds: [], growth: [], immunizations: [], records: [], status: 'Active', birth: {}, ...input }; data.infants.push(infant); const mother = byId(data.mothers, infant.motherId); if (mother && !mother.infantIds.includes(infant.id)) mother.infantIds.push(infant.id); return clone(infant); }, input.name); },
    updateInfant(id, input) { return mutate('Updated', 'Infant', id, data => { const infant = byId(data.infants, id); if (!infant) throw new Error('Infant not found'); Object.assign(infant, input, { initials: initials((input.name || infant.name).replace(/^Baby\s+/i, '')) }); return clone(infant); }, input.name); },
    addRecord(type, id, record) { return mutate('Added record', type, id, data => { const item = type === 'Mother' ? byId(data.mothers, id) : byId(data.infants, id); if (!item) throw new Error('Patient not found'); item.records.unshift({ id: uid('REC'), date: new Date().toISOString().slice(0, 10), status: 'Completed', author: this.currentUser()?.name || 'Health worker', ...record }); return clone(item); }, record.type); },
    addGrowth(id, record) { return mutate('Added growth measurement', 'Infant', id, data => { const infant = byId(data.infants, id); infant.growth.unshift({ id: uid('GR'), author: this.currentUser()?.name || 'Health worker', ...record }); return clone(infant); }); },
    addImmunization(id, record) { return mutate('Updated immunization', 'Infant', id, data => { const infant = byId(data.infants, id); infant.immunizations.unshift({ id: uid('IM'), status: 'Completed', ...record }); return clone(infant); }, record.vaccine); },
    addAppointment(input) { return mutate('Scheduled appointment', 'Appointment', uid('APT'), data => { const appointment = { id: uid('APT'), status: 'Requested', createdAt: isoNow(), ...input }; data.appointments.unshift(appointment); return clone(appointment); }, input.service); },
    setAppointmentStatus(id, status) { return mutate('Updated appointment', 'Appointment', id, data => { const item = byId(data.appointments, id); if (!item) throw new Error('Appointment not found'); item.status = status; return clone(item); }, status); },
    addConcern(input) { return mutate('Reported health concern', 'Concern', uid('CON'), data => { const concern = { id: uid('CON'), status: 'Pending', priority: 'Normal', createdAt: isoNow(), ...input }; data.concerns.unshift(concern); return clone(concern); }, input.type); },
    requestCaregiver(input) { return mutate('Requested caregiver access', 'Caregiver', uid('APR'), data => { const approval = { id: uid('APR'), type: 'Caregiver', status: 'Pending', createdAt: isoNow(), motherConsent: false, ...input }; data.approvals.unshift(approval); return clone(approval); }, input.name); },
    setCaregiverConsent(id, allowed) { return mutate(allowed ? 'Granted caregiver consent' : 'Denied caregiver consent', 'Approval', id, data => { const approval = byId(data.approvals, id); if (!approval) throw new Error('Request not found'); approval.motherConsent = allowed; approval.status = allowed ? 'Mother approved' : 'Declined'; return clone(approval); }); },
    approveCaregiver(id) { return mutate('Approved caregiver', 'Approval', id, data => { const approval = byId(data.approvals, id); if (!approval?.motherConsent) throw new Error('Mother consent is required'); const caregiver = { id: `C-${new Date().getFullYear()}-${String(data.caregivers.length + 1).padStart(4, '0')}`, initials: initials(approval.name), status: 'Approved', permissions: approval.permissions || ['view_records', 'care_notes', 'report_symptom', 'view_appointments'], patientIds: approval.patientIds || [], ...approval }; data.caregivers.push(caregiver); approval.status = 'Approved'; return clone(caregiver); }, 'Mother consent verified'); },
    getPatientAppointments(type, id) { return clone(load().appointments.filter(item => item.patientType === type && item.patientId === id)); },
    patientName(type, id) { const data = load(); return patientName(data, type, id); }
  };
})();
