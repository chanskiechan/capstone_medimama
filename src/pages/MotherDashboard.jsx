import { PageStyles } from '../components/PageStyles';
import FamilyOverview from '../components/FamilyOverview';
import { FamilyHeader } from './FamilyPortal';
import { session } from '../care';

export default function MotherDashboard() {
  const user = session();
  return <><PageStyles page="user" /><FamilyHeader /><main className="family-page"><section className="hero-panel"><div className="hero-copy"><p><i className="fa-solid fa-heart-pulse" /> Your family's care</p><h1>Welcome, {user.name}!</h1><span>Your next visit, care status, and reminders at a glance.</span></div><div className="mother-visual"><img src="/medimama/motherside.png" alt="Mother and baby" /></div></section><FamilyOverview /></main></>;
}
