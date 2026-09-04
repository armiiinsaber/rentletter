// lib/listingStatus.js  SERVER ONLY (takes the service role client). The ownership check for a
// listing, the consent token, the consent flip for /keep/{token}, and the absent table probe.
// The pure parts live in lib/listingState.js and are re-exported here for the routes.
import crypto from 'crypto';
export * from './listingState.js';

// The explicit ownership check for a listing: the row read through the service role must carry
// profile_id === userId. null when there is no row, false when it belongs to someone else.
export async function ownedListing(admin, listingId, userId) {
  if (!admin || !listingId || !userId) return null;
  const { data, error } = await admin.from('listings').select('*').eq('id', String(listingId)).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (String(data.profile_id) !== String(userId)) return false;
  return data;
}

export const newConsentToken = () => crypto.randomBytes(24).toString('base64url');

// Flip a consent row by token. status: 'consented' | 'declined'. Returns { ok, status, expired,
// found } and never throws into the page.
export async function flipConsent(admin, token, status, { now = new Date() } = {}) {
  if (!admin || !token || !['consented', 'declined'].includes(status)) return { ok: false, found: false };
  const { data: row, error } = await admin.from('pipeline_consents').select('*').eq('token', String(token)).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, found: false };
  const expired = !!(row.expires_at && new Date(row.expires_at).getTime() < new Date(now).getTime());
  if (expired) return { ok: false, found: true, expired: true, status: row.status };
  const patch = { status, consented_at: status === 'consented' ? new Date(now).toISOString() : null };
  const { error: upErr } = await admin.from('pipeline_consents').update(patch).eq('id', row.id);
  if (upErr) throw upErr;
  return { ok: true, found: true, expired: false, status, realtorName: row.realtor_name || null };
}

// A table that is not set up yet (db/listing-status.sql not run): log once, skip.
export function statusTableAbsent(error) {
  const m = String(error?.message || '');
  return error?.code === '42P01' || error?.code === '42703' || error?.code === 'PGRST204' || /pipeline_consents|closed_at|rented_link_id|'status'/.test(m) && /(does not exist|could not find|not found|schema cache)/i.test(m);
}
