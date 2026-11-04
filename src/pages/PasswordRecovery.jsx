import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageStyles } from '../components/PageStyles';
import { supabase } from '../lib/supabase';
import './Support.css';

export default function PasswordRecovery({ reset = false }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!reset) return undefined;

    const { data: listener } = supabase.auth.onAuthStateChange((event, auth) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION') {
        setReady(Boolean(auth));
      }
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setReady(Boolean(data.session));
    });

    return () => listener.subscription.unsubscribe();
  }, [reset]);

  const submit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    setNotice('');

    if (
      reset &&
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(values.password)
    ) {
      setError('Use at least 8 characters, including uppercase, lowercase, a number and a symbol.');
      return;
    }

    if (reset && values.password !== values.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const result = reset
        ? await supabase.auth.updateUser({ password: values.password })
        : await supabase.auth.resetPasswordForEmail(values.email.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
          });

      if (result.error) throw result.error;

      if (reset) {
        await supabase.auth.signOut();
        localStorage.removeItem('medimama-current-session');
        setDone(true);
        setNotice('Password updated. You can now log in with your new password.');
      } else {
        setNotice('If the address belongs to an account, a reset link will be sent. Check your inbox and spam folder.');
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageStyles page="login" />
      <main className="password-recovery-page">
        <section className="support-panel">
          <h1>{reset ? 'Choose a new password' : 'Reset your password'}</h1>

          {error && (
            <p role="alert" className="support-message">
              {error}
            </p>
          )}

          {notice && <p role="status">{notice}</p>}

          {!done && (
            <form className="support-form" onSubmit={submit}>
              {reset ? (
                <>
                  <label>
                    New password
                    <div className="password-recovery-input">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        maxLength={128}
                      />
                      <button
                        className="password-recovery-toggle"
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  <label>
                    Confirm password
                    <div className="password-recovery-input">
                      <input
                        name="confirm"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        maxLength={128}
                      />
                      <button
                        className="password-recovery-toggle"
                        type="button"
                        onClick={() => setShowConfirm((visible) => !visible)}
                        aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                        aria-pressed={showConfirm}
                      >
                        {showConfirm ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </label>

                  {!ready && (
                    <p>Open the reset link from your email to continue. If it expired, request a new link.</p>
                  )}
                </>
              ) : (
                <label>
                  Email address
                  <input name="email" type="email" autoComplete="email" required />
                </label>
              )}

              <button type="submit" disabled={busy || (reset && !ready)}>
                {busy ? 'Please wait…' : reset ? 'Save new password' : 'Send reset link'}
              </button>
            </form>
          )}

          <p>
            <Link to="/login">Back to login</Link>
            {reset && (
              <>
                {' · '}
                <Link to="/forgot-password">Request another link</Link>
              </>
            )}
          </p>
        </section>
      </main>
    </>
  );
}
