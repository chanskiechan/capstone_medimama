import { supabase } from './supabase';

// Login must remain available even when the optional email delivery service is
// unavailable or has not been deployed yet.
export async function sendLoginNotification({ email, name, role }) {
  if (!supabase || !email || !['mother', 'caregiver'].includes(role)) return { sent: false, skipped: true };

  try {
    const { data, error } = await supabase.functions.invoke('send-login-notification', {
      body: { email, name, role },
    });
    if (error) return { sent: false, error };
    return data || { sent: true };
  } catch (error) {
    return { sent: false, error };
  }
}
