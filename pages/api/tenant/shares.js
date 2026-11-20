// /api/tenant/shares  The tenant's own shares (lib/profileShares.js, db/019-profile-shares.sql).
// The tenant's session cookie is the only credential, and the profile a share is made for or
// stopped on is the one that session belongs to: no id of a profile is ever read from the
// request, so a tenant can never approve or stop a share on another tenant's profile. No realtor
// session opens this route: it never reads one.
//
//   GET                       every share of this tenant (who, for which listing, since when,
//                             whether it is live, until when their documents open), each with
//                             the realtor's views of it from the tenant's log; and `preview`,
//                             exactly what a realtor sees through a share (lib/profileFacts.js).
//   POST { action }
//     apply { inviteToken, applicationNumber }
//                             one tap apply: the tenant just applied to the listing behind this
//                             invite with their profile. The share for that listing's realtor is
//                             approved by this act. The server finds the realtor and the listing
//                             from the invite, and checks that the application is this tenant's
//                             and is on that listing. Answers { ok, shared }.
//     stop { id }             the tenant stops one of their shares, at once.
import { sessionProfile, rateLimited, clientIp, normalizeEmail } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvGet } from '../../../lib/kv';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { logServerError } from '../../../lib/serverLog';
import { sharePayload } from '../../../lib/profileFacts';
import { listVault } from '../../../lib/tenantVault';
import { approveApplicationShare, stopShare, listTenantShares } from '../../../lib/profileShares';

const adminClient = () => (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.', code: 'no_session' });
  const admin = adminClient();
  try {
    if (req.method === 'GET') {
      const vault = admin ? await listVault(admin, p.id) : { checks: [], views: [] };
      const list = admin ? await listTenantShares(admin, p.id) : { available: false, shares: [] };
      const preview = sharePayload({ id: p.id, facts: p.facts || {}, factsUpdatedAt: p.factsUpdatedAt }, vault.checks.map((c) => ({ kind: c.kind, value: c.value, read_at: c.readAt })));
      const shares = list.shares.map((s) => ({ ...s, views: vault.views.filter((v) => v.shareId === s.id).map((v) => ({ id: v.id, action: v.action, at: v.at })) }));
      return res.status(200).json({ available: list.available, shares, preview: { facts: preview.facts, checks: preview.checks }, documents: (vault.documents || []).map((d) => ({ id: d.id, kind: d.kind })) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action } = req.body || {};
    if (!admin) return res.status(503).json({ error: 'Service temporarily unavailable.' });

    if (action === 'stop') {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!id) return res.status(400).json({ error: 'Nothing to stop.' });
      const out = await stopShare(admin, { tenantProfileId: p.id, id });
      if (!out.ok) return res.status(out.reason === 'missing' ? 404 : 503).json({ error: out.reason === 'missing' ? 'That share has already ended.' : 'Sharing is not available yet.' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'apply') {
      const token = String(req.body?.inviteToken || '');
      const rl = String(req.body?.applicationNumber || '').trim().toUpperCase();
      if (!/^[a-f0-9]{20}$/.test(token) || !isApplicationNumber(rl)) return res.status(400).json({ error: 'That application could not be found.' });
      if (await rateLimited('share', p.id, 20, 3600) || await rateLimited('share:ip', clientIp(req), 60, 3600)) return res.status(429).json({ error: 'Too many requests. Try again in an hour.' });
      // The realtor and the listing come from the invite, never from the request.
      const invite = await kvGet(`linvite:${token}`);
      if (!invite || !invite.profileId || !invite.listingId) return res.status(200).json({ ok: true, shared: false });
      const { data: listing } = await admin.from('listings').select('id, profile_id').eq('id', invite.listingId).maybeSingle();
      if (!listing || String(listing.profile_id) !== String(invite.profileId)) return res.status(200).json({ ok: true, shared: false });
      // The application is this tenant's (its email is the profile's) and it is on that listing.
      const { data: app } = await admin.from('applications').select('id, email').eq('application_number', rl).maybeSingle();
      if (!app || normalizeEmail(app.email) !== normalizeEmail(p.email)) return res.status(403).json({ error: 'That application is not yours.' });
      const { data: links } = await admin.from('listing_applicants').select('id').eq('application_id', app.id).eq('listing_id', listing.id);
      if (!(links || []).length) return res.status(403).json({ error: 'That application is not on this listing.' });
      const out = await approveApplicationShare(admin, { tenantProfileId: p.id, recipientProfileId: listing.profile_id, listingId: listing.id });
      return res.status(200).json({ ok: true, shared: !!out.ok });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/shares]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
