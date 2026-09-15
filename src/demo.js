import { addDays, today } from './care.js';

const motherId = 'demo-mother-record';
const infantId = 'demo-infant-record';
const caregiverId = 'demo-caregiver-link';

export function demoSession(role) {
  if (!['mother', 'caregiver'].includes(role)) throw new Error('Unknown demo role');
  return { id: `demo-${role}`, name: role === 'mother' ? 'Demo Mother' : 'Demo Caregiver', role, demo: true };
}

export function withDemoFamily(data) {
  const birthDate = addDays(today(), -60);
  const measuredDate = addDays(today(), -7);
  const mother = {
    id: motherId, accountId: 'demo-mother', name: 'Demo Mother', status: 'Postnatal',
    deliveryDate: birthDate, contact: '0917 000 0000', address: 'Bucandala II, Imus City',
    infantIds: [infantId], records: [], demo: true,
  };
  const infant = {
    id: infantId, motherId, name: 'Demo Baby', birthDate, sex: 'Female', status: 'Active', demo: true,
    growth: [{ date: measuredDate, weight: '4.8', length: '56', muac: '12', source: 'Demo sample', notes: 'Sample measurements for the frontend preview.' }],
    vaccines: [{ vaccine: 'BCG', dose: 'Birth dose', date: birthDate, status: 'Complete', provider: 'Demo health worker' }],
    records: [{ date: addDays(birthDate, 14), type: 'Infant review', details: 'Sample newborn clinic visit.' }], screenings: [],
  };
  const caregiver = { id: caregiverId, accountId: 'demo-caregiver', name: 'Demo Caregiver', motherId, relationship: 'Guardian', status: 'Approved', demo: true };
  // Add sample records once. Returning to the demo preserves edits and other accounts.
  return {
    ...data,
    mothers: data.mothers.some(m => m.id === motherId) ? data.mothers : [...data.mothers, mother],
    infants: data.infants.some(i => i.id === infantId) ? data.infants : [...data.infants, infant],
    caregivers: data.caregivers.some(c => c.id === caregiverId) ? data.caregivers : [...data.caregivers, caregiver],
  };
}
