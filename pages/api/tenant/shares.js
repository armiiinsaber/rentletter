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
//   Sharing with the listing agent of a unit (db/024-share-roles.sql). Each is the tenant's own
//   act on their own profile; the unit is one of their own open applications, and the realtor
//   they share with is one they chose here:
//     agent-search { applicationNumber, q }    realtors by name or brokerage: a name, a brokerage, initials
//     agent-share { applicationNumber, agentId }   the share, with the realtor the tenant chose, as listing agent
//     agent-invite { applicationNumber, email }   a listing agent with no account: an email with
//                             the invite link of the realtor on that unit. Nothing is shared.
//     agent-invite-cancel { id }               the tenant takes an invite back
//     agent-share-invited { id }               the invited realtor has joined: the tenant shares
import { sessionProfile, rateLimited, clientIp, normalizeEmail } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { kvGet } from '../../../lib/kv';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { logServerError } from '../../../lib/serverLog';
import { sharePayload } from '../../../lib/profileFacts';
import { listVault } from '../../../lib/tenantVault';
import { approveApplicationShare, stopShare, listTenantShares, unitOfApplication, unitOfListing, unitsOfTenant, findListingAgents, approveListingAgentShare, inviteListingAgent, listListingAgentInvites, endListingAgentInvite, listingAgentInvite } from '../../../lib/profileShares';
import { Resend } from 'resend';
import { ensureInviteCode, inviteLink } from '../../../lib/realtorInvite';
import { listingAgentInviteEmail, LISTING_AGENT_FROM } from '../../../lib/listingAgentEmails';

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
      // Sharing with a listing agent: the tenant's open applications as units, and their waiting invites.
      const units = admin && list.available ? await unitsOfTenant(admin, { tenantProfileId: p.id, applicationNumbers: (p.applications || []).map((a) => a && a.applicationNumber).filter(Boolean) }) : [];
      const invited = admin && list.available ? await listListingAgentInvites(admin, p.id) : { available: false, invites: [] };
      return res.status(200).json({ available: list.available, shares, preview: { facts: preview.facts, checks: preview.checks }, documents: (vault.documents || []).map((d) => ({ id: d.id, kind: d.kind })), agents: { available: invited.available, units, invites: invited.invites } });
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
    // ── Sharing with the listing agent ──
    const CLOSED = 'That application is no longer open, so there is nothing to share for it.';
    const NOT_YET = 'Sharing with a listing agent is not available yet.';
    const unitFor = async () => { const rl = String(req.body?.applicationNumber || '').trim().toUpperCase(); return isApplicationNumber(rl) ? unitOfApplication(admin, { tenantProfileId: p.id, applicationNumber: rl }) : { ok: false, reason: 'missing' }; };
    const refuse = (unit) => res.status(unit.reason === 'closed' ? 409 : 404).json({ error: unit.reason === 'closed' ? CLOSED : 'That application could not be found.' });
    const shareWith = async (recipientProfileId, listing) => {
      const out = await approveListingAgentShare(admin, { tenantProfileId: p.id, recipientProfileId, listing });
      if (out.ok) return res.status(200).json({ ok: true, shared: true });
      if (out.reason === 'self') return res.status(400).json({ error: 'That is your realtor for this unit. They already see your profile.' });
      if (out.reason === 'no realtor') return res.status(404).json({ error: 'That realtor could not be found.' });
      return res.status(503).json({ error: out.reason === 'absent' ? NOT_YET : 'Sharing did not go through. Try again.', code: out.reason });
    };

    if (action === 'agent-search') {
      if (await rateLimited('agent-search', p.id, 60, 3600)) return res.status(429).json({ error: 'Too many searches. Try again in an hour.' });
      const unit = await unitFor(); if (!unit.ok) return refuse(unit);
      const found = await findListingAgents(admin, { q: req.body?.q, excludeId: unit.listing.realtorId });
      return res.status(200).json({ ok: true, results: found.results, tooShort: !!found.tooShort });
    }
    if (action === 'agent-share') {
      // The one id a tenant sends: the realtor THEY chose to share with, from the search above.
      // Their own profile is never named in a request: it is the session's.
      const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId : '';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(agentId)) return res.status(400).json({ error: 'Choose a realtor to share with.' });
      if (await rateLimited('agent-share', p.id, 20, 3600)) return res.status(429).json({ error: 'Too many requests. Try again in an hour.' });
      const unit = await unitFor(); if (!unit.ok) return refuse(unit);
      return shareWith(agentId, unit.listing);
    }
    if (action === 'agent-invite') {
      const email = normalizeEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter the listing agent’s email.' });
      if (email === normalizeEmail(p.email)) return res.status(400).json({ error: 'That is your own email.' });
      if (await rateLimited('agent-invite', p.id, 5, 86400) || await rateLimited('agent-invite:ip', clientIp(req), 20, 86400)) return res.status(429).json({ error: 'You have sent several invites today. Try again tomorrow.' });
      const unit = await unitFor(); if (!unit.ok) return refuse(unit);
      const made = await inviteListingAgent(admin, { tenantProfileId: p.id, listingId: unit.listing.id, email });
      if (!made.ok) return res.status(503).json({ error: made.reason === 'absent' ? NOT_YET : 'The invite did not go through. Try again.', code: made.reason });
      // Already a realtor on Rentletter: no mail. The tenant's page offers Share.
      const { data: there } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
      let emailed = false;
      if (!there && made.created && process.env.RESEND_API_KEY) {
        try {
          // The invite link of the realtor on this unit (lib/realtorInvite.js): theirs is the credit.
          const code = await ensureInviteCode(admin, unit.listing.realtorId);
          const joinUrl = code && code.available ? inviteLink(code.code) : `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '')}/signup`;
          const mail = listingAgentInviteEmail({ tenantName: String((p.facts && p.facts.fullName) || '').trim() || null, listingName: unit.listing.label, joinUrl });
          const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: LISTING_AGENT_FROM, to: email, subject: mail.subject, html: mail.html, text: mail.text });
          if (sent && sent.error) throw new Error(sent.error.message || 'send failed');
          emailed = true;
        } catch (e) { logServerError('[tenant/shares] invite email', e, {}); }
      }
      return res.status(200).json({ ok: true, invited: true, emailed, joined: !!there });
    }
    if (action === 'agent-invite-cancel') {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!id) return res.status(400).json({ error: 'Nothing to cancel.' });
      const out = await endListingAgentInvite(admin, { tenantProfileId: p.id, id });
      if (!out.ok) return res.status(out.reason === 'missing' ? 404 : 503).json({ error: out.reason === 'missing' ? 'That invite has already ended.' : NOT_YET });
      return res.status(200).json({ ok: true });
    }
    if (action === 'agent-share-invited') {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const invite = id ? await listingAgentInvite(admin, { tenantProfileId: p.id, id }) : null;
      if (!invite) return res.status(404).json({ error: 'That invite has already ended.' });
      if (await rateLimited('agent-share', p.id, 20, 3600)) return res.status(429).json({ error: 'Too many requests. Try again in an hour.' });
      // Only once that address belongs to a realtor: an invite alone shares nothing.
      const { data: joined } = await admin.from('profiles').select('id').eq('email', invite.email).maybeSingle();
      if (!joined) return res.status(409).json({ error: 'They have not joined Rentletter yet. Nothing is shared.' });
      const unit = await unitOfListing(admin, { tenantProfileId: p.id, listingId: invite.listing_id });
      if (!unit.ok) return refuse(unit);
      const out = await approveListingAgentShare(admin, { tenantProfileId: p.id, recipientProfileId: joined.id, listing: unit.listing });
      if (!out.ok) return shareWith(joined.id, unit.listing);
      await endListingAgentInvite(admin, { tenantProfileId: p.id, id, status: 'shared' });
      return res.status(200).json({ ok: true, shared: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/shares]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
