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
// WHAT MOVES: facts only — the flat application form. PLUS a verification SUMMARY (extracted
// facts + analyzedAt) when Realtor 1 had an active document verification. Never documents,
// never Realtor 1's AI insight, never the owner token, never the applicant's other
// applications, never anything about Realtor 1's listing beyond its label.
//
// STORAGE: KV is canonical (referral:{id} + indexes), Supabase `referrals` is the durable
// mirror once db/referrals.sql has run (missing table → KV-only, one warning). Consent tokens
// are random, stored HASHED, single-use, 7-day TTL, never logged.
import crypto from 'crypto';
import { ADDED_VIA } from './listingApplicantsVocabulary';
import { kvGet } from './kv';
import { getSupabaseAdminClient } from './supabase/admin';
import { isSupabaseConfigured } from './supabase/server';
import { formFromApplication, buildApplicationFromForm, EMPTY_FORM } from './tenantProfile';
import { getProfileByEmail, attachApplication, normalizeEmail, isEmail, emailKey, newToken, rateLimited } from './tenantProfileStore';
import { landlordVerification } from './listingReportData';
import { activeReport } from './docVerifications';
import { upsertApplication, linkApplicantToListing } from './supabaseBridge';

export const CONSENT_TTL = 7 * 24 * 3600;
const REFERRAL_TTL = 400 * 24 * 3600;
const base = () => (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const auth = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });
export const kvReady = () => !!(base() && process.env.KV_REST_API_TOKEN);
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function kvSet(key, value, ttl) {
  const r = await fetch(`${base()}/set/${key}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`KV set ${r.status}`);
  if (ttl) await fetch(`${base()}/expire/${key}/${ttl}`, { method: 'POST', headers: auth() });
}
async function kvDel(key) { try { await fetch(`${base()}/del/${key}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLpush(key, v) { try { await fetch(`${base()}/lpush/${key}/${encodeURIComponent(v)}`, { method: 'POST', headers: auth() }); await fetch(`${base()}/expire/${key}/${REFERRAL_TTL}`, { method: 'POST', headers: auth() }); } catch (e) { /* ignore */ } }
async function kvLrange(key) { try { const r = await fetch(`${base()}/lrange/${key}/0/-1`, { headers: auth() }); const d = await r.json(); return Array.isArray(d?.result) ? d.result.map(String) : []; } catch (e) { return []; } }

// ── Supabase mirror (tolerant of the table not existing yet) ────────────────────────────
let tableMissing = false;
function admin() { return isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null; }
async function mirror(ref) {
  const a = admin(); if (!a || tableMissing) return;
  const row = {
    id: ref.id, status: ref.status, from_profile_id: ref.from.profileId, from_listing_id: ref.from.listingId || null, from_link_id: ref.from.linkId || null,
    source_application_number: ref.sourceApplicationNumber, to_email: ref.to.email, to_name: ref.to.name, to_profile_id: ref.to.profileId || null,
    note: ref.note || null, applicant_email_key: ref.applicantEmailKey, referred_application_number: ref.referredApplicationNumber || null,
    verification_summary: ref.verification || null, assigned_listing_id: ref.assignedListingId || null, assigned_at: ref.assignedAt || null,
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

// Fields the consent page lists — plain labels, in the order a tenant thinks about them.
export const SHARED_FIELDS = [
  ['Name', (f) => f.fullName], ['Email', (f) => f.email], ['Phone', (f) => f.phone],
  ['Employment', (f) => [f.jobTitle, f.employer].filter(Boolean).join(' at ') || null],
  ['Income before tax', (f) => (Number(f.annualIncome) ? `$${Number(f.annualIncome).toLocaleString('en-CA')}/yr` : null)],
  ['After-tax income', (f) => (Number(f.netIncome) ? `$${Number(f.netIncome).toLocaleString('en-CA')}/yr` : null)],
  ['Rental history', (f) => [f.previousAddress, f.yearsAtPrevious ? `${f.yearsAtPrevious} yrs` : null].filter(Boolean).join(' · ') || null],
  ['Landlord reference', (f) => [f.previousLandlordName, f.previousLandlordContact].filter(Boolean).join(' · ') || null],
  ['Move-in & reason', (f) => [f.moveInDate ? (/^\d{4}-\d{2}-\d{2}$/.test(f.moveInDate) ? new Date(`${f.moveInDate}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : f.moveInDate) : null, f.reasonForMoving].filter(Boolean).join(' — ') || null],
  ['Household & pets', (f) => [f.numberOfOccupants ? `${f.numberOfOccupants} occupant(s)` : null, f.pets || null, f.hasCoApplicant ? 'co-tenant' : null].filter(Boolean).join(' · ') || null],
  ['In your own words', (f) => f.personality || null], ['Anything addressed', (f) => f.redFlags || null],
  ['References', (f) => [f.reference1Name, f.reference2Name].filter(Boolean).join(', ') || null],
];

// What will be shared, as of NOW: the tenant's profile facts if they have one, else the
// source application snapshot. Returns { form, source: 'profile' | 'snapshot' }.
export async function currentFacts(ref) {
  const p = await getProfileByEmail(ref.applicantEmail);
  if (p?.facts) return { form: { ...EMPTY_FORM, ...p.facts, email: p.email, apartmentAddress: '', apartmentDescription: '' }, source: 'profile' };
  const app = await kvGet(`app:${ref.sourceApplicationNumber}`);
  if (!app) return null;
  const form = formFromApplication(app); form.apartmentAddress = ''; form.apartmentDescription = '';
  return { form, source: 'snapshot' };
}

// Verification SUMMARY from Realtor 1's junction row: extracted facts + when. No documents.
export function verificationSummary(docVerifications, sourceLabel) {
  const v = landlordVerification(docVerifications);
  const rep = activeReport(docVerifications);
  if (!rep) return null;
  return {
    analyzedAt: rep.analyzedAt || null, verified: !!v.verified, reason: v.verified ? null : (v.reason || null),
    incomeVerified: !!v.incomeVerified, incomeFigure: v.incomeFigure || null,
    employmentVerified: !!v.employmentVerified, employerName: v.employerName || null,
    credit: v.credit || null, documentsCount: Array.isArray(rep.documents) ? rep.documents.length : 0,
    forListing: sourceLabel || null,
  };
}

// ── create (Realtor 1) ──────────────────────────────────────────────────────────────────
export async function createReferral({ fromProfile, fromListing, link, toName, toEmail, note }) {
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
    note: String(note || '').trim().slice(0, 400) || null,
    sourceApplicationNumber: link.application.application_number,
    applicantEmail, applicantEmailKey: emailKey(applicantEmail), applicantName: link.application.full_name || null,
    verification: verificationSummary(link.docVerifications, fromListing.name || fromListing.address || null),
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
  const src = (await kvGet(`app:${ref.sourceApplicationNumber}`)) || {};
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rand = (n, set) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  const rl = `RL-${new Date().getFullYear()}-${rand(4, '0123456789ABCDEF')}-${rand(4, '0123456789ABCDEF')}`;
  const seed = { applicationNumber: rl, createdAt: new Date().toISOString(), ownerToken: rand(32, chars), revoked: false, apartment: { address: null, description: null, estimatedRent: null, rentToIncomeRatio: null }, tenant: { dateOfBirth: src.tenant?.dateOfBirth || null } };
  const app = buildApplicationFromForm(seed, facts.form);
  app.applicationNumber = rl; app.ownerToken = seed.ownerToken; app.createdAt = seed.createdAt; app.revoked = false; delete app.updatedAt; app.profileRevision = 0;
  app.referral = { id: ref.id, fromName: ref.from.name, fromBrokerage: ref.from.brokerage, toName: ref.to.name, toEmail: ref.to.email, note: ref.note, approvedAt: ref.decidedAt, factsSource: facts.source, verification: ref.verification };
  await kvSet(`app:${rl}`, app, 365 * 24 * 3600);
  ref.status = 'approved'; ref.referredApplicationNumber = rl; ref.factsSource = facts.source;
  await saveReferral(ref);
  // Mirror to Supabase so Realtor 2 can assign it; attach to the tenant's profile (no facts refresh).
  const a = admin();
  if (a) { try { await upsertApplication(a, app); } catch (e) { console.error('[referrals] mirror application failed', e?.message || e); } }
  try { await attachApplication(app, { refreshFacts: false }); } catch (e) { /* non-fatal */ }
  return { ok: true, ref, app };
}

// ── receiving (Realtor 2) ───────────────────────────────────────────────────────────────
export async function inboxFor(user) {
  const refs = await listToEmail(user.email);
  const mine = refs.filter((r) => effectiveStatus(r) === 'approved' || effectiveStatus(r) === 'revoked');
  // Claim by profile id on first sight (attribution survives a later email change).
  for (const r of mine) if (!r.to.profileId) { r.to.profileId = user.id; await saveReferral(r); }
  const out = [];
  for (const r of mine) {
    const app = r.referredApplicationNumber ? await kvGet(`app:${r.referredApplicationNumber}`) : null;
    out.push({
      id: r.id, status: effectiveStatus(r), from: { name: r.from.name, brokerage: r.from.brokerage }, note: r.note, approvedAt: r.decidedAt, createdAt: r.createdAt,
      assignedListingId: r.assignedListingId, assignedAt: r.assignedAt, verification: r.verification, factsSource: r.factsSource,
      applicationNumber: r.referredApplicationNumber,
      applicant: app && !app.revoked ? {
        name: app.tenant?.fullName || r.applicantName, jobTitle: app.employment?.jobTitle || null, employer: app.employment?.employer || null, employmentType: app.employment?.employmentType || null,
        annualIncome: app.employment?.annualIncome || null, netIncome: app.employment?.netIncome || null, moveInDate: app.move?.moveInDate || null, yearsAtJob: app.employment?.yearsAtJob || null,
        rentalYears: app.rental?.yearsAtPrevious || null, hasLandlordRef: !!app.rental?.previousLandlordName, pets: app.lifestyle?.pets || null, occupants: app.household?.numberOfOccupants || null,
      } : null,
      revoked: !!app?.revoked,
    });
  }
  return out;
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
  app.apartment = { address: listing.address || listing.name || null, description: desc || null, estimatedRent: rent, rentToIncomeRatio: null };
  const next = buildApplicationFromForm(app, formFromApplication(app)); // recomputes ratio + scorecard for THIS rent
  next.applicationNumber = app.applicationNumber; next.ownerToken = app.ownerToken; next.createdAt = app.createdAt; next.revoked = false; delete next.updatedAt; next.profileRevision = app.profileRevision || 0;
  next.referral = { ...app.referral, assignedListing: listing.name || listing.address || null, assignedAt: new Date().toISOString() };
  await kvSet(`app:${next.applicationNumber}`, next, 365 * 24 * 3600);
  const a = admin(); if (!a) throw new Error('Supabase is not configured.');
  const applicationId = await upsertApplication(a, next);
  await linkApplicantToListing(a, listing.id, applicationId, ADDED_VIA.REFERRAL);
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

