import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import { useStore } from '../store';
import { demoSession, withDemoFamily } from '../demo';
import { supabase } from '../lib/supabase';
import { notifyEmailEvent, requestRegistrationOtp, verifyRegistrationOtp } from '../lib/emailNotifications';
import './Login.css';

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const strongPassword = value => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const passwordRequirements = [
  ['At least 8 characters', value => value.length >= 8],
  ['Uppercase letter', value => /[A-Z]/.test(value)],
  ['Lowercase letter', value => /[a-z]/.test(value)],
  ['Number', value => /\d/.test(value)],
  ['Special character', value => /[^A-Za-z0-9]/.test(value)],
];
const passwordStrength = value => {
  const score = passwordRequirements.filter(([, test]) => test(value)).length;
  if (score === passwordRequirements.length) return { label: 'Strong', level: 'strong', score };
  if (score >= 3) return { label: 'Moderate', level: 'moderate', score };
  return { label: 'Weak', level: 'weak', score };
};
const Icon = ({ name, className = '' }) => <span className={`fa-solid fa-${name} ${className}`} aria-hidden="true" />;

function Input({ icon, children, className = '' }) {
  return <div className={`mm-input ${className}`}><i>{icon}</i>{children}</div>;
}

export function Login() {
  const { save, refreshPatientData } = useStore();
  const navigate = useNavigate();
  const [signup, setSignup] = useState(false);
  const [feedback, setFeedback] = useState();
  const [visible, setVisible] = useState({ login: false, signup: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerification, setEmailVerification] = useState({ status: 'idle', email: '', message: '' });
  const [otpBusy, setOtpBusy] = useState(false);

  const tell = (text, type = 'error') => {
    if (type === 'success' && text.startsWith('Registration submitted')) setSignup(false);
    setFeedback({ text, type });
  };
  const go = session => navigate(session.role === 'admin' ? '/dashboard' : session.role === 'caregiver' ? '/caregiver' : '/user');
  const enterDemo = roleName => {
    if (!save(withDemoFamily)) return tell('Could not save demo data.');
    const session = demoSession(roleName);
    localStorage.setItem('medimama-current-session', JSON.stringify(session));
    go(session);
  };
  const sendRegistrationOtp = async () => {
    const email = registrationEmail.trim().toLowerCase();
    if (!validEmail(email)) return setEmailVerification({ status: 'error', email, message: 'Enter a valid email address first.' });
    setOtpBusy(true);
    const result = await requestRegistrationOtp(email);
    setOtpBusy(false);
    if (result.error) return setEmailVerification({ status: 'error', email, message: result.error });
    setEmailOtp('');
    setEmailVerification({ status: 'sent', email, message: 'OTP sent. Check your inbox or Spam folder.' });
  };
  const verifyEmailOtp = async () => {
    const email = registrationEmail.trim().toLowerCase();
    if (!emailOtp.trim()) return setEmailVerification({ status: 'error', email, message: 'Enter the OTP from your email.' });
    setOtpBusy(true);
    const result = await verifyRegistrationOtp(email, emailOtp);
    setOtpBusy(false);
    if (result.error) return setEmailVerification({ status: 'error', email, message: result.error });
    setEmailVerification({ status: 'verified', email, message: 'Email verified. You can continue registration.' });
  };

  const login = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim().toLowerCase();
    const password = String(form.get('password') || '');
    if (!validEmail(email) || !password) return tell('Enter a valid email address and password.');
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return tell(error.message);
    }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, role').eq('id', data.user.id).single();
    if (profileError) {
      await supabase.auth.signOut();
      setBusy(false);
      return tell('Signed in, but your profile could not be loaded.');
    }
    if (profile.role === 'mother') {
      const { data: link, error: linkError } = await supabase.from('mother_accounts').select('mother_id').eq('user_id', profile.id).maybeSingle();
      if (linkError || !link) {
        await supabase.auth.signOut();
        setBusy(false);
        return tell('Your mother account could not be verified. Please contact the health center.');
      }
      const { data: motherRecord, error: motherError } = await supabase.from('mothers').select('status').eq('id', link.mother_id).maybeSingle();
      if (motherError || !motherRecord) {
        await supabase.auth.signOut();
        setBusy(false);
        return tell('Your mother record could not be verified. Please contact the health center.');
      }
      if (motherRecord.status !== 'active') {
        await supabase.auth.signOut();
        setBusy(false);
        return tell(motherRecord.status === 'archived' ? 'Your account is archived. Please contact the health center.' : 'Your mother account is pending administrator approval.');
      }
    }
    if (profile.role === 'caregiver') {
      const { data: request, error: requestError } = await supabase.from('caregiver_requests').select('status').eq('caregiver_id', profile.id).maybeSingle();
      if (requestError || !request) {
        await supabase.auth.signOut();
        setBusy(false);
        return tell('Your caregiver request could not be verified. Please contact the administrator.');
      }
      if (request.status !== 'approved') {
        await supabase.auth.signOut();
        setBusy(false);
        return tell(request.status === 'declined' ? 'Your caregiver request was declined. Please contact the health center.' : 'Your caregiver account is pending administrator approval.');
      }
    }
    const session = { id: profile.id, name: profile.full_name || email, email, role: profile.role };
    localStorage.setItem('medimama-current-session', JSON.stringify(session));
    void notifyEmailEvent('/api/email/login');
    setBusy(false);
    await refreshPatientData();
    tell('Login successful.', 'success');
    go(session);
  };

  const register = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = key => String(form.get(key) || '').trim();
    const email = get('email').toLowerCase();
    const password = get('password');
    const validId = form.get('validId');
    if (!get('firstName') || !get('lastName')) return tell('Please enter your first and last name.');
    if (!get('address') || !get('birthdate') || !/^9\d{9}$/.test(get('contact'))) return tell('Please complete your address, birthdate, and valid Philippine mobile number.');
    if (!validEmail(email)) return tell('Please enter a valid email address.');
    if (emailVerification.status !== 'verified' || emailVerification.email !== email) return tell('Verify your email with the OTP before registering.');
    if (!(validId instanceof File) || !validId.name) return tell('Please upload a valid ID.');
    if (!strongPassword(password)) return tell('Password needs 8+ characters with uppercase, lowercase, number, and special character.');
    if (password !== get('confirmPassword')) return tell('Passwords do not match.');
    if (!form.get('terms')) return tell('Please agree to the Terms and Privacy Policy.');
    const fullName = `${get('firstName')} ${get('middleName')} ${get('lastName')} ${get('suffix')}`.replace(/\s+/g, ' ').trim();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, address: get('address'), birthdate: get('birthdate'), contact_number: get('contact') } },
    });
    setBusy(false);
    if (error) return tell(error.message);
    if (!data.user) return tell('Account could not be created. Please try again.');
    tell('Registration submitted. Please wait for an email from MediMama confirming whether the health center approved or declined your registration. You can log in only after approval.', 'success');
  };

  const passwordField = (name, placeholder, key, extra = {}) => (
    <Input icon={<Icon name="lock" />}>
      <input {...extra} name={name} type={visible[key] ? 'text' : 'password'} placeholder={placeholder} required />
      <button className="mm-eye" type="button" onClick={() => setVisible(value => ({ ...value, [key]: !value[key] }))}><Icon name={visible[key] ? 'eye-slash' : 'eye'} /></button>
    </Input>
  );
  const strength = passwordStrength(passwordValue);

  return <>
    <PageStyles page="login" />
    <main className="mm-login-page">
      <img className="mm-bg" src="/medimama/background.png" alt="" />
      <div className="mm-container">
        <aside className="mm-left">
          <img className="mm-logo" src="/medimama/medimamalogo.png" alt="MediMama" />
          <p>Empowering Mothers.<br />Protecting Every Child.</p>
          <img className="mm-mother" src="/medimama/medimama.png" alt="Mother and child" />
          <div className="mm-info"><img src="/medimama/healthcare servicesicon.png" alt="" /><div><b>Your Health. Your Child.</b><span>Our Priority</span></div></div>
        </aside>
        <section className="mm-right">
          {!signup ? <div className="mm-card">
            <h1>Welcome Back!</h1>
            <span className="mm-subtitle">Please login to your account</span>
            <form onSubmit={login}>
              {feedback && <div className={`mm-feedback ${feedback.type}`}>{feedback.text}</div>}
              <label>Email Address</label>
              <Input icon={<Icon name="envelope" />}><input name="email" type="email" placeholder="Enter your email" required /></Input>
              <label>Password</label>
              {passwordField('password', 'Enter your password', 'login')}
              <div className="mm-remember"><label><input type="checkbox" /> Remember me</label><button type="button" onClick={() => navigate('/forgot-password')}>Forgot Password?</button></div>
              <button className="mm-primary" disabled={busy}><Icon name="right-to-bracket" /> {busy ? 'Logging in…' : 'Login'}</button>
              <p className="mm-switch">Don't have an account? <button type="button" onClick={() => { setSignup(true); setFeedback(); }}>Register here</button></p>
              <section className="mm-demo"><p>Try the demo</p><span>No registration needed</span><div><button type="button" onClick={() => enterDemo('mother')}><Icon name="person-pregnant" /> Demo Mother</button><button type="button" onClick={() => enterDemo('caregiver')}><Icon name="hand-holding-heart" /> Demo Caregiver</button></div></section>
            </form>
          </div> : <div className="mm-card mm-signup">
            <h1>Create Account</h1>
            <span className="mm-subtitle">Fill in your details to register as a mother</span>
            <form onSubmit={register}>
              {feedback && <div className={`mm-feedback ${feedback.type}`}>{feedback.text}</div>}
              <label>Name</label>
              <div className="mm-names">{[['firstName', 'First name'], ['middleName', 'Middle name (optional)'], ['lastName', 'Last name'], ['suffix', 'Suffix (optional)']].map(([name, placeholder]) => <Input key={name} icon={<Icon name="user" />}><input name={name} placeholder={placeholder} /></Input>)}</div>
              <label>Address</label><div className="mm-place"><span>Barangay Bucandala II</span><span>Imus City</span><span>Cavite</span></div><Input icon={<Icon name="location-dot" />}><input name="address" placeholder="House no., street, subdivision, or landmark" /></Input>
              <label>Birthdate</label><Input icon={<Icon name="calendar-days" />}><input name="birthdate" type="date" /></Input>
              <label>Contact Number</label><Input icon={<Icon name="phone" />} className="mm-phone"><strong>+63</strong><input name="contact" inputMode="numeric" maxLength="10" placeholder="9XXXXXXXXX" /></Input>
              <label>Email Address</label>
              <div className="mm-email-row mm-registration-email-row"><Input icon={<Icon name="envelope" />}><input name="email" type="email" placeholder="Enter your email" value={registrationEmail} onChange={event => { setRegistrationEmail(event.target.value); setEmailVerification({ status: 'idle', email: '', message: '' }); }} required /></Input><button type="button" className="mm-otp-action" onClick={sendRegistrationOtp} disabled={otpBusy || emailVerification.status === 'verified'}>{emailVerification.status === 'verified' ? 'Verified' : otpBusy ? 'Sending…' : 'Send OTP'}</button></div>
              {emailVerification.status !== 'idle' && <div className={`mm-email-verification ${emailVerification.status}`} role={emailVerification.status === 'error' ? 'alert' : 'status'}>{emailVerification.message}</div>}
              {emailVerification.status === 'sent' && <div className="mm-email-row mm-registration-otp-row"><Input icon={<Icon name="key" />}><input name="emailOtp" value={emailOtp} onChange={event => setEmailOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength="6" placeholder="6-digit OTP" /></Input><button type="button" className="mm-otp-action" onClick={verifyEmailOtp} disabled={otpBusy}>{otpBusy ? 'Checking…' : 'Verify'}</button></div>}
              <label>Valid ID</label><Input icon={<Icon name="id-card" />}><input className="mm-file" name="validId" type="file" accept="image/*,.pdf" /></Input>
              <label>Password</label>
              {passwordField('password', 'Create a password', 'signup', { value: passwordValue, onChange: event => setPasswordValue(event.target.value), autoComplete: 'new-password' })}
              {passwordValue && <div className={`mm-password-strength ${strength.level}`} aria-live="polite"><div className="mm-password-strength-heading"><span>Password strength</span><strong>{strength.label}</strong></div><div className="mm-password-strength-bar" aria-label={`${strength.label} password strength`}>{[0, 1, 2, 3, 4].map(index => <span key={index} className={index < strength.score ? 'filled' : ''} />)}</div><ul>{passwordRequirements.map(([label, test]) => <li key={label} className={test(passwordValue) ? 'met' : ''}><i className={`fa-solid ${test(passwordValue) ? 'fa-check' : 'fa-xmark'}`} aria-hidden="true" />{label}</li>)}</ul></div>}
              <p className="mm-hint">At least 8 characters, with uppercase, lowercase, number, and special character.</p>
              <label>Confirm Password</label>{passwordField('confirmPassword', 'Confirm your password', 'confirm')}
              <label className="mm-check"><input name="terms" type="checkbox" /> I agree to the Terms and Privacy Policy.</label>
              <button className="mm-primary" disabled={busy}><Icon name="user-plus" /> {busy ? 'Creating account…' : 'Register'}</button>
              <p className="mm-switch">Already have an account? <button type="button" onClick={() => { setSignup(false); setFeedback(); }}>Login here</button></p>
            </form>
          </div>}
        </section>
      </div>
    </main>
  </>;
}
