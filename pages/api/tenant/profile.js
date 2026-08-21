// /api/tenant/profile — session-cookie authenticated (the magic link set it).
//
//   GET                      → the profile: durable facts + applications (with listing/realtor
//                              and a tenant-safe status, when Supabase has them) + pending email.
//   POST { action }
//     update-facts {form}    → edit the DURABLE facts. Applies to FUTURE applications only —
//                              never rewrites a submitted snapshot.
//     link-application       → manually attach an application ({applicationNumber, ownerToken}).
//     request-email-change   → email a confirmation to the NEW address (old keeps access until
//                              confirmed). Rate-limited.
//     sign-out               → destroy the session + clear the cookie.
import { Resend } from 'resend';
import { timingSafeEqual } from 'crypto';
import { kvGet } from '../../../lib/kv';
import {
  sessionProfile, saveProfile, cleanFacts, attachApplication, clientProfile, isEmail, normalizeEmail,
  createEmailChange, rateLimited, clientIp, destroySession, readCookie, setSessionCookie,
} from '../../../lib/tenantProfileStore';
import { emailChangeEmail } from '../../../lib/tenantEmails';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { logServerError } from '../../../lib/serverLog';

function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); }

// Tenant-safe status wording. Realtor decisions are shown softly and never with reasons.
const STATUS = {
  none: { key: 'submitted', label: 'Submitted' },
  ranked: { key: 'review', label: 'Under review' },
  set_aside: { key: 'not_selected', label: 'Not selected for this unit' },
  withdrawn: { key: 'withdrawn', label: 'Withdrawn' },
};

// Enrich the profile's application refs with listing name / realtor / status from Supabase.
// Graceful: without Supabase (or before mirroring) each app simply reads "Submitted".
async function enrich(apps) {
  const out = apps.map((a) => ({ ...a, listingName: a.listingAddress || null, realtorName: null, status: STATUS.none, revoked: false }));
  // Revoked flag + current snapshot facts from KV (cheap, and KV is canonical for the tenant path).
  await Promise.all(out.map(async (a) => {
    const app = await kvGet(`app:${a.applicationNumber}`);
    if (app) {
      a.revoked = !!app.revoked; a.updatedAt = app.updatedAt || null; a.profileRevision = app.profileRevision || 0;
      if (!a.listingName) a.listingName = app.apartment?.address || null;
      if (app.referral) { a.referral = { fromName: app.referral.fromName, toName: app.referral.toName, approvedAt: app.referral.approvedAt, assignedListing: app.referral.assignedListing || null }; if (!a.listingName) a.listingName = `Referred to ${app.referral.toName || 'another realtor'}`; a.realtorName = a.realtorName || app.referral.toName || null; }
    }
    else a.missing = true; // expired from KV (1-year TTL)
  }));
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY || !out.length) return out;
  try {
    const admin = getSupabaseAdminClient();
    const { data: rows } = await admin.from('applications').select('id, application_number').in('application_number', out.map((a) => a.applicationNumber));
    const byId = new Map((rows || []).map((r) => [r.id, r.application_number]));
    if (!byId.size) return out;
    const { data: links } = await admin.from('listing_applicants')
      .select('application_id, decision_status, decision_changed_at, created_at, listing:listings(name, address, profile_id)')
      .in('application_id', [...byId.keys()]).order('created_at', { ascending: true });
    const realtorIds = [...new Set((links || []).map((l) => l.listing?.profile_id).filter(Boolean))];
    let realtors = new Map();
    if (realtorIds.length) {
      const { data: profs } = await admin.from('profiles').select('id, full_name, brokerage').in('id', realtorIds);
      realtors = new Map((profs || []).map((p) => [p.id, p]));
    }
    for (const l of links || []) {
      const rl = byId.get(l.application_id);
      const a = out.find((x) => x.applicationNumber === rl);
      if (!a) continue;
      a.listingName = l.listing?.name || l.listing?.address || a.listingName;
      const r = realtors.get(l.listing?.profile_id);
      a.realtorName = r?.full_name || null; a.realtorBrokerage = r?.brokerage || null;
      a.status = STATUS[l.decision_status] || STATUS.none;
      a.statusChangedAt = l.decision_changed_at || null;
    }
  } catch (e) { /* columns/tables may not exist yet — statuses stay "Submitted" */ }
  return out;
}

export default async function handler(req, res) {
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.', code: 'no_session' });

  if (req.method === 'GET') {
    const view = clientProfile(p);
    view.applications = await enrich(view.applications);
    return res.status(200).json(view);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body || {};

  try {
    if (action === 'update-facts') {
      const form = req.body?.form;
      if (!form || typeof form !== 'object') return res.status(400).json({ error: 'Nothing to update.' });
      const facts = cleanFacts(form);
      if (!String(facts.fullName).trim()) return res.status(400).json({ error: 'Your name is required.', code: 'invalid' });
      facts.email = p.email; // the profile email is the contact email; change it via the email flow
      p.facts = facts; p.factsUpdatedAt = new Date().toISOString(); p.factsSource = 'profile-edit';
      p.profileRevision = (p.profileRevision || 0) + 1;
      await saveProfile(p);
      return res.status(200).json({ ok: true, facts: p.facts, factsUpdatedAt: p.factsUpdatedAt, profileRevision: p.profileRevision });
    }

    if (action === 'link-application') {
      const appNum = String(req.body?.applicationNumber || '').trim().toUpperCase();
      if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(appNum)) return res.status(400).json({ error: 'That doesn’t look like an application number.' });
      const app = await kvGet(`app:${appNum}`);
      if (!app || !safeEqual(app.ownerToken, String(req.body?.ownerToken || '').trim())) return res.status(401).json({ error: 'Application number and owner key don’t match.' });
      if (normalizeEmail(app.email) !== p.email) return res.status(403).json({ error: `That application was submitted under a different email (${String(app.email || '').replace(/^(.).+(@.+)$/, '$1…$2')}). Sign in with that email to see it.` });
      await attachApplication(app, { refreshFacts: !p.facts });
      return res.status(200).json({ ok: true });
    }

    if (action === 'request-email-change') {
      const newEmail = normalizeEmail(req.body?.newEmail);
      if (!isEmail(newEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (newEmail === p.email) return res.status(400).json({ error: 'That’s already your email.' });
      if (await rateLimited('emailchange', p.id, 3, 3600) || await rateLimited('emailchange:ip', clientIp(req), 10, 3600)) {
        return res.status(429).json({ error: 'Too many attempts. Try again in an hour.' });
      }
      // Don't reveal whether the new address already has a profile; the confirm step says so
      // to the person who controls that inbox.
      const token = await createEmailChange(p.id, newEmail);
      p.pendingEmail = newEmail; await saveProfile(p);
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca';
      const url = `${site}/api/tenant/verify-email-change?t=${encodeURIComponent(token)}`;
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from: 'Rentletter <hello@rentletter.ca>', to: newEmail, subject: 'Confirm your new Rentletter email', html: emailChangeEmail(url, p.email) });
      } else if (process.env.NODE_ENV !== 'production') console.warn('[tenant/profile] RESEND_API_KEY not set — dev-only link:', url);
      return res.status(200).json({ ok: true, pendingEmail: newEmail });
    }

    if (action === 'cancel-email-change') {
      p.pendingEmail = null; await saveProfile(p);
      return res.status(200).json({ ok: true });
    }

    if (action === 'sign-out') {
      await destroySession(readCookie(req));
      setSessionCookie(res, '', { clear: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/profile]', e, { action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
