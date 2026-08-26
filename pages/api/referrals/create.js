// /api/referrals/create — POST { listingId, linkId, toName, toEmail, note } (Realtor 1)
// Creates a PENDING referral and emails the APPLICANT for consent. Nothing is shared yet.
import { Resend } from 'resend';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { requireRealtor } from '../../../lib/realtorAuth';
import { fetchListingApplicants, attachDocVerifications } from '../../../lib/supabaseBridge';
import { createReferral, kvReady } from '../../../lib/referrals';
import { consentEmail } from '../../../lib/referralEmails';
import { isEmail, normalizeEmail } from '../../../lib/tenantProfileStore';
import { logServerError } from '../../../lib/serverLog';
import { requireEntitlement } from '../../../lib/requireEntitlement';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  // Write path: needs an unlocked plan (lib/entitlements.js) → 402 otherwise.
  if (!(await requireEntitlement(req, res, ctx.supabase, ctx.user))) return;
  if (!kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const { listingId, linkId, toName, toEmail, note } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant.' });
  if (!isEmail(toEmail)) return res.status(400).json({ error: 'Enter the receiving realtor’s email.' });
  if (!String(toName || '').trim()) return res.status(400).json({ error: 'Enter the receiving realtor’s name.' });
  if (normalizeEmail(toEmail) === normalizeEmail(ctx.user.email)) return res.status(400).json({ error: 'That’s your own email.' });

  const { data: listing } = await ctx.supabase.from('listings').select('id, name, address').eq('id', listingId).maybeSingle();
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  const admin = getSupabaseAdminClient();
  const applicants = await attachDocVerifications(admin, listing.id, await fetchListingApplicants(admin, listing.id), 'referral');
  const link = applicants.find((a) => String(a.linkId) === String(linkId));
  if (!link) return res.status(404).json({ error: 'Applicant not found on this listing.' });

  try {
    const { ref, token } = await createReferral({ fromProfile: { ...ctx.profile, id: ctx.user.id }, fromListing: listing, link, toName, toEmail, note });
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca';
    const url = `${site}/refer/${encodeURIComponent(token)}`;
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({ from: 'Rentletter <hello@rentletter.ca>', to: ref.applicantEmail, subject: `${ref.from.name || 'Your realtor'} would like to share your application`, html: consentEmail({ url, fromName: ref.from.name, fromBrokerage: ref.from.brokerage, toName: ref.to.name, toBrokerage: ref.to.brokerage, applicantFirst: String(ref.applicantName || '').split(' ')[0] }) });
    } else if (process.env.NODE_ENV !== 'production') console.warn('[referrals/create] RESEND_API_KEY not set — dev-only consent link:', url);
    return res.status(200).json({ ok: true, referral: { id: ref.id, status: ref.status, to: { name: ref.to.name, email: ref.to.email, hasAccount: !!ref.to.profileId }, createdAt: ref.createdAt, expiresAt: ref.expiresAt } });
  } catch (e) {
    if (e.code === 'rate' || e.code === 'no_email') return res.status(e.code === 'rate' ? 429 : 400).json({ error: e.message });
    logServerError('[referrals/create]', e, { listingId, linkId });
    return res.status(500).json({ error: 'Could not create the referral.' });
  }
}
