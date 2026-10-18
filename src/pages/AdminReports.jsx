import { AdminShell } from '../components/AdminShell';
import { useStore } from '../store';
import { useState } from 'react';
import { infantAgeStatus } from '../care';
import './AdminReports.css';

const isCancelled = appointment => ['Cancelled', 'cancelled'].includes(appointment.status);
const appointmentType = service => {
  const name = String(service || '').toLowerCase();
  if (name.includes('prenatal')) return 'prenatal';
  if (name.includes('postnatal')) return 'postnatal';
  if (name.includes('immunization') || name.includes('vaccine')) return 'immunization';
  return '';
};

function ReportsSummary() {
  const { data } = useStore();
  const mothers = data.mothers.filter(item => !item.archived && item.status !== 'Archived');
  const infants = data.infants.filter(item => !item.archived && item.status !== 'Archived');
  const appointments = data.appointments.filter(item => !isCancelled(item));
  const patientRows = [
    ['fa-person-pregnant', mothers.length, 'Registered mothers'],
    ['fa-mars', infants.filter(item => String(item.sex || '').toLowerCase() === 'male').length, 'Male infants'],
    ['fa-venus', infants.filter(item => String(item.sex || '').toLowerCase() === 'female').length, 'Female infants'],
  ];
  const appointmentRows = [
    ['fa-calendar-check', appointments.filter(item => appointmentType(item.service) === 'prenatal').length, 'Prenatal appointments'],
    ['fa-calendar-days', appointments.filter(item => appointmentType(item.service) === 'postnatal').length, 'Postnatal appointments'],
    ['fa-syringe', appointments.filter(item => appointmentType(item.service) === 'immunization').length, 'Immunization appointments'],
  ];
  const cards = [...patientRows, ...appointmentRows];
  return <section className="reports-summary-stats" aria-label="Patient and appointment summary">{cards.map(([icon, value, label]) => <article key={label}><i className={`fa-solid ${icon}`} aria-hidden="true" /><div><strong>{value}</strong><span>{label}</span></div></article>)}</section>;
}

function ReportsDetails() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 7;
  const mothers = data.mothers.filter(item => !item.archived && item.status !== 'Archived').map(item => ({
    id: `mother-${item.id}`,
    type: 'Mother',
    name: item.name || 'Unnamed mother',
    details: item.status || 'Not recorded',
    date: item.birthDate || '—',
    status: item.status || 'Active',
    search: `${item.name} ${item.status} ${item.id}`,
  }));
  const infants = data.infants.filter(item => !item.archived && item.status !== 'Archived').map(item => ({
    id: `infant-${item.id}`,
    type: 'Infant',
    name: item.name || 'Unnamed infant',
    details: `${item.sex || 'Sex not recorded'} · ${infantAgeStatus(item.birthDate)} · Mother: ${data.mothers.find(mother => mother.id === item.motherId)?.name || 'Not linked'}`,
    date: item.birthDate || '—',
    status: item.status || 'Active',
    search: `${item.name} ${item.sex} ${item.id} ${item.motherId}`,
  }));
  const appointments = data.appointments.filter(item => !isCancelled(item)).map(item => {
    const patient = [...data.mothers, ...data.infants].find(record => record.id === item.patientId);
    return {
      id: `appointment-${item.id}`,
      type: 'Appointment',
      name: item.patient || patient?.name || 'Linked patient',
      details: `${item.service || 'Appointment'}${item.date ? ` · ${item.date}${item.time ? ` at ${item.time}` : ''}` : ''}`,
      date: patient?.birthDate || '—',
      status: item.status || 'Not recorded',
      search: `${item.patient} ${item.service} ${item.status} ${item.date} ${item.time}`,
    };
  });
  const allRows = [...mothers, ...infants, ...appointments];
  const rows = allRows.filter(row => (filter === 'All' || row.type === filter) && `${row.type} ${row.name} ${row.details} ${row.date} ${row.status} ${row.search}`.toLowerCase().includes(query.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstRow = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, rows.length);
  return <section className="reports-details-panel" aria-label="All patient and appointment records"><div className="reports-details-heading"><div><h2>All Records</h2><span>{rows.length} matching records</span></div><div className="reports-details-filters"><label><span className="sr-only">Search records</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search mother, infant, or appointment" /></label><label><span className="sr-only">Filter records</span><select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option>All</option><option>Mother</option><option>Infant</option><option>Appointment</option></select></label></div></div><div className="reports-details-table-wrap"><table><thead><tr><th>Type</th><th>Name / Patient</th><th>Details</th><th>Birthdate</th><th>Status</th></tr></thead><tbody>{rows.length ? visibleRows.map(row => <tr key={row.id}><td><span className={`reports-record-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td>{row.name}</td><td>{row.details}</td><td>{row.date}</td><td>{row.status}</td></tr>) : null}</tbody></table></div>{rows.length > 0 && <div className="reports-pagination"><span>Showing {firstRow}–{lastRow} of {rows.length}</span><div><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><strong>Page {currentPage} of {totalPages}</strong><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></div></div>}</section>;
}

export default function AdminReports() {
  return <AdminShell page="reports"><main className="main-content directory-page reports-page"><ReportsSummary /><ReportsDetails /></main></AdminShell>;
}
