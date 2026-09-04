// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import HomeView from '../components/dashboard/HomeView';
import { getEntitlement } from '../lib/entitlements';
import { readPromoCookie, redeemPromoFromCookie } from '../lib/promoCookie';
import { needsOnboarding } from '../lib/onboarding';
import { loadSignals } from '../lib/dashboardSignals';
import { logServerError } from '../lib/serverLog';
import { backfillProvince } from '../lib/profileBackfill';

// The profile read, with failure and absence kept apart. A FAILED read (RLS with an access token
// mid refresh is the usual cause) is retried once; if it fails again the request goes back to
// sign in rather than rendering with a substitute profile, which carries no plan and would put
// a paying or founding member behind the paywall. A SUCCESSFUL read with no row is a real new
// account: maybeSingle() returns data null with no error, and that null falls through to the
// existing { id, email } fallback and needsOnboarding exactly as before.
async function readProfile(supabase, user, tag) {
  const read = () => supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const first = await read();
  if (!first.error) return { failed: false, profile: first.data || null };
  const second = await read();
  logServerError(tag, first.error, { userId: user.id, retried: true, retrySucceeded: !second.error, retryMessage: second.error ? String(second.error.message || '').slice(0, 200) : null });
  if (second.error) return { failed: true, profile: null };
  return { failed: false, profile: second.data || null };
}
const sessionRedirect = (next) => ({ redirect: { destination: `/signin?error=${encodeURIComponent('We could not confirm your session. Please sign in again.')}&next=${encodeURIComponent(next)}`, permanent: false } });

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { redirect: { destination: '/signin?next=/landlord', permanent: false } };
  }
  const [profileRead, { data: listings, error: listingsError }] = await Promise.all([
    readProfile(supabase, user, '[landlord] profile read'),
    supabase.from('listings').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }),
  ]);
  if (profileRead.failed) return sessionRedirect('/landlord');
  let profile = profileRead.profile; // null only when the read succeeded and found no row
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
  profile = await backfillProvince(supabase, user, profile);
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
