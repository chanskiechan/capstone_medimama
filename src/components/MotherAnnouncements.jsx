import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { announcementScheduleLabel } from '../lib/announcements';
import './MotherAnnouncements.css';

export default function MotherAnnouncements() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.from('announcements').select('id,title,description,audience,priority,created_at,event_date,event_time').eq('archived', false).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3).then(({ data, error: loadError }) => { if (!active) return; if (loadError) setError('Announcements are unavailable right now.'); else setItems(data || []); });
    return () => { active = false; };
  }, []);
  return <>
    <section className="mother-announcements" aria-label="Health center announcements">
      <div className="mother-announcements-heading"><div><p>Health center</p><h2>Announcements</h2></div><i className="fa-solid fa-bullhorn" aria-hidden="true" /></div>
      {error ? <p className="mother-announcements-empty">{error}</p> : items.length ? <div className="mother-announcement-list">{items.map(item => <article key={item.id} className={`mother-announcement ${item.priority.toLowerCase()}`}><span><i className="fa-solid fa-bullhorn" /></span><div className="mother-announcement-content"><h3>{item.title}</h3>{item.event_date && <strong className="mother-announcement-schedule"><i className="fa-regular fa-calendar" aria-hidden="true" /> When: {announcementScheduleLabel(item.event_date, item.event_time)}</strong>}<p>{item.description}</p><div className="mother-announcement-footer"><small>Published {new Date(item.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</small><button type="button" className="mother-announcement-details" onClick={() => setSelected(item)}>View details <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button></div></div></article>)}</div> : <p className="mother-announcements-empty">No announcements from the health center yet.</p>}
    </section>
    {selected && <div className="mother-announcement-modal" role="presentation" onMouseDown={event => event.target === event.currentTarget && setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="mother-announcement-title"><button type="button" className="mother-announcement-modal-close" onClick={() => setSelected(null)} aria-label="Close announcement"><i className="fa-solid fa-xmark" aria-hidden="true" /></button><p className="mother-announcement-modal-eyebrow">Health center announcement</p><h2 id="mother-announcement-title">{selected.title}</h2>{selected.event_date && <p className="mother-announcement-modal-schedule"><i className="fa-regular fa-calendar" aria-hidden="true" /> <strong>When:</strong> {announcementScheduleLabel(selected.event_date, selected.event_time)}</p>}<p className="mother-announcement-modal-message">{selected.description}</p><div className="mother-announcement-modal-meta"><span>{selected.audience || 'Mothers & caregivers'}</span><span>{selected.priority} priority</span><small>Published {new Date(selected.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })}</small></div><button type="button" className="mother-announcement-modal-button" onClick={() => setSelected(null)}>Close</button></section></div>}
  </>;
}
