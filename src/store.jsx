import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { seed } from './data';
import { normalize } from './care';

const Store = createContext(null);
const storageKey = 'medimama-react-data';

export function StoreProvider({ children }) {
  const [data, setData] = useState(() => {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey)) || seed); } catch { return normalize(seed); }
  });
  const currentData = useRef(data);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    const sync = event => { if (event.key === storageKey && event.newValue) { try { const next = normalize(JSON.parse(event.newValue)); currentData.current = next; setData(next); } catch {} } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
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
  return <Store.Provider value={{ data, save, storageError }}>{children}</Store.Provider>;
}

export const useStore = () => useContext(Store);
