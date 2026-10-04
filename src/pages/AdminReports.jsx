import { useMemo, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { useStore } from '../store';
import './AdminReports.css';

const displaySex = value => {
  const normalized = String(value || '').toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Not recorded';
};

export default function AdminReports() {
  const { data, storageError } = useStore();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [genderFilter, setGenderFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const records = useMemo(() => {
    const mothers = data.mothers.filter(mother => !mother.archived).map(mother => ({
      id: `mother-${mother.id}`, type: 'Mother', name: mother.name || mother.full_name || 'Unnamed mother', gender: 'Female', status: mother.status || 'Not recorded', linkedMother: '—', recordCode: mother.recordCode || mother.record_code || mother.id,
    }));
    const infants = data.infants.filter(infant => !infant.archived).map(infant => ({
      id: `infant-${infant.id}`, type: 'Infant', name: infant.name || infant.full_name || 'Unnamed infant', gender: displaySex(infant.sex), status: infant.status || 'Not recorded', linkedMother: data.mothers.find(mother => mother.id === infant.motherId)?.name || 'Unlinked', recordCode: infant.recordCode || infant.record_code || infant.id,
    }));
    return [...mothers, ...infants].sort((a, b) => `${a.type} ${a.name}`.localeCompare(`${b.type} ${b.name}`));
  }, [data]);
  const statuses = [...new Set(records.map(record => record.status))].sort();
  const shown = records.filter(record => (typeFilter === 'All' || record.type === typeFilter) && (genderFilter === 'All' || record.gender === genderFilter) && (statusFilter === 'All' || record.status === statusFilter) && `${record.type} ${record.name} ${record.gender} ${record.status} ${record.linkedMother} ${record.recordCode}`.toLowerCase().includes(query.toLowerCase()));
  const clearFilters = () => { setQuery(''); setTypeFilter('All'); setGenderFilter('All'); setStatusFilter('All'); };
  const mothersCount = data.mothers.filter(mother => !mother.archived).length;
  const femaleInfants = data.infants.filter(infant => !infant.archived && String(infant.sex || '').toLowerCase() === 'female').length;
  const maleInfants = data.infants.filter(infant => !infant.archived && String(infant.sex || '').toLowerCase() === 'male').length;
  return <AdminShell page="reports"><main className="main-content directory-page reports-page"><header className="page-header"><div><p className="eyebrow">Patient summary</p><h1>Reports</h1><p>View registered mothers and infants by gender and current status.</p></div></header>{storageError && <p className="admin-toast" role="alert">{storageError}</p>}<section className="reports-summary-stats" aria-label="Patient totals"><article><i className="fa-solid fa-person-pregnant" /><div><strong>{mothersCount}</strong><span>Registered mothers</span></div></article><article><i className="fa-solid fa-child-dress" /><div><strong>{femaleInfants}</strong><span>Female infants</span></div></article><article><i className="fa-solid fa-child" /><div><strong>{maleInfants}</strong><span>Male infants</span></div></article></section><section className="directory-panel patient-report-panel"><div className="patient-report-filters"><label className="report-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><span className="sr-only">Search records</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, gender, status, or record ID" /></label><label><span>Patient type</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option>All</option><option>Mother</option><option>Infant</option></select></label><label><span>Gender</span><select value={genderFilter} onChange={event => setGenderFilter(event.target.value)}><option>All</option><option>Female</option><option>Male</option></select></label><label><span>Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><button type="button" className="clear-report-filters" onClick={clearFilters}><i className="fa-solid fa-rotate-left" aria-hidden="true" /> Clear</button></div><div className="table-wrap"><table><thead><tr><th>Patient type</th><th>Name</th><th>Gender</th><th>Status</th><th>Linked mother</th><th>Record ID</th></tr></thead><tbody>{shown.length ? shown.map(record => <tr key={record.id}><td><span className={`report-type ${record.type.toLowerCase()}`}>{record.type}</span></td><td><strong>{record.name}</strong></td><td>{record.gender}</td><td><span className="status">{record.status}</span></td><td>{record.linkedMother}</td><td>{record.recordCode}</td></tr>) : <tr><td colSpan="6" className="admin-empty">No patient records match the current filters.</td></tr>}</tbody></table></div></section></main></AdminShell>;
}
