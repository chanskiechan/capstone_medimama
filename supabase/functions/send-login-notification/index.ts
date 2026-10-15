import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('LOGIN_NOTIFICATION_FROM_EMAIL');
  if (!token || !supabaseUrl || !serviceRoleKey) return json({ error: 'Unauthorized' }, 401);
  if (!resendApiKey || !fromEmail) return json({ error: 'Email delivery is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !['mother', 'caregiver'].includes(profile.role)) {
    return json({ error: 'Only mother and caregiver accounts can receive login notifications' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const email = String(authData.user.email || '').trim().toLowerCase();
  if (!email || String(body.email || '').trim().toLowerCase() !== email) return json({ error: 'Email does not match the signed-in account' }, 403);

  const roleLabel = profile.role === 'caregiver' ? 'Caregiver' : 'Mother';
  const displayName = profile.full_name || email;
  const loginTime = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date());
  const subject = `MediMama login notification - ${roleLabel}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fd;font-family:Arial,sans-serif;color:#203252;padding:32px 16px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dce7fa;border-radius:18px;padding:32px;box-shadow:0 10px 28px rgba(38,63,107,.08)"><div style="color:#e0588d;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">MediMama security alert</div><h1 style="margin:10px 0 12px;font-size:26px">New login detected</h1><p style="font-size:16px;line-height:1.6">Hello ${escapeHtml(displayName)}, your ${roleLabel.toLowerCase()} account was signed in successfully.</p><div style="background:#f7faff;border-radius:12px;padding:16px;margin:22px 0;font-size:14px;line-height:1.8"><strong>Login time:</strong> ${escapeHtml(loginTime)}<br><strong>Account:</strong> ${escapeHtml(email)}<br><strong>Role:</strong> ${roleLabel}</div><p style="font-size:14px;line-height:1.6;color:#63708a">If this was not you, change your password and contact the MediMama health center administrator.</p></div></body></html>`;

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
  });
  if (!emailResponse.ok) {
    const details = await emailResponse.text();
    console.error('Resend login notification failed', details);
    return json({ error: 'Email delivery failed' }, 502);
  }

  return json({ sent: true });
});
