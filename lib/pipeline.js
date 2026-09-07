// lib/pipeline.js  SERVER ONLY (takes the service role client). People: the reads and the
// writes behind the list, the invite, the renewal cron and the remove. The pure parts live in
// lib/pipelineState.js. A person is only ever visible to the realtor whose profile_id is on the
// consent row: every read filters by profile_id, every write checks it first.
import crypto from 'crypto';
import { peopleRows, PREFILL_TTL, RENEW_BEFORE_DAYS } from './pipelineState.js';
import { consentExpiry } from './listingState.js';
import { ownedListing, newConsentToken } from './listingStatus.js';
import { listingOpen } from './listingState.js';
import { kvGetJson, kvSetJson, kvDel } from './docRequest.js';
import { ID_ALPHABET, OWNER_TOKEN_LENGTH } from './applicationIds.js';
export * from './pipelineState.js';
export { rowToForm } from './pipelinePrefill.js';

const DAY = 86400000;
const absent = (e) => !!e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST204' || /pipeline_consents|invites|renew_token|renew_sent_at/.test(String(e.message || '')) && /(does not exist|could not find|not found|schema cache)/i.test(String(e.message || '')));
export const tableAbsent = absent;

// 32 characters from the application alphabet (lib/applicationIds.js), like the report token.
export const newPrefillToken = () => Array.from(crypto.randomBytes(OWNER_TOKEN_LENGTH), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
export const isPrefillToken = (v) => new RegExp(`^[${ID_ALPHABET}]{${OWNER_TOKEN_LENGTH}}$`).test(String(v || ''));
export const prefillKey = (token) => `prefill:${token}`;

// The list: three reads. The consent rows for this profile, their applications, the junction
// rows for those applications (confirmations). applied comes from applicantsByListing when the
// caller has it (the dashboard load does), otherwise from one more junction read.
// The three reads on their own, so the dashboard load can run them beside the junction read
// and combine afterwards (lib/dashboardSignals.js). null when the table is absent.
export async function readPeopleSource({ profileId, admin, now = new Date() } = {}) {
  if (!admin || !profileId) return null;
  const { data: consents, error } = await admin.from('pipeline_consents').select('*').eq('profile_id', profileId).eq('status', 'consented');
  if (error) { if (absent(error)) return null; throw error; }
  const live = (consents || []).filter((c) => c.expires_at && new Date(c.expires_at).getTime() > new Date(now).getTime());
  const ids = [...new Set(live.map((c) => c.application_id).filter(Boolean).map(String))];
  let applications = [], junctions = [];
  if (ids.length) {
    const { data: apps, error: aErr } = await admin.from('applications').select('*').in('id', ids);
    if (aErr) throw aErr;
    applications = (apps || []).map((a) => { const x = { ...a }; delete x.owner_token; delete x.cover_letter; return x; });
    const { data: js, error: jErr } = await admin.from('listing_applicants').select('id, listing_id, application_id, confirmations').in('application_id', ids);
    if (jErr) { if (!/confirmations/.test(String(jErr.message || ''))) throw jErr; } else junctions = js || [];
  }
  return { consents: live, applications, junctions };
}

export async function listPeople({ profileId, listings, admin, applicantsByListing = null, now = new Date() } = {}) {
  const src = await readPeopleSource({ profileId, admin, now });
  if (!src) return [];
  const { consents: live, applications, junctions } = src;
  let byListing = applicantsByListing;
  if (!byListing) {
    byListing = {};
    const active = (listings || []).filter((l) => l && listingOpen(l));
    if (active.length) {
      const { data: rows } = await admin.from('listing_applicants').select('id, listing_id, application_id, application:applications(*)').in('listing_id', active.map((l) => l.id));
      for (const r of rows || []) (byListing[r.listing_id] = byListing[r.listing_id] || []).push({ linkId: r.id, application: { email: r.application?.email || null } });
    }
  }
  return peopleRows({ consents: live, applications, junctions, listings, applicantsByListing: byListing, now });
}

// The explicit ownership check for a consent row: profile_id === userId. null when there is no
// row, false when it belongs to someone else.
export async function ownedConsent(admin, consentId, userId) {
  if (!admin || !consentId || !userId) return null;
  const { data, error } = await admin.from('pipeline_consents').select('*').eq('id', String(consentId)).maybeSingle();
  if (error) { if (absent(error)) return null; throw error; }
  if (!data) return null;
  if (String(data.profile_id) !== String(userId)) return false;
  return data;
}

// The invite: refusals, the prefill token, the invites entry. deps: { admin, userId, kv, now }.
// Answers { status, body } like lib/realtorWrites.js; the route sends the email and the event.
export async function prepareInvite({ admin, userId, now = new Date() }, { consentId, listingId } = {}) {
  if (!consentId || !listingId) return { status: 400, body: { error: 'consentId and listingId are required.' } };
  const consent = await ownedConsent(admin, consentId, userId);
  if (!consent) return { status: consent === null ? 404 : 403, body: { error: consent === null ? 'Not found.' : 'Not yours.' } };
  const listing = await ownedListing(admin, listingId, userId);
  if (!listing) return { status: listing === null ? 404 : 403, body: { error: listing === null ? 'Not found.' : 'Not yours.' } };
  if (!listingOpen(listing)) return { status: 409, body: { error: 'This listing is not taking applications.' } };
  const t = new Date(now).getTime();
  if (consent.status !== 'consented' || !consent.expires_at || new Date(consent.expires_at).getTime() <= t) return { status: 410, body: { error: 'This keep me in mind has ended.' } };
  const invites = Array.isArray(consent.invites) ? consent.invites : [];
  if (invites.some((i) => i && String(i.listingId) === String(listing.id))) return { status: 409, body: { error: 'Already invited to this listing.' } };
  let prefillToken = null;
  if (consent.application_id) {
    prefillToken = newPrefillToken();
    const ok = await kvSetJson(prefillKey(prefillToken), { applicationId: consent.application_id, consentId: consent.id }, PREFILL_TTL);
    if (!ok) prefillToken = null; // KV down: the invite still goes, without the prefill
  }
  const at = new Date(now).toISOString();
  const { error } = await admin.from('pipeline_consents').update({ invites: [...invites, { listingId: listing.id, at }] }).eq('id', consent.id);
  if (error) { if (absent(error)) return { status: 503, body: { error: 'Not available yet. Run db/pipeline.sql.' } }; throw error; }
  let application = null;
  if (consent.application_id) { const { data } = await admin.from('applications').select('id, full_name, email').eq('id', consent.application_id).maybeSingle(); application = data || null; }
  return { status: 200, body: { ok: true }, consent, listing, application, prefillToken, at };
}

// The prefill token → the application row (owner_token and cover_letter stripped), or null.
export async function readPrefill(admin, token) {
  if (!admin || !isPrefillToken(token)) return null;
  const rec = await kvGetJson(prefillKey(token));
  if (!rec || !rec.applicationId) return null;
  const { data, error } = await admin.from('applications').select('*').eq('id', String(rec.applicationId)).maybeSingle();
  if (error || !data) return null;
  const row = { ...data }; delete row.owner_token; delete row.cover_letter;
  return { application: row, consentId: rec.consentId || null };
}
export const consumePrefill = (token) => (isPrefillToken(token) ? kvDel(prefillKey(token)) : Promise.resolve(false));

// Remove: deletes the row. { status, body, consent }.
export async function removePerson({ admin, userId }, { consentId } = {}) {
  if (!consentId) return { status: 400, body: { error: 'consentId is required.' } };
  const consent = await ownedConsent(admin, consentId, userId);
  if (!consent) return { status: consent === null ? 404 : 403, body: { error: consent === null ? 'Not found.' : 'Not yours.' } };
  const { error } = await admin.from('pipeline_consents').delete().eq('id', consent.id).eq('profile_id', userId);
  if (error) throw error;
  return { status: 200, body: { ok: true }, consent };
}

// The renewal selection: consented rows with expires_at within RENEW_BEFORE_DAYS and no
// renewal sent yet. Pure over rows so the cron and the test share it.
export function selectRenewals(rows, now = new Date()) {
  const t = new Date(now).getTime();
  return (rows || []).filter((r) => r && r.status === 'consented' && r.expires_at && !r.renew_sent_at
    && new Date(r.expires_at).getTime() > t && new Date(r.expires_at).getTime() - t <= RENEW_BEFORE_DAYS * DAY);
}
export const selectExpired = (rows, now = new Date()) => (rows || []).filter((r) => r && ['pending', 'consented'].includes(r.status) && r.expires_at && new Date(r.expires_at).getTime() <= new Date(now).getTime());

// The daily run. deps: { admin, send(mail), recordEvent, siteBase, now }. Returns counts.
export async function runPipelineCron({ admin, send, recordEvent, siteBase = 'https://rentletter.ca', now = new Date(), log = console.log }) {
  const { data: rows, error } = await admin.from('pipeline_consents').select('*').in('status', ['pending', 'consented']);
  if (error) { if (absent(error)) return { renewalsSent: 0, expired: 0, skipped: 'table absent' }; throw error; }
  const { renewalEmail, pipelineFrom } = await import('./pipelineState.js');
  let renewalsSent = 0, expired = 0;
  const expiredRows = selectExpired(rows, now);
  if (expiredRows.length) {
    const { error: eErr } = await admin.from('pipeline_consents').update({ status: 'expired' }).in('id', expiredRows.map((r) => r.id));
    if (eErr) log('[cron/pipeline] expiry skipped:', eErr.message); else expired = expiredRows.length;
  }
  const profiles = new Map();
  const apps = new Map();
  for (const r of selectRenewals(rows, now)) {
    let prof = profiles.get(r.profile_id);
    if (!prof) { const { data } = await admin.from('profiles').select('id, full_name, email').eq('id', r.profile_id).maybeSingle(); prof = data || { id: r.profile_id }; profiles.set(r.profile_id, prof); }
    let app = null;
    if (r.application_id) { app = apps.get(r.application_id); if (!app) { const { data } = await admin.from('applications').select('id, full_name, email').eq('id', r.application_id).maybeSingle(); app = data || null; apps.set(r.application_id, app); } }
    const renewToken = newConsentToken();
    const sentAt = new Date(now).toISOString();
    const { error: uErr } = await admin.from('pipeline_consents').update({ renew_token: renewToken, renew_sent_at: sentAt }).eq('id', r.id);
    if (uErr) { if (absent(uErr)) { log('[cron/pipeline] renewal columns absent (run db/pipeline.sql)'); break; } log('[cron/pipeline] renewal skipped:', uErr.message); continue; }
    const mail = renewalEmail({ realtorName: prof.full_name, applicantName: app?.full_name, email: r.email, expiresAt: r.expires_at, keepUrl: `${siteBase}/keep/${renewToken}` });
    try {
      await send({ from: pipelineFrom(prof.full_name), to: String(r.email).trim(), reply_to: prof.email || undefined, subject: mail.subject, html: mail.html, text: mail.text });
      renewalsSent++;
      await recordEvent?.(admin, { profileId: r.profile_id, listingId: r.listing_id || null, applicationId: r.application_id || null, type: 'pipeline_renewal_sent', payload: { applicantName: app?.full_name || r.email, expiresAt: r.expires_at } });
    } catch (e) { log('[cron/pipeline] send failed:', e?.message || e); }
  }
  return { renewalsSent, expired };
}

// A renew token → the row, for /keep/{renewToken} (read only) and the answer route.
export async function readRenewal(admin, token, { now = new Date() } = {}) {
  if (!admin || !token) return { found: false };
  const { data: row, error } = await admin.from('pipeline_consents').select('*').eq('renew_token', String(token)).maybeSingle();
  if (error) { if (absent(error)) return { found: false }; throw error; }
  if (!row) return { found: false };
  const expired = row.status !== 'consented' || !!(row.expires_at && new Date(row.expires_at).getTime() < new Date(now).getTime());
  let realtorName = null;
  if (row.profile_id) { const { data: prof } = await admin.from('profiles').select('full_name').eq('id', row.profile_id).maybeSingle(); realtorName = prof?.full_name || null; }
  return { found: true, expired, answered: false, renew: true, status: row.status, realtorName, row };
}
// yes: expires_at = now + 60 days, renew_token and renew_sent_at cleared. no: status declined.
export async function answerRenewal(admin, token, status, { now = new Date() } = {}) {
  const r = await readRenewal(admin, token, { now });
  if (!r.found) return { ok: false, found: false };
  if (r.expired) return { ok: false, found: true, expired: true, answered: false, status: r.status };
  const patch = status === 'consented' ? { expires_at: consentExpiry(now), renew_token: null, renew_sent_at: null } : { status: 'declined', renew_token: null };
  const { error } = await admin.from('pipeline_consents').update(patch).eq('id', r.row.id);
  if (error) throw error;
  return { ok: true, found: true, expired: false, answered: false, status, renewed: status === 'consented', realtorName: r.realtorName };
}
