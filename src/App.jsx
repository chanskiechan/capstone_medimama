import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboard, Directory, Healthcare } from './pages/AdminWorkspace';
import Announcements from './pages/AnnouncementsManager';
import MotherDashboard from './pages/MotherExperience';
import FamilyPortal from './pages/FamilyPortal';
import { Login } from './pages/Login';
import CaregiverRequests from './pages/CaregiverRequests';
import MotherProfile from './pages/MotherProfile';
import CaregiverProfile from './pages/CaregiverProfile';
import Reports from './pages/Reports';
import Support from './pages/Support';
import AdminTools, { AdminProfile } from './pages/AdminTools';
import PasswordRecovery from './pages/PasswordRecovery';

const sessionKey = 'medimama-current-session';

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
}

function ProtectedRoute({ roles, children }) {
  const session = readSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.role)) return <Navigate to={session.role === 'admin' ? '/dashboard' : session.role === 'caregiver' ? '/caregiver' : '/user'} replace />;
  return children;
}

const admin = (element) => <ProtectedRoute roles={['admin']}>{element}</ProtectedRoute>;
const mother = (element) => <ProtectedRoute roles={['mother']}>{element}</ProtectedRoute>;
const caregiver = (element) => <ProtectedRoute roles={['caregiver']}>{element}</ProtectedRoute>;

export default function App() {
  return <Routes>
    <Route path="/" element={<Login />} />
    <Route path="/login" element={<Login />} />
    <Route path="/forgot-password" element={<PasswordRecovery />} />
    <Route path="/reset-password" element={<PasswordRecovery reset />} />
    <Route path="/dashboard" element={admin(<AdminDashboard />)} />
    <Route path="/mothers" element={admin(<Directory type="mothers" />)} />
    <Route path="/infants" element={admin(<Directory type="infants" />)} />
    <Route path="/healthcare" element={admin(<Healthcare />)} />
    <Route path="/announcements" element={admin(<Announcements />)} />
    <Route path="/system" element={admin(<AdminTools />)} />
    <Route path="/profile" element={admin(<AdminProfile />)} />
    <Route path="/caregiver-requests" element={admin(<CaregiverRequests />)} />
    <Route path="/reports" element={admin(<Support admin view="reports" />)} />
    <Route path="/care-notes" element={admin(<Reports />)} />
    <Route path="/health-concerns" element={admin(<Support admin view="concerns" />)} />
    <Route path="/archives" element={admin(<Support admin view="archives" />)} />
    <Route path="/support/:section" element={<ProtectedRoute roles={['mother','caregiver','admin']}><Support /></ProtectedRoute>} />
    <Route path="/caregiver" element={caregiver(<FamilyPortal page="caregiver" />)} />
    <Route path="/caregiver/profile" element={caregiver(<CaregiverProfile />)} />
    <Route path="/user" element={mother(<MotherDashboard />)} />
    <Route path="/user/profile" element={mother(<MotherProfile />)} />
    <Route path="/user/appointments" element={mother(<FamilyPortal page="appointments" />)} />
    <Route path="/user/infants" element={mother(<FamilyPortal page="infants" />)} />
    <Route path="/user/records" element={mother(<FamilyPortal page="records" />)} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
