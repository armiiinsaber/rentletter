// lib/inviteResolve.js  SERVER ONLY (takes the service role client). The invite link's source of
// truth is the listings row found by invite_token: address, rent, bedrooms, pets, smoking,
// parking, status, and the realtor's name, brokerage and province through the profile. The KV
// record (90 day TTL, pages/api/listings/invite.js) stays for rate limiting and counters; its
// expiry no longer kills the link. A deleted listing (no row) answers rented while the record
// exists, as before; no row and no record is 404.
import { normalizeProvince } from './provinces.js';
import { listingOpen } from './listingState.js';
import { rentFromInvite } from './inviteRent.js';

export const LISTING_COLS = 'id, profile_id, name, address, monthly_rent, bedrooms, allows_pets, allows_smoking, parking_included, status, closed_at';

// The public answer built from the row and its realtor's profile, the shape the apply page reads.
export function inviteFromRow(row, profile) {
  const p = profile || {};
  return {
    realtorName: String(p.full_name || '').slice(0, 120),
    realtorBrokerage: String(p.brokerage || '').slice(0, 200),
    listingName: String(row.name || row.address || 'Listing').slice(0, 80),
    unit: {
      address: row.address || null,
      monthlyRent: row.monthly_rent != null ? String(row.monthly_rent) : '',
      bedrooms: row.bedrooms || '',
      allowsPets: row.allows_pets || 'any',
      allowsSmoking: row.allows_smoking || 'no',
      parkingIncluded: row.parking_included || 'no',
    },
    province: normalizeProvince(p.province),
  };
}

// The row and profile for a token, or null when there is no such listing.
export async function loadInviteListing(admin, token) {
  if (!admin || !/^[a-f0-9]{20}$/.test(String(token || ''))) return null;
  const { data: row } = await admin.from('listings').select(LISTING_COLS).eq('invite_token', String(token)).maybeSingle();
  if (!row) return null;
  let profile = null;
  if (row.profile_id) { const { data: p } = await admin.from('profiles').select('full_name, brokerage, province').eq('id', row.profile_id).maybeSingle(); profile = p || null; }
  return { row, profile };
}

// resolveInvite(admin, token, record) -> { status, body }
//   the row decides: open answers the listing, rented or closed answers rented; no row: the record
//   alone answers rented (a deleted listing), nothing answers 404.
export async function resolveInvite(admin, token, record) {
  const found = await loadInviteListing(admin, token);
  if (found) {
    const { row, profile } = found;
    const pub = inviteFromRow(row, profile);
    if (!listingOpen(row)) return { status: 200, body: { rented: true, realtorName: pub.realtorName || null, listingName: pub.listingName || null } };
    return { status: 200, body: pub };
  }
  if (record) return { status: 200, body: { rented: true, realtorName: record.realtorName || null, listingName: record.listingName || null } };
  return { status: 404, body: { error: 'This invite link has expired or is invalid. Please contact your realtor for a new link.' } };
}

// The rent an application arrived under: the row first, the KV record only when there is no row.
export async function inviteRent(admin, token, record) {
  const found = admin ? await loadInviteListing(admin, token) : null;
  if (found && found.row) { const n = Number(found.row.monthly_rent); if (Number.isFinite(n) && n > 0) return Math.round(n); }
  return rentFromInvite(record);
}
