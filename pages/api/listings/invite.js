// /api/listings/invite
// Mint (or reuse) a listing-scoped tenant invite link for a SUPABASE-authed
// realtor. Writes the SAME Upstash KV `linvite:{token}` record shape the tenant
// /apply flow already consumes (pages/api/invite/resolve.js and tag.js), those
// routes are left untouched. Also persists invite_token/invite_url back onto the
// Supabase listing row (RLS, realtor owns it).
import crypto from 'crypto';
import { recordEvent } from '../../../lib/events';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { normalizeProvince } from '../../../lib/provinces';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { newShortCode, isShortCode, shortKey, shortUrl, INVITE_TTL } from '../../../lib/shortLink';

function kvBase() {
  return (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: 'Not signed in.' });
  // Write path: needs an unlocked plan (lib/entitlements.js) → 402 otherwise.
  if (!(await requireEntitlement(req, res, supabase, user))) return;

  const { listingId, regenerate } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });

  // Fetch the listing under RLS (ensures the realtor owns it).
  const { data: listing, error: listErr } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .single();
  if (listErr || !listing) return res.status(404).json({ error: 'Listing not found.' });

  // Realtor profile for co-branding on the apply page.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, brokerage, phone, province')
    .eq('id', user.id)
    .single();

  const base = kvBase();
  if (!base || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Invite service unavailable.' });
  }

  // Reuse the existing token unless asked to regenerate.
  const reuse = !regenerate && listing.invite_token && /^[a-f0-9]{20}$/.test(String(listing.invite_token));
  const token = reuse ? String(listing.invite_token) : crypto.randomBytes(10).toString('hex');

  const payload = {
    realtorEmail: user.email,
    profileId: user.id,
    realtorName: String(profile?.full_name || '').slice(0, 120),
    realtorBrokerage: String(profile?.brokerage || '').slice(0, 200),
    realtorPhone: String(profile?.phone || '').slice(0, 40),
    // The listing's applicable province = the owning realtor's province. Carried on the invite
    // so the tenant apply page can apply the right age-of-majority gate (ON 18 / BC 19).
    province: normalizeProvince(profile?.province),
    listingId: String(listing.id).slice(0, 64),
    listingName: String(listing.name || 'Listing').slice(0, 80),
    unit: {
      address: listing.address || null,
      monthlyRent: listing.monthly_rent != null ? String(listing.monthly_rent) : '',
      bedrooms: listing.bedrooms || '',
      allowsPets: listing.allows_pets || 'any',
      allowsSmoking: listing.allows_smoking || 'no',
      parkingIncluded: listing.parking_included || 'no',
    },
    createdAt: new Date().toISOString(),
    submissionCount: 0,
  };

  try {
    const H = { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` };
    // The previous record: submission count and createdAt survive a reuse; its short code is
    // kept on reuse and deleted on regenerate.
    let prev = null;
    if (listing.invite_token && /^[a-f0-9]{20}$/.test(String(listing.invite_token))) {
      const r = await fetch(`${base}/get/linvite:${listing.invite_token}`, { headers: H });
      const d = await r.json();
      if (d?.result) prev = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
    }
    if (reuse && prev) {
      payload.submissionCount = prev.submissionCount || 0;
      payload.createdAt = prev.createdAt || payload.createdAt;
    }
    // SHORT LINK: short:{code} holds the token, same TTL as the record; the record carries the
    // code. Reuse keeps the code (and mints one lazily for a record that has none); regenerate
    // mints a new code and deletes the old key so the old short link dies with the old token.
    if (!reuse && prev?.shortCode) await fetch(`${base}/del/${shortKey(prev.shortCode)}`, { method: 'POST', headers: H });
    const shortCode = reuse && isShortCode(prev?.shortCode) ? prev.shortCode : newShortCode();
    payload.shortCode = shortCode;
    await fetch(`${base}/set/${shortKey(shortCode)}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(token) });
    await fetch(`${base}/expire/${shortKey(shortCode)}/${INVITE_TTL}`, { method: 'POST', headers: H });

    const setRes = await fetch(`${base}/set/linvite:${token}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!setRes.ok) return res.status(500).json({ error: 'Could not create invite link.' });
    // 90-day TTL (matches the existing invite flow).
    await fetch(`${base}/expire/linvite:${token}/${INVITE_TTL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    const url = `https://rentletter.ca/apply/${token}`;

    // Persist token + url back onto the listing (RLS — realtor owns it).
    await supabase.from('listings').update({ invite_token: token, invite_url: url }).eq('id', listing.id);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) await recordEvent(getSupabaseAdminClient(), { profileId: user.id, listingId: listing.id, type: 'invite_link_created', payload: { listingName: listing.name || listing.address || null, regenerated: !!(regenerate && listing.invite_token) } });

    return res.status(200).json({ ok: true, token, url, shortCode, shortUrl: shortUrl(shortCode) });
  } catch (e) {
    console.error('[listings/invite] error:', e);
    return res.status(500).json({ error: 'Could not create invite link.' });
  }
}
