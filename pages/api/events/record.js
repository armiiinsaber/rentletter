// /api/events/record  POST { type, listingId?, linkId?, payload? }
// The bridge for realtor actions that write to Supabase directly from the browser (set aside,
// restore, withdrew, finalist, create or edit listing, branding). The browser reports the
// action; this route proves the realtor owns what it names (their own session, RLS), stamps
// profile_id from the session (never from the body), and records through the service role.
// Only CLIENT_EVENT_TYPES are accepted here. Nothing a client sends can insert an event by
// itself, and there is no route to update or delete one.
import { requireRealtor } from '../../../lib/realtorAuth';
import { invalidateSignals } from '../../../lib/signalsCache';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { CLIENT_EVENT_TYPES } from '../../../lib/eventTypes';
import { recordEvent } from '../../../lib/events';

const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = await requireRealtor(req, res); if (!ctx) return;
  const { type, listingId, linkId } = req.body || {};
  const body = (req.body && req.body.payload) || {};
  if (!CLIENT_EVENT_TYPES.includes(type)) return res.status(400).json({ error: 'Not a reportable event.' });
  try {
    const admin = getSupabaseAdminClient();
    const ev = { profileId: ctx.user.id, type, listingId: null, applicationId: null, payload: { reason: str(body.reason), removed: body.removed === true } };
    if (linkId) {
      const { data: link } = await admin.from('listing_applicants').select('id, listing_id, application_id').eq('id', String(linkId)).maybeSingle();
      if (!link) return res.status(404).json({ error: 'Applicant not found.' });
      const { data: owned } = await ctx.supabase.from('listings').select('id, name, address').eq('id', link.listing_id).maybeSingle(); // RLS: own listings only
      if (!owned) return res.status(403).json({ error: 'Not your listing.' });
      const { data: app } = await admin.from('applications').select('full_name').eq('id', link.application_id).maybeSingle();
      ev.listingId = owned.id; ev.applicationId = link.application_id;
      ev.payload.listingName = owned.name || owned.address || null; ev.payload.applicantName = app?.full_name || null; ev.payload.linkId = link.id;
    } else if (listingId) {
      const { data: owned } = await ctx.supabase.from('listings').select('id, name, address').eq('id', String(listingId)).maybeSingle();
      if (!owned) return res.status(403).json({ error: 'Not your listing.' });
      ev.listingId = owned.id; ev.payload.listingName = owned.name || owned.address || null;
    } else if (type !== 'branding_updated') {
      return res.status(400).json({ error: 'Missing reference.' });
    }
    const ok = await recordEvent(admin, ev);
    invalidateSignals(ctx.user.id); return res.status(200).json({ ok });
  } catch (e) {
    console.warn('[events/record] failed:', e?.message || e);
    return res.status(200).json({ ok: false });
  }
}
