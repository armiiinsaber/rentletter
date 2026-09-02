// lib/ownApplicant.js  SERVER ONLY (takes the service role client).
// The explicit ownership check every realtor route runs on an applicant: the junction row's
// listing must carry profile_id === userId. Read through the service role and compared here,
// never left to RLS. Returns { junction, listing } when owned, false when the row exists but the
// listing belongs to someone else, null when there is no such row.
export async function ownedApplicant(admin, linkId, userId) {
  if (!admin || !linkId || !userId) return null;
  const { data: junction, error } = await admin.from('listing_applicants').select('*').eq('id', String(linkId)).maybeSingle();
  if (error) throw error;
  if (!junction) return null;
  const { data: listing, error: lErr } = await admin.from('listings').select('id, name, address, profile_id').eq('id', junction.listing_id).maybeSingle();
  if (lErr) throw lErr;
  if (!listing || String(listing.profile_id) !== String(userId)) return false;
  return { junction, listing };
}

// The realtor's display name for "by" fields: profile name, then email, then a plain label.
export function realtorName(profile, user) {
  return String(profile?.full_name || '').trim() || String(user?.email || '').trim() || 'the realtor';
}
