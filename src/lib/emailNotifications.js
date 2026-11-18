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
    return response.ok ? data : { ...data, error: data.error || 'Email service request failed.' };
  } catch (error) {
    return { error: 'Email service is unavailable. Start the email server and try again.' };
  }
}

export function requestRegistrationOtp(email) {
  return publicEmailRequest('/api/email/registration-otp', { email });
}

export function checkRegistrationEmail(email) {
  return publicEmailRequest('/api/email/registration-check', { email });
}

export function verifyRegistrationOtp(email, otp) {
  return publicEmailRequest('/api/email/verify-registration-otp', { email, otp });
}

export function registerCaregiverAccount(payload) {
  return publicEmailRequest('/api/caregiver/register', payload);
}

export function registerMotherAccount(payload) {
  return publicEmailRequest('/api/mother/register', payload);
}

export async function notifyEmailEvent(path, body = {}) {
  if (!supabase) return { error: 'Supabase is not configured.' };
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: 'Authentication session is missing.' };
  try {
    const response = await fetch(`${emailApiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn(`Notification event ${path} failed:`, data.error || response.statusText);
      return { ...data, error: data.error || response.statusText };
    }
    if (path === '/api/email/appointment' && body.eventType === 'reschedule_requested' && data.adminSmsSent === 0) {
      console.warn('Reschedule request reached the email server, but no admin SMS was sent. Check the admin contact number and TextBee configuration.');
    }
    return data;
  } catch (error) {
    console.warn(`Email service unavailable for ${path}:`, error.message);
    return { error: error.message };
  }
}
