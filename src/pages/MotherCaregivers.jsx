import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FamilyHeader } from './FamilyPortal';
import { PageStyles } from '../components/PageStyles';
import { registerCaregiverAccount, requestRegistrationOtp, verifyRegistrationOtp } from '../lib/emailNotifications';
import { daysBetween, family, session, today } from '../care';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import './MotherCaregivers.css';
import './MotherCaregiverPassword.css';

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const strongPassword = value => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const passwordRequirements = [
  ['8+ characters', value => value.length >= 8],
  ['Uppercase letter', value => /[A-Z]/.test(value)],
  ['Lowercase letter', value => /[a-z]/.test(value)],
  ['Number', value => /\d/.test(value)],
  ['Special character', value => /[^A-Za-z0-9]/.test(value)],
];

const fileToDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function digitsOnly(event) {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 10);
}

function PasswordField({ name, value, onChange, visible, onToggle, required = true }) {
  return <div className="caregiver-password-field">
    <input name={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete="new-password" required={required} />
    <button type="button" onClick={onToggle} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>
      <i className={`fa-solid ${visible ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
    </button>
  </div>;
}

export default function MotherCaregivers() {
  const user = session();
  const { data, loadingRecords, storageError } = useStore();
  const familyScope = family(data, user);
  const mother = familyScope.mothers[0];
  const infants = familyScope.infants.filter(infant => !infant.archived);
  const canManageCaregiver = mother?.status === 'Postnatal';
  const [open, setOpen] = useState(false);
  const [motherName, setMotherName] = useState(user.name || '');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailVerification, setEmailVerification] = useState({ status: 'idle', email: '' });
  const [passwordValue, setPasswordValue] = useState('');
  const [showPasswords, setShowPasswords] = useState({ password: false, confirm: false });
  const formRef = useRef(null);

  const resetCaregiverDraft = () => {
    formRef.current?.reset();
    setRegistrationEmail('');
    setEmailOtp('');
    setEmailVerification({ status: 'idle', email: '' });
    setPasswordValue('');
    setShowPasswords({ password: false, confirm: false });
  };

  const openForm = () => {
    if (!canManageCaregiver) {
      setNotice({ type: 'error', text: 'Caregiver access becomes available after the mother is marked Postnatal by the health center.' });
      return;
    }
    resetCaregiverDraft();
    setNotice({ type: '', text: '' });
    setOpen(true);
  };

  const closeForm = () => {
    if (busy) return;
    resetCaregiverDraft();
    setNotice({ type: '', text: '' });
    setOpen(false);
  };

  useEffect(() => {
    let active = true;
    if (!user.id || user.demo) return undefined;
    const loadMother = async () => {
      const { data: link } = await supabase.from('mother_accounts').select('mother_id').eq('user_id', user.id).maybeSingle();
      if (!link) return;
      const { data: mother } = await supabase.from('mothers').select('full_name').eq('id', link.mother_id).maybeSingle();
      if (active && mother?.full_name) setMotherName(mother.full_name);
    };
    loadMother();
    return () => { active = false; };
  }, [user.id, user.demo]);

  const sendOtp = async () => {
    const email = registrationEmail.trim().toLowerCase();
    if (!validEmail(email)) return setNotice({ type: 'error', text: 'Enter a valid caregiver email address first.' });
    setOtpBusy(true);
    const result = await requestRegistrationOtp(email);
    setOtpBusy(false);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    setEmailOtp('');
    setEmailVerification({ status: 'sent', email });
    setNotice({ type: 'success', text: 'OTP sent. Check the caregiver email inbox or Spam folder.' });
  };

  const verifyOtp = async () => {
    const email = registrationEmail.trim().toLowerCase();
    if (!/^\d{6}$/.test(emailOtp.trim())) return setNotice({ type: 'error', text: 'Enter the 6-digit OTP from the email.' });
    setOtpBusy(true);
    const result = await verifyRegistrationOtp(email, emailOtp);
    setOtpBusy(false);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    setEmailVerification({ status: 'verified', email });
    setNotice({ type: 'success', text: 'Email verified. You can submit the caregiver request.' });
  };

  const submit = async event => {
    event.preventDefault();
    if (!canManageCaregiver) return setNotice({ type: 'error', text: 'Caregiver registration is available only after delivery has been recorded.' });
    const form = new FormData(event.currentTarget);
    const get = key => String(form.get(key) || '').trim();
    const email = get('email').toLowerCase();
    const password = get('password');
    const validId = form.get('validId');
    if (!get('firstName') || !get('lastName')) return setNotice({ type: 'error', text: 'Please enter the caregiver first and last name.' });
    if (!get('address') || !get('birthdate')) return setNotice({ type: 'error', text: 'Please complete the caregiver address and birthdate.' });
    if (!/^9\d{9}$/.test(get('contact'))) return setNotice({ type: 'error', text: 'Use 10 digits starting with 9 for the contact number.' });
    if (!validEmail(email)) return setNotice({ type: 'error', text: 'Please enter a valid caregiver email address.' });
    if (emailVerification.status !== 'verified' || emailVerification.email !== email) return setNotice({ type: 'error', text: 'Verify the caregiver email with the OTP before submitting.' });
    if (!get('relationship')) return setNotice({ type: 'error', text: 'Please select the relationship to the mother.' });
    if (!(validId instanceof File) || !validId.name) return setNotice({ type: 'error', text: 'Please upload a valid ID.' });
    if (!strongPassword(password)) return setNotice({ type: 'error', text: 'Password needs 8+ characters with uppercase, lowercase, number, and special character.' });
    if (password !== get('confirmPassword')) return setNotice({ type: 'error', text: 'Passwords do not match.' });
    if (!form.get('consent')) return setNotice({ type: 'error', text: 'Please confirm that the mother is requesting this caregiver access.' });
    setBusy(true);
    let idData;
    try {
      idData = await fileToDataUrl(validId);
    } catch {
      setBusy(false);
      return setNotice({ type: 'error', text: 'The valid ID could not be read.' });
    }
    const result = await registerCaregiverAccount({
      firstName: get('firstName'),
      middleName: get('middleName'),
      lastName: get('lastName'),
      suffix: get('suffix'),
      address: get('address'),
      birthdate: get('birthdate'),
      contact: get('contact'),
      email,
      password,
      relationship: get('relationship'),
      linkedPatient: motherName,
      validId: { name: validId.name, type: validId.type, data: idData },
    });
    setBusy(false);
    if (result.error) return setNotice({ type: 'error', text: result.error });
    resetCaregiverDraft();
    setOpen(false);
    setNotice({ type: 'success', text: result.alreadyRegistered ? 'This caregiver request was already submitted and is waiting for administrator approval.' : 'Caregiver request submitted and is waiting for administrator approval. Email notifications will be sent after approval.' });
  };

  const strengthScore = passwordRequirements.filter(([, test]) => test(passwordValue)).length;
  const strengthLabel = strengthScore === 5 ? 'Strong' : strengthScore >= 3 ? 'Moderate' : 'Weak';

  return <>
    <PageStyles page="user" />
    <FamilyHeader />
    <main className="family-page mother-caregivers-page">
      <header className="mother-caregivers-heading">
        <div><p>MediMama care</p><h1>Baby progress</h1><span>{canManageCaregiver ? 'Track your baby’s growth and manage trusted caregiver access.' : 'Track your pregnancy progress. Caregiver access will be available after delivery.'}</span></div>
      </header>
      {notice.text && <p className={`mother-caregiver-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      <section className="mother-baby-progress" aria-labelledby="baby-progress-title">
        <div className="mother-baby-progress-heading"><div><p className="caregiver-eyebrow">Family care</p><h2 id="baby-progress-title">Baby progress</h2><span>Review the latest recorded measurements and growth history.</span></div><Link className="family-secondary" to="/user/records">View full records <i className="fa-solid fa-arrow-right" /></Link></div>
        {storageError && <p className="mother-caregiver-notice error" role="alert">{storageError}</p>}
        {loadingRecords ? <p className="mother-baby-progress-empty">Loading baby records...</p> : infants.length ? <div className="mother-baby-progress-grid">{infants.map(baby => {
          const growth = [...(baby.growth || [])].filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date));
          const latest = growth.at(-1);
          const previous = growth.at(-2);
          const ageDays = daysBetween(baby.birthDate, today());
          const weightChange = latest?.weight != null && previous?.weight != null ? Number(latest.weight) - Number(previous.weight) : null;
          return <article className="mother-baby-progress-card" key={baby.id}>
            <div className="mother-baby-progress-card-heading"><div className="mother-baby-progress-name"><span><i className="fa-solid fa-baby" aria-hidden="true" /></span><div><h3>{baby.name}</h3><p>{ageDays >= 0 ? `${Math.floor(ageDays / 7)} weeks old` : 'Age not available'} · {baby.status}</p></div></div><b>{growth.length} {growth.length === 1 ? 'record' : 'records'}</b></div>
            <div className="mother-baby-progress-metrics"><div><small>Latest weight</small><strong>{latest?.weight != null ? `${latest.weight} kg` : 'Not recorded'}</strong></div><div><small>Length</small><strong>{latest?.length != null ? `${latest.length} cm` : 'Not recorded'}</strong></div><div><small>MUAC</small><strong>{latest?.muac != null ? `${latest.muac} cm` : 'Not recorded'}</strong></div><div><small>Change since last</small><strong>{weightChange == null ? '—' : `${weightChange >= 0 ? '+' : ''}${weightChange.toFixed(2)} kg`}</strong></div></div>
            <p className="mother-baby-progress-last">{latest ? `Last measured: ${latest.date}` : 'No growth measurement has been recorded yet.'}</p>
            {growth.length > 0 && <div className="mother-baby-progress-history"><strong>Recent measurements</strong>{growth.slice(-3).reverse().map((item, index) => <div key={`${item.date}-${index}`}><span>{item.date}</span><span>{item.weight != null ? `${item.weight} kg` : '—'} · {item.length != null ? `${item.length} cm` : 'Length —'}</span></div>)}</div>}
            <Link to="/user/records">Open baby records <i className="fa-solid fa-arrow-right" /></Link>
          </article>;
        })}</div> : <div className="mother-baby-progress-empty"><i className="fa-solid fa-baby" aria-hidden="true" /><h3>No baby records yet</h3><p>Register or open your baby’s record to see growth progress here.</p><Link className="family-secondary" to="/user/records">Go to records</Link></div>}
      </section>
      {canManageCaregiver ? <>
        <section className="mother-caregiver-intro">
          <div className="mother-caregiver-icon"><i className="fa-solid fa-people-group" /></div>
          <div><h2>Add a trusted caregiver</h2><p>Caregiver access is reviewed by the administrator. The caregiver cannot log in until the request and identity document have been approved.</p></div>
          <button className="family-secondary" type="button" onClick={openForm}>Add caregiver <i className="fa-solid fa-arrow-right" /></button>
        </section>
        <section className="mother-caregiver-steps">
          <article><b>1</b><div><h3>Submit details</h3><p>Provide the caregiver information and valid ID.</p></div></article>
          <article><b>2</b><div><h3>Admin reviews</h3><p>The health center confirms the request.</p></div></article>
          <article><b>3</b><div><h3>Caregiver gets access</h3><p>An approval email is sent after confirmation.</p></div></article>
        </section>
      </> : <section className="mother-caregiver-locked" aria-live="polite"><div className="mother-caregiver-icon"><i className="fa-solid fa-lock" /></div><div><h2>Caregiver access is not available yet</h2><p>You can add a trusted caregiver after the health center records the delivery and changes your maternal status to Postnatal.</p></div></section>}
      {open && <div className="mother-caregiver-modal" role="dialog" aria-modal="true" aria-labelledby="caregiver-form-title">
        <form ref={formRef} className="mother-caregiver-form" autoComplete="off" onSubmit={submit}>
          <button type="button" className="mother-caregiver-close" onClick={closeForm} aria-label="Close">×</button>
          <p className="caregiver-eyebrow">Mother account</p>
          <h2 id="caregiver-form-title">Add caregiver</h2>
          <p className="caregiver-form-copy">Complete the form below. The caregiver will remain pending until an administrator approves the request.</p>
          <div className="caregiver-form-grid">
            <label>First name<input name="firstName" required /></label>
            <label>Middle name <small>(optional)</small><input name="middleName" /></label>
            <label>Last name<input name="lastName" required /></label>
            <label>Suffix <small>(optional)</small><input name="suffix" /></label>
            <label className="full">Address<input name="address" placeholder="House no., street, subdivision, or landmark" required /></label>
            <label>Birthdate<input name="birthdate" type="date" required /></label>
            <label>Contact number<div className="caregiver-phone"><strong>+63</strong><input name="contact" inputMode="numeric" maxLength="10" placeholder="9XXXXXXXXX" onInput={digitsOnly} required /></div></label>
            <label>Relationship<select name="relationship" defaultValue="" required><option value="">Choose relationship</option><option>Spouse</option><option>Parent</option><option>Sibling</option><option>Relative</option><option>Legal guardian</option><option>Other</option></select></label>
            <label className="full">Mother to link<input name="linkedPatient" value={motherName} readOnly /></label>
            <label className="full">Valid ID<input name="validId" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></label>
            <label className="full">Email address<div className="caregiver-otp-row"><input name="email" type="email" autoComplete="off" value={registrationEmail} onChange={event => { setRegistrationEmail(event.target.value); setEmailVerification({ status: 'idle', email: '' }); }} placeholder="caregiver@example.com" required /><button type="button" onClick={sendOtp} disabled={otpBusy || emailVerification.status === 'verified'}>{emailVerification.status === 'verified' ? 'Verified' : otpBusy ? 'Sending…' : 'Send OTP'}</button></div></label>
            {emailVerification.status === 'sent' && <label className="full">Email OTP<div className="caregiver-otp-row"><input value={emailOtp} onChange={event => setEmailOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength="6" placeholder="6-digit OTP" /><button type="button" onClick={verifyOtp} disabled={otpBusy}>{otpBusy ? 'Checking…' : 'Verify'}</button></div></label>}
            <label>Password<PasswordField name="password" value={passwordValue} onChange={event => setPasswordValue(event.target.value)} visible={showPasswords.password} onToggle={() => setShowPasswords(value => ({ ...value, password: !value.password }))} /></label>
            <label>Confirm password<PasswordField name="confirmPassword" visible={showPasswords.confirm} onToggle={() => setShowPasswords(value => ({ ...value, confirm: !value.confirm }))} /></label>
          </div>
          {passwordValue && <div className={`caregiver-password-strength ${strengthLabel.toLowerCase()}`}><div><span>Password strength</span><strong>{strengthLabel}</strong></div><div className="caregiver-strength-bar">{[0, 1, 2, 3, 4].map(index => <i key={index} className={index < strengthScore ? 'filled' : ''} />)}</div></div>}
          <label className="caregiver-consent"><input name="consent" type="checkbox" /> I confirm that this caregiver is trusted and may access the linked family care information.</label>
          <div className="mother-caregiver-actions"><button type="button" className="family-secondary" onClick={closeForm} disabled={busy}>Cancel</button><button className="family-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit caregiver request'}</button></div>
        </form>
      </div>}
    </main>
  </>;
}
