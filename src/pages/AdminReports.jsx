import { AdminShell } from '../components/AdminShell';
import ConcernReports from './ConcernReports';

export default function AdminReports() {
  return <AdminShell page="reports"><main className="main-content directory-page reports-page"><ConcernReports admin /></main></AdminShell>;
}
