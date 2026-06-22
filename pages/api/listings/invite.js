// /api/listings/invite
// Mint (or reuse) a listing-scoped tenant invite link for a SUPABASE-authed
// realtor. Writes the SAME Upstash KV `linvite:{token}` record shape the tenant
// /apply flow already consumes (resolve-invite, tag-invite-submission) — those
// routes are left untouched. Also persists invite_token/invite_url back onto the
// Supabase listing row (RLS, realtor owns it).
import crypto from 'crypto';
import { getSupabaseServerClient } from '../../../lib/supabase/server';

function kvBase() {
  return (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: 'Not signed in.' });

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
    .select('full_name, brokerage, phone')
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
    realtorName: String(profile?.full_name || '').slice(0, 120),
    realtorBrokerage: String(profile?.brokerage || '').slice(0, 200),
    realtorPhone: String(profile?.phone || '').slice(0, 40),
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
    // Preserve submission count / createdAt if reusing the token.
    if (reuse) {
      const r = await fetch(`${base}/get/linvite:${token}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const d = await r.json();
      if (d?.result) {
        const prev = typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
        payload.submissionCount = prev.submissionCount || 0;
        payload.createdAt = prev.createdAt || payload.createdAt;
      }
    }

    const setRes = await fetch(`${base}/set/linvite:${token}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!setRes.ok) return res.status(500).json({ error: 'Could not create invite link.' });
    // 90-day TTL (matches the existing invite flow).
    await fetch(`${base}/expire/linvite:${token}/7776000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    const url = `https://rentletter.ca/apply/${token}`;

    // Persist token + url back onto the listing (RLS — realtor owns it).
    await supabase.from('listings').update({ invite_token: token, invite_url: url }).eq('id', listing.id);

    return res.status(200).json({ ok: true, token, url });
  } catch (e) {
    console.error('[listings/invite] error:', e);
    return res.status(500).json({ error: 'Could not create invite link.' });
  }
}
