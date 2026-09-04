// /api/applications/mirror
// PUBLIC bridge endpoint, called by /apply/[token] AFTER the tenant's submission
// was written to KV (generate.js) and linked to the invite (tag-invite-submission.js).
// It mirrors the KV app:{RL} into Supabase `applications` (service-role) and links
// it to the invite's listing via `listing_applicants` (added_via ADDED_VIA.INVITE).
//
// Non-blocking by design: if Supabase isn't configured it no-ops with 200 so the
// tenant flow is never affected. KV remains the source of truth for the tenant path.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { recordForListing } from '../../../lib/events';
import { ADDED_VIA } from '../../../lib/listingApplicantsVocabulary';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvGet, kvLrange } from '../../../lib/kv';
import { upsertApplication, linkApplicantToListing } from '../../../lib/supabaseBridge';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { kvReady, mintRequest, uploadUrl } from '../../../lib/docRequest';

export default async function handler(req, res) {
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

  // No-op (not an error) when Supabase isn't set up — keeps the tenant flow intact.
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ ok: false, skipped: 'supabase-unconfigured' });
  }

  // Legitimacy: the RL must actually have been submitted through THIS invite.
  const subs = await kvLrange(`invite_submissions:${token}`);
  if (!subs.map(String).includes(appNum)) {
    return res.status(403).json({ error: 'Application is not associated with this invite.' });
  }

  const app = await kvGet(`app:${appNum}`);
  if (!app) return res.status(404).json({ error: 'Application not found in KV.' });

  try {
    const admin = getSupabaseAdminClient();
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
      await linkApplicantToListing(admin, listing.id, applicationId, ADDED_VIA.INVITE);
      linked = true;
      await recordForListing(admin, listing.id, 'applicant_applied', { applicationId, payload: { via: 'invite' } });
      // MINT AT SUBMISSION: the same document request the realtor's button mints, no email. The
      // apply page offers the upload as its last step and the confirmation email carries the link.
      // Only this invite path mints; add by number and referral do not.
      if (kvReady()) {
        try {
          const { data: link } = await admin.from('listing_applicants').select('id').eq('listing_id', listing.id).eq('application_id', applicationId).maybeSingle();
          const { data: profile } = await admin.from('profiles').select('full_name, brokerage').eq('id', listing.profile_id).maybeSingle();
          if (link?.id) {
            const minted = await mintRequest({ listingId: listing.id, linkId: link.id, applicationId, tenantName: app?.tenant?.fullName || '', listingName: listing.name || listing.address || 'your rental', address: listing.address || '', realtorName: profile?.full_name || 'The listing realtor', brokerage: profile?.brokerage || '' });
            docRequest = { token: minted.token, url: uploadUrl(minted.token), requestedAt: minted.requestedAt, minted: minted.minted };
            if (minted.minted) await recordForListing(admin, listing.id, 'documents_requested', { applicationId, linkId: link.id, payload: { auto: true, emailed: false } });
          }
        } catch (e) { console.error('[applications/mirror] document request mint failed:', e?.message || e); }
      }
    }
    return res.status(200).json({ ok: true, mirrored: true, linked, docRequest });
  } catch (e) {
    console.error('[applications/mirror] error:', e?.message || e);
    return res.status(500).json({ error: 'Mirror failed.' });
  }
}
