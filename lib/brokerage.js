// lib/brokerage.js  SERVER ONLY (takes the service role client).
// The brokerage record (db/021-realtor-circle.sql; docs/design/profile-and-circle.md sections
// 3.4, 4.8 and 9.5): a realtor enters their brokerage and its broker of record, the broker of
// record gets ONE email with a single use link and either confirms the details or says the
// realtor is not their agent, and the office then reviews the record before it reads confirmed.
//   · the realtor's own record: saveBrokerage and resendConfirmation take the caller's id from
//     the session (pages/api/circle/brokerage.js, behind lib/realtorRoute.js withRealtor) and
//     touch only the brokerage that realtor is the active member of and entered themselves;
//   · the link: 32 random bytes, sent once, stored only as its SHA 256, good for LINK_DAYS days
//     and for one answer. The broker of record has no account;
//   · confirmed is the office's word: approveBrokerage refuses a record its broker of record has
//     not confirmed. The broker's click alone never makes a record confirmed;
//   · a realtor who names their own address as the broker of record's, or a free mail address,
//     is flagged for the office (reviewFlags), never refused;
//   · what another realtor is shown of a brokerage (brokerageCards): its legal name, address,
//     phone, the broker of record's name, and whether it is confirmed. Never the broker of
//     record's email, the HST number or who entered it;
//   · before db/021 has run every function answers that the record is not available.
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { kvIncr, kvExpire } from './kv.js';
import { recordEvent } from './events.js';
import { logServerError } from './serverLog.js';
import { brokerageConfirmEmail, CIRCLE_FROM } from './circleEmails.js';

export const BROKERAGES = 'brokerages';
export const MEMBERS = 'brokerage_members';
export const LINK_DAYS = 14;
export const SAVES_A_DAY = 5;
const DAY = 86400000;
// A membership's standing (brokerage_members.status), named once.
const MEMBER = Object.freeze({ active: 'active', left: 'left', disputed: 'disputed' });
const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|gmx)\.[a-z.]+$/i;

const msg = (e) => String((e && e.message) || e || '');
const absent = (error) => !!error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || /(does not exist|could not find)/i.test(msg(error)));
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
const same = (a, b) => String(a) === String(b);
const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
export const isConfirmToken = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
export const confirmUrl = (token) => `${siteBase()}/brokerage/confirm/${token}`;

async function over(scope, id, limit, seconds) {
  const key = `brokerage:${scope}:${String(id).replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 80)}:${Math.floor(Date.now() / (seconds * 1000))}`;
  const n = await kvIncr(key);
  if (n === 1) await kvExpire(key, seconds + 5);
  return n !== null && n > limit;
}

// How the record stands, in the realtor's words: sent (the broker of record has not answered),
// review (they confirmed; the office is reviewing), confirmed, disputed, suspended.
export const standingOf = (b) => (b.status === 'confirmed' ? 'confirmed' : b.status === 'disputed' ? 'disputed' : b.status === 'suspended' ? 'suspended' : b.broker_confirmed_at ? 'review' : 'sent');

// What the realtor reads of their own record.
const ownView = (b) => ({ id: b.id, legalName: b.legal_name, address: b.address, phone: b.phone || '', brokerName: b.broker_of_record_name, brokerEmail: b.broker_of_record_email, hstNumber: b.hst_number || '', standing: standingOf(b), sentAt: b.confirm_sent_at || null });
// What another realtor is shown.
const cardView = (b) => ({ legalName: b.legal_name, address: b.address, phone: b.phone || null, brokerOfRecord: b.broker_of_record_name, confirmed: b.status === 'confirmed' });

// The caller's membership that counts (active, else the one a broker of record disputed) and
// its brokerage.
async function currentOf(admin, userId) {
  const { data: members, error } = await admin.from(MEMBERS).select('*').eq('profile_id', userId);
  if (error) return absent(error) ? { available: false } : { error };
  const list = [...(members || [])].sort((a, b) => String(b.joined_at || '').localeCompare(String(a.joined_at || '')));
  const member = list.find((m) => m.status === MEMBER.active) || list.find((m) => m.status === MEMBER.disputed) || null;
  if (!member) return { available: true, member: null, brokerage: null };
  const { data: brokerage, error: bErr } = await admin.from(BROKERAGES).select('*').eq('id', member.brokerage_id).maybeSingle();
  if (bErr) return absent(bErr) ? { available: false } : { error: bErr };
  return { available: true, member, brokerage: brokerage || null };
}

// The caller's own record for the Circle screen: null when there is none or the table is absent.
export async function myBrokerage(admin, userId) {
  const cur = await currentOf(admin, userId);
  if (cur.error) throw cur.error;
  return cur.available && cur.brokerage ? ownView(cur.brokerage) : null;
}

// The brokerage shown on each of these realtors' cards: Map of profile id -> card view.
export async function brokerageCards(admin, profileIds) {
  const out = new Map();
  if (!profileIds.length) return out;
  const { data: members, error } = await admin.from(MEMBERS).select('profile_id, brokerage_id, status').in('profile_id', profileIds).eq('status', MEMBER.active);
  if (error || !(members || []).length) return out;
  const { data: rows, error: bErr } = await admin.from(BROKERAGES).select('id, legal_name, address, phone, broker_of_record_name, status').in('id', [...new Set(members.map((m) => m.brokerage_id))]);
  if (bErr) return out;
  const byId = new Map((rows || []).map((b) => [String(b.id), b]));
  for (const m of members) { const b = byId.get(String(m.brokerage_id)); if (b && b.status !== 'suspended' && b.status !== 'disputed') out.set(String(m.profile_id), cardView(b)); }
  return out;
}

// What the realtor typed, checked. -> { value } | { error }
export function readBrokerageForm(body) {
  const v = { legal_name: text(body.legalName, 120), address: text(body.address, 200), phone: text(body.phone, 30) || null, broker_of_record_name: text(body.brokerName, 100), broker_of_record_email: text(body.brokerEmail, 160).toLowerCase(), hst_number: text(body.hstNumber, 20) || null };
  if (v.legal_name.length < 2) return { error: 'Add the brokerage’s legal name.' };
  if (v.address.length < 5) return { error: 'Add the brokerage’s address.' };
  if (v.broker_of_record_name.length < 2) return { error: 'Add the broker of record’s name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.broker_of_record_email)) return { error: 'Add the broker of record’s email.' };
  return { value: v };
}

async function sendConfirm(brokerage, realtorName, token) {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const mail = brokerageConfirmEmail({ brokerName: brokerage.broker_of_record_name, realtorName, legalName: brokerage.legal_name, url: confirmUrl(token) });
    const out = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: CIRCLE_FROM, to: brokerage.broker_of_record_email, subject: mail.subject, html: mail.html, text: mail.text });
    if (out && out.error) throw new Error(out.error.message || 'send failed');
    return true;
  } catch (e) { logServerError('[brokerage] confirmation email', e, { brokerageId: brokerage.id }); return false; }
}
const newLink = () => { const token = randomBytes(32).toString('base64url'); const now = Date.now(); return { token, fields: { confirm_token_hash: hashToken(token), confirm_sent_at: new Date(now).toISOString(), confirm_expires_at: new Date(now + LINK_DAYS * DAY).toISOString() } }; };
// A record the caller entered, is the active member of, and nobody has answered yet: theirs to edit.
const editable = (cur, userId) => !!cur.brokerage && !!cur.member && cur.member.status === MEMBER.active && same(cur.brokerage.created_by, userId) && cur.brokerage.status === 'unconfirmed' && !cur.brokerage.broker_confirmed_at;

// Save the caller's brokerage and send the broker of record their link. An unanswered record the
// caller entered is edited in place; anything else ends the caller's membership and starts a
// new record, so a confirmed or disputed record is never rewritten.
export async function saveBrokerage({ admin, userId, body }) {
  const form = readBrokerageForm(body || {});
  if (form.error) return { status: 400, body: { error: form.error } };
  const cur = await currentOf(admin, userId);
  if (cur.error) throw cur.error;
  if (!cur.available) return { status: 200, body: { available: false } };
  if (await over('save', userId, SAVES_A_DAY, 86400)) return { status: 429, body: { error: 'You have changed your brokerage several times today. Try again tomorrow.' } };
  const { data: me } = await admin.from('profiles').select('id, full_name').eq('id', userId).maybeSingle();
  if (!me) return { status: 404, body: { error: 'Profile not found.' } };
  const link = newLink();
  const now = new Date().toISOString();
  let brokerage;
  if (editable(cur, userId)) {
    const { data, error } = await admin.from(BROKERAGES).update({ ...form.value, ...link.fields, updated_at: now }).eq('id', cur.brokerage.id).eq('created_by', userId).eq('status', 'unconfirmed').select('*');
    if (error) throw error;
    brokerage = (data || [])[0];
    if (!brokerage) return { status: 409, body: { error: 'That changed a moment ago. Try again.' } };
  } else {
    if (cur.member) {
      const { error } = await admin.from(MEMBERS).update({ status: cur.member.status === MEMBER.disputed ? MEMBER.disputed : MEMBER.left, left_at: now }).eq('id', cur.member.id).eq('profile_id', userId);
      if (error) throw error;
    }
    const made = await admin.from(BROKERAGES).insert({ ...form.value, ...link.fields, status: 'unconfirmed', created_by: userId }).select('*').maybeSingle();
    if (made.error) throw made.error;
    brokerage = made.data;
    const joined = await admin.from(MEMBERS).insert({ brokerage_id: brokerage.id, profile_id: userId, status: MEMBER.active });
    if (joined.error) throw joined.error;
    await recordEvent(admin, { profileId: userId, type: 'brokerage_added', payload: { brokerageName: brokerage.legal_name } });
  }
  const emailed = await sendConfirm(brokerage, String(me.full_name || '').trim() || 'A realtor', link.token);
  return { status: 200, body: { ok: true, emailed, brokerage: ownView(brokerage) } };
}

// Send the broker of record a fresh link (the old one stops working).
export async function resendConfirmation({ admin, userId }) {
  const cur = await currentOf(admin, userId);
  if (cur.error) throw cur.error;
  if (!cur.available) return { status: 200, body: { available: false } };
  if (!editable(cur, userId)) return { status: 409, body: { error: 'There is nothing to send again.' } };
  if (await over('save', userId, SAVES_A_DAY, 86400)) return { status: 429, body: { error: 'That has been sent several times today. Try again tomorrow.' } };
  const { data: me } = await admin.from('profiles').select('id, full_name').eq('id', userId).maybeSingle();
  const link = newLink();
  const { data, error } = await admin.from(BROKERAGES).update({ ...link.fields, updated_at: new Date().toISOString() }).eq('id', cur.brokerage.id).eq('created_by', userId).eq('status', 'unconfirmed').select('*');
  if (error) throw error;
  if (!(data || []).length) return { status: 409, body: { error: 'There is nothing to send again.' } };
  const emailed = await sendConfirm(data[0], String((me && me.full_name) || '').trim() || 'A realtor', link.token);
  return { status: 200, body: { ok: true, emailed, brokerage: ownView(data[0]) } };
}

// ── the broker of record's link ─────────────────────────────────────────────────────────────
// The record a link opens, while it is still good: not answered, not expired.
async function byToken(admin, token) {
  if (!isConfirmToken(token)) return { gone: true };
  const { data: b, error } = await admin.from(BROKERAGES).select('*').eq('confirm_token_hash', hashToken(token)).maybeSingle();
  if (error) return absent(error) ? { gone: true } : { error };
  if (!b || b.status !== 'unconfirmed' || b.broker_confirmed_at || !b.confirm_expires_at || Date.parse(b.confirm_expires_at) < Date.now()) return { gone: true };
  return { brokerage: b };
}
// What the broker of record's page shows: the details as entered and the realtor's name.
export async function readConfirmation(admin, token) {
  const found = await byToken(admin, token);
  if (found.error) throw found.error;
  if (found.gone) return { gone: true };
  const b = found.brokerage;
  const { data: realtor } = b.created_by ? await admin.from('profiles').select('full_name').eq('id', b.created_by).maybeSingle() : { data: null };
  return { gone: false, legalName: b.legal_name, address: b.address, phone: b.phone || '', brokerName: b.broker_of_record_name, realtorName: String((realtor && realtor.full_name) || '').trim() || 'A realtor' };
}
// The broker of record's answer, once: confirm, or not_ours. Either way the link stops working.
export async function answerConfirmation(admin, token, answer) {
  if (answer !== 'confirm' && answer !== 'not_ours') return { status: 400, body: { error: 'Choose an answer.' } };
  const found = await byToken(admin, token);
  if (found.error) throw found.error;
  if (found.gone) return { status: 410, body: { error: 'This link has been used or has expired.' } };
  const b = found.brokerage; const now = new Date().toISOString();
  const patch = answer === 'confirm' ? { broker_confirmed_at: now, confirm_token_hash: null, updated_at: now } : { status: 'disputed', confirm_token_hash: null, updated_at: now };
  const { data, error } = await admin.from(BROKERAGES).update(patch).eq('id', b.id).eq('confirm_token_hash', hashToken(token)).select('id');
  if (error) throw error;
  if (!(data || []).length) return { status: 410, body: { error: 'This link has been used or has expired.' } };
  if (answer === 'not_ours') {
    await admin.from(MEMBERS).update({ status: MEMBER.disputed, left_at: now }).eq('brokerage_id', b.id).eq('status', MEMBER.active);
    if (b.created_by) await recordEvent(admin, { profileId: b.created_by, type: 'brokerage_disputed', payload: { brokerageName: b.legal_name } });
  }
  return { status: 200, body: { ok: true, answer } };
}

// ── the office ──────────────────────────────────────────────────────────────────────────────
// What the office should look at before it confirms a record.
export function reviewFlags(b, realtorEmail) {
  const flags = [];
  if (realtorEmail && String(realtorEmail).toLowerCase() === String(b.broker_of_record_email).toLowerCase()) flags.push('The broker of record’s email is the realtor’s own.');
  if (FREE_MAIL.test(String(b.broker_of_record_email))) flags.push('The broker of record uses a free mail address.');
  return flags;
}
// Every record, newest first, with the realtor who entered it and the flags. Office only.
export async function listBrokeragesForReview(admin) {
  const { data, error } = await admin.from(BROKERAGES).select('*').order('created_at', { ascending: false }).limit(500);
  if (error) { if (absent(error)) return { available: false, brokerages: [] }; throw error; }
  const ids = [...new Set((data || []).map((b) => b.created_by).filter(Boolean))];
  const { data: people } = ids.length ? await admin.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
  const byId = new Map((people || []).map((p) => [String(p.id), p]));
  return { available: true, brokerages: (data || []).map((b) => { const r = byId.get(String(b.created_by)) || null; return { id: b.id, legalName: b.legal_name, address: b.address, phone: b.phone || '', brokerName: b.broker_of_record_name, brokerEmail: b.broker_of_record_email, hstNumber: b.hst_number || '', status: b.status, standing: standingOf(b), brokerConfirmedAt: b.broker_confirmed_at || null, confirmedAt: b.confirmed_at || null, createdAt: b.created_at || null, realtorName: r ? String(r.full_name || '').trim() || null : null, realtorEmail: r ? r.email || null : null, flags: reviewFlags(b, r && r.email) }; }) };
}
// The office confirms a record its broker of record has confirmed. Nothing else makes one confirmed.
export async function approveBrokerage(admin, id) {
  const { data: b, error } = await admin.from(BROKERAGES).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!b) return { status: 404, body: { error: 'Brokerage not found.' } };
  if (b.status === 'confirmed') return { status: 200, body: { ok: true, status: 'confirmed' } };
  if (b.status !== 'unconfirmed' || !b.broker_confirmed_at) return { status: 409, body: { error: 'The broker of record has not confirmed this brokerage.' } };
  const now = new Date().toISOString();
  const { data, error: uErr } = await admin.from(BROKERAGES).update({ status: 'confirmed', confirmed_at: now, updated_at: now }).eq('id', b.id).eq('status', 'unconfirmed').not('broker_confirmed_at', 'is', null).select('id');
  if (uErr) throw uErr;
  if (!(data || []).length) return { status: 409, body: { error: 'That changed a moment ago. Reload.' } };
  if (b.created_by) await recordEvent(admin, { profileId: b.created_by, type: 'brokerage_confirmed', payload: { brokerageName: b.legal_name } });
  return { status: 200, body: { ok: true, status: 'confirmed' } };
}
// The office suspends a record: it leaves every card.
export async function suspendBrokerage(admin, id) {
  const now = new Date().toISOString();
  const { data, error } = await admin.from(BROKERAGES).update({ status: 'suspended', confirm_token_hash: null, updated_at: now }).eq('id', id).select('id');
  if (error) throw error;
  if (!(data || []).length) return { status: 404, body: { error: 'Brokerage not found.' } };
  return { status: 200, body: { ok: true, status: 'suspended' } };
}
