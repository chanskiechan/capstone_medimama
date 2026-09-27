import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { seed } from './data';
import { normalize } from './care';
import { supabase } from './lib/supabase';

const Store = createContext(null);
const storageKey = 'medimama-react-data';

export function StoreProvider({ children }) {
  const [data, setData] = useState(() => {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey)) || seed); } catch { return normalize(seed); }
  });
  const currentData = useRef(data);
  const [storageError, setStorageError] = useState('');
  const [loadingRecords, setLoadingRecords] = useState(false);
  useEffect(() => {
    const sync = event => { if (event.key === storageKey && event.newValue) { try { const next = normalize(JSON.parse(event.newValue)); currentData.current = next; setData(next); } catch {} } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const refreshPatientData = useCallback(async () => {
      setLoadingRecords(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoadingRecords(false); return; }
      const [{ data: mothers, error: mothersError }, { data: infants, error: infantsError }, { data: links, error: linksError }, { data: assignments, error: assignmentsError }, { data: appointments, error: appointmentsError }, { data: ownMotherLink, error: ownMotherLinkError }] = await Promise.all([
        supabase.from('mothers').select('*'), supabase.from('infants').select('*'),
        supabase.from('mother_accounts').select('mother_id, user_id'), supabase.from('caregiver_assignments').select('id, caregiver_id, mother_id, relationship, status'), supabase.from('appointments').select('*'),
        // Fetch the signed-in mother's link explicitly. This keeps the family
        // scope intact when an RLS policy only exposes the account's own row.
        supabase.from('mother_accounts').select('mother_id').eq('user_id', auth.user.id).maybeSingle(),
      ]);
      if (mothersError || infantsError || linksError || assignmentsError || appointmentsError || ownMotherLinkError) {
        setStorageError('Could not refresh records from Supabase. Your previously loaded records are still shown.');
        setLoadingRecords(false);
        return;
      }
      const previous = normalize(currentData.current);
      const merge = (remote, local) => [
        ...remote.map(item => {
          const existing = local.find(saved => saved.id === item.id);
          // Database fields always win, while local-only relationship metadata
          // is retained until the refreshed record supplies it.
          return existing ? { ...existing, ...item, accountId: item.accountId || existing.accountId } : item;
        }),
        ...local.filter(item => !remote.some(saved => saved.id === item.id)),
      ];
      // A caregiver's access must always reflect the live database assignment.
      // Do not keep old browser-only records, which could otherwise look like
      // an approved family link even after access has been revoked or was never
      // created in Supabase.
      const caregiverSession = (() => { try { return JSON.parse(localStorage.getItem('medimama-current-session') || '{}'); } catch { return {}; } })();
      const fallback = caregiverSession.role === 'caregiver' ? [] : previous;
      const next = normalize({
        ...previous,
        mothers: merge((mothers || []).map(m => ({ ...m, name: m.full_name, recordCode: m.record_code, accountId: (links || []).find(l => l.mother_id === m.id)?.user_id || (ownMotherLink?.mother_id === m.id ? auth.user.id : undefined), status: m.maternal_status === 'postnatal' ? 'Postnatal' : 'Pregnant', contact: m.contact_number })), fallback.mothers),
        infants: merge((infants || []).map(i => ({ ...i, name: i.full_name, recordCode: i.record_code, birthDate: i.birth_date, motherId: i.mother_id, status: i.status === 'active' ? 'Active' : 'Pending approval' })), fallback.infants),
        caregivers: merge((assignments || []).map(a => ({ id: a.id, accountId: a.caregiver_id, motherId: a.mother_id, relationship: a.relationship, status: a.status[0].toUpperCase() + a.status.slice(1) })), fallback.caregivers),
        appointments: merge((appointments || []).map(a => { const patient = a.mother_id ? (mothers || []).find(m => m.id === a.mother_id) : (infants || []).find(i => i.id === a.infant_id); return { ...a, patientId: a.mother_id || a.infant_id, patient: patient?.full_name || 'Linked patient', recordCode: patient?.record_code || '', date: a.scheduled_at.slice(0, 10), time: a.scheduled_at.slice(11, 16), service: a.service, status: a.status[0].toUpperCase() + a.status.slice(1) }; }), fallback.appointments),
      });
      currentData.current = next; setData(next); setLoadingRecords(false);
  }, []);
  useEffect(() => {
    refreshPatientData();
    // StoreProvider stays mounted while the user is on the login page. Refresh
    // after Supabase finishes signing in so linked records appear immediately.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(refreshPatientData, 0);
    });
    // Keep open admin and family screens in sync when another signed-in user
    // registers, approves, or updates a record. The interval remains as a
    // fallback for projects where Realtime has not yet been enabled.
    const realtime = supabase.channel('medimama-live-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mothers' }, refreshPatientData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'infants' }, refreshPatientData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caregiver_assignments' }, refreshPatientData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, refreshPatientData)
      .subscribe();
    const refreshOnFocus = () => refreshPatientData();
    window.addEventListener('focus', refreshOnFocus);
    const fallbackRefresh = window.setInterval(refreshPatientData, 15000);
    return () => {
      listener.subscription.unsubscribe();
      supabase.removeChannel(realtime);
      window.removeEventListener('focus', refreshOnFocus);
      window.clearInterval(fallbackRefresh);
    };
  }, [refreshPatientData]);
  const save = (updater) => {
    try {
      const stored = localStorage.getItem(storageKey);
      const current = stored ? normalize(JSON.parse(stored)) : currentData.current;
      const next = typeof updater === 'function' ? updater(current) : updater;
      localStorage.setItem(storageKey, JSON.stringify(next));
      currentData.current = next;
      setData(next);
      setStorageError('');
      return true;
    } catch {
      setStorageError('Changes were not saved. Browser storage may be full or unavailable. Export your data in System settings and try a smaller attachment.');
      return false;
    }
  };
  return <Store.Provider value={{ data, save, storageError, loadingRecords, refreshPatientData }}>{children}</Store.Provider>;
}

export const useStore = () => useContext(Store);
