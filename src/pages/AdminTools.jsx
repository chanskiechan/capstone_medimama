import { useSearchParams } from 'react-router-dom';
import Archives from './Archives';
import { useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { validateBackup } from '../lib/backup';
import { today } from '../care';
import './Support.css';

const auditEntityNames = {
  mothers: 'Mother profile',
  infants: 'Infant profile',
  maternal_records: 'Maternal health record',
  growth_records: 'Growth record',
  vaccinations: 'Immunization record',
  infant_records: 'Infant health record',
  appointments: 'Appointment',
  health_concerns: 'Health report',
  caregiver_assignments: 'Caregiver link',
  announcements: 'Announcement',
  profiles: 'Account profile'
};

const auditEntityName = entity => auditEntityNames[entity] || entity.replaceAll('_', ' ');
const auditActionName = event => {
  const action = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Archived' }[event.action] || event.action;
  return `${action} ${auditEntityName(event.entity).toLowerCase()}`;
};
const auditReference = recordId => recordId ? `Reference ${recordId.slice(0, 8).toUpperCase()}` : 'General system activity';
const auditTechnicalId = recordId => recordId ? `ID: ${recordId.slice(0, 8)}...${recordId.slice(-4)}` : 'No linked record';
const auditRoleName = role => ({ admin: 'Administrator', mother: 'Mother', caregiver: 'Caregiver' }[role] || role || 'System process');
const auditTime = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });

export default function AdminTools() {
  const [params, setParams] = useSearchParams();
  const tab = ['backup', 'audit', 'archives'].includes(params.get('tab')) ? params.get('tab') : 'backup';
  const setTab = value => setParams({ tab: value });
  const [events, setEvents] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('All');
  const [auditEntity, setAuditEntity] = useState('All');
  const { refreshPatientData } = useStore();
  const project = new URL(import.meta.env.VITE_SUPABASE_URL).origin;

  const loadAudit = async () => {
    setBusy(true);
    setError('');
    try {
      let auditQuery = supabase.from('audit_events').select('*');
      if (auditAction !== 'All') auditQuery = auditQuery.eq('action', auditAction);
      if (auditEntity !== 'All') auditQuery = auditQuery.eq('entity', auditEntity);
      const { data, error: problem } = await auditQuery.order('created_at', { ascending: false }).order('id').range(page * 50, page * 50 + 49);
      if (problem) throw problem;
      const actorIds = [...new Set((data || []).map(event => event.actor_id).filter(Boolean))];
      let actors = {};
      if (actorIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name,role').in('id', actorIds);
        actors = Object.fromEntries((profiles || []).map(profile => [profile.id, profile]));
      }
      setEvents((data || []).map(event => ({ ...event, actor: actors[event.actor_id] })));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (tab === 'audit') loadAudit();
  }, [tab, page, auditAction, auditEntity]);

  const filteredEvents = events.filter(event => {
    const search = auditSearch.trim().toLowerCase();
    if (!search) return true;
    return `${auditActionName(event)} ${auditEntityName(event.entity)} ${event.actor?.full_name || ''} ${auditReference(event.record_id)} ${event.record_id || ''}`.toLowerCase().includes(search);
  });
  const clearAuditFilters = () => {
    setAuditSearch('');
    setAuditAction('All');
    setAuditEntity('All');
    setPage(0);
  };

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const { data, error: problem } = await supabase.rpc('export_clinical_backup');
      if (problem) throw problem;
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, project }, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `medimama-clinical-${today()}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Clinical backup downloaded. Store it privately; it contains patient information.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const choose = async event => {
    setFile(null);
    setPreview([]);
    setNotice('');
    setError('');
    const selected = event.target.files[0];
    if (!selected) return;
    try {
      if (selected.size > 25 * 1024 * 1024) throw Error('Choose a backup smaller than 25 MB.');
      const value = JSON.parse(await selected.text());
      setPreview(validateBackup(value, project));
      setFile(value);
    } catch (e) {
      setError(e.message);
    }
  };

  const restore = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: problem } = await supabase.rpc('restore_clinical_backup', { backup_json: file });
      if (problem) throw problem;
      await refreshPatientData();
      setNotice(`Restored ${Object.values(data).reduce((total, count) => total + count, 0)} missing records. Existing records were kept.`);
      setFile(null);
      setPreview([]);
    } catch (e) {
      setError(`Restore failed; no partial restore was saved. ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell page="system">
      <main className="main-content system-page">
        <header className="page-header system-settings-header">
          <div>
            <p className="eyebrow">ADMINISTRATION</p>
            <h1>System Settings</h1>
            <p>Archives, clinical backups and recorded account activity.</p>
          </div>
        </header>

        <nav className="support-nav system-settings-tabs" aria-label="System tools">
          <button type="button" className="family-primary" onClick={() => setTab('backup')} aria-pressed={tab === 'backup'}>Backup &amp; restore</button>
          <button type="button" className="family-primary" onClick={() => setTab('audit')} aria-pressed={tab === 'audit'}>Activity log</button>
          <button type="button" className="family-primary" onClick={() => setTab('archives')} aria-pressed={tab === 'archives'}>Archives</button>
        </nav>

        {(error || notice) && <div className="system-tools-feedback">
          {error && <p role="alert" className="support-message">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>}

        <div className="system-tools-content">
          {tab === 'archives' ? <Archives /> : tab === 'backup' ? (
            <div className="system-settings-grid">
              <section className="support-panel system-settings-card">
                <div className="system-card-heading">
                  <div>
                    <p className="system-card-eyebrow">CLINICAL DATA</p>
                    <h2>Download clinical backup</h2>
                  </div>
                  <span className="system-card-icon" aria-hidden="true">↓</span>
                </div>
                <p>Includes patient profiles, clinical histories and appointments from this project. Login accounts and account links are not included.</p>
                <div className="system-card-footer">
                  <span className="system-card-meta">JSON export</span>
                  <button type="button" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download backup'}</button>
                </div>
              </section>

              <section className="support-panel system-settings-card">
                <div className="system-card-heading">
                  <div>
                    <p className="system-card-eyebrow">SAFE RESTORE</p>
                    <h2>Restore missing records</h2>
                  </div>
                  <span className="system-card-icon pink" aria-hidden="true">↺</span>
                </div>
                <p>Choose a backup from this same project. Only missing record IDs are restored; current records are never overwritten.</p>
                <label className="system-file-field">
                  <span>Backup file</span>
                  <input type="file" accept=".json,application/json" onChange={choose} disabled={busy} />
                </label>
                {file && <div className="system-restore-preview">
                  <p><strong>Exported:</strong> {file.exported_at}</p>
                  <ul>{preview.map(item => <li key={item.table}>{item.table}: {item.count} records</li>)}</ul>
                  <button type="button" onClick={restore} disabled={busy}>{busy ? 'Restoring…' : 'Restore missing records'}</button>
                </div>}
              </section>
            </div>
          ) : (
            <section className="support-panel system-settings-card audit-log-card">
              <div className="system-card-heading audit-card-heading">
                <div>
                  <p className="system-card-eyebrow">SYSTEM ACTIVITY</p>
                  <h2>Activity history</h2>
                  <p>See when important records were created, updated, or archived and who performed the action.</p>
                </div>
                <button type="button" className="system-secondary-button" onClick={loadAudit} disabled={busy}>{busy ? 'Loading…' : '↻ Refresh'}</button>
              </div>
              <div className="audit-filters" aria-label="Filter activity history">
                <label>Search activity<input value={auditSearch} onChange={event => setAuditSearch(event.target.value)} placeholder="Search action, record, or person" /></label>
                <label>Action<select value={auditAction} onChange={event => { setAuditAction(event.target.value); setPage(0); }}><option>All</option><option value="INSERT">Created</option><option value="UPDATE">Updated</option><option value="DELETE">Archived</option></select></label>
                <label>Record type<select value={auditEntity} onChange={event => { setAuditEntity(event.target.value); setPage(0); }}><option>All</option>{Object.entries(auditEntityNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <button type="button" className="system-secondary-button audit-clear-button" onClick={clearAuditFilters} disabled={!auditSearch && auditAction === 'All' && auditEntity === 'All'}>Clear filters</button>
              </div>
              <div className="support-table-wrap system-table-wrap">
                <table className="support-table">
                  <thead><tr><th>Date &amp; time</th><th>What happened</th><th>Record</th><th>Performed by</th></tr></thead>
                  <tbody>{filteredEvents.map(event => <tr key={event.id}><td><time dateTime={event.created_at}>{auditTime(event.created_at)}</time></td><td className="audit-action-cell"><strong>{auditActionName(event)}</strong><small>{auditEntityName(event.entity)}</small></td><td className="audit-record-cell" title={event.record_id || undefined}><strong>{auditReference(event.record_id)}</strong><small>{auditTechnicalId(event.record_id)}</small></td><td className="audit-actor-cell"><strong>{event.actor?.full_name || (event.actor_id ? 'User account' : 'System process')}</strong><small>{event.actor ? auditRoleName(event.actor.role) : 'Automated action'}</small></td></tr>)}</tbody>
                </table>
              </div>
              {!busy && !events.length && <div className="system-empty-state"><strong>No activity on this page.</strong><span>Recorded account actions will appear here.</span></div>}
              {!busy && events.length > 0 && !filteredEvents.length && <div className="system-empty-state"><strong>No matching activity.</strong><span>Try another search or clear the filters.</span></div>}
              <div className="support-actions audit-pagination">
                <button type="button" className="system-secondary-button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page + 1}</span>
                <button type="button" className="system-secondary-button" disabled={busy || events.length < 50} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </section>
          )}
        </div>
      </main>
    </AdminShell>
  );
}

export function AdminProfile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) throw Error('Please sign in again.');
        const { data, error: problem } = await supabase.from('profiles').select('id,full_name,phone').eq('id', auth.user.id).single();
        if (problem) throw problem;
        setProfile({ ...data, email: auth.user.email });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  const save = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const { error: problem } = await supabase.from('profiles').update({ full_name: values.full_name.trim(), phone: values.phone.trim() }).eq('id', profile.id);
      if (problem) throw problem;
      const current = JSON.parse(localStorage.getItem('medimama-current-session') || '{}');
      localStorage.setItem('medimama-current-session', JSON.stringify({ ...current, name: values.full_name.trim() }));
      setNotice('Profile saved to your account.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return <AdminShell page="system"><main className="main-content system-page"><h1>My profile</h1>{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{profile && <section className="support-panel"><form className="support-form" onSubmit={save}><label>Full name<input name="full_name" required maxLength={150} defaultValue={profile.full_name} /></label><label>Contact number<input name="phone" type="tel" maxLength={30} defaultValue={profile.phone || ''} /></label><label>Login email<input value={profile.email} readOnly /></label><button disabled={busy}>Save profile</button></form></section>}</main></AdminShell>;
}
