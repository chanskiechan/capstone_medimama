export const seed = {
  mothers: [
    { id: 'M-2026-0001', name: 'Shaina Santos', age: 29, contact: '0917 555 2026', address: 'Bucandala II, Imus City', bloodType: 'O+', status: 'Postnatal', risk: 'Routine', infantIds: ['I-2026-0001'], records: [{ date: '2026-08-14', type: 'Postnatal check-up', details: 'Blood pressure stable; breastfeeding support provided.' }] },
    { id: 'M-2026-0002', name: 'Liza Dela Cruz', age: 31, contact: '0918 555 0152', address: 'Purok 5, San Isidro', bloodType: 'A+', status: 'Pregnant', risk: 'Routine', infantIds: [], records: [{ date: '2026-08-20', type: 'Prenatal check-up', details: '32-week assessment completed.' }] },
  ],
  infants: [{ id: 'I-2026-0001', name: 'Baby Patrick Ibanez', birthDate: '2026-06-15', sex: 'Male', motherId: 'M-2026-0001', bloodType: 'O+', status: 'Active', growth: [{ date: '2026-08-14', weight: '5.2', length: '58', notes: 'Healthy growth curve.' }], vaccines: [{ vaccine: 'BCG', dose: 'Birth dose', date: '2026-06-15', status: 'Complete' }, { vaccine: 'Pentavalent', dose: 'Dose 1', date: '2026-09-15', status: 'Due' }], records: [] }],
  appointments: [{ id: 'A-001', patient: 'Baby Patrick Ibanez', service: 'Infant Immunization', date: '2026-09-15', time: '09:00', status: 'Scheduled' }],
  concerns: [],
  caregivers: [{ id: 'C-001', name: 'Juan Dela Cruz', relationship: 'Father', infantId: 'I-2026-0001', permissions: 'View records, care notes, symptom reports', status: 'Approved' }],
};

export const createId = (prefix, suffix = Math.random().toString(36).slice(2, 5)) => `${prefix}-${Date.now()}-${suffix}`;
