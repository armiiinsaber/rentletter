// /api/landlord/workspace
// Load/save the signed-in landlord's workspace (applications + decisions).

import { trackUniqueSignup, bump, logEvent, COUNTERS } from '../../../lib/stats';

// Returns:
//   { ok: false, reason: 'missing' }    — no token or invalid format
//   { ok: false, reason: 'expired' }    — session not found in KV (expired or never existed)
//   { ok: false, reason: 'error' }      — server error checking session (DO NOT clear client session)
//   { ok: true, session: {...} }        — valid session
async function getSession(sessionToken) {
  if (!sessionToken) return { ok: false, reason: 'missing' };
  const clean = String(sessionToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) return { ok: false, reason: 'missing' };
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('[getSession] KV env vars missing');
    return { ok: false, reason: 'error' };
  }
  try {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    if (!r.ok) {
      console.error('[getSession] KV returned non-OK:', r.status);
      return { ok: false, reason: 'error' };
    }
    const data = await r.json();
    if (!data || data.result === undefined) {
      // Malformed response from KV
      return { ok: false, reason: 'error' };
    }
    if (data.result === null) {
      // KV explicitly returned null = session genuinely doesn't exist (expired)
      return { ok: false, reason: 'expired' };
    }
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (!record || !record.email) return { ok: false, reason: 'expired' };
    return { ok: true, session: record };
  } catch (e) {
    console.error('[getSession] Exception:', e?.message || e);
    return { ok: false, reason: 'error' };
  }
}

// Build a KV-safe key. Emails contain @ and . which can sometimes interact badly with URL paths.
// We hash-prefix-replace to keep keys ASCII-clean and predictable.
function workspaceKeyForEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  // Replace problematic URL-path characters. @ stays (Upstash supports it), but we encode dots and others.
  const safeEmail = encodeURIComponent(normalized);
  return `lworkspace:${safeEmail}`;
}

export default async function handler(req, res) {
  const sessionToken = req.headers['x-rl-session'] || req.body?.sessionToken;
  const sessionResult = await getSession(sessionToken);
  if (!sessionResult.ok) {
    if (sessionResult.reason === 'error') {
      // Transient server error — tell client NOT to wipe their session
      return res.status(503).json({ error: 'Session check temporarily unavailable. Try again in a moment.', transient: true });
    }
    // expired or missing — legitimately not signed in
    return res.status(401).json({ error: 'Not signed in.' });
  }
  const session = sessionResult.session;
  const wsKey = workspaceKeyForEmail(session.email);
  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  // Refresh session TTL to 30 days from now (active users don't expire mid-session)
  // Fire-and-forget — don't block the request on this.
  (async () => {
    try {
      await fetch(`${base}/expire/lsession:${String(sessionToken).trim()}/2592000`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
    } catch (e) {
      // Non-fatal
    }
  })();

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${base}/get/${wsKey}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const data = await r.json();
      console.log('[workspace GET]', { email: session.email, wsKey, hasResult: !!data?.result });
      if (!data?.result) return res.status(200).json({ applications: [], decisions: {} });
      const ws = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      console.log('[workspace GET] returning', {
        email: session.email,
        appsCount: ws.applications?.length || 0,
        decisionsCount: ws.decisions ? Object.keys(ws.decisions).length : 0,
      });
      return res.status(200).json(ws);
    } catch (e) {
      console.error('[workspace GET] error:', e);
      return res.status(500).json({ error: 'Failed to load workspace.' });
    }
  }

  if (req.method === 'POST') {
    const { applications, decisions, unit, realtorProfile, listings, activeListingId } = req.body || {};
    const safeApps = Array.isArray(applications) ? applications.slice(0, 200) : [];
    const safeDecisions = decisions && typeof decisions === 'object' ? decisions : {};
    const safeUnit = unit && typeof unit === 'object' ? unit : null;
    const safeRealtor = realtorProfile && typeof realtorProfile === 'object' ? {
      isRealtor: !!realtorProfile.isRealtor,
      fullName: String(realtorProfile.fullName || '').slice(0, 120),
      brokerage: String(realtorProfile.brokerage || '').slice(0, 200),
      phone: String(realtorProfile.phone || '').slice(0, 40),
      licenseNumber: String(realtorProfile.licenseNumber || '').slice(0, 40),
    } : null;
    // Cap listings: max 30 listings per workspace, max 200 apps per listing.
    const safeListings = Array.isArray(listings)
      ? listings.slice(0, 30).map(l => ({
          id: String(l.id || '').slice(0, 32),
          name: String(l.name || 'Listing').slice(0, 80),
          applications: Array.isArray(l.applications) ? l.applications.slice(0, 200) : [],
          decisions: l.decisions && typeof l.decisions === 'object' ? l.decisions : {},
          unit: l.unit && typeof l.unit === 'object' ? l.unit : null,
          // Landlord stated preferences (OHRC-compliant fields only)
          preferences: l.preferences && typeof l.preferences === 'object' ? l.preferences : undefined,
          createdAt: l.createdAt || new Date().toISOString(),
          // Preserve invite + share metadata so realtors keep their tokens across sessions
          inviteToken: l.inviteToken ? String(l.inviteToken).slice(0, 40) : undefined,
          inviteUrl: l.inviteUrl ? String(l.inviteUrl).slice(0, 200) : undefined,
          shareToken: l.shareToken ? String(l.shareToken).slice(0, 40) : undefined,
          sharedWithEmail: l.sharedWithEmail ? String(l.sharedWithEmail).slice(0, 200) : undefined,
          sharedAt: l.sharedAt || undefined,
        }))
      : null;
    const safeActiveListingId = activeListingId ? String(activeListingId).slice(0, 32) : null;
    const payload = {
      applications: safeApps,
      decisions: safeDecisions,
      unit: safeUnit,
      realtorProfile: safeRealtor,
      listings: safeListings,
      activeListingId: safeActiveListingId,
      updatedAt: new Date().toISOString(),
    };
    const payloadJson = JSON.stringify(payload);
    console.log('[workspace POST]', {
      email: session.email,
      wsKey,
      appsCount: safeApps.length,
      decisionsCount: Object.keys(safeDecisions).length,
      hasUnit: !!safeUnit,
      isRealtor: !!safeRealtor?.isRealtor,
      listingsCount: safeListings?.length || 0,
      payloadBytes: payloadJson.length,
    });
    try {
      const setRes = await fetch(`${base}/set/${wsKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: payloadJson,
      });
      if (!setRes.ok) {
        const errText = await setRes.text().catch(() => '');
        console.error('[workspace POST] KV set FAILED:', setRes.status, errText);
        return res.status(500).json({ error: 'Failed to save workspace.', detail: `KV ${setRes.status}: ${errText.slice(0, 200)}` });
      }
      const setBody = await setRes.text().catch(() => '');
      console.log('[workspace POST] KV set OK. Response:', setBody.slice(0, 100));

      // Refresh TTL to 30 days
      const expireRes = await fetch(`${base}/expire/${wsKey}/2592000`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      if (!expireRes.ok) {
        console.warn('[workspace POST] TTL refresh failed but value was saved');
      }
      // Instrument: track unique signup + workspace save count
      trackUniqueSignup(session.email);
      bump(COUNTERS.WORKSPACE_SAVES);
      return res.status(200).json({ ok: true, bytesSaved: payloadJson.length });
    } catch (e) {
      console.error('[workspace POST] error:', e);
      return res.status(500).json({ error: 'Failed to save workspace.', detail: e?.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
