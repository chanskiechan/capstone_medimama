import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import './MotherAnnouncements.css';

export default function MotherAnnouncements() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.from('announcements').select('id,title,description,priority,created_at').eq('archived', false).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3).then(({ data, error: loadError }) => { if (!active) return; if (loadError) setError('Announcements are unavailable right now.'); else setItems(data || []); });
    return () => { active = false; };
  }, []);
  return <section className="mother-announcements" aria-label="Health center announcements"><div className="mother-announcements-heading"><div><p>Health center</p><h2>Announcements</h2></div><i className="fa-solid fa-bullhorn" aria-hidden="true" /></div>{error ? <p className="mother-announcements-empty">{error}</p> : items.length ? <div className="mother-announcement-list">{items.map(item => <article key={item.id} className={`mother-announcement ${item.priority.toLowerCase()}`}><span><i className="fa-solid fa-bullhorn" /></span><div><h3>{item.title}</h3><p>{item.description}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></div></article>)}</div> : <p className="mother-announcements-empty">No announcements from the health center yet.</p>}</section>;
}
