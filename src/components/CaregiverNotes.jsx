import { useEffect, useState } from 'react';
import { session } from '../care';
import { supabase } from '../lib/supabase';
import './CareWorkspace.css';

export default function CaregiverNotes() {
  const user = session();
  const [infants, setInfants] = useState([]);
  const [notes, setNotes] = useState([]);
  const [infantId, setInfantId] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadNotes = async () => {
    const [{ data: rows, error }, { data: linkedInfants, error: infantsError }] = await Promise.all([
      supabase.from('care_notes').select('id, infant_id, note, created_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('infants').select('id, full_name, record_code').order('full_name'),
    ]);
    if (infantsError) setNotice(infantsError.message);
    else setInfants(linkedInfants || []);
    if (error) setNotice(error.message); else setNotes(rows || []);
  };
  useEffect(() => { loadNotes(); }, []);
  useEffect(() => { if (!infantId && infants[0]) setInfantId(infants[0].id); }, [infants, infantId]);

  const submit = async event => {
    event.preventDefault();
    if (!infantId || !note.trim()) return;
    setBusy(true); setNotice('');
    const { error } = await supabase.from('care_notes').insert({ infant_id: infantId, note: note.trim(), author_id: user.id });
    setBusy(false);
    if (error) return setNotice(error.message);
    setNote(''); setNotice('Care note saved for the health center.'); loadNotes();
  };
  const infantName = id => infants.find(infant => infant.id === id)?.full_name || 'Linked infant';
  return <section className="care-workspace caregiver-notes">
    <article className="care-card"><h2>Care notes</h2><p className="care-muted">Share a short observation about a linked infant. These notes are visible to the health center.</p>
      {!infants.length ? <p className="care-empty">No linked infants are available in Supabase yet. Ask the administrator to approve and link this caregiver to the mother record.</p> : <form className="care-form" onSubmit={submit}><label>Infant<select value={infantId} onChange={event => setInfantId(event.target.value)}>{infants.map(infant => <option key={infant.id} value={infant.id}>{infant.full_name}</option>)}</select></label><label>Note<textarea value={note} maxLength="3000" onChange={event => setNote(event.target.value)} placeholder="Example: Baby has a mild cough since yesterday." required /></label><button className="family-primary" disabled={busy}>{busy ? 'Saving...' : 'Save care note'}</button></form>}
      {notice && <p className="care-note-notice">{notice}</p>}
    </article>
    <article className="care-card"><h2>Recent notes</h2>{notes.length ? <div className="care-note-list">{notes.map(item => <div key={item.id}><strong>{infantName(item.infant_id)}</strong><p>{item.note}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>)}</div> : <p className="care-empty">No care notes yet.</p>}</article>
  </section>;
}
