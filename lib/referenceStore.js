// lib/referenceStore.js  SERVER ONLY (takes the service role client). The reference request
// rows (db/reference-responses.sql): create, read by token (read only, for the page), answer by
// token (the tap), and the attach onto applicants for the checklist. The table may be absent:
// every read answers empty, the create answers { status: 503 }.
import crypto from 'crypto';
import { normalizeAnswers, REQUEST_DAYS, RESEND_AFTER_DAYS } from './referenceQuestions.js';

const DAY = 86400000;
export const newReferenceToken = () => crypto.randomBytes(24).toString('base64url');
export const isReferenceToken = (t) => /^[A-Za-z0-9_-]{8,128}$/.test(String(t || ''));
export const tableAbsent = (e) => !!e && (e.code === '42P01' || /reference_responses/.test(String(e.message || '')) && /(does not exist|could not find|not found|schema cache)/i.test(String(e.message || '')));

const live = (r, now) => r.status === 'pending' && r.expires_at && new Date(r.expires_at).getTime() > new Date(now).getTime();
export const toClient = (r) => (r ? { id: r.id, status: r.status, sentTo: r.sent_to, sentAt: r.sent_at || null, answeredAt: r.answered_at || null, expiresAt: r.expires_at || null, answers: r.status === 'answered' ? r.answers || null : null } : null);
// The row the checklist shows: the answered one if any, else the latest pending, else null.
export function pickForLink(rows, now = new Date()) {
  const list = (rows || []).slice().sort((a, b) => String(b.sent_at || '').localeCompare(String(a.sent_at || '')));
  return list.find((r) => r.status === 'answered') || list.find((r) => live(r, now)) || null;
}
export const canResend = (r, now = new Date()) => !r || r.status !== 'pending' || !live(r, now) || new Date(now).getTime() - new Date(r.sent_at || 0).getTime() >= RESEND_AFTER_DAYS * DAY;

// Create: refuses while a pending request is younger than RESEND_AFTER_DAYS. { status, body, row }.
export async function createRequest(admin, { linkId, profileId, sentTo, now = new Date() }) {
  const { data: rows, error } = await admin.from('reference_responses').select('*').eq('listing_applicant_id', linkId).eq('profile_id', profileId);
  if (error) { if (tableAbsent(error)) return { status: 503, body: { error: 'Not available yet. Run db/reference-responses.sql.' } }; throw error; }
  const current = pickForLink(rows, now);
  if (current && current.status === 'pending' && !canResend(current, now)) return { status: 409, body: { error: `Already asked ${new Date(current.sent_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`, response: toClient(current) } };
  const token = newReferenceToken();
  const row = { listing_applicant_id: linkId, profile_id: profileId, token, sent_to: sentTo, status: 'pending', answers: null, sent_at: new Date(now).toISOString(), answered_at: null, expires_at: new Date(new Date(now).getTime() + REQUEST_DAYS * DAY).toISOString() };
  const { data: inserted, error: iErr } = await admin.from('reference_responses').insert(row).select('*').single();
  if (iErr) { if (tableAbsent(iErr)) return { status: 503, body: { error: 'Not available yet. Run db/reference-responses.sql.' } }; throw iErr; }
  return { status: 200, body: { ok: true, response: toClient({ ...row, ...(inserted || {}) }) }, row: { ...row, ...(inserted || {}) }, token };
}

// Read only, for GET /ref/{token}: the row, the realtor's name, the applicant's name.
export async function readRequest(admin, token, { now = new Date() } = {}) {
  if (!admin || !isReferenceToken(token)) return { found: false };
  const { data: row, error } = await admin.from('reference_responses').select('*').eq('token', String(token)).maybeSingle();
  if (error) { if (tableAbsent(error)) return { found: false }; throw error; }
  if (!row) return { found: false };
  const expired = row.status === 'expired' || (row.status === 'pending' && !live(row, now));
  let realtorName = null, applicantName = null;
  const { data: prof } = await admin.from('profiles').select('full_name').eq('id', row.profile_id).maybeSingle(); realtorName = prof?.full_name || null;
  const { data: j } = await admin.from('listing_applicants').select('id, application_id, listing_id').eq('id', row.listing_applicant_id).maybeSingle();
  if (j?.application_id) { const { data: app } = await admin.from('applications').select('full_name').eq('id', j.application_id).maybeSingle(); applicantName = app?.full_name || null; }
  return { found: true, expired, answered: row.status === 'answered', realtorName, applicantName, row, junction: j || null };
}

// The tap: answers and answered_at, status answered, confirmations.landlord_reference on the
// junction row. Refuses expired and already answered. { status, body, row, junction, realtorName }.
export async function answerRequest(admin, token, answersIn, { now = new Date() } = {}) {
  const r = await readRequest(admin, token, { now });
  if (!r.found) return { status: 404, body: { error: 'This link is not valid.' } };
  if (r.answered) return { status: 409, body: { error: 'Already answered. Nothing changed.' } };
  if (r.expired) return { status: 410, body: { error: 'This link has expired. Nothing was saved.' } };
  const answers = normalizeAnswers(answersIn, { now });
  if (!answers) return { status: 400, body: { error: 'Please use the options on the page.' } };
  const at = new Date(now).toISOString();
  const { error } = await admin.from('reference_responses').update({ answers, answered_at: at, status: 'answered' }).eq('id', r.row.id);
  if (error) throw error;
  if (r.junction) {
    const { data: jr } = await admin.from('listing_applicants').select('confirmations').eq('id', r.junction.id).maybeSingle();
    const current = jr && jr.confirmations && typeof jr.confirmations === 'object' ? jr.confirmations : {};
    await admin.from('listing_applicants').update({ confirmations: { ...current, landlord_reference: { at, by: 'reference' } } }).eq('id', r.junction.id);
  }
  return { status: 200, body: { ok: true, realtorName: r.realtorName }, row: { ...r.row, answers, answered_at: at, status: 'answered' }, junction: r.junction, realtorName: r.realtorName, applicantName: r.applicantName };
}

// applicant.referenceResponse for the checklist: one query for the list, null when absent.
export async function attachReferenceResponses(admin, list, now = new Date()) {
  const ids = (list || []).map((a) => a.linkId).filter(Boolean);
  if (!ids.length) return;
  try {
    const { data, error } = await admin.from('reference_responses').select('*').in('listing_applicant_id', ids);
    if (error) { for (const a of list) a.referenceResponse = null; return; }
    const by = new Map();
    for (const r of data || []) { const k = String(r.listing_applicant_id); (by.get(k) || by.set(k, []).get(k)).push(r); }
    for (const a of list) a.referenceResponse = toClient(pickForLink(by.get(String(a.linkId)) || [], now));
  } catch (e) { for (const a of list) a.referenceResponse = null; }
}
