import { createServer } from 'node:http';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const serverDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(serverDirectory, '.env') });

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`Missing server environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
const transporter = smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || smtpPort === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;
const port = Number(process.env.PORT || 3001);
const frontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map(origin => origin.trim()).filter(Boolean);
const reminderPollMs = Math.max(30_000, Number(process.env.REMINDER_POLL_MS || 60_000));
let reminderJobRunning = false;
const registrationOtps = new Map();
const registrationOtpLifetimeMs = 10 * 60 * 1000;
const registrationOtpResendMs = 60 * 1000;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const formatDate = value => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const json = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

async function authContext(request) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const { data: auth, error } = await supabase.auth.getUser(token);
  if (error || !auth.user) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,full_name,role').eq('id', auth.user.id).single();
  if (profileError || !profile) return null;
  return { user: auth.user, profile };
}

async function userEmail(userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.email || '';
}

async function emailsForUserIds(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const recipients = [];
  for (const userId of uniqueIds) {
    const email = await userEmail(userId);
    if (email) recipients.push({ userId, email });
  }
  return recipients;
}

async function sendMail({ to, subject, title, intro, details = [] }) {
  if (!transporter) throw new Error('SMTP is not configured. Copy server/.env.example to server/.env and add SMTP values.');
  const rows = details.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#63708a"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fd;font-family:Arial,sans-serif;color:#203252;padding:32px 16px"><div style="max-width:580px;margin:auto;background:#fff;border:1px solid #dce7fa;border-radius:18px;padding:32px;box-shadow:0 10px 28px rgba(38,63,107,.08)"><div style="color:#e0588d;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">MediMama notification</div><h1 style="margin:10px 0 12px;font-size:26px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(intro)}</p>${rows ? `<table style="margin:22px 0;font-size:14px;line-height:1.5">${rows}</table>` : ''}<p style="font-size:13px;line-height:1.6;color:#63708a">Open MediMama to view the full details.</p></div></body></html>`;
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text: `${title}\n\n${intro}\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}`, html });
}

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const registrationOtpHash = (email, otp) => createHash('sha256').update(`${email}:${otp}:${process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex');

async function sendRegistrationOtp(body) {
  const email = normalizeEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  const previous = registrationOtps.get(email);
  if (previous && Date.now() - previous.createdAt < registrationOtpResendMs) return { status: 429, body: { error: 'Please wait a minute before requesting another OTP.', retryAfter: Math.ceil((registrationOtpResendMs - (Date.now() - previous.createdAt)) / 1000) } };
  const otp = String(randomInt(100000, 1000000));
  registrationOtps.set(email, { hash: registrationOtpHash(email, otp), createdAt: Date.now(), expiresAt: Date.now() + registrationOtpLifetimeMs, attempts: 0 });
  await sendMail({ to: email, subject: 'MediMama email verification code', title: 'Verify your email', intro: 'Use this one-time code to continue creating your MediMama account.', details: [['OTP code', otp], ['Expires in', '10 minutes']] });
  return { status: 200, body: { sent: true, expiresIn: registrationOtpLifetimeMs / 1000 } };
}

async function verifyRegistrationOtp(body) {
  const email = normalizeEmail(body.email);
  const otp = String(body.otp || '').trim();
  const record = registrationOtps.get(email);
  if (!record || Date.now() > record.expiresAt) {
    registrationOtps.delete(email);
    return { status: 400, body: { error: 'This OTP has expired. Request a new one.' } };
  }
  if (!/^\d{6}$/.test(otp)) return { status: 400, body: { error: 'Enter the 6-digit OTP.' } };
  record.attempts += 1;
  const expected = Buffer.from(record.hash);
  const actual = Buffer.from(registrationOtpHash(email, otp));
  if (record.attempts > 5 || !timingSafeEqual(expected, actual)) {
    if (record.attempts >= 5) registrationOtps.delete(email);
    return { status: 400, body: { error: record.attempts >= 5 ? 'Too many incorrect attempts. Request a new OTP.' : 'Incorrect OTP.' } };
  }
  record.verifiedAt = Date.now();
  return { status: 200, body: { verified: true } };
}

function validPassword(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

async function registerCaregiver(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const validId = body.validId || {};
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const fileData = String(validId.data || '');
  const base64 = fileData.includes(',') ? fileData.split(',').pop() : fileData;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  const { data: existingRequest, error: existingRequestError } = await supabase.from('caregiver_requests').select('status').eq('email', email).maybeSingle();
  if (existingRequestError) throw existingRequestError;
  if (existingRequest?.status === 'pending') return { status: 200, body: { created: false, pendingApproval: true, alreadyRegistered: true } };
  if (existingRequest) return { status: 409, body: { error: `This email already has a ${existingRequest.status} caregiver request.` } };
  const otpRecord = registrationOtps.get(email);
  if (!otpRecord?.verifiedAt || Date.now() - otpRecord.verifiedAt > registrationOtpLifetimeMs) return { status: 400, body: { error: 'Verify your email with the OTP before registering.' } };
  if (!validPassword(password)) return { status: 400, body: { error: 'Password needs 8+ characters with uppercase, lowercase, number, and special character.' } };
  if (!String(body.firstName || '').trim() || !String(body.lastName || '').trim()) return { status: 400, body: { error: 'First name and last name are required.' } };
  if (!String(body.address || '').trim() || !String(body.birthdate || '').trim() || !/^9\d{9}$/.test(String(body.contact || ''))) return { status: 400, body: { error: 'Complete the address, birthdate, and valid Philippine mobile number.' } };
  if (!String(body.relationship || '').trim() || !String(body.linkedPatient || '').trim()) return { status: 400, body: { error: 'Complete the relationship and mother to link.' } };
  if (!allowedTypes.has(String(validId.type || '')) || !base64) return { status: 400, body: { error: 'Upload a JPEG, PNG, WebP, or PDF valid ID.' } };

  let idBuffer;
  try { idBuffer = Buffer.from(base64, 'base64'); } catch { return { status: 400, body: { error: 'The valid ID file could not be read.' } }; }
  if (!idBuffer.length || idBuffer.length > 5 * 1024 * 1024) return { status: 400, body: { error: 'The valid ID must be 5 MB or smaller.' } };

  const fullName = [body.firstName, body.middleName, body.lastName, body.suffix].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  const metadata = {
    full_name: fullName,
    requested_role: 'caregiver',
    email,
    middle_name: String(body.middleName || '').trim(),
    suffix: String(body.suffix || '').trim(),
    address: String(body.address || '').trim(),
    birthdate: String(body.birthdate || '').trim(),
    contact_number: String(body.contact || '').trim(),
    relationship: String(body.relationship || '').trim(),
    linked_patient: String(body.linkedPatient || '').trim(),
  };
  const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (createError || !created.user) {
    const duplicate = /already registered|already exists|duplicate/i.test(createError?.message || '');
    return { status: duplicate ? 409 : 400, body: { error: duplicate ? 'This email is already registered. Use the existing caregiver request or another email address.' : createError?.message || 'Caregiver account could not be created.' } };
  }

  const safeName = String(validId.name || 'valid-id').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'valid-id';
  const path = `${created.user.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('caregiver-ids').upload(path, idBuffer, { contentType: validId.type, upsert: false });
  if (uploadError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    throw uploadError;
  }
  const { error: requestError } = await supabase.from('caregiver_requests').update({ valid_id_path: path, valid_id_name: safeName }).eq('caregiver_id', created.user.id);
  if (requestError) {
    await supabase.storage.from('caregiver-ids').remove([path]);
    await supabase.auth.admin.deleteUser(created.user.id);
    throw requestError;
  }
  registrationOtps.delete(email);
  return { status: 200, body: { created: true, pendingApproval: true } };
}

async function appointmentRecipients(appointment) {
  let motherId = appointment.mother_id;
  if (!motherId && appointment.infant_id) {
    const { data: infant, error } = await supabase.from('infants').select('mother_id').eq('id', appointment.infant_id).single();
    if (error) throw error;
    motherId = infant.mother_id;
  }
  const [{ data: motherLink, error: motherError }, { data: caregivers, error: caregiverError }] = await Promise.all([
    supabase.from('mother_accounts').select('user_id').eq('mother_id', motherId),
    supabase.from('caregiver_assignments').select('caregiver_id').eq('mother_id', motherId).eq('status', 'approved'),
  ]);
  if (motherError) throw motherError;
  if (caregiverError) throw caregiverError;
  return { motherId, userIds: [...(motherLink || []).map(row => row.user_id), ...(caregivers || []).map(row => row.caregiver_id)] };
}

async function notifyAppointment(context, body) {
  const appointmentId = String(body.appointmentId || '');
  if (!appointmentId) return { status: 400, body: { error: 'appointmentId is required.' } };
  const { data: appointment, error } = await supabase.from('appointments').select('id,service,scheduled_at,status,mother_id,infant_id').eq('id', appointmentId).single();
  if (error || !appointment) return { status: 404, body: { error: 'Appointment not found.' } };
  const recipients = await appointmentRecipients(appointment);
  if (context.profile.role !== 'admin' && !recipients.userIds.includes(context.user.id)) return { status: 403, body: { error: 'You cannot notify this appointment.' } };
  const emails = await emailsForUserIds(recipients.userIds);
  for (const recipient of emails) {
    await sendMail({
      to: recipient.email,
      subject: `MediMama appointment update: ${appointment.service}`,
      title: 'Appointment update',
      intro: 'Your MediMama care appointment has been created or updated.',
      details: [['Service', appointment.service], ['Schedule', formatDate(appointment.scheduled_at)], ['Status', appointment.status]],
    });
  }
  return { status: 200, body: { sent: emails.length } };
}

async function notifyAnnouncement(context, body) {
  if (context.profile.role !== 'admin') return { status: 403, body: { error: 'Only administrators can send announcements.' } };
  const announcementId = String(body.announcementId || '');
  if (!announcementId) return { status: 400, body: { error: 'announcementId is required.' } };
  const { data: announcement, error } = await supabase.from('announcements').select('title,description,audience,priority').eq('id', announcementId).single();
  if (error || !announcement) return { status: 404, body: { error: 'Announcement not found.' } };
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,role').in('role', ['mother', 'caregiver']);
  if (profileError) throw profileError;
  const emails = await emailsForUserIds((profiles || []).map(profile => profile.id));
  for (const recipient of emails) {
    await sendMail({ to: recipient.email, subject: `MediMama announcement: ${announcement.title}`, title: announcement.title, intro: announcement.description, details: [['Audience', announcement.audience], ['Priority', announcement.priority]] });
  }
  return { status: 200, body: { sent: emails.length } };
}

async function notifyCaregiverApproved(context, body) {
  if (context.profile.role !== 'admin') return { status: 403, body: { error: 'Only administrators can send approval notifications.' } };
  const requestId = String(body.requestId || '');
  if (!requestId) return { status: 400, body: { error: 'requestId is required.' } };
  const { data: request, error: requestError } = await supabase.from('caregiver_requests').select('id,caregiver_id,full_name,requested_patient_name,status').eq('id', requestId).single();
  if (requestError || !request) return { status: 404, body: { error: 'Caregiver request not found.' } };
  if (request.status !== 'approved') return { status: 400, body: { error: 'The caregiver request is not approved.' } };
  const { data: assignment, error: assignmentError } = await supabase.from('caregiver_assignments').select('mother_id,relationship').eq('caregiver_id', request.caregiver_id).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (assignmentError) throw assignmentError;
  const { data: motherLinks, error: motherError } = await supabase.from('mother_accounts').select('user_id').eq('mother_id', assignment?.mother_id || '00000000-0000-0000-0000-000000000000');
  if (motherError) throw motherError;
  const recipients = await emailsForUserIds([request.caregiver_id, ...(motherLinks || []).map(link => link.user_id)]);
  for (const recipient of recipients) {
    const caregiverRecipient = recipient.userId === request.caregiver_id;
    await sendMail({
      to: recipient.email,
      subject: 'MediMama caregiver account approved',
      title: caregiverRecipient ? 'Caregiver account approved' : 'A caregiver has been approved',
      intro: caregiverRecipient ? 'Your MediMama caregiver account has been approved. You can now log in and access the linked family records.' : `${request.full_name} has been approved as a caregiver for your MediMama account.`,
      details: [['Caregiver', request.full_name], ['Relationship', assignment?.relationship || 'Caregiver'], ['Linked mother', request.requested_patient_name]],
    });
  }
  return { status: 200, body: { sent: recipients.length } };
}

async function notifyMotherApproval(context, body) {
  if (context.profile.role !== 'admin') return { status: 403, body: { error: 'Only administrators can send approval notifications.' } };
  const motherId = String(body.motherId || '');
  const decision = String(body.decision || '').toLowerCase();
  if (!motherId || !['approved', 'declined'].includes(decision)) return { status: 400, body: { error: 'motherId and a valid approval decision are required.' } };

  const { data: mother, error: motherError } = await supabase
    .from('mothers')
    .select('id,full_name,record_code,status')
    .eq('id', motherId)
    .single();
  if (motherError || !mother) return { status: 404, body: { error: 'Mother record not found.' } };

  const { data: links, error: linksError } = await supabase.from('mother_accounts').select('user_id').eq('mother_id', motherId);
  if (linksError) throw linksError;
  const recipients = await emailsForUserIds((links || []).map(link => link.user_id));
  for (const recipient of recipients) {
    const approved = decision === 'approved';
    await sendMail({
      to: recipient.email,
      subject: approved ? 'Your MediMama account has been approved' : 'MediMama registration update',
      title: approved ? 'Your MediMama account has been approved' : 'Registration needs further review',
      intro: approved
        ? 'Your account in MediMama has been approved. You can now log in.'
        : 'The health center could not approve your MediMama registration at this time. Please contact the health center for assistance or clarification.',
    });
  }
  return { status: 200, body: { sent: recipients.length } };
}

async function processReminderEmails() {
  if (reminderJobRunning || !transporter) return;
  reminderJobRunning = true;
  try {
    await supabase.rpc('generate_appointment_reminders');
    await supabase.rpc('generate_vaccine_reminders');
    const { data: rows, error } = await supabase.from('notifications').select('id,user_id,message,created_at,source_key').is('email_sent_at', null).or('source_key.like.appointment-1day:*,source_key.like.vaccine:*').order('created_at', { ascending: true }).limit(50);
    if (error) throw error;
    for (const row of rows || []) {
      const email = await userEmail(row.user_id);
      if (!email) continue;
      await sendMail({ to: email, subject: 'MediMama reminder', title: 'Care reminder', intro: row.message, details: [['Received', formatDate(row.created_at)]] });
      const { error: updateError } = await supabase.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', row.id).is('email_sent_at', null);
      if (updateError) throw updateError;
    }
  } catch (error) {
    console.error('Reminder email job failed:', error.message);
  } finally {
    reminderJobRunning = false;
  }
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  response.setHeader('Access-Control-Allow-Origin', frontendOrigins.includes(requestOrigin) ? requestOrigin : frontendOrigins[0]);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.end();
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, smtpConfigured });
  if (request.method !== 'POST' || (!url.pathname.startsWith('/api/email/') && url.pathname !== '/api/caregiver/register')) return json(response, 404, { error: 'Not found.' });
  try {
    const body = await readBody(request);
    if (url.pathname === '/api/email/registration-otp') return json(response, ...(await sendRegistrationOtp(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/email/verify-registration-otp') return json(response, ...(await verifyRegistrationOtp(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/caregiver/register') return json(response, ...(await registerCaregiver(body).then(result => [result.status, result.body])));
    const context = await authContext(request);
    if (!context) return json(response, 401, { error: 'Authentication required.' });
    if (url.pathname === '/api/email/login') {
      await sendMail({ to: context.user.email, subject: 'MediMama login notification', title: 'New login detected', intro: 'Your MediMama account was signed in successfully.', details: [['Account', context.user.email], ['Role', context.profile.role], ['Login time', formatDate(new Date())]] });
      return json(response, 200, { sent: 1 });
    }
    const result = url.pathname === '/api/email/appointment' ? await notifyAppointment(context, body) : url.pathname === '/api/email/announcement' ? await notifyAnnouncement(context, body) : url.pathname === '/api/email/caregiver-approved' ? await notifyCaregiverApproved(context, body) : url.pathname === '/api/email/mother-approval' ? await notifyMotherApproval(context, body) : { status: 404, body: { error: 'Unknown email event.' } };
    return json(response, result.status, result.body);
  } catch (error) {
    console.error('Email request failed:', error.message);
    return json(response, 500, { error: 'Email could not be sent.' });
  }
});

server.listen(port, () => {
  console.log(`MediMama email server listening on http://localhost:${port}`);
  if (!smtpConfigured) console.warn('SMTP is not configured. Copy server/.env.example to server/.env and fill in the SMTP values.');
  if (transporter) void transporter.verify().then(() => console.log('SMTP connection verified.')).catch(error => console.warn(`SMTP verification failed: ${error.message}`));
});

setTimeout(processReminderEmails, 3000);
setInterval(processReminderEmails, reminderPollMs);
