// /api/listings/status  POST { listingId, status, rentedLinkId, notify }
// status: active | rented | closed. Session, entitlement, then the explicit ownership check
// (listing.profile_id === user.id through the service role, lib/listingStatus.js ownedListing).
// Sets status and closed_at (now for rented or closed, null on reopen) and rented_link_id when
// given, clears the signals cache, records listing_updated with { status }. Marking rented with
// notify on sends the not selected message to every active applicant who did not get the unit
// (never set aside or withdrawn ones, never a missing email), creates one pending
// pipeline_consents row per message with a crypto token, and records applicant_not_selected.
import { Resend } from 'resend';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { realtorName } from '../../../lib/ownApplicant';
import { recordEvent } from '../../../lib/events';
import { logServerError } from '../../../lib/serverLog';
import { invalidateSignals } from '../../../lib/signalsCache';
import { LISTING_STATUSES, statusPatch, ownedListing, notSelectedRecipients, notSelectedEmail, newConsentToken, consentExpiry, statusTableAbsent } from '../../../lib/listingStatus';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
  const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;

  const { listingId, status, rentedLinkId, notify } = req.body || {};
  if (!listingId || !LISTING_STATUSES.includes(status)) return res.status(400).json({ error: 'listingId and a status of active, rented or closed are required.' });

  try {
    const admin = getSupabaseAdminClient();
    // Explicit ownership: the listing row must carry profile_id === user.id.
    const listing = await ownedListing(admin, listingId, user.id);
    if (!listing) return res.status(listing === null ? 404 : 403).json({ error: listing === null ? 'Listing not found.' : 'Not your listing.' });

    let winner = null;
    if (status === 'rented' && rentedLinkId) {
      const { data: link } = await admin.from('listing_applicants').select('id, listing_id, application_id').eq('id', String(rentedLinkId)).maybeSingle();
      if (!link || String(link.listing_id) !== String(listing.id)) return res.status(400).json({ error: 'That applicant is not on this listing.' });
      winner = link;
    }
    const patch = statusPatch(status, { rentedLinkId: winner ? winner.id : null });
    const { error: upErr } = await admin.from('listings').update(patch).eq('id', listing.id);
    if (upErr) {
      if (statusTableAbsent(upErr)) return res.status(503).json({ error: 'Listing status is not set up yet (run db/listing-status.sql).' });
      throw upErr;
    }
    invalidateSignals(user.id);
    await recordEvent(admin, { profileId: user.id, listingId: listing.id, type: 'listing_updated', payload: { status, listingName: listing.name || listing.address || null } });

    let notified = 0, recipients = 0;
    if (status === 'rented' && notify !== false) {
      const { data: rows } = await admin.from('listing_applicants').select('id, application_id, decision_status, withdrawn_at, application:applications(id, full_name, email)').eq('listing_id', listing.id);
      const list = notSelectedRecipients(rows || [], winner ? winner.id : null);
      recipients = list.length;
      const name = realtorName(gate.profile, user);
      const unit = listing.name || listing.address || 'the unit';
      const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
      let consentsAbsent = false;
      for (const r of list) {
        const token = newConsentToken();
        if (!consentsAbsent) {
          const { error: cErr } = await admin.from('pipeline_consents').insert({ profile_id: user.id, listing_id: listing.id, application_id: r.applicationId, email: r.email, token, status: 'pending', expires_at: consentExpiry() });
          if (cErr) { if (statusTableAbsent(cErr)) { consentsAbsent = true; console.warn('[listings/status] pipeline_consents is not set up (run db/listing-status.sql); messages go out without a keep me in mind row'); } else { logServerError('[listings/status] consent row', cErr, { listingId: listing.id }); continue; } }
        }
        const keepUrl = `${siteBase()}/keep/${token}`;
        const mail = notSelectedEmail({ listingName: unit, realtorName: name, keepUrl, declineUrl: `${keepUrl}?no=1` });
        if (resend) {
          try {
            await resend.emails.send({ from: 'Rentletter <hello@rentletter.ca>', to: r.email, reply_to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
            notified++;
            await recordEvent(admin, { profileId: user.id, listingId: listing.id, applicationId: r.applicationId, type: 'applicant_not_selected', payload: { applicantName: r.name, listingName: unit, linkId: r.linkId } });
          } catch (e) { logServerError('[listings/status] not selected email', e, { listingId: listing.id, linkId: r.linkId }); }
        }
      }
    }
    return res.status(200).json({ ok: true, status, closedAt: patch.closed_at, rentedLinkId: patch.rented_link_id, recipients, notified });
  } catch (e) {
    logServerError('[listings/status]', e, { listingId, status, userId: user.id });
    return res.status(500).json({ error: 'Could not update the listing.' });
  }
}
