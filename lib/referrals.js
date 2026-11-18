// lib/referrals.js
// SERVER-ONLY. Realtor → realtor applicant handoff, with the APPLICANT'S CONSENT as the gate.
//
// LIFECYCLE
//   pending   Realtor 1 created it; consent email sent to the applicant (7-day single-use link)
//   approved  applicant approved → a DERIVED application is minted for Realtor 2 (new RL, new
//             owner token, facts from the tenant's CURRENT profile — or the source snapshot if
//             they have no profile). Realtor 2 is emailed (dashboard link, or signup invite).
//   declined  applicant declined. Realtor 1 learns only that. No reasons, no re-ask prompt.
//   expired   consent link lapsed unused (7 days)
//   revoked   applicant revoked the completed referral from their profile (the derived
//             application is revoked → Realtor 2's view is blocked going forward)
//   assigned  (approved + Realtor 2 attached it to one of their listings) — tracked via
//             assigned_listing_id; status stays 'approved'.
//
// WHAT MOVES: the facts on the closed list in lib/profileFacts.js (PROFILE_FACT_KEYS), each with
// its source and date, and nothing else. Everything the receiving realtor is sent or shown is
// built by sharePayload and checked by assertSharePayload: referralPayload below is the one door.
// Never household size, a co tenant, a date of birth, pets, a smoker answer, after tax income,
// personal references, a note from Realtor 1, Realtor 1's document read, documents, the owner
// token, the applicant's other applications, or anything about Realtor 1's listing.
//
// OLDER ROWS: referrals made before this rule may hold a note and a document summary (KV
// referral:{id}, referrals.note, referrals.verification_summary), and their derived application
// may hold a household size. None is deleted here and none is read: the mirror no longer writes
// those two columns, the inbox and the assign rebuild from the whitelist, and
// lib/supabaseBridge.js cuts referral_meta down before a realtor's browser sees it.
//
// STORAGE: KV is canonical (referral:{id} + indexes), Supabase `referrals` is the durable
// mirror once db/referrals.sql has run (missing table → KV-only, one warning). Consent tokens
// are random, stored HASHED, single-use, 7-day TTL, never logged.
import crypto from 'crypto';
import { note } from './queryTrace.js';
import { recordEvent } from './events';
import { ADDED_VIA } from './listingApplicantsVocabulary';
import { kvGet } from './kv';
import { getSupabaseAdminClient } from './supabase/admin';
import { isSupabaseConfigured } from './supabase/server';
import { formFromApplication, buildApplicationFromForm, EMPTY_FORM } from './tenantProfile';
import { getProfileByEmail, attachApplication, normalizeEmail, isEmail, emailKey, newToken, rateLimited } from './tenantProfileStore';
import { upsertApplication, linkApplicantToListing } from './supabaseBridge';
import { displayAddress, displayLabel } from './listingAddress.js';
import { PROFILE_FACTS, sharePayload, assertSharePayload } from './profileFacts.js';

export const CONSENT_TTL = 7 * 24 * 3600;
const REFERRAL_TTL = 400 * 24 * 3600;
const base = () => (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const auth = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });
export const kvReady = () => !!(base() && process.env.KV_REST_API_TOKEN);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function kvSet(key, value, ttl) {
  const done = note('kv', 'set'); try { return await kvSetRaw(key, value, ttl); } finally { done(); }
}
async function kvSetRaw(key, value, ttl) {
  const r = await fetch(`${base()}/set/${key}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`KV set ${r.status}`);
  if (ttl) await fetch(`${base()}/expire/${key}/${ttl}`, { method: 'POST', headers: auth() });
}
async function kvDel(key) { try { await fetch(`${base()}/del/${key}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLpush(key, v) { try { await fetch(`${base()}/lpush/${key}/${encodeURIComponent(v)}`, { method: 'POST', headers: auth() }); await fetch(`${base()}/expire/${key}/${REFERRAL_TTL}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLrange(key) { const done = note('kv', 'lrange'); try { const r = await fetch(`${base()}/lrange/${key}/0/-1`, { headers: auth() }); const d = await r.json(); return Array.isArray(d?.result) ? d.result.map(String) : []; } catch (e) { return []; }  finally { done(); } }

// ── Supabase mirror (tolerant of the table not existing yet) ────────────────────────────
let tableMissing = false;
function admin() { return isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null; }
async function mirror(ref) {
  const a = admin(); if (!a || tableMissing) return;
  const row = {
    id: ref.id, status: ref.status, from_profile_id: ref.from.profileId, from_listing_id: ref.from.listingId || null, from_link_id: ref.from.linkId || null,
    source_application_number: ref.sourceApplicationNumber, to_email: ref.to.email, to_name: ref.to.name, to_profile_id: ref.to.profileId || null,
    // note and verification_summary are no longer written: an upsert that leaves a column out
    // leaves what an older row holds untouched, so nothing stored is deleted and nothing is read.
    applicant_email_key: ref.applicantEmailKey, referred_application_number: ref.referredApplicationNumber || null,
    assigned_listing_id: ref.assignedListingId || null, assigned_at: ref.assignedAt || null,
    created_at: ref.createdAt, decided_at: ref.decidedAt || null, expires_at: ref.expiresAt, updated_at: new Date().toISOString(),
  };
  const { error } = await a.from('referrals').upsert(row, { onConflict: 'id' });
  if (error) { if (/referrals|schema cache|does not exist/i.test(error.message || '')) { tableMissing = true; console.warn('[referrals] referrals table missing — run db/referrals.sql (KV-only until then)'); } else console.error('[referrals] mirror failed', error.message); }
}

// ── read/write ──────────────────────────────────────────────────────────────────────────
export async function getReferral(id) { if (!kvReady() || !/^[0-9a-f-]{36}$/.test(String(id || ''))) return null; return kvGet(`referral:${id}`); }
export async function saveReferral(ref) { ref.updatedAt = new Date().toISOString(); await kvSet(`referral:${ref.id}`, ref, REFERRAL_TTL); await mirror(ref); return ref; }
async function listByIndex(key) {
  const ids = [...new Set(await kvLrange(key))];
  const refs = await Promise.all(ids.map((id) => kvGet(`referral:${id}`)));
  return refs.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export const listFromRealtor = (profileId) => listByIndex(`referrals_from:${profileId}`);
export const listToEmail = (email) => listByIndex(`referrals_to:${emailKey(email)}`);
export const listForApplicant = (email) => listByIndex(`referrals_app:${emailKey(email)}`);

// Lazy expiry: a pending referral past its window reads as expired.
export function effectiveStatus(ref) {
  if (ref.status === 'pending' && ref.expiresAt && new Date(ref.expiresAt) < new Date()) return 'expired';
  return ref.status;
}

// ── what moves ──────────────────────────────────────────────────────────────────────────
// THE referral payload: lib/profileFacts.js sharePayload over a flat form, checked by
// assertSharePayload. Whatever else the form holds (household size, a co tenant, pets, a note,
// a date of birth, any key at all) is left behind here. at: when those facts were last set.
export function referralPayload(form, at = null) {
  return assertSharePayload(sharePayload({ facts: form || {}, factsUpdatedAt: at || null }, []));
}
// A flat apply form holding the payload's facts and nothing else: what the receiving realtor's
// copy of the application is built from. Every other key is the form's own blank.
export function formFromPayload(payload) {
  const f = { ...EMPTY_FORM, apartmentAddress: '', apartmentDescription: '' };
  for (const x of assertSharePayload(payload).facts) f[x.key] = x.value;
  f.rentalStatus = (f.previousAddress || f.previousLandlordName || f.yearsAtPrevious) ? 'current' : 'none';
  return f;
}
const EMPLOYMENT = { 'full-time': 'Full time', 'part-time': 'Part time', contract: 'Contract', 'self-employed': 'Self employed' };
const longDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : (v || null));
const shown = (key, value) => {
  if (key === 'annualIncome') return Number(value) ? `$${Number(value).toLocaleString('en-CA')} a year` : null;
  if (key === 'employmentType') return EMPLOYMENT[value] || null;
  if (key === 'moveInDate') return longDay(value);
  if (key === 'yearsAtJob' || key === 'yearsAtPrevious') return value ? `${value} yrs` : null;
  return value || null;
};
// The rows the consent page lists: one per whitelisted fact, in the list's order, null when the
// tenant gave none. Exactly what the receiving realtor gets, under the same labels.
export function sharedFields(payload) {
  const by = Object.fromEntries(assertSharePayload(payload).facts.map((x) => [x.key, x.value]));
  return PROFILE_FACTS.map(({ key, label }) => ({ label, value: by[key] !== undefined ? shown(key, by[key]) : null }));
}
// The receiving realtor's card for one referred applicant, from the payload alone.
export function receivedApplicant(app, fallbackName = null) {
  const payload = referralPayload(formFromApplication(app), app?.updatedAt || app?.createdAt || null);
  const f = Object.fromEntries(payload.facts.map((x) => [x.key, x.value]));
  return {
    name: f.fullName || fallbackName || null, jobTitle: f.jobTitle || null, employer: f.employer || null, employmentType: f.employmentType || null,
    annualIncome: Number(f.annualIncome) || null, moveInDate: longDay(f.moveInDate), yearsAtJob: f.yearsAtJob || null,
    rentalYears: f.yearsAtPrevious || null, hasLandlordRef: !!f.previousLandlordName,
  };
}

// What will be shared, as of NOW: the tenant's profile facts if they have one, else the
// source application snapshot. Returns { form, source: 'profile' | 'snapshot', payload }: the
// payload is the whitelist's cut, and form is built back from it.
export async function currentFacts(ref) {
  const p = await getProfileByEmail(ref.applicantEmail);
  let payload; let source;
  if (p?.facts) { payload = referralPayload({ ...p.facts, email: p.email }, p.factsUpdatedAt || null); source = 'profile'; }
  else {
    const app = await kvGet(`app:${ref.sourceApplicationNumber}`);
    if (!app) return null;
    payload = referralPayload(formFromApplication(app), app.updatedAt || app.createdAt || null); source = 'snapshot';
  }
  return { form: formFromPayload(payload), source, payload };
}

// ── create (Realtor 1) ──────────────────────────────────────────────────────────────────
// No note: Realtor 1 cannot write a word about the applicant, and no document read of theirs
// travels.
export async function createReferral({ fromProfile, fromListing, link, toName, toEmail }) {
  const app = await kvGet(`app:${link.application.application_number}`);
  const applicantEmail = normalizeEmail(app?.email || link.application.email);
  if (!isEmail(applicantEmail)) throw Object.assign(new Error('This applicant has no email on file, so we can’t ask for their consent.'), { code: 'no_email' });
  if (await rateLimited('ref:from', fromProfile.id, 10, 3600)) throw Object.assign(new Error('You’ve sent a lot of referrals in the last hour. Try again later.'), { code: 'rate' });
  if (await rateLimited('ref:applicant', applicantEmail, 3, 86400)) throw Object.assign(new Error('This applicant has already been asked about referrals today. Give them a day.'), { code: 'rate' });
  if (await rateLimited('ref:to', normalizeEmail(toEmail), 5, 86400)) throw Object.assign(new Error('That realtor has received several referrals today. Try again tomorrow.'), { code: 'rate' });

  const now = new Date();
  const ref = {
    id: crypto.randomUUID(), status: 'pending',
    from: { profileId: fromProfile.id, name: fromProfile.full_name || null, brokerage: fromProfile.brokerage || null, listingId: fromListing.id, listingLabel: fromListing.name || fromListing.address || null, linkId: link.linkId },
    to: { email: normalizeEmail(toEmail), name: String(toName || '').trim().slice(0, 120), profileId: null, brokerage: null },
    sourceApplicationNumber: link.application.application_number,
    applicantEmail, applicantEmailKey: emailKey(applicantEmail), applicantName: link.application.full_name || null,
    referredApplicationNumber: null, assignedListingId: null, assignedAt: null,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + CONSENT_TTL * 1000).toISOString(), decidedAt: null,
  };
  // Is the receiving realtor already on Rentletter? (auth email → profile)
  const a = admin();
  if (a) {
    try {
      const { data } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = (data?.users || []).find((x) => normalizeEmail(x.email) === ref.to.email);
      if (u) { ref.to.profileId = u.id; const { data: p } = await a.from('profiles').select('full_name, brokerage').eq('id', u.id).maybeSingle(); if (p) { ref.to.brokerage = p.brokerage || null; if (!ref.to.name) ref.to.name = p.full_name || ''; } }
    } catch (e) { /* ignore */ }
  }
  const token = newToken();
  await kvSet(`rconsent:${hash(token)}`, { referralId: ref.id }, CONSENT_TTL);
  await saveReferral(ref);
  await kvLpush(`referrals_from:${ref.from.profileId}`, ref.id);
  await kvLpush(`referrals_to:${emailKey(ref.to.email)}`, ref.id);
  await kvLpush(`referrals_app:${ref.applicantEmailKey}`, ref.id);
  await kvLpush(`referrals_link:${link.linkId}`, ref.id);
  return { ref, token };
}

// ── consent (applicant) ─────────────────────────────────────────────────────────────────
export async function referralForToken(token) {
  if (!token || String(token).length < 20) return null;
  const rec = await kvGet(`rconsent:${hash(token)}`);
  if (!rec?.referralId) return null;
  return getReferral(rec.referralId);
}
export async function decideReferral(token, approve) {
  const k = `rconsent:${hash(token)}`;
  const rec = await kvGet(k);
  if (!rec?.referralId) return { ok: false, reason: 'expired' };
  const ref = await getReferral(rec.referralId);
  if (!ref || effectiveStatus(ref) !== 'pending') { await kvDel(k); return { ok: false, reason: ref ? effectiveStatus(ref) : 'expired' }; }
  await kvDel(k); // single-use, either way
  ref.decidedAt = new Date().toISOString();
  if (!approve) { ref.status = 'declined'; await saveReferral(ref); return { ok: true, ref }; }

  // APPROVE → mint the derived application for Realtor 2 from the applicant's CURRENT facts.
  const facts = await currentFacts(ref);
  if (!facts) { ref.status = 'expired'; await saveReferral(ref); return { ok: false, reason: 'source_missing' }; }
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rand = (n, set) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  const rl = `RL-${new Date().getFullYear()}-${rand(4, '0123456789ABCDEF')}-${rand(4, '0123456789ABCDEF')}`;
  const seed = { applicationNumber: rl, createdAt: new Date().toISOString(), ownerToken: rand(32, chars), revoked: false, apartment: { address: null, description: null, estimatedRent: null, rentToIncomeRatio: null }, tenant: {} };
  const app = buildApplicationFromForm(seed, facts.form);
  app.applicationNumber = rl; app.ownerToken = seed.ownerToken; app.createdAt = seed.createdAt; app.revoked = false; delete app.updatedAt; app.profileRevision = 0;
  app.referral = { id: ref.id, fromName: ref.from.name, fromBrokerage: ref.from.brokerage, toName: ref.to.name, toEmail: ref.to.email, approvedAt: ref.decidedAt, factsSource: facts.source };
  await kvSet(`app:${rl}`, app, 365 * 24 * 3600);
  ref.status = 'approved'; ref.referredApplicationNumber = rl; ref.factsSource = facts.source;
  await saveReferral(ref);
  // Mirror to Supabase so Realtor 2 can assign it; attach to the tenant's profile (no facts refresh).
  const a = admin();
  if (a) { try { await upsertApplication(a, app); } catch (e) { console.error('[referrals] mirror application failed', e?.message || e); } }
  try { await attachApplication(app, { refreshFacts: false }); } catch (e) { /* non-fatal */ }
  // The receiving realtor's timeline, when they have an account (by profile id, else by email).
  if (a) {
    try {
      let toId = ref.to.profileId || null;
      if (!toId) { const { data: prof } = await a.from('profiles').select('id').eq('email', ref.to.email).maybeSingle(); toId = prof?.id || null; }
      if (toId) await recordEvent(a, { profileId: toId, type: 'referral_received', payload: { applicantName: ref.applicantName || null, fromName: ref.from?.name || null } });
    } catch (e) { console.warn('[referrals] received event skipped:', e?.message || e); }
  }
  return { ok: true, ref, app };
}

// ── receiving (Realtor 2) ───────────────────────────────────────────────────────────────
// READ ONLY: the inbox as it is, unclaimed referrals included (claimed: false). The claim by
// profile id (attribution that survives a later email change) is a separate write, claimReferrals,
// run by POST /api/referrals/claim when the inbox card is shown and by the assign route; it no
// longer happens inside the dashboard read.
export async function inboxFor(user) {
  const refs = await listToEmail(user.email);
  const mine = refs.filter((r) => effectiveStatus(r) === 'approved' || effectiveStatus(r) === 'revoked');
  const apps = await Promise.all(mine.map((r) => (r.referredApplicationNumber ? kvGet(`app:${r.referredApplicationNumber}`) : null)));
  const out = [];
  mine.forEach((r, i) => {
    const app = apps[i];
    out.push({
      id: r.id, status: effectiveStatus(r), from: { name: r.from.name, brokerage: r.from.brokerage }, approvedAt: r.decidedAt, createdAt: r.createdAt, claimed: !!r.to.profileId,
      assignedListingId: r.assignedListingId, assignedAt: r.assignedAt, factsSource: r.factsSource,
      applicationNumber: r.referredApplicationNumber,
      // Built from the whitelist: an older referral's note and document summary, and an older
      // derived application's household size, pets and after tax income, stay where they are
      // stored and are never sent.
      applicant: app && !app.revoked ? receivedApplicant(app, r.applicantName) : null,
      revoked: !!app?.revoked,
    });
  });
  return out;
}

// Claim the approved or revoked referrals addressed to this realtor's email by profile id.
// Returns the number written. Idempotent: an already claimed referral is left alone.
export async function claimReferrals(user) {
  const refs = await listToEmail(user.email);
  const mine = refs.filter((r) => (effectiveStatus(r) === 'approved' || effectiveStatus(r) === 'revoked') && !r.to.profileId);
  for (const r of mine) { r.to.profileId = user.id; await saveReferral(r); }
  return mine.length;
}

// Assign the derived application to one of Realtor 2's listings: compute rent-to-income +
// scorecard against THAT listing, mirror, link (added_via ADDED_VIA.REFERRAL). One listing per referral.
export async function assignReferral(ref, listing, user) {
  if (effectiveStatus(ref) !== 'approved' || ref.to.email !== normalizeEmail(user.email) && ref.to.profileId !== user.id) throw new Error('This referral isn’t yours to assign.');
  if (ref.assignedListingId) throw new Error('This referral is already assigned to a listing.');
  const app = await kvGet(`app:${ref.referredApplicationNumber}`);
  if (!app) throw new Error('The referred application is no longer available.');
  if (app.revoked) throw new Error('The applicant has revoked this referral.');
  const rent = listing.monthly_rent ? Number(listing.monthly_rent) : null;
  const desc = [listing.bedrooms ? `${listing.bedrooms} BR` : null, rent ? `$${rent.toLocaleString('en-CA')}/mo` : null].filter(Boolean).join(' · ');
  app.apartment = { address: displayAddress(listing) || null, description: desc || null, estimatedRent: rent, rentToIncomeRatio: null };
  // Rebuilt from the whitelist: a derived application made before this rule holds more than the
  // list allows, and none of it may arrive on Realtor 2's listing. Recomputes the ratio for THIS rent.
  const next = buildApplicationFromForm(app, formFromPayload(referralPayload(formFromApplication(app), app.updatedAt || app.createdAt || null)));
  next.applicationNumber = app.applicationNumber; next.ownerToken = app.ownerToken; next.createdAt = app.createdAt; next.revoked = false; delete next.updatedAt; next.profileRevision = app.profileRevision || 0;
  next.referral = { ...app.referral, assignedListing: displayLabel(listing) || null, assignedAt: new Date().toISOString() };
  await kvSet(`app:${next.applicationNumber}`, next, 365 * 24 * 3600);
  const a = admin(); if (!a) throw new Error('Supabase is not configured.');
  const applicationId = await upsertApplication(a, next);
  await linkApplicantToListing(a, listing.id, applicationId, ADDED_VIA.REFERRAL);
  await recordEvent(a, { profileId: user.id, listingId: listing.id, applicationId, type: 'referral_accepted', payload: { applicantName: next.tenant?.fullName || ref.applicantName || null, listingName: listing.name || listing.address || null, fromName: ref.from?.name || null } });
  ref.assignedListingId = listing.id; ref.assignedAt = next.referral.assignedAt; ref.to.profileId = user.id;
  await saveReferral(ref);
  return { ref, applicationId };
}

// Tenant revokes a completed referral (from /my-application): revoke the derived application
// and mark the referral. Realtor 2's views show "revoked" from here on.
export async function revokeReferralByApplication(app, revoked) {
  if (!app?.referral?.id) return;
  const ref = await getReferral(app.referral.id);
  if (!ref) return;
  ref.status = revoked ? 'revoked' : 'approved';
  await saveReferral(ref);
}

