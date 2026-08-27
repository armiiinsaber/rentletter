// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { normalizeProvince } from '../lib/provinces';
import HomeView from '../components/dashboard/HomeView';
import { getEntitlement } from '../lib/entitlements';
import { readPromoCookie, redeemPromoFromCookie } from '../lib/promoCookie';
import { needsOnboarding } from '../lib/onboarding';
import { getSupabaseAdminClient } from '../lib/supabase/admin';
import { fetchListingApplicants, attachDocVerifications } from '../lib/supabaseBridge';
import { notificationsFor, EMPTY_FEED } from '../lib/notificationsFeed';
import { inboxFor, listFromRealtor, effectiveStatus } from '../lib/referrals';

// Everything the first screen needs, loaded on the server WITH the listings so the dashboard
// commits in one paint: the assistant block ("Rentletter noticed") reads the applicants per
// listing, the notification feed and the referrals. Each part is best effort on its own; if the
// whole thing fails the page falls back to the client fetch and holds its skeleton until then.
async function loadSignals({ supabase, user, listings }) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = getSupabaseAdminClient();
  const safe = (p, fallback) => p.catch((e) => { console.warn('[dashboard] signal skipped:', e?.message || e); return fallback; });
  const ls = (listings || []).slice(0, 12);
  const [notif, inbox, sent, ...apps] = await Promise.all([
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
  // getServerSideProps needs plain JSON (no undefined).
  return JSON.parse(JSON.stringify({ applicantsByListing, notifications: notif?.items || [], referralsInbox: inbox || [], referralsSent: Object.values(byLink), loaded: true }));
}

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { redirect: { destination: '/signin?next=/landlord', permanent: false } };
  }
  let [{ data: profile }, { data: listings, error: listingsError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }),
  ]);
  // Founder admin suspension (db/admin-suspend.sql): blocks the dashboard immediately; the
  // auth-layer ban the admin action also applies stops new sign-ins. Nothing is deleted.
  if (profile?.suspended_at) {
    await supabase.auth.signOut();
    return { redirect: { destination: '/signin?error=This%20account%20is%20suspended.%20Contact%20info%40rentletter.ca.', permanent: false } };
  }
  // Backfill province once: new signups carry it in user metadata; existing accounts with no
  // province default to Ontario. Only writes when profiles.province is unset, so a realtor's
  // later manual change in settings is never overwritten. Gracefully no-ops if the column
  // isn't migrated yet.
  if (profile && (profile.province === null || profile.province === undefined)) {
    const chosen = normalizeProvince(user.user_metadata?.province);
    const { data: updated } = await supabase
      .from('profiles').update({ province: chosen }).eq('id', user.id).select().single();
    if (updated) profile = updated;
    else profile = { ...profile, province: chosen };
  }
  // A pending invitation (rl_promo) that didn't get redeemed in the auth callback — e.g. the
  // realtor signed in with a password instead of the email link — is redeemed here, once.
  if (profile && readPromoCookie(ctx.req) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const r = await redeemPromoFromCookie(ctx.req, ctx.res, user.id);
    if (r?.ok) { const { data: fresh } = await supabase.from('profiles').select('*').eq('id', user.id).single(); if (fresh) profile = fresh; }
  }
  const finalProfile = profile || { id: user.id, email: user.email };
  // First run: identity and province are required before the dashboard means anything. Skipped
  // branding or a skipped first listing never redirect (lib/onboarding.js).
  if (needsOnboarding(finalProfile)) return { redirect: { destination: '/onboarding', permanent: false } };
  let initialSignals = null;
  if (!listingsError) {
    try { initialSignals = await loadSignals({ supabase, user, listings: listings || [] }); }
    catch (e) { console.warn('[dashboard] signals fell back to the client:', e?.message || e); initialSignals = null; }
  }
  return {
    props: {
      userId: user.id,
      userEmail: user.email || '',
      initialProfile: finalProfile,
      // null = the query FAILED (the client retries and shows a skeleton, never the empty state);
      // [] = the query succeeded with zero rows (the only case that may show "add your first listing").
      initialListings: listingsError ? null : (listings || []),
      listingsError: listingsError ? String(listingsError.message || 'Could not load your listings.') : null,
      entitlement: getEntitlement(finalProfile),
      // The assistant block's inputs, loaded with the page (see loadSignals). null = fall back to
      // the client fetch, during which the page holds its skeleton.
      initialSignals,
    },
  };
}

export default function LandlordPage(props) { return <HomeView {...props} />; }
