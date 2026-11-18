import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { useStore } from '../store';
import { infantAgeStatus, session } from '../care';
import { supabase } from '../lib/supabase';
import './AdminReports.css';

const isCancelled = appointment => String(appointment?.status || '').toLowerCase() === 'cancelled';
const isActive = item => !item?.archived && String(item?.status || '').toLowerCase() !== 'archived';
const appointmentType = service => {
  const name = String(service || '').toLowerCase();
  if (name.includes('prenatal')) return 'Prenatal';
  if (name.includes('postnatal')) return 'Postnatal';
  if (name.includes('immunization') || name.includes('vaccine')) return 'Immunization';
  return 'Other';
};

const eventValue = item => item?.created_at || item?.createdAt || item?.record_date || item?.date || item?.scheduled_at || '';
const eventDate = value => {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const statusLabel = value => {
  const status = String(value || 'Not recorded').trim().toLowerCase();
  if (status === 'done' || status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'rescheduled') return 'Rescheduled';
  if (status === 'pending' || status === 'scheduled' || status === 'approved') return 'Pending';
  return value || 'Not recorded';
};

async function loadExtraRows(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(columns).order('created_at', { ascending: false }).range(offset, offset + 499);
    if (error) return [];
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

function useReportExtras() {
  const [extras, setExtras] = useState({ concerns: [], announcements: [] });
  useEffect(() => {
    let mounted = true;
    if (session().demo) return undefined;
    Promise.all([
      loadExtraRows('health_concerns', 'id,status,category,created_at'),
      loadExtraRows('announcements', 'id,priority,created_at'),
    ]).then(([concerns, announcements]) => {
      if (mounted) setExtras({ concerns, announcements });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  return extras;
}

function MetricCard({ icon, value, label, note, tone = 'blue' }) {
  return <article className={`analytics-metric ${tone}`}>
    <span className="analytics-metric-icon"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
    <div><strong>{value.toLocaleString()}</strong><span>{label}</span>{note && <small>{note}</small>}</div>
  </article>;
}

function MotherStatusLineGraph({ rows, total }) {
  const denominator = total || rows.reduce((sum, row) => sum + row.value, 0);
  const width = 360;
  const height = 190;
  const left = 30;
  const right = 16;
  const top = 16;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = rows.map((row, index) => ({
    ...row,
    percentage: denominator ? Math.round((row.value / denominator) * 100) : 0,
    x: left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth),
    y: top + (1 - (denominator ? row.value / denominator : 0)) * plotHeight,
  }));
  return <div className="analytics-line-graph" role="img" aria-label="Mother status line graph"><svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {[0, 0.25, 0.5, 0.75, 1].map(ratio => { const y = top + (1 - ratio) * plotHeight; return <g key={ratio}><line className="analytics-line-grid" x1={left} x2={width - right} y1={y} y2={y} /><text className="analytics-line-axis-label" x="0" y={y + 3}>{Math.round(denominator * ratio)}</text></g>; })}
    {points.length > 1 && <polyline className="analytics-line-path" points={points.map(point => `${point.x},${point.y}`).join(' ')} />}
    {points.map(point => <g key={point.label}><circle className={`analytics-line-point ${point.color || ''}`} cx={point.x} cy={point.y} r="5" /><text className="analytics-line-value" x={point.x} y={point.y - 12} textAnchor="middle">{point.value}</text><text className="analytics-line-label" x={point.x} y={height - 28} textAnchor="middle"><tspan x={point.x} dy="0">{point.label}</tspan><tspan className="analytics-line-percentage" x={point.x} dy="13">{point.percentage}%</tspan></text></g>)}
  </svg></div>;
}

function BreakdownCard({ title, icon, rows, total, tone = 'blue', barGraph = false, lineGraph = false }) {
  const denominator = total || rows.reduce((sum, row) => sum + row.value, 0);
  const maxValue = Math.max(1, ...rows.map(row => row.value));
  return <section className={`analytics-breakdown ${tone}`}>
    <div className="analytics-card-heading"><div><i className={`fa-solid ${icon}`} aria-hidden="true" /><h2>{title}</h2></div><strong>{denominator.toLocaleString()}</strong></div>
    {lineGraph ? <MotherStatusLineGraph rows={rows} total={denominator} /> : <div className={`analytics-breakdown-list${barGraph ? ' analytics-bar-graph' : ''}`} aria-label={barGraph ? `${title} bar graph` : title}>{rows.map(row => {
      const percentage = denominator ? Math.round((row.value / denominator) * 100) : 0;
      return <div className="analytics-breakdown-row" key={row.label}>
        {barGraph ? <><span className="analytics-breakdown-value">{row.value.toLocaleString()}</span><div className="analytics-vertical-track"><span className={`analytics-vertical-bar ${row.color || ''}`} style={{ height: `${row.value ? Math.max(10, (row.value / maxValue) * 100) : 3}%` }} /></div><div className="analytics-breakdown-label"><span className={`analytics-dot ${row.color || ''}`} /><span>{row.label}</span></div><small>{percentage}%</small></> : <><div className="analytics-breakdown-label"><span className={`analytics-dot ${row.color || ''}`} /> <span>{row.label}</span><b>{row.value.toLocaleString()}</b></div><div className="analytics-bar"><span style={{ width: `${percentage}%` }} /></div><small>{percentage}%</small></>}
      </div>;
    })}</div>}
  </section>;
}

function TrendCard({ events }) {
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return { date, key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString('en-PH', { month: 'short' }) };
    });
  }, []);
  const values = months.map(month => events.filter(event => {
    const date = eventDate(event.date);
    return date && date.getFullYear() === month.date.getFullYear() && date.getMonth() === month.date.getMonth();
  }).length);
  const max = Math.max(1, ...values);
  return <section className="analytics-trend">
    <div className="analytics-card-heading"><div><i className="fa-solid fa-chart-line" aria-hidden="true" /><h2>Six-month activity trend</h2></div><span>New and recorded activity</span></div>
    <div className="analytics-chart" aria-label="Six-month activity trend">{months.map((month, index) => <div className="analytics-chart-column" key={month.key}>
      <span className="analytics-chart-value">{values[index]}</span><div className="analytics-chart-track"><span style={{ height: `${Math.max(values[index] ? 12 : 4, (values[index] / max) * 100)}%` }} /></div><small>{month.label}</small>
    </div>)}</div>
  </section>;
}

function AnalyticsInventory({ rows }) {
  return <section className="analytics-inventory">
    <div className="analytics-card-heading"><div><i className="fa-solid fa-database" aria-hidden="true" /><h2>System data inventory</h2></div><span>Records currently available for reporting</span></div>
    <div className="analytics-inventory-grid">{rows.map(row => <div key={row.label}><span>{row.label}</span><strong>{row.value.toLocaleString()}</strong><small>{row.note}</small></div>)}</div>
  </section>;
}

function ReportsAnalytics() {
  const { data } = useStore();
  const extras = useReportExtras();
  const [range, setRange] = useState('all');
  const analytics = useMemo(() => {
    const mothers = (data.mothers || []).filter(isActive);
    const infants = (data.infants || []).filter(isActive);
    const appointments = data.appointments || [];
    const appointmentRequests = data.appointmentRequests || [];
    const caregivers = (data.caregivers || []).filter(item => String(item.status || '').toLowerCase() !== 'archived');
    const maternalRecords = mothers.flatMap(mother => mother.records || []);
    const growthRecords = infants.flatMap(infant => infant.growth || []);
    const vaccineRecords = infants.flatMap(infant => infant.vaccines || []);
    const infantRecords = infants.flatMap(infant => infant.records || []);
    const screenings = infants.flatMap(infant => infant.screenings || []);
    const start = new Date();
    if (range === '30d') start.setDate(start.getDate() - 30);
    if (range === '6m') start.setMonth(start.getMonth() - 6);
    if (range === 'year') { start.setMonth(0); start.setDate(1); }
    const inRange = value => {
      if (range === 'all') return true;
      const date = eventDate(value);
      return date ? date >= start : false;
    };
    const rangedAppointments = appointments.filter(item => inRange(item.date || item.scheduled_at || item.created_at));
    const rangedMaternalRecords = maternalRecords.filter(item => inRange(item.date || item.record_date));
    const rangedGrowthRecords = growthRecords.filter(item => inRange(item.date || item.measured_at));
    const rangedVaccineRecords = vaccineRecords.filter(item => inRange(item.date || item.administered_at));
    const rangedInfantRecords = infantRecords.filter(item => inRange(item.date || item.record_date));
    const rangedScreenings = screenings.filter(item => inRange(item.date || item.record_date));
    const rangedConcerns = extras.concerns.filter(item => inRange(item.created_at));
    const rangedActivity = [
      ...mothers.map(item => ({ date: eventValue(item) })),
      ...infants.map(item => ({ date: eventValue(item) })),
      ...rangedAppointments.map(item => ({ date: item.date || item.scheduled_at })),
      ...rangedMaternalRecords.map(item => ({ date: item.date || item.record_date })),
      ...rangedGrowthRecords.map(item => ({ date: item.date || item.measured_at })),
      ...rangedVaccineRecords.map(item => ({ date: item.date || item.administered_at })),
      ...rangedInfantRecords.map(item => ({ date: item.date || item.record_date })),
      ...rangedConcerns.map(item => ({ date: item.created_at })),
    ];
    const appointmentStatusRows = ['Pending', 'Confirmed', 'Rescheduled', 'Completed', 'Cancelled'].map(label => ({ label, value: rangedAppointments.filter(item => statusLabel(item.status) === label).length, color: label.toLowerCase() }));
    const appointmentTypeRows = ['Prenatal', 'Postnatal', 'Immunization', 'Other'].map(label => ({ label, value: rangedAppointments.filter(item => appointmentType(item.service) === label).length, color: label.toLowerCase() }));
    const motherStatusRows = [{ label: 'Pregnant', value: mothers.filter(item => String(item.status).toLowerCase() !== 'postnatal').length, color: 'pregnant' }, { label: 'Postnatal / delivered', value: mothers.filter(item => String(item.status).toLowerCase() === 'postnatal').length, color: 'postnatal' }];
    const infantSexRows = [{ label: 'Male', value: infants.filter(item => String(item.sex || '').toLowerCase() === 'male').length, color: 'male' }, { label: 'Female', value: infants.filter(item => String(item.sex || '').toLowerCase() === 'female').length, color: 'female' }, { label: 'Not recorded', value: infants.filter(item => !['male', 'female'].includes(String(item.sex || '').toLowerCase())).length, color: 'other' }];
    const vaccineRows = [{ label: 'Recorded doses', value: rangedVaccineRecords.length, color: 'completed' }, { label: 'Infants with a dose', value: infants.filter(item => (item.vaccines || []).length > 0).length, color: 'pending' }];
    const clinicalCount = rangedMaternalRecords.length + rangedGrowthRecords.length + rangedInfantRecords.length + rangedScreenings.length;
    return {
      mothers, infants, appointments, caregivers, appointmentRequests, rangedAppointments, rangedMaternalRecords, rangedGrowthRecords, rangedVaccineRecords, rangedInfantRecords, rangedScreenings, rangedConcerns, rangedActivity, appointmentStatusRows, appointmentTypeRows, motherStatusRows, infantSexRows, vaccineRows, clinicalCount,
      archivedMothers: (data.mothers || []).filter(item => !isActive(item)).length,
      archivedInfants: (data.infants || []).filter(item => !isActive(item)).length,
    };
  }, [data, extras.concerns, range]);
  const periodLabel = { all: 'All time', '30d': 'Last 30 days', '6m': 'Last 6 months', year: 'This year' }[range];
  const inventory = [
    { label: 'Mothers', value: analytics.mothers.length, note: `${analytics.archivedMothers} archived` },
    { label: 'Infants', value: analytics.infants.length, note: `${analytics.archivedInfants} archived` },
    { label: 'Appointments', value: analytics.rangedAppointments.length, note: `${analytics.rangedAppointments.filter(item => !isCancelled(item)).length} active` },
    { label: 'Maternal records', value: analytics.rangedMaternalRecords.length, note: 'Prenatal and postnatal records' },
    { label: 'Growth records', value: analytics.rangedGrowthRecords.length, note: 'Infant measurements' },
    { label: 'Vaccine records', value: analytics.rangedVaccineRecords.length, note: 'Recorded administered doses' },
    { label: 'Infant records', value: analytics.rangedInfantRecords.length, note: 'Clinical infant records' },
    { label: 'Screening records', value: analytics.rangedScreenings.length, note: 'Newborn and hearing tests' },
    { label: 'Caregiver links', value: analytics.caregivers.length, note: 'Active assignments' },
    { label: 'Reschedule requests', value: analytics.appointmentRequests.length, note: 'Appointment change requests' },
    { label: 'Care requests', value: analytics.rangedConcerns.length, note: 'Family health concerns' },
    { label: 'Announcements', value: extras.announcements.length, note: 'Published system updates' },
  ];
  return <>
    <header className="page-header reports-page-header"><div><p className="eyebrow">MEDIMAMA ADMIN</p><h1>Analytics &amp; Statistics</h1><p>Monitor patient registration, appointments, clinical records, immunization, and family care activity.</p></div><label className="analytics-period"><span>Reporting period</span><select value={range} onChange={event => setRange(event.target.value)}><option value="all">All time</option><option value="30d">Last 30 days</option><option value="6m">Last 6 months</option><option value="year">This year</option></select></label></header>
    <section className="analytics-period-note"><i className="fa-solid fa-circle-info" aria-hidden="true" /><span>Showing <strong>{periodLabel}</strong>. Patient totals remain all-time; activity counts follow the selected period.</span></section>
    <section className="analytics-metrics" aria-label="Analytics summary">
      <MetricCard icon="fa-person-pregnant" value={analytics.mothers.length} label="Registered mothers" note={`${analytics.motherStatusRows[0]?.value || 0} pregnant`} tone="pink" />
      <MetricCard icon="fa-baby" value={analytics.infants.length} label="Registered infants" note={`${analytics.infants.filter(item => item.status === 'Pending approval').length} awaiting approval`} tone="blue" />
      <MetricCard icon="fa-calendar-check" value={analytics.rangedAppointments.length} label="Appointments" note={`${analytics.rangedAppointments.filter(item => statusLabel(item.status) === 'Completed').length} completed`} tone="purple" />
      <MetricCard icon="fa-syringe" value={analytics.rangedVaccineRecords.length} label="Recorded vaccine doses" note={`${analytics.infants.filter(item => (item.vaccines || []).length > 0).length} infants reached`} tone="green" />
      <MetricCard icon="fa-file-medical" value={analytics.clinicalCount} label="Clinical records" note={`${analytics.rangedGrowthRecords.length} growth measurements`} tone="orange" />
      <MetricCard icon="fa-user-group" value={analytics.caregivers.length} label="Caregiver links" note="Active assignments" tone="teal" />
      <MetricCard icon="fa-hand-holding-heart" value={analytics.rangedConcerns.length} label="Care requests" note="Family concerns in period" tone="pink" />
      <MetricCard icon="fa-clock-rotate-left" value={analytics.appointmentRequests.length} label="Reschedule requests" note="All request statuses" tone="purple" />
    </section>
    <section className="analytics-breakdown-grid">
      <BreakdownCard title="Mother status" icon="fa-person-pregnant" rows={analytics.motherStatusRows} tone="pink" lineGraph />
      <BreakdownCard title="Infant sex" icon="fa-baby" rows={analytics.infantSexRows} tone="blue" />
      <BreakdownCard title="Appointment type" icon="fa-calendar-days" rows={analytics.appointmentTypeRows} total={analytics.rangedAppointments.length} tone="purple" barGraph />
      <BreakdownCard title="Appointment status" icon="fa-calendar-check" rows={analytics.appointmentStatusRows} total={analytics.rangedAppointments.length} tone="green" />
      <BreakdownCard title="Immunization coverage" icon="fa-syringe" rows={analytics.vaccineRows} total={analytics.infants.length || 1} tone="orange" />
      <TrendCard events={analytics.rangedActivity} />
    </section>
    <AnalyticsInventory rows={inventory} />
  </>;
}

function ReportsDetails() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1);
  const pageSize = 7;
  const mothers = data.mothers.filter(item => isActive(item)).map(item => ({ id: `mother-${item.id}`, type: 'Mother', name: item.name || 'Unnamed mother', details: item.status || 'Not recorded', date: item.birthDate || '—', status: item.status || 'Active', search: `${item.name} ${item.status} ${item.id}` }));
  const infants = data.infants.filter(item => isActive(item)).map(item => ({ id: `infant-${item.id}`, type: 'Infant', name: item.name || 'Unnamed infant', details: `${item.sex || 'Sex not recorded'} · ${infantAgeStatus(item.birthDate)} · Mother: ${data.mothers.find(mother => mother.id === item.motherId)?.name || 'Not linked'}`, date: item.birthDate || '—', status: item.status || 'Active', search: `${item.name} ${item.sex} ${item.id} ${item.motherId}` }));
  const appointments = data.appointments.filter(item => !isCancelled(item)).map(item => {
    const patient = [...data.mothers, ...data.infants].find(record => record.id === item.patientId);
    return { id: `appointment-${item.id}`, type: 'Appointment', name: item.patient || patient?.name || 'Linked patient', details: `${item.service || 'Appointment'}${item.date ? ` · ${item.date}${item.time ? ` at ${item.time}` : ''}` : ''}`, date: patient?.birthDate || '—', status: item.status || 'Not recorded', search: `${item.patient} ${item.service} ${item.status} ${item.date} ${item.time}` };
  });
  const allRows = [...mothers, ...infants, ...appointments];
  const recordCreatedAt = row => {
    const [prefix, ...parts] = row.id.split('-');
    const sourceId = parts.join('-');
    const collection = prefix === 'mother' ? data.mothers : prefix === 'infant' ? data.infants : data.appointments;
    const source = collection.find(item => item.id === sourceId);
    const parsed = Date.parse(source?.created_at || source?.createdAt || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const rows = allRows.filter(row => (filter === 'All' || row.type === filter) && `${row.type} ${row.name} ${row.details} ${row.date} ${row.status} ${row.search}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => recordCreatedAt(b) - recordCreatedAt(a) || String(b.id).localeCompare(String(a.id)));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstRow = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, rows.length);
  return <section className="reports-details-panel" aria-label="All patient and appointment records"><div className="reports-details-heading"><div><h2>All Records</h2><span>{rows.length} matching records</span></div><div className="reports-details-filters"><label><span className="sr-only">Search records</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search mother, infant, or appointment" /></label><label><span className="sr-only">Filter records</span><select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option>All</option><option>Mother</option><option>Infant</option><option>Appointment</option></select></label></div></div><div className="reports-details-table-wrap"><table><thead><tr><th>Type</th><th>Name / Patient</th><th>Details</th><th>Birthdate</th><th>Status</th></tr></thead><tbody>{visibleRows.length ? visibleRows.map(row => <tr key={row.id}><td><span className={`reports-record-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td>{row.name}</td><td>{row.details}</td><td>{row.date}</td><td>{row.status}</td></tr>) : <tr><td colSpan="5" className="reports-empty-row">No matching records found.</td></tr>}</tbody></table></div>{rows.length > 0 && <div className="reports-pagination"><span>Showing {firstRow}–{lastRow} of {rows.length}</span><div><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><strong>Page {currentPage} of {totalPages}</strong><button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></div></div>}</section>;
}

export default function AdminReports() {
  return <AdminShell page="reports"><main className="main-content directory-page reports-page"><ReportsAnalytics /><ReportsDetails /></main></AdminShell>;
}
