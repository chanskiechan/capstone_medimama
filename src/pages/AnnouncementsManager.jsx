import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { supabase } from '../lib/supabase';

const Icon = ({ name }) => <i className={`fa-solid fa-${name}`} />;

export default function AnnouncementsManager() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const visible = useMemo(() => items.filter(item => !item.archived), [items]);
  const load = async () => { setLoading(true); const { data, error } = await supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }); setLoading(false); if (error) return setNotice(`Could not load announcements: ${error.message}`); setItems(data || []); };
  useEffect(() => { load(); }, []);
  const save = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { title: values.title.trim(), description: values.description.trim(), audience: values.audience, priority: values.priority };
    const query = editing?.id ? supabase.from('announcements').update(payload).eq('id', editing.id) : supabase.from('announcements').insert(payload);
    const { error } = await query;
    if (error) return setNotice(`Could not publish announcement: ${error.message}`);
    setEditing(null); setNotice(editing?.id ? 'Announcement updated.' : 'Announcement published.'); load();
  };
  const archive = async item => { const { error } = await supabase.from('announcements').update({ archived: !item.archived }).eq('id', item.id); if (error) return setNotice(`Could not update announcement: ${error.message}`); setNotice(item.archived ? 'Announcement restored.' : 'Announcement archived.'); load(); };
  return <AdminShell page="announcements"><main className="main-content announcements-page"><header className="page-header"><div><p className="eyebrow">Communication center</p><h1>Announcements</h1><p className="page-description">Publish updates that mothers can see on their dashboard.</p></div><button className="primary-button" onClick={() => setEditing({})}><Icon name="plus" /> New announcement</button></header><section className="announcement-stats"><article><b>{visible.length}</b><span>Published</span></article><article><b>{items.filter(item => item.archived).length}</b><span>Archived</span></article><article><b>{items.filter(item => item.pinned).length}</b><span>Pinned</span></article></section>{notice && <p className="admin-toast" role="status">{notice}</p>}<section className="announcement-list">{loading ? <p className="admin-empty">Loading announcements…</p> : items.map(item => <article className={`announcement-card${item.archived ? ' archived' : ''}`} key={item.id}><div className="card-content"><div className="card-top"><h2>{item.title}</h2><span className={`pill ${item.priority.toLowerCase()}`}>{item.priority} priority</span></div><div className="card-meta"><span><Icon name="users" /> {item.audience}</span><span>{new Date(item.created_at).toLocaleDateString()}</span></div><p className="card-description">{item.description}</p></div><div className="card-actions"><button className="icon-button" title="Edit" onClick={() => setEditing(item)}><Icon name="pen" /></button><button className="icon-button" title={item.archived ? 'Restore' : 'Archive'} onClick={() => archive(item)}><Icon name={item.archived ? 'box-open' : 'box-archive'} /></button></div></article>)}</section>{editing && <div className="admin-modal" onMouseDown={event => event.target === event.currentTarget && setEditing(null)}><section role="dialog" aria-modal="true"><button className="close" onClick={() => setEditing(null)} aria-label="Close">×</button><p className="eyebrow">Health center update</p><h2>{editing.id ? 'Edit announcement' : 'New announcement'}</h2><form className="admin-form" onSubmit={save}><label className="full">Title<input name="title" maxLength="160" required defaultValue={editing.title || ''} /></label><label className="full">Message<textarea name="description" maxLength="2000" required defaultValue={editing.description || ''} /></label><label>Audience<select name="audience" defaultValue={editing.audience || 'Mothers & caregivers'}><option>Mothers & caregivers</option><option>Everyone</option></select></label><label>Priority<select name="priority" defaultValue={editing.priority || 'Normal'}><option>Low</option><option>Normal</option><option>High</option></select></label><div className="admin-form-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button">Publish</button></div></form></section></div>}</main></AdminShell>;
}
