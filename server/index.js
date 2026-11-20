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
const brevoConfigured = Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
const resendConfigured = Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM));
const emailConfigured = brevoConfigured || resendConfigured || smtpConfigured;
const emailProvider = brevoConfigured ? 'brevo' : resendConfigured ? 'resend' : smtpConfigured ? 'smtp' : 'none';
const textbeeApiUrl = String(process.env.TEXTBEE_API_URL || 'https://api.textbee.dev/api/v1').replace(/\/+$/, '');
const textbeeConfigured = Boolean(process.env.TEXTBEE_API_KEY);
const adminSmsPhone = normalizeSmsNumber(process.env.ADMIN_SMS_PHONE);
const port = Number(process.env.PORT || 3001);
const configuredFrontendOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(',').map(origin => origin.trim()).filter(Boolean);
const frontendOrigins = [...new Set([...configuredFrontendOrigins, 'http://localhost', 'https://localhost', 'capacitor://localhost', 'ionic://localhost'])];
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

async function userContact(userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  const user = data.user || {};
  return {
    email: user.email || '',
    phone: normalizeSmsNumber(user.phone || user.user_metadata?.contact_number),
  };
}

async function userEmail(userId) {
  return (await userContact(userId)).email;
}

function normalizeSmsNumber(value) {
  const raw = String(value || '').trim().replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(raw)) return `+63${raw.slice(1)}`;
  if (/^9\d{9}$/.test(raw)) return `+63${raw}`;
  if (/^63\d{10}$/.test(raw)) return `+${raw}`;
  if (/^\+63\d{10}$/.test(raw)) return raw;
  return '';
}

async function contactsForUserIds(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const [{ data: profiles, error: profileError }, { data: motherLinks, error: motherLinkError }] = await Promise.all([
    supabase.from('profiles').select('id,phone').in('id', uniqueIds),
    supabase.from('mother_accounts').select('user_id,mother_id').in('user_id', uniqueIds),
  ]);
  if (profileError) throw profileError;
  if (motherLinkError) throw motherLinkError;
  const motherIds = [...new Set((motherLinks || []).map(link => link.mother_id).filter(Boolean))];
  const { data: mothers, error: motherError } = motherIds.length
    ? await supabase.from('mothers').select('id,contact_number').in('id', motherIds)
    : { data: [], error: null };
  if (motherError) throw motherError;
  const recipients = [];
  for (const userId of uniqueIds) {
    const authContact = await userContact(userId);
    const profile = (profiles || []).find(item => item.id === userId);
    const motherLink = (motherLinks || []).find(item => item.user_id === userId);
    const mother = motherLink ? (mothers || []).find(item => item.id === motherLink.mother_id) : null;
    recipients.push({ userId, email: authContact.email, phone: normalizeSmsNumber(profile?.phone || mother?.contact_number) || authContact.phone });
  }
  return recipients;
}

async function emailsForUserIds(userIds) {
  return (await contactsForUserIds(userIds)).filter(recipient => recipient.email);
}

async function adminRecipients() {
  const { data: profiles, error } = await supabase.from('profiles').select('id').eq('role', 'admin');
  if (error) throw error;
  const recipients = await contactsForUserIds((profiles || []).map(profile => profile.id));
  // Optional fallback for deployments where the administrator's profile has
  // no phone number yet. Prefer saving the number in the admin profile.
  if (adminSmsPhone && !recipients.some(recipient => recipient.phone === adminSmsPhone)) {
    recipients.push({ userId: 'admin-sms-fallback', email: '', phone: adminSmsPhone });
  }
  return recipients;
}

async function sendSms({ to, message }) {
  if (!textbeeConfigured) return false;
  const recipient = normalizeSmsNumber(to);
  if (!recipient) return false;
  const response = await fetch(`${textbeeApiUrl}/gateway/send-sms`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.TEXTBEE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [recipient], message: String(message || '').replace(/\s+/g, ' ').trim().slice(0, 1600) }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`TextBee request failed (${response.status}): ${details}`);
  }
  return true;
}

function buildSmsMessage({ title, intro, details = [] }) {
  const smsIntro = String(intro || title || '').replace(/\s+/g, ' ').trim();
  const smsDetails = details
    .map(([label, value]) => `${label}: ${value}`)
    .filter(Boolean)
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim();
  return `MEDIMAMA: ${smsIntro}${smsDetails ? ` ${smsDetails}.` : ''} Open the app for full details.`;
}

async function sendSmsNotifications(recipients, { title, intro, details = [] }) {
  if (!textbeeConfigured) return 0;
  const sentNumbers = new Set();
  let sent = 0;
  for (const recipient of recipients) {
    if (!recipient.phone) {
      console.warn(`TextBee SMS skipped for ${recipient.userId || 'recipient'}: no phone number configured.`);
      continue;
    }
    if (sentNumbers.has(recipient.phone)) continue;
    sentNumbers.add(recipient.phone);
    try {
      if (await sendSms({ to: recipient.phone, message: buildSmsMessage({ title, intro, details }) })) sent += 1;
    } catch (error) {
      console.warn(`TextBee SMS failed for ${recipient.phone}:`, error.message);
    }
  }
  return sent;
}

async function notifyAdmins({ subject, title, intro, details = [], sourceKey, linkPath = '/support/notifications', sendSmsNotification = true }) {
  const recipients = await adminRecipients();
  if (!recipients.length) return { notified: 0, emailed: 0, smsSent: 0 };

  // Keep an in-app notification as a fallback so an admin is still alerted
  // when the external email provider is temporarily unavailable.
  const notificationKey = sourceKey || `admin-activity:${Date.now()}:${randomInt(100000, 999999)}`;
  const notificationMessage = [title, intro, ...details.map(([label, value]) => `${label}: ${value}`)].join('\n').slice(0, 1000);
  const { error: notificationError } = await supabase.from('notifications').upsert(
    recipients.map(recipient => ({ user_id: recipient.userId, source_key: notificationKey, message: notificationMessage, link_path: linkPath })),
    { onConflict: 'user_id,source_key', ignoreDuplicates: true },
  );
  if (notificationError) console.warn('Admin inbox notification failed:', notificationError.message);

  let emailed = 0;
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    try {
      await sendMail({ to: recipient.email, subject, title, intro, details });
      emailed += 1;
    } catch (error) {
      console.warn(`Admin email failed for ${recipient.email}:`, error.message);
    }
  }
  const smsSent = sendSmsNotification ? await sendSmsNotifications(recipients, { title, intro, details }) : 0;
  return { notified: recipients.length, emailed, smsSent };
}

const motherTransactionLabels = {
  care_request_submitted: 'New care request submitted',
  care_request_follow_up: 'Care request follow-up received',
  infant_registration: 'New infant registration submitted',
  profile_updated: 'Mother profile updated',
};

async function notifyMotherTransaction(context, body) {
  if (context.profile.role !== 'mother') return { status: 403, body: { error: 'Only mother accounts can send this notification.' } };
  const type = String(body.type || '').trim();
  const title = motherTransactionLabels[type];
  if (!title) return { status: 400, body: { error: 'Unsupported mother transaction.' } };
  const details = Object.entries(body.details || {})
    .slice(0, 8)
    .map(([label, value]) => [String(label).slice(0, 80), String(value ?? '').slice(0, 500)])
    .filter(([, value]) => value);
  const displayName = context.profile.full_name || context.user.email || 'A mother account';
  const result = await notifyAdmins({
    subject: `MediMama: ${title}`,
    title,
    intro: `${displayName} completed an action in the mother portal.`,
    details: [['Mother', displayName], ['Account email', context.user.email || 'Not available'], ...details],
    sourceKey: `mother-transaction:${context.user.id}:${type}:${Date.now()}`,
  });
  return { status: 200, body: { sent: result.emailed, notified: result.notified } };
}

async function sendMail({ to, subject, title, intro, details = [] }) {
  if (!emailConfigured) throw new Error('Email delivery is not configured. Add BREVO_API_KEY and BREVO_FROM_EMAIL, RESEND_API_KEY and RESEND_FROM_EMAIL, or configure SMTP.');
  const rows = details.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#63708a"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fd;font-family:Arial,sans-serif;color:#203252;padding:32px 16px"><div style="max-width:580px;margin:auto;background:#fff;border:1px solid #dce7fa;border-radius:18px;padding:32px;box-shadow:0 10px 28px rgba(38,63,107,.08)"><div style="color:#e0588d;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">MediMama notification</div><h1 style="margin:10px 0 12px;font-size:26px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(intro)}</p>${rows ? `<table style="margin:22px 0;font-size:14px;line-height:1.5">${rows}</table>` : ''}<p style="font-size:13px;line-height:1.6;color:#63708a">Open MediMama to view the full details.</p></div></body></html>`;
  const text = `${title}\n\n${intro}\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}`;
  if (brevoConfigured) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_FROM_EMAIL, name: process.env.BREVO_FROM_NAME || 'MediMama' },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Brevo request failed (${response.status}): ${details}`);
    }
    return;
  }
  if (resendConfigured) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || process.env.MAIL_FROM,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Resend request failed (${response.status}): ${details}`);
    }
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text, html });
}

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const registrationOtpHash = (email, otp) => createHash('sha256').update(`${email}:${otp}:${process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex');
async function registrationEmailExists(email) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    if (users.some(user => normalizeEmail(user.email) === email)) return true;
    if (users.length < perPage) return false;
  }
}

async function checkRegistrationEmail(body) {
  const email = normalizeEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  const alreadyRegistered = await registrationEmailExists(email);
  return { status: 200, body: { email, available: !alreadyRegistered, alreadyRegistered } };
}

async function sendRegistrationOtp(body) {
  const email = normalizeEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  if (await registrationEmailExists(email)) return { status: 409, body: { error: 'This email is already registered. Please log in or use another email address.', alreadyRegistered: true } };
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
  try {
    await notifyAdmins({
      subject: 'MediMama: New caregiver request',
      title: 'New caregiver request',
      intro: 'A mother submitted a caregiver access request that is waiting for administrator review.',
      details: [['Caregiver', fullName], ['Email', email], ['Relationship', metadata.relationship], ['Linked mother', metadata.linked_patient]],
      sourceKey: `caregiver-request:${created.user.id}`,
      linkPath: '/caregiver-requests',
    });
  } catch (error) {
    console.warn('Caregiver request admin email failed:', error.message);
  }
  return { status: 200, body: { created: true, pendingApproval: true } };
}

async function registerMother(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const validId = body.validId || {};
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const fileData = String(validId.data || '');
  const base64 = fileData.includes(',') ? fileData.split(',').pop() : fileData;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  if (await registrationEmailExists(email)) return { status: 409, body: { error: 'This email is already registered. Please log in or use another email address.', alreadyRegistered: true } };
  const otpRecord = registrationOtps.get(email);
  if (!otpRecord?.verifiedAt || Date.now() - otpRecord.verifiedAt > registrationOtpLifetimeMs) return { status: 400, body: { error: 'Verify your email with the OTP before registering.' } };
  if (!validPassword(password)) return { status: 400, body: { error: 'Password needs 8+ characters with uppercase, lowercase, number, and special character.' } };
  if (!String(body.firstName || '').trim() || !String(body.lastName || '').trim()) return { status: 400, body: { error: 'First name and last name are required.' } };
  if (!String(body.address || '').trim() || !String(body.birthdate || '').trim() || !/^9\d{9}$/.test(String(body.contact || ''))) return { status: 400, body: { error: 'Complete the address, birthdate, and valid Philippine mobile number.' } };
  if (!allowedTypes.has(String(validId.type || '')) || !base64) return { status: 400, body: { error: 'Upload a JPEG, PNG, WebP, or PDF valid ID.' } };

  let idBuffer;
  try { idBuffer = Buffer.from(base64, 'base64'); } catch { return { status: 400, body: { error: 'The valid ID file could not be read.' } };
  }
  if (!idBuffer.length || idBuffer.length > 5 * 1024 * 1024) return { status: 400, body: { error: 'The valid ID must be 5 MB or smaller.' } };

  const fullName = [body.firstName, body.middleName, body.lastName, body.suffix].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  const metadata = {
    full_name: fullName,
    requested_role: 'mother',
    email,
    address: String(body.address || '').trim(),
    birthdate: String(body.birthdate || '').trim(),
    contact_number: String(body.contact || '').trim(),
  };
  const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (createError || !created.user) {
    const duplicate = /already registered|already exists|duplicate/i.test(createError?.message || '');
    return { status: duplicate ? 409 : 400, body: { error: duplicate ? 'This email is already registered. Please log in or use another email address.' : createError?.message || 'Mother account could not be created.' } };
  }

  const safeName = String(validId.name || 'valid-id').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'valid-id';
  const path = `mother-ids/${created.user.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('caregiver-ids').upload(path, idBuffer, { contentType: validId.type, upsert: false });
  if (uploadError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    throw uploadError;
  }

  const { data: motherLink, error: motherLinkError } = await supabase.from('mother_accounts').select('mother_id').eq('user_id', created.user.id).single();
  if (motherLinkError || !motherLink) {
    await supabase.storage.from('caregiver-ids').remove([path]);
    await supabase.auth.admin.deleteUser(created.user.id);
    throw motherLinkError || new Error('Mother account link was not created.');
  }
  const { error: motherUpdateError } = await supabase.from('mothers').update({ email, valid_id_path: path, valid_id_name: safeName }).eq('id', motherLink.mother_id);
  if (motherUpdateError) {
    await supabase.storage.from('caregiver-ids').remove([path]);
    await supabase.auth.admin.deleteUser(created.user.id);
    throw motherUpdateError;
  }

  registrationOtps.delete(email);
  try {
    await notifyAdmins({
      subject: 'MediMama: New mother registration',
      title: 'New mother registration',
      intro: 'A new mother account was submitted and is waiting for health center review.',
      details: [['Mother', fullName], ['Email', email], ['Contact', metadata.contact_number], ['Address', metadata.address]],
      sourceKey: `mother-registration:${created.user.id}`,
      linkPath: '/caregiver-requests',
    });
  } catch (error) {
    console.warn('Mother registration admin email failed:', error.message);
  }
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
  const contacts = await contactsForUserIds(recipients.userIds);
  const eventType = String(body.eventType || 'updated');
  // A reschedule request is an admin-review event. The mother and caregivers
  // should receive one family notification after the admin approves it, not
  // another SMS immediately when the request is submitted.
  const notifyFamily = !(context.profile.role === 'mother' && eventType === 'reschedule_requested');
  const emails = contacts.filter(recipient => recipient.email);
  const actionLabels = { booked: 'booked', rescheduled: 'rescheduled', reschedule_declined: 'declined', confirmed: 'confirmed', completed: 'marked completed', cancelled: 'cancelled', updated: 'updated' };
  const actionLabel = actionLabels[eventType] || 'updated';
  const familyTitle = eventType === 'reschedule_declined' ? 'Reschedule request declined' : `Appointment ${actionLabel}`;
  const familyIntro = eventType === 'reschedule_declined'
    ? 'Your reschedule request was declined by the health center. Your original appointment schedule remains unchanged.'
    : `Your MediMama care appointment was ${actionLabel}.`;
  const familyDetails = [['Service', appointment.service], ['Schedule', formatDate(appointment.scheduled_at)], ['Status', eventType === 'reschedule_declined' ? 'Reschedule declined; original appointment unchanged' : appointment.status]];
  let familyEmailed = 0;
  if (notifyFamily) {
    for (const recipient of emails) {
      try {
        await sendMail({
          to: recipient.email,
          subject: `MediMama appointment update: ${appointment.service}`,
          title: familyTitle,
          intro: familyIntro,
          details: familyDetails,
        });
        familyEmailed += 1;
      } catch (error) {
        console.warn(`Family appointment email failed for ${recipient.email}:`, error.message);
      }
    }
  }
  const familySmsSent = notifyFamily ? await sendSmsNotifications(contacts, {
    title: familyTitle,
    intro: familyIntro,
    details: familyDetails,
  }) : 0;
  if (context.profile.role === 'mother') {
    const action = eventType.replaceAll('_', ' ');
    const displayName = context.profile.full_name || context.user.email || 'A mother';
    const isRescheduleRequest = eventType === 'reschedule_requested';
    const details = [
      ['Mother', displayName],
      ['Account email', context.user.email || 'Not available'],
      ['Appointment type', appointment.service],
      ['Current schedule', formatDate(appointment.scheduled_at)],
      ['Current appointment status', appointment.status],
    ];
    let requestId = '';
    if (isRescheduleRequest) {
      const { data: request, error: requestError } = await supabase.from('appointment_change_requests').select('id,requested_scheduled_at,reason').eq('appointment_id', appointment.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (requestError) throw requestError;
      if (request) {
        requestId = request.id || '';
        details.push(['Requested schedule', formatDate(request.requested_scheduled_at)]);
        details.push(['Reason for moving the appointment', request.reason || 'Not provided']);
        details.push(['Request status', 'Pending admin review']);
      }
    }
    const adminTitle = isRescheduleRequest
      ? `MEDIMAMA: ${displayName} sent a reschedule request`
      : 'Mother appointment activity';
    const adminResult = await notifyAdmins({
      subject: isRescheduleRequest ? adminTitle : `MediMama: Mother appointment ${action}`,
      title: adminTitle,
      intro: isRescheduleRequest
        ? `MEDIMAMA: ${displayName} sent a reschedule request. Review the complete request details below.`
        : `${displayName} ${action} an appointment in the mother portal.`,
      details,
      sourceKey: requestId ? `mother-appointment-request:${requestId}` : `mother-appointment:${appointment.id}:${eventType}:${Date.now()}`,
      linkPath: '/healthcare?tab=appointments',
      sendSmsNotification: true,
    });
    return { status: 200, body: { sent: familyEmailed, smsSent: familySmsSent, adminNotified: adminResult.notified, adminEmailed: adminResult.emailed, adminSmsSent: adminResult.smsSent } };
  }
  return { status: 200, body: { sent: familyEmailed, smsSent: familySmsSent } };
}

async function notifyAnnouncement(context, body) {
  if (context.profile.role !== 'admin') return { status: 403, body: { error: 'Only administrators can send announcements.' } };
  const announcementId = String(body.announcementId || '');
  if (!announcementId) return { status: 400, body: { error: 'announcementId is required.' } };
  const { data: announcement, error } = await supabase.from('announcements').select('title,description,audience,priority').eq('id', announcementId).single();
  if (error || !announcement) return { status: 404, body: { error: 'Announcement not found.' } };
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,role').in('role', ['mother', 'caregiver']);
  if (profileError) throw profileError;
  const contacts = await contactsForUserIds((profiles || []).map(profile => profile.id));
  const emails = contacts.filter(recipient => recipient.email);
  for (const recipient of emails) {
    await sendMail({ to: recipient.email, subject: `MediMama announcement: ${announcement.title}`, title: announcement.title, intro: announcement.description, details: [['Audience', announcement.audience], ['Priority', announcement.priority]] });
  }
  const smsSent = await sendSmsNotifications(contacts, {
    title: announcement.title,
    intro: 'There is a new health center announcement. Open the app for full details.',
  });
  return { status: 200, body: { sent: emails.length, smsSent } };
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
  const contacts = await contactsForUserIds([request.caregiver_id, ...(motherLinks || []).map(link => link.user_id)]);
  const emails = contacts.filter(recipient => recipient.email);
  for (const recipient of emails) {
    const caregiverRecipient = recipient.userId === request.caregiver_id;
    await sendMail({
      to: recipient.email,
      subject: 'MediMama caregiver account approved',
      title: caregiverRecipient ? 'Caregiver account approved' : 'A caregiver has been approved',
      intro: caregiverRecipient ? 'Your MediMama caregiver account has been approved. You can now log in and access the linked family records.' : `${request.full_name} has been approved as a caregiver for your MediMama account.`,
      details: [['Caregiver', request.full_name], ['Relationship', assignment?.relationship || 'Caregiver'], ['Linked mother', request.requested_patient_name]],
    });
  }
  const smsSent = await sendSmsNotifications(contacts, {
    title: 'Caregiver access update',
    intro: 'A caregiver account was approved in MediMama. Open the app for full details.',
  });
  return { status: 200, body: { sent: emails.length, smsSent } };
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
  const contacts = await contactsForUserIds((links || []).map(link => link.user_id));
  const emails = contacts.filter(recipient => recipient.email);
  for (const recipient of emails) {
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
  const approved = decision === 'approved';
  const smsSent = await sendSmsNotifications(contacts, {
    title: approved ? 'MediMama account approved' : 'MediMama registration update',
    intro: approved ? 'Your MediMama account was approved. Open the app to continue.' : 'Your MediMama registration needs further review. Open the app for details.',
  });
  return { status: 200, body: { sent: emails.length, smsSent } };
}

async function notifyVaccineRecord(context, body) {
  if (context.profile.role !== 'admin') return { status: 403, body: { error: 'Only administrators can send immunization notifications.' } };
  const vaccinationId = String(body.vaccinationId || '');
  if (!vaccinationId) return { status: 400, body: { error: 'vaccinationId is required.' } };

  const { data: vaccination, error: vaccinationError } = await supabase
    .from('vaccinations')
    .select('id,infant_id,administered_at,vaccine,dose,notes,recorded_by_label,provider')
    .eq('id', vaccinationId)
    .single();
  if (vaccinationError || !vaccination) return { status: 404, body: { error: 'Vaccination record not found.' } };

  const { data: infant, error: infantError } = await supabase
    .from('infants')
    .select('id,full_name,mother_id')
    .eq('id', vaccination.infant_id)
    .single();
  if (infantError || !infant) return { status: 404, body: { error: 'Infant record not found.' } };

  const [{ data: motherLinks, error: motherError }, { data: caregiverLinks, error: caregiverError }] = await Promise.all([
    supabase.from('mother_accounts').select('user_id').eq('mother_id', infant.mother_id),
    supabase.from('caregiver_assignments').select('caregiver_id').eq('mother_id', infant.mother_id).eq('status', 'approved'),
  ]);
  if (motherError) throw motherError;
  if (caregiverError) throw caregiverError;

  const userIds = [
    ...(motherLinks || []).map(link => link.user_id),
    ...(caregiverLinks || []).map(link => link.caregiver_id),
  ];
  const contacts = await contactsForUserIds(userIds);
  const recordedBy = vaccination.recorded_by_label || vaccination.provider || 'Health Center';
  const details = [
    ['Infant', infant.full_name],
    ['Vaccine', vaccination.vaccine],
    ['Dose', vaccination.dose],
    ['Date recorded', vaccination.administered_at],
    ['Recorded by', recordedBy],
  ];
  if (vaccination.notes) details.push(['Notes', vaccination.notes]);

  const title = 'Infant immunization recorded';
  const intro = `${infant.full_name}'s ${vaccination.vaccine} ${vaccination.dose} was recorded by the health center.`;
  const sourceKey = `vaccine-record:${vaccination.id}`;
  const notificationMessage = [title, intro, ...details.map(([label, value]) => `${label}: ${value}`)].join('\n').slice(0, 1000);
  const { error: notificationError } = await supabase.from('notifications').upsert(
    contacts.map(contact => ({ user_id: contact.userId, source_key: sourceKey, message: notificationMessage, link_path: '/user/records' })),
    { onConflict: 'user_id,source_key', ignoreDuplicates: true },
  );
  if (notificationError) console.warn('Family immunization inbox notification failed:', notificationError.message);

  let emailed = 0;
  for (const recipient of contacts.filter(contact => contact.email)) {
    try {
      await sendMail({
        to: recipient.email,
        subject: `MediMama: ${infant.full_name}'s immunization was recorded`,
        title,
        intro,
        details,
      });
      emailed += 1;
    } catch (error) {
      console.warn(`Family immunization email failed for ${recipient.email}:`, error.message);
    }
  }
  const smsSent = await sendSmsNotifications(contacts, { title, intro, details });
  return { status: 200, body: { notified: contacts.length, emailed, smsSent } };
}

async function processReminderEmails() {
  if (reminderJobRunning || (!emailConfigured && !textbeeConfigured)) return;
  reminderJobRunning = true;
  try {
    await supabase.rpc('generate_appointment_reminders');
    await supabase.rpc('generate_vaccine_reminders');
    const { data: rows, error } = await supabase.from('notifications')
      .select('id,user_id,message,created_at,source_key,email_sent_at,sms_sent_at')
      .or('source_key.like.appointment-1day:*,source_key.like.vaccine:*')
      .or('email_sent_at.is.null,sms_sent_at.is.null')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;

    const smsRowsByNumber = new Map();
    for (const row of rows || []) {
      const contact = await userContact(row.user_id);
      if (emailConfigured && row.email_sent_at === null) {
        let emailDelivered = !contact.email;
        if (contact.email) {
          try {
            await sendMail({ to: contact.email, subject: 'MediMama reminder', title: 'Care reminder', intro: row.message, details: [['Received', formatDate(row.created_at)]] });
            emailDelivered = true;
          } catch (sendError) {
            console.warn(`Reminder email failed for ${contact.email}:`, sendError.message);
          }
        }
        if (emailDelivered) {
          const { error: emailUpdateError } = await supabase.from('notifications')
            .update({ email_sent_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('email_sent_at', null);
          if (emailUpdateError) throw emailUpdateError;
        }
      }

      if (textbeeConfigured && row.sms_sent_at === null) {
        if (!contact.phone) {
          const { error: smsUpdateError } = await supabase.from('notifications')
            .update({ sms_sent_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('sms_sent_at', null);
          if (smsUpdateError) throw smsUpdateError;
        } else {
          const reminderRows = smsRowsByNumber.get(contact.phone) || [];
          reminderRows.push({ row, contact });
          smsRowsByNumber.set(contact.phone, reminderRows);
        }
      }
    }

    // One SMS per phone number per reminder run, even when the same phone is
    // linked to more than one MediMama account.
    for (const [phone, reminderRows] of smsRowsByNumber) {
      const first = reminderRows[0];
      try {
        await sendSms({ to: phone, message: buildSmsMessage({ intro: first.row.message }) });
        const ids = reminderRows.map(({ row }) => row.id);
        const { error: smsUpdateError } = await supabase.from('notifications')
          .update({ sms_sent_at: new Date().toISOString() })
          .in('id', ids)
          .is('sms_sent_at', null);
        if (smsUpdateError) throw smsUpdateError;
      } catch (sendError) {
        console.warn(`Reminder SMS failed for ${phone}:`, sendError.message);
      }
    }
  } catch (error) {
    console.error('Reminder delivery job failed:', error.message);
  } finally {
    reminderJobRunning = false;
  }
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  response.setHeader('Access-Control-Allow-Origin', requestOrigin && frontendOrigins.includes(requestOrigin) ? requestOrigin : frontendOrigins[0]);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (request.method === 'OPTIONS') return response.end();
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, emailConfigured, emailProvider, smsConfigured: textbeeConfigured, smsProvider: textbeeConfigured ? 'textbee' : 'none' });
  if (request.method !== 'POST' || (!url.pathname.startsWith('/api/email/') && !['/api/caregiver/register', '/api/mother/register'].includes(url.pathname))) return json(response, 404, { error: 'Not found.' });
  try {
    const body = await readBody(request);
    if (url.pathname === '/api/email/registration-check') return json(response, ...(await checkRegistrationEmail(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/email/registration-otp') return json(response, ...(await sendRegistrationOtp(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/email/verify-registration-otp') return json(response, ...(await verifyRegistrationOtp(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/caregiver/register') return json(response, ...(await registerCaregiver(body).then(result => [result.status, result.body])));
    if (url.pathname === '/api/mother/register') return json(response, ...(await registerMother(body).then(result => [result.status, result.body])));
    const context = await authContext(request);
    if (!context) return json(response, 401, { error: 'Authentication required.' });
    if (url.pathname === '/api/email/login') {
      await sendMail({ to: context.user.email, subject: 'MediMama login notification', title: 'New login detected', intro: 'Your MediMama account was signed in successfully.', details: [['Account', context.user.email], ['Role', context.profile.role], ['Login time', formatDate(new Date())]] });
      return json(response, 200, { sent: 1 });
    }
    const result = url.pathname === '/api/email/appointment' ? await notifyAppointment(context, body) : url.pathname === '/api/email/mother-transaction' ? await notifyMotherTransaction(context, body) : url.pathname === '/api/email/announcement' ? await notifyAnnouncement(context, body) : url.pathname === '/api/email/caregiver-approved' ? await notifyCaregiverApproved(context, body) : url.pathname === '/api/email/mother-approval' ? await notifyMotherApproval(context, body) : url.pathname === '/api/email/vaccine-record' ? await notifyVaccineRecord(context, body) : { status: 404, body: { error: 'Unknown email event.' } };
    return json(response, result.status, result.body);
  } catch (error) {
    console.error('Email request failed:', error.message);
    return json(response, 500, { error: 'Email could not be sent.' });
  }
});

server.listen(port, () => {
  console.log(`MediMama email server listening on http://localhost:${port}`);
  if (!emailConfigured) console.warn('Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL, or configure SMTP.');
  if (textbeeConfigured) console.log('TextBee SMS provider configured.');
  if (!textbeeConfigured) console.warn('TextBee SMS delivery is disabled. Add TEXTBEE_API_KEY to enable SMS notifications.');
  if (brevoConfigured) console.log('Brevo email provider configured.');
  if (!brevoConfigured && resendConfigured) console.log('Resend email provider configured.');
  if (!brevoConfigured && !resendConfigured && transporter) void transporter.verify().then(() => console.log('SMTP connection verified.')).catch(error => console.warn(`SMTP verification failed: ${error.message}`));
});

setTimeout(processReminderEmails, 3000);
setInterval(processReminderEmails, reminderPollMs);
