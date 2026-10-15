import { supabase } from './supabase';

const emailApiUrl = import.meta.env.VITE_EMAIL_API_URL || 'http://localhost:3001';

async function publicEmailRequest(path, body) {
  try {
    const response = await fetch(`${emailApiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data : { error: data.error || 'Email service request failed.' };
  } catch (error) {
    return { error: 'Email service is unavailable. Start the email server and try again.' };
  }
}

export function requestRegistrationOtp(email) {
  return publicEmailRequest('/api/email/registration-otp', { email });
}

export function verifyRegistrationOtp(email, otp) {
  return publicEmailRequest('/api/email/verify-registration-otp', { email, otp });
}

export function registerCaregiverAccount(payload) {
  return publicEmailRequest('/api/caregiver/register', payload);
}

export async function notifyEmailEvent(path, body = {}) {
  if (!supabase) return;
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  try {
    const response = await fetch(`${emailApiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) console.warn(`Email event ${path} failed:`, await response.text());
  } catch (error) {
    console.warn(`Email service unavailable for ${path}:`, error.message);
  }
}
