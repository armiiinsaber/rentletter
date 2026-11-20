// lib/profileShareRoutes.js  SERVER ONLY. What the two realtor routes under
// pages/api/profile-shares do before any read: the explicit ownership check on the applicant
// (lib/ownApplicant.js), then the share that applicant's tenant gave THIS realtor for THIS
// listing, if any (lib/profileShares.js). The tenant's profile is found from the application's
// own record of the profile it was made from (db/014 prefill_profile_id, else the back link
// tenant_profile_id): two ids, and nothing else of the application is selected, never its owner
// token. The viewer's label is the realtor's name and brokerage as they are now, for the
// tenant's log.
//   -> { share, junction, listing, viewer } | { status, error }
import { ownedApplicant } from './ownApplicant.js';
import { shareForApplicant } from './profileShares.js';

export async function shareForRealtorApplicant(admin, { linkId, user }) {
  if (!linkId || typeof linkId !== 'string') return { status: 400, error: 'linkId is required.' };
  const own = await ownedApplicant(admin, linkId, user.id);
  if (!own) return own === null ? { status: 404, error: 'Applicant not found.' } : { status: 403, error: 'Not your applicant.' };
  let app = await admin.from('applications').select('prefill_profile_id, tenant_profile_id').eq('id', own.junction.application_id).maybeSingle();
  if (app.error) app = await admin.from('applications').select('tenant_profile_id').eq('id', own.junction.application_id).maybeSingle();
  const tenantProfileId = app.data ? (app.data.prefill_profile_id || app.data.tenant_profile_id || null) : null;
  const { data: me } = await admin.from('profiles').select('full_name, brokerage').eq('id', user.id).maybeSingle();
  const viewer = { id: user.id, label: [String(me?.full_name || '').trim() || 'A realtor', String(me?.brokerage || '').trim()].filter(Boolean).join(', ') };
  const found = await shareForApplicant(admin, { recipientProfileId: user.id, listingId: own.listing.id, tenantProfileId });
  return { share: found.share || null, junction: own.junction, listing: own.listing, viewer };
}
