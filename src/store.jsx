import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { normalize, session } from './care';
import { supabase } from './lib/supabase';
import { hydratePatients, appointmentDateTime } from './lib/clinical';
import { withDemoFamily } from './demo';
const Store = createContext(null);
const empty = () => normalize({});
export function StoreProvider({ children }) {
  const [data, setData] = useState(() => session().demo ? withDemoFamily(empty()) : empty());
  const currentData = useRef(data), requestVersion = useRef(0);
  const [storageError, setStorageError] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  const refreshPatientData = useCallback(async () => {
    const version = ++requestVersion.current;
    if (session().demo) return;
    setLoadingRecords(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) { currentData.current = empty(); setData(empty()); return; }
      const tables = ['mothers', 'infants', 'mother_accounts', 'caregiver_assignments', 'appointments', 'maternal_records', 'growth_records', 'vaccinations', 'infant_records'];
      const results = await Promise.all(tables.map(async table => {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const result = await supabase.from(table).select('*').order(table === 'mother_accounts' ? 'mother_id' : 'id').range(offset, offset + 499);
          if (result.error) return result;
          rows.push(...result.data);
          if (result.data.length < 500) return { data: rows };
        }
      }));
      const problem = results.find(result => result.error);
      if (problem) throw problem.error;
      if (version !== requestVersion.current || session().demo) return;
      const [mothers, infants, links, assignments, appointments, maternal, growth, vaccinations, infantRecords] = results.map(r => r.data || []);
      const patients = hydratePatients(mothers, infants, maternal, growth, vaccinations, infantRecords);
      const next = normalize({ ...patients,
        mothers: patients.mothers.map(m => ({ ...m, accountId: links.find(l => l.mother_id === m.id)?.user_id })),
        caregivers: assignments.map(a => ({ ...a, accountId: a.caregiver_id, motherId: a.mother_id, status: a.status[0].toUpperCase() + a.status.slice(1) })),
        appointments: appointments.map(a => ({ ...a, patientId: a.mother_id || a.infant_id, patient: [...patients.mothers, ...patients.infants].find(p => p.id === (a.mother_id || a.infant_id))?.name || 'Linked patient', ...appointmentDateTime(a.scheduled_at), status: a.status[0].toUpperCase() + a.status.slice(1) })),
      });
      currentData.current = next; setData(next); setStorageError('');
    } catch (error) {
      if (version === requestVersion.current) setStorageError(`Could not load shared records: ${error.message}. If the database update has not been applied, run migration 016.`);
    } finally { if (version === requestVersion.current) setLoadingRecords(false); }
  }, []);
  useEffect(() => {
    refreshPatientData();
    const { data: listener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { ++requestVersion.current; currentData.current = empty(); setData(empty()); }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(refreshPatientData, 0);
    });
    window.addEventListener('focus', refreshPatientData);
    const timer = window.setInterval(refreshPatientData, 15000);
    return () => { listener.subscription.unsubscribe(); window.removeEventListener('focus', refreshPatientData); clearInterval(timer); };
  }, [refreshPatientData]);
  const save = updater => {
    try {
      const next = typeof updater === 'function' ? updater(currentData.current) : updater;
      currentData.current = next; setData(next); return true;
    } catch { setStorageError('Changes could not be saved.'); return false; }
  };
  return <Store.Provider value={{ data, save, storageError, loadingRecords, refreshPatientData }}>{children}</Store.Provider>;
}
export const useStore = () => useContext(Store);
