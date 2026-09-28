// /api/listings/status  POST { listingId, status, rentedLinkId, notify }
// status: active | rented | closed. Session, entitlement, then the explicit ownership check
// (listing.profile_id === user.id through the service role, lib/listingStatus.js ownedListing).
// Sets status and closed_at (now for rented or closed, null on reopen) and rented_link_id when
// given, clears the signals cache, records listing_updated with { status }. Marking rented with
// notify on sends the not selected message to every active applicant who did not get the unit
// (never set aside or withdrawn ones), creates one pending pipeline_consents row per person and
// listing with a crypto token (a person who already has a row for this listing is not written or
// mailed again), and records applicant_not_selected. Whoever could not be reached (no email, no
// mailer, a failed send) comes back by name in notReached. The winner gets the accepted message
// with the move to accepted, and whoever held the listing gets the fell through message with the
// move to fell_through on reopen: one send per move, so never twice.
// The state machine (lib/application-state.js): the listing's move and every application's move
// are asserted before anything is written. Rented accepts the winner and sets every other
// application still in play to not_selected; reopening a rented listing is a deal that fell
// through for whoever held it. A refused move answers 409 and writes nothing.
import { Resend } from 'resend';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { realtorName } from '../../../lib/ownApplicant';
import { recordEvent } from '../../../lib/events';
import { logServerError } from '../../../lib/serverLog';
import { invalidateSignals } from '../../../lib/signalsCache';
import { LISTING_STATUSES, statusPatch, ownedListing, notSelectedRecipients, notSelectedEmail, notSelectedFrom, newConsentToken, consentExpiry, statusTableAbsent, acceptedEmail, fellThroughEmail, existingConsent } from '../../../lib/listingStatus';
import { kvSrem } from '../../../lib/docRequest';
import { displayLabel } from '../../../lib/listingAddress';
import { ACTOR_TYPE, LISTING_STATE, APPLICATION_STATE, isLegacyRented, isLegacyActive, listingStateFromLegacy, listingStateOf, applicationStateOf, rentedCascade, reopenCascade, isTransitionError } from '../../../lib/application-state';
import { transitionListing, transitionApplications, refusal, listingRefusal } from '../../../lib/applicationTransitions';

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
    if (isLegacyRented(status) && rentedLinkId) {
      const { data: link } = await admin.from('listing_applicants').select('id, listing_id, application_id').eq('id', String(rentedLinkId)).maybeSingle();
      if (!link || String(link.listing_id) !== String(listing.id)) return res.status(400).json({ error: 'That applicant is not on this listing.' });
      winner = link;
    }
    const patch = statusPatch(status, { rentedLinkId: winner ? winner.id : null });
    // Every move this request makes, asserted up front: the listing's, then the applications'.
    const fromState = listingStateOf(listing);
    const toState = listingStateFromLegacy(status);
    let moves = [];
    let moved;
    try {
      // Leaving rented, to live or to withdrawn, is a deal that fell through for whoever held it.
      const cascades = isLegacyRented(status) || (fromState === LISTING_STATE.RENTED && toState !== LISTING_STATE.RENTED);
      if (cascades) {
        const { data: standing, error: sErr } = await admin.from('listing_applicants').select('*').eq('listing_id', listing.id);
        if (sErr) throw sErr;
        const applications = (standing || []).map((j) => ({ id: j.id, state: applicationStateOf(j, listing) }));
        moves = isLegacyRented(status) ? rentedCascade(applications, winner ? winner.id : null) : reopenCascade(applications);
      }
      moved = await transitionListing(admin, { listing, to: toState, patch });
    } catch (e) {
      if (isTransitionError(e)) { const r = e.kind === 'listing' ? listingRefusal(e) : refusal(e); return res.status(r.status).json(r.body); }
      throw e;
    }
    const upErr = moved.error;
    if (upErr) {
      if (statusTableAbsent(upErr)) return res.status(503).json({ error: 'Listing status is not set up yet (run db/listing-status.sql).' });
      throw upErr;
    }
    // Already asserted above. A write that fails here is logged and the request carries on: the
    // listing has moved, and the columns the screens read are already right.
    try { await transitionApplications(admin, moves, { actor: user.id, actorType: ACTOR_TYPE.REALTOR, reason: isLegacyRented(status) ? 'listing_rented' : 'listing_reopened' }); }
    catch (e) { logServerError('[listings/status] application states', e, { listingId: listing.id }); }
    invalidateSignals(user.id);
    if (!isLegacyActive(status)) {
      // Rented or closed: no applicant on this listing gets a document reminder (lib/nudges.js pending set).
      const { data: links } = await admin.from('listing_applicants').select('id').eq('listing_id', listing.id);
      for (const l of links || []) await kvSrem(l.id);
    }
    await recordEvent(admin, { profileId: user.id, listingId: listing.id, type: 'listing_updated', payload: { status, listingName: displayLabel(listing) || listing.name || listing.address || null } });

    const name = realtorName(gate.profile, user);
    const unit = displayLabel(listing, 'the unit');
    const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    const send = async (to, mail) => resend.emails.send({ from: notSelectedFrom(name), to, reply_to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
    // The person behind a move this request made: name and email from the application row.
    const personOf = async (linkId) => {
      const { data: link } = await admin.from('listing_applicants').select('id, application_id').eq('id', String(linkId)).maybeSingle();
      if (!link) return null;
      const { data: app } = await admin.from('applications').select('id, full_name, email').eq('id', link.application_id).maybeSingle();
      return app ? { linkId: link.id, applicationId: app.id, name: app.full_name || 'Applicant', email: String(app.email || '').trim() } : null;
    };
    const notReached = []; // [{ name, reason }] reason: no_email | no_mailer | send_failed
    const mailMove = async (move, build, label) => {
      const who = await personOf(move.id);
      if (!who) return;
      if (!who.email) { notReached.push({ name: who.name, reason: 'no_email' }); return; }
      if (!resend) { notReached.push({ name: who.name, reason: 'no_mailer' }); return; }
      try { await send(who.email, build({ listingName: unit, realtorName: name, applicantName: who.name })); }
      catch (e) { logServerError(`[listings/status] ${label} email`, e, { listingId: listing.id, linkId: who.linkId }); notReached.push({ name: who.name, reason: 'send_failed' }); }
    };
    // The winner: once, with the move into accepted (a second mark rented is refused before this).
    for (const m of moves.filter((x) => x.to === APPLICATION_STATE.ACCEPTED)) await mailMove(m, acceptedEmail, 'accepted');
    // Whoever held the listing when it reopened: once, with the move into fell_through.
    for (const m of moves.filter((x) => x.to === APPLICATION_STATE.FELL_THROUGH)) await mailMove(m, fellThroughEmail, 'fell through');

    let notified = 0, recipients = 0, alreadyAsked = 0;
    if (isLegacyRented(status) && notify !== false) {
      const { data: rows } = await admin.from('listing_applicants').select('*, application:applications(id, full_name, email)').eq('listing_id', listing.id);
      const list = notSelectedRecipients(rows || [], winner ? winner.id : null);
      recipients = list.length;
      let consentsAbsent = false;
      for (const r of list) {
        const token = newConsentToken();
        if (!consentsAbsent) {
          // One row per person and listing: someone asked before (an earlier rented, a keep me in
          // mind they typed themselves) is neither written nor mailed again.
          try {
            const had = await existingConsent(admin, { listingId: listing.id, email: r.email });
            if (had) { alreadyAsked++; continue; }
          } catch (e) { if (statusTableAbsent(e)) consentsAbsent = true; else throw e; }
        }
        if (!consentsAbsent) {
          const { error: cErr } = await admin.from('pipeline_consents').insert({ profile_id: user.id, listing_id: listing.id, application_id: r.applicationId, email: r.email, token, status: 'pending', expires_at: consentExpiry() });
          if (cErr) { if (statusTableAbsent(cErr)) { consentsAbsent = true; console.warn('[listings/status] pipeline_consents is not set up (run db/listing-status.sql); messages go out without a keep me in mind row'); } else { logServerError('[listings/status] consent row', cErr, { listingId: listing.id, linkId: r.linkId }); } }
        }
        const keepUrl = `${siteBase()}/keep/${token}`;
        const mail = notSelectedEmail({ listingName: unit, realtorName: name, applicantName: r.name, keepUrl });
        if (!resend) { notReached.push({ name: r.name, reason: 'no_mailer' }); continue; }
        try {
          await send(r.email, mail);
          notified++;
          await recordEvent(admin, { profileId: user.id, listingId: listing.id, applicationId: r.applicationId, type: 'applicant_not_selected', payload: { applicantName: r.name, listingName: unit, linkId: r.linkId } });
        } catch (e) { logServerError('[listings/status] not selected email', e, { listingId: listing.id, linkId: r.linkId }); notReached.push({ name: r.name, reason: 'send_failed' }); }
      }
      // Someone told no this request with no email on file cannot be reached either.
      for (const m of moves.filter((x) => x.to === APPLICATION_STATE.NOT_SELECTED)) {
        const j = (rows || []).find((r) => String(r.id) === String(m.id));
        if (j && !String(j.application?.email || '').trim()) notReached.push({ name: j.application?.full_name || 'Applicant', reason: 'no_email' });
      }
    }
    return res.status(200).json({ ok: true, status, state: toState, closedAt: patch.closed_at, rentedLinkId: patch.rented_link_id, recipients, notified, alreadyAsked, notReached });
  } catch (e) {
    logServerError('[listings/status]', e, { listingId, status, userId: user.id });
    return res.status(500).json({ error: 'Could not update the listing.' });
  }
}
