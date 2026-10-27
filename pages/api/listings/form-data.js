// /api/listings/form-data  POST { listingId }. A realtor read behind the same gate as every realtor
// write: session and entitlement through lib/realtorRoute.js withRealtor, then the explicit
// ownership check on the listing row (lib/listingStatus.js ownedListing: 404 unknown, 403 not
// theirs). Answers the Form data view (lib/formData.js, docs/form-data.md) for the one applicant
// who holds the listing (accepted or further along, lib/application-state.js HOLDING_STATES), or
// 409 while nobody does. Records form_data_opened on the listing's timeline once per open.
// The applicant row is read by named columns, so owner_token never leaves the server; the
// parties table may not exist yet (lib/partyStore.js partiesAbsent), in which case there are none.
import { withRealtor } from '../../../lib/realtorRoute';
import { ownedListing } from '../../../lib/listingStatus';
import { applicantStanding, holdsListing } from '../../../lib/application-state';
import { partiesAbsent } from '../../../lib/partyStore';
import { buildFormData } from '../../../lib/formData';
import { recordForListing } from '../../../lib/events';
import { displayLabel } from '../../../lib/listingAddress';

export default withRealtor(async ({ user, gate, admin }, req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId is required.' });
  const own = await ownedListing(admin, listingId, user.id);
  if (own === null) return res.status(404).json({ error: 'Not found.' });
  if (!own) return res.status(403).json({ error: 'Not your listing.' });
  // Explicit, beside the helper: the listing row must carry the caller.
  if (String(own.profile_id) !== String(user.id)) return res.status(403).json({ error: 'Not your listing.' });

  const { data: links, error: linkErr } = await admin.from('listing_applicants').select('*').eq('listing_id', own.id);
  if (linkErr) return res.status(500).json({ error: 'Could not read the applicants.' });
  const tenantLink = (links || []).find((j) => holdsListing(applicantStanding(j, own).state)) || null;
  if (!tenantLink) return res.status(409).json({ error: 'Form data is ready once an applicant is accepted.', code: 'not_accepted' });

  const { data: application } = await admin.from('applications').select('id, full_name, email, phone, prev_address').eq('id', tenantLink.application_id).maybeSingle();
  if (!application) return res.status(409).json({ error: 'That application is no longer on file.', code: 'not_accepted' });
  let parties = [];
  try {
    const { data, error } = await admin.from('application_parties').select('id, role, status, full_name, email, phone, address').eq('application_id', application.id);
    if (error && !partiesAbsent(error)) throw error;
    parties = data || [];
  } catch (e) { parties = []; }
  const profile = gate && gate.profile ? gate.profile : (await admin.from('profiles').select('*').eq('id', user.id).maybeSingle()).data;

  const built = buildFormData({ listing: own, profile: profile || {}, application, parties });
  await recordForListing(admin, own.id, 'form_data_opened', { applicationId: application.id, linkId: tenantLink.id, payload: { tenantName: application.full_name || null } });
  return res.status(200).json({ ok: true, listingName: displayLabel(own) || own.address || null, tenantName: application.full_name || null, province: built.province, groups: built.groups });
}, { label: '[listings/form-data]' });
