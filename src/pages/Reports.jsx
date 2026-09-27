import { useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { supabase } from '../lib/supabase';

export default function Reports() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    const [{ data: noteRows, error: notesError }, { data: infantRows, error: infantsError }, { data: profileRows, error: profilesError }] = await Promise.all([
      supabase.from('care_notes').select('id, infant_id, author_id, note, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('infants').select('id, full_name, record_code'),
      supabase.from('profiles').select('id, full_name'),
    ]);
    if (notesError || infantsError || profilesError) {
      setError(notesError?.message || infantsError?.message || profilesError?.message || 'Could not load care notes.');
    } else {
      const infantNames = new Map((infantRows || []).map(item => [item.id, item]));
      const authorNames = new Map((profileRows || []).map(item => [item.id, item.full_name]));
      setNotes((noteRows || []).map(item => ({ ...item, infant: infantNames.get(item.infant_id), author: authorNames.get(item.author_id) || 'Caregiver' })));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return <AdminShell page="reports"><main className="main-content directory-page"><header className="page-header"><div><p className="eyebrow">Care reports</p><h1>Caregiver notes</h1><p>Recent observations submitted by approved caregivers for linked infants.</p></div><button className="primary-button" onClick={load} disabled={loading}><i className="fa-solid fa-rotate" /> {loading ? 'Loading…' : 'Refresh'}</button></header><section className="summary-grid"><article><i className="fa-solid fa-note-sticky" /><span><b>{notes.length}</b><small>Recent care notes</small></span></article><article><i className="fa-solid fa-baby" /><span><b>{new Set(notes.map(note => note.infant_id)).size}</b><small>Infants with notes</small></span></article><article><i className="fa-solid fa-user-heart" /><span><b>{new Set(notes.map(note => note.author_id)).size}</b><small>Caregivers reporting</small></span></article></section>{error && <p className="care-error" role="alert">{error}</p>}<section className="directory-panel"><div className="caregiver-table-head"><div><h2>Recent notes</h2><p>Newest caregiver observation appears first.</p></div></div><div className="table-wrap"><table><thead><tr><th>Infant</th><th>Caregiver</th><th>Observation</th><th>Submitted</th></tr></thead><tbody>{loading ? <tr><td colSpan="4" className="admin-empty">Loading care notes…</td></tr> : notes.length ? notes.map(note => <tr key={note.id}><td><strong>{note.infant?.full_name || 'Linked infant'}</strong><small>{note.infant?.record_code || 'Record ID unavailable'}</small></td><td>{note.author}</td><td>{note.note}</td><td>{new Date(note.created_at).toLocaleString()}</td></tr>) : <tr><td colSpan="4" className="admin-empty">No caregiver notes have been submitted yet.</td></tr>}</tbody></table></div></section></main></AdminShell>;
}
