import { useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import ConcernReports from './ConcernReports';
import { HealthcareReports } from './Support';

export default function AdminReports() {
  const [params,setParams] = useSearchParams();
  const summary = params.get('tab') === 'summary';
  return <AdminShell page="reports"><main className="main-content directory-page"><h1>Reports</h1><nav className="concern-admin-tabs" aria-label="Report sections"><button aria-pressed={!summary} onClick={()=>setParams({})}>Concern reports</button><button aria-pressed={summary} onClick={()=>setParams({tab:'summary'})}>Healthcare summary</button></nav>{summary ? <HealthcareReports /> : <ConcernReports admin />}</main></AdminShell>;
}
