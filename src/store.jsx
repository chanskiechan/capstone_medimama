import { createContext, useContext, useState } from 'react';
import { seed } from './data';

const Store = createContext(null);
const storageKey = 'medimama-react-data';

export function StoreProvider({ children }) {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || seed; } catch { return seed; }
  });
  const save = (updater) => setData((current) => {
    const next = typeof updater === 'function' ? updater(current) : updater;
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });
  return <Store.Provider value={{ data, save }}>{children}</Store.Provider>;
}

export const useStore = () => useContext(Store);
