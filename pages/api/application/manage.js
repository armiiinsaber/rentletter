// /api/application/manage
// Tenant-side endpoint, authenticated ONLY by the owner token issued at submission.
// The owner token is the tenant's sole credential — treat it like a password.
//
// Actions
//   view      → profile facts + privacy state + lookup log           (works while revoked)
//   update    → edit the profile IN PLACE (same RL, same record)      (403 while revoked)
//   prefill   → form-shaped facts to apply to another listing         (403 while revoked)
//   revoke / unrevoke                                                  (unchanged)
//
// Scoping: a token is only ever compared against the record stored under the RL number
// the caller names — there is no token→application index, so a valid token for RL-A can
// never read or write RL-B. The comparison is constant-time.
//
// `update` rewrites the SAME app:{RL} document (no new RL is minted, no new junction row)
// and re-mirrors it into Supabase `applications` via the same upsert the first submission
// used (onConflict application_number → the existing row is updated; listing_applicants
// rows — and the realtor's doc_verifications / ai_insight / decisions on them — are not
// touched). KV TTL is refreshed so an edit never resurrects an already-expired record.
import { timingSafeEqual } from 'crypto';
import { recordProfileEditEvents } from '../../../lib/events';
import { verificationFacts } from '../../../lib/applicantSynthesis';
import { kvGet, kvIncr, kvExpire } from '../../../lib/kv';
import { buildApplicationFromForm, formFromApplication, publicProfile } from '../../../lib/tenantProfile';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { upsertApplication } from '../../../lib/supabaseBridge';
import { logServerError } from '../../../lib/serverLog';
import { attachApplication } from '../../../lib/tenantProfileStore';
import { revokeReferralByApplication } from '../../../lib/referrals';

const UPDATE_LIMIT_PER_HOUR = 20;
const ONE_YEAR = 31536000;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length === 0 || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

async function kvSet(key, value) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { applicationNumber, ownerToken, action } = req.body || {};

  if (!applicationNumber || !ownerToken) {
    return res.status(400).json({ error: 'Application number and owner token required.' });
  }

  const appNum = String(applicationNumber).trim().toUpperCase();
  if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(appNum)) {
    return res.status(400).json({ error: 'Invalid application number format.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  try {
    const application = await kvGet(`app:${appNum}`);
    if (!application) return res.status(404).json({ error: 'Application not found.' });

    // Authenticate via owner token (constant-time). Same generic message either way.
    if (!safeEqual(application.ownerToken, String(ownerToken).trim())) {
      return res.status(401).json({ error: 'Invalid owner token.' });
    }

    // ─── ACTION: VIEW (default) ───
    if (!action || action === 'view') {
      // Lazy association: a legacy owner-token visit links this application to its email's
      // unified profile (no facts refresh — viewing isn't a statement of current truth).
      attachApplication(application, { refreshFacts: false }).catch(() => {});
      const log = (await kvGet(`auditlog:${appNum}`)) || [];
      return res.status(200).json({
        applicationNumber: appNum,
        revoked: !!application.revoked,
        revokedAt: application.revokedAt || null,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt || null,
        profileRevision: Number(application.profileRevision) || 0,
        profile: publicProfile(application),
        lookups: Array.isArray(log) ? log : [],
        lookupCount: Array.isArray(log) ? log.length : 0,
      });
    }

    // ─── ACTION: PREFILL — apply to another listing with this profile ───
    // Returns ONLY the flat form values (no log, no state). Refused while revoked: a tenant
    // who pulled their application should not be able to fan it out until they reactivate.
    if (action === 'prefill') {
      if (application.revoked) {
        return res.status(403).json({ error: 'This application is revoked. Reactivate it on your profile page before using it to apply elsewhere.', code: 'revoked' });
      }
      const form = formFromApplication(application);
      // Listing facts belong to the NEW listing, never carried over.
      form.apartmentAddress = ''; form.apartmentDescription = '';
      return res.status(200).json({ ok: true, form, sourceApplicationNumber: appNum, sourceListingAddress: application?.apartment?.address || null });
    }

    // ─── ACTION: UPDATE — edit the profile in place ───
    if (action === 'update') {
      if (application.revoked) {
        return res.status(403).json({ error: 'This application is revoked. Reactivate it before editing.', code: 'revoked' });
      }
      // Rate limit per application (fail-open if KV counters are unavailable).
      const hourKey = `profile_update:${appNum}:${new Date().toISOString().slice(0, 13)}`;
      const n = await kvIncr(hourKey);
      if (n === 1) await kvExpire(hourKey, 3700);
      if (n !== null && n > UPDATE_LIMIT_PER_HOUR) {
        return res.status(429).json({ error: 'Too many edits in a short time. Please wait a little while and try again.', code: 'rate_limited' });
      }
      const form = req.body?.form;
      if (!form || typeof form !== 'object') return res.status(400).json({ error: 'Nothing to update.' });

      let next;
      try { next = buildApplicationFromForm(application, form); }
      catch (e) { return res.status(400).json({ error: e.message || 'Some fields are invalid.', code: 'invalid' }); }

      // Identity + privacy fields can never change through this path.
      next.applicationNumber = application.applicationNumber;
      next.ownerToken = application.ownerToken;
      next.createdAt = application.createdAt;
      next.revoked = !!application.revoked;
      if (application.revokedAt) next.revokedAt = application.revokedAt; else delete next.revokedAt;
      next.coverLetter = application.coverLetter ?? null;

      await kvSet(`app:${appNum}`, next);
      await kvExpire(`app:${appNum}`, ONE_YEAR);

      // Mirror into Supabase so the realtor's dashboard reflects the edit. Best-effort: the
      // tenant's record is saved regardless; a mirror failure is logged, not surfaced as a
      // failed save.
      let mirrored = false;
      if (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try { await upsertApplication(getSupabaseAdminClient(), next); mirrored = true; }
        catch (e) { logServerError('[application/manage:update:mirror]', e, { applicationNumber: appNum }); }
        if (mirrored) await recordProfileEditEvents(getSupabaseAdminClient(), appNum, (docv) => verificationFacts(docv).documents);
      }
      // Coherence with the unified profile: always keep the application linked; copy the edited
      // facts INTO the profile only when the tenant asked ("also update my profile").
      attachApplication(next, { refreshFacts: !!req.body?.syncProfile, force: !!req.body?.syncProfile }).catch(() => {});
      return res.status(200).json({
        ok: true,
        updatedAt: next.updatedAt,
        profileRevision: next.profileRevision,
        profile: publicProfile(next),
        mirrored,
        profileSynced: !!req.body?.syncProfile,
      });
    }

    // ─── ACTION: REVOKE ───
    if (action === 'revoke') {
      application.revoked = true;
      application.revokedAt = new Date().toISOString();
      await kvSet(`app:${appNum}`, application);
      // A referred application: revoking it IS revoking the referral (Realtor 2 loses access).
      revokeReferralByApplication(application, true).catch(() => {});
      return res.status(200).json({ ok: true, revoked: true });
    }

    // ─── ACTION: UN-REVOKE ───
    if (action === 'unrevoke') {
      application.revoked = false;
      delete application.revokedAt;
      await kvSet(`app:${appNum}`, application);
      revokeReferralByApplication(application, false).catch(() => {});
      return res.status(200).json({ ok: true, revoked: false });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[application/manage]', e, { applicationNumber: appNum, action: action || 'view' });
    return res.status(500).json({ error: 'Failed to manage application.' });
  }
}
