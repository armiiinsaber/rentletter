// lib/dashboardSignals.js  SERVER ONLY.
// Everything the assistant needs, in one load: the realtor's listings, the applicants per
// listing, the derived notification feed, and both referral lists. Shared by the dashboard's
// server load (pages/landlord.js, so the first paint has it) and GET /api/assistant/signals
// (the bell on every other page). Each part is best effort on its own.
import { getSupabaseAdminClient } from './supabase/admin';
import { fetchListingApplicants, attachDocVerifications } from './supabaseBridge';
import { notificationsFor, EMPTY_FEED } from './notificationsFeed';
import { inboxFor, listFromRealtor, effectiveStatus } from './referrals';

export async function loadSignals({ supabase, user, listings = null }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = getSupabaseAdminClient();
  const safe = (p, fallback) => p.catch((e) => { console.warn('[dashboard] signal skipped:', e?.message || e); return fallback; });
  let all = listings;
  if (!Array.isArray(all)) {
    const { data } = await supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false });
    all = data || [];
  }
  const ls = all.slice(0, 12);
  const [latestEvent, notif, inbox, sent, ...apps] = await Promise.all([
    safe(admin.from('events').select('created_at').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then((r) => (r.error ? null : r.data?.created_at || null)), null),
    safe(notificationsFor({ supabase, admin, userId: user.id }), { ...EMPTY_FEED }),
    safe(inboxFor(user), []),
    safe(listFromRealtor(user.id), []),
    ...ls.map((l) => safe(fetchListingApplicants(admin, l.id).then((a) => attachDocVerifications(admin, l.id, a, 'dashboard')), [])),
  ]);
  const applicantsByListing = {};
  ls.forEach((l, i) => { applicantsByListing[l.id] = apps[i] || []; });
  // Same shape as /api/referrals/list: one entry per linkId, newest first.
  const byLink = {};
  for (const r of sent || []) {
    if (!r?.from?.linkId || byLink[r.from.linkId]) continue;
    byLink[r.from.linkId] = { id: r.id, status: effectiveStatus(r), to: { name: r.to?.name, email: r.to?.email, hasAccount: !!r.to?.profileId }, createdAt: r.createdAt, decidedAt: r.decidedAt, assigned: !!r.assignedListingId, from: r.from, applicantName: r.applicantName };
  }
  // Plain JSON (no undefined): getServerSideProps and res.json both need it.
  return JSON.parse(JSON.stringify({
    listings: all.map((l) => ({ id: l.id, name: l.name, address: l.address, monthly_rent: l.monthly_rent, landlord_email: l.landlord_email, landlord_name: l.landlord_name })),
    applicantsByListing, notifications: notif?.items || [], referralsInbox: inbox || [], referralsSent: Object.values(byLink), latestEventAt: latestEvent || null, loaded: true,
  }));
}
