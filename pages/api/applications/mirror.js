// /api/applications/mirror
// PUBLIC bridge endpoint, called by /apply/[token] AFTER the tenant's submission
// was written to KV (generate.js) and linked to the invite (pages/api/invite/tag.js).
// It mirrors the KV app:{RL} into Supabase `applications` (service-role) and links
// it to the invite's listing via `listing_applicants` (added_via ADDED_VIA.INVITE).
//
// Non-blocking by design: if Supabase isn't configured it no-ops with 200 so the
// tenant flow is never affected. KV remains the source of truth for the tenant path.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { recordForListing } from '../../../lib/events';
import { ADDED_VIA } from '../../../lib/listingApplicantsVocabulary';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvGet, kvLrange, kvIncr, kvExpire } from '../../../lib/kv';
import { checkSubmitLimits } from '../../../lib/rateLimit';
import { upsertApplication, linkApplicantToListing } from '../../../lib/supabaseBridge';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { kvReady, mintRequest, uploadUrl } from '../../../lib/docRequest';

export function createHandler(deps = {}) {
  const { admin: adminFactory = getSupabaseAdminClient, configured = () => isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY, kv = { get: kvGet, lrange: kvLrange, incr: kvIncr, expire: kvExpire, ready: kvReady }, record = recordForListing, mint = mintRequest, now = () => Date.now() } = deps;
  return async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, applicationNumber } = req.body || {};
  const appNum = String(applicationNumber || '').trim().toUpperCase();
  if (!isApplicationNumber(appNum)) {
    return res.status(400).json({ error: 'Invalid application number.' });
  }
  // Sandbox invite: nothing is mirrored; the apply page still gets a document request shape to render.
  if (/^demo\d{16}$/.test(String(token || ''))) {
    const demoToken = `demo${'0'.repeat(28)}`;
    return res.status(200).json({ ok: true, sandbox: true, mirrored: false, linked: false, docRequest: { token: demoToken, url: uploadUrl(demoToken), sandbox: true } });
  }
  if (!token || !/^[a-f0-9]{20}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid invite token.' });
  }
  // Public write: the same limits as the application form, per invite token and per IP.
  const clientIp = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kv.incr, expire: kv.expire }, { token: `mirror:${token}`, ip: clientIp, now: now() });
  if (!limited.ok) return res.status(429).json({ error: limited.message });

  // No-op (not an error) when Supabase isn't set up, keeps the tenant flow intact.
  if (!configured()) {
    return res.status(200).json({ ok: false, skipped: 'supabase-unconfigured' });
  }

  // Legitimacy: the RL must actually have been submitted through THIS invite.
  const subs = await kv.lrange(`invite_submissions:${token}`);
  if (!subs.map(String).includes(appNum)) {
    return res.status(403).json({ error: 'Application is not associated with this invite.' });
  }

  const app = await kv.get(`app:${appNum}`);
  if (!app) return res.status(404).json({ error: 'Application not found in KV.' });

  try {
    const admin = adminFactory();
    // Resolve the Supabase listing this invite belongs to (invite_token was written
    // onto the listing by /api/listings/invite).
    const { data: listing } = await admin
      .from('listings')
      .select('id, name, address, profile_id')
      .eq('invite_token', token)
      .maybeSingle();

    const applicationId = await upsertApplication(admin, app);
    let linked = false;
    let docRequest = null;
    if (listing?.id) {
      const link = await linkApplicantToListing(admin, listing.id, applicationId, ADDED_VIA.INVITE);
      linked = true;
      // Once per application: a repeat mirror call (a retry, a refresh) records nothing.
      if (link.created) await record(admin, listing.id, 'applicant_applied', { applicationId, payload: { via: 'invite' } });
      // MINT AT SUBMISSION: the same document request the realtor's button mints, no email. The
      // apply page offers the upload as its last step and the confirmation email carries the link.
      // Only this invite path mints; add by number and referral do not.
      if (kv.ready()) {
        try {
          const { data: link } = await admin.from('listing_applicants').select('id').eq('listing_id', listing.id).eq('application_id', applicationId).maybeSingle();
          const { data: profile } = await admin.from('profiles').select('full_name, brokerage').eq('id', listing.profile_id).maybeSingle();
          if (link?.id) {
            const minted = await mint({ listingId: listing.id, linkId: link.id, applicationId, tenantName: app?.tenant?.fullName || '', listingName: listing.name || listing.address || 'your rental', address: listing.address || '', realtorName: profile?.full_name || 'The listing realtor', brokerage: profile?.brokerage || '' });
            docRequest = { token: minted.token, url: uploadUrl(minted.token), requestedAt: minted.requestedAt, minted: minted.minted };
            if (minted.minted) await record(admin, listing.id, 'documents_requested', { applicationId, linkId: link.id, payload: { auto: true, emailed: false } });
          }
        } catch (e) { console.error('[applications/mirror] document request mint failed:', e?.message || e); }
      }
    }
    return res.status(200).json({ ok: true, mirrored: true, linked, docRequest });
  } catch (e) {
    console.error('[applications/mirror] error:', e?.message || e);
    return res.status(500).json({ error: 'Mirror failed.' });
  }
  };
}

export default createHandler();
