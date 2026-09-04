// lib/dashboardSignals.js  SERVER ONLY.
// Everything the assistant needs, in one load: the realtor's listings, the applicants per
// listing, the derived notification feed, and both referral lists. Shared by the dashboard's
// server load (pages/landlord.js, so the first paint has it) and GET /api/assistant/signals
// (the bell on every other page). Each part is best effort on its own.
import { getSupabaseAdminClient } from './supabase/admin';
import { fetchApplicantsForListings } from './supabaseBridge';
import { notificationsFor, EMPTY_FEED } from './notificationsFeed';
import { inboxFor, listFromRealtor, effectiveStatus } from './referrals';
import { traceEnabled, startTrace, endTrace, tracedClient } from './queryTrace.js';

// admin: injectable (tests hand in a fake); production takes the service role client. With
// RL_QUERY_TRACE set, every query and KV call is counted and one line is logged at the end.
export async function loadSignals({ supabase: supabaseIn, user, listings = null, admin: adminIn = null }) {
  if (!adminIn && !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const tracing = traceEnabled();
  if (tracing) startTrace(`loadSignals profile=${user?.id}`);
  const admin = tracedClient(adminIn || getSupabaseAdminClient(), 'admin');
  const supabase = tracedClient(supabaseIn, 'rls');
  try { return await loadSignalsInner({ supabase, admin, user, listings }); } finally { if (tracing) endTrace(); }
}

async function loadSignalsInner({ supabase, admin, user, listings }) {
  const safe = (p, fallback) => p.catch((e) => { console.warn('[dashboard] signal skipped:', e?.message || e); return fallback; });
  let all = listings;
  if (!Array.isArray(all)) {
    const { data } = await supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false });
    all = data || [];
  }
  const ls = all.slice(0, 12);
  // Four independent reads side by side: the latest event, the feed (given the listings, so it
  // selects none), both referral lists, and ONE junction select for every listing's applicants.
  const [latestEvent, notif, inbox, sent, byListing] = await Promise.all([
    safe(admin.from('events').select('created_at').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle().then((r) => (r.error ? null : r.data?.created_at || null)), null),
    safe(notificationsFor({ supabase, admin, userId: user.id, listings: all }), { ...EMPTY_FEED }),
    safe(inboxFor(user), []),
    safe(listFromRealtor(user.id), []),
    safe(fetchApplicantsForListings(admin, ls), {}),
  ]);
  const applicantsByListing = {};
  ls.forEach((l) => { applicantsByListing[l.id] = byListing[l.id] || []; });
  // Same shape as /api/referrals/list: one entry per linkId, newest first.
  const byLink = {};
  for (const r of sent || []) {
    if (!r?.from?.linkId || byLink[r.from.linkId]) continue;
    byLink[r.from.linkId] = { id: r.id, status: effectiveStatus(r), to: { name: r.to?.name, email: r.to?.email, hasAccount: !!r.to?.profileId }, createdAt: r.createdAt, decidedAt: r.decidedAt, assigned: !!r.assignedListingId, from: r.from, applicantName: r.applicantName };
  }
  // Plain JSON (no undefined): getServerSideProps and res.json both need it.
  return JSON.parse(JSON.stringify({
    listings: all.map((l) => ({ id: l.id, name: l.name, address: l.address, monthly_rent: l.monthly_rent, landlord_email: l.landlord_email, landlord_name: l.landlord_name, status: l.status || 'active', closed_at: l.closed_at || null, rented_link_id: l.rented_link_id || null })),
    applicantsByListing, notifications: notif?.items || [], referralsInbox: inbox || [], referralsSent: Object.values(byLink), latestEventAt: latestEvent || null, loaded: true,
  }));
}
