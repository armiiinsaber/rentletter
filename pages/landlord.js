// pages/landlord.js
// Realtor dashboard — LISTINGS INDEX. Supabase-backed (RLS), gated behind a
// Supabase session. Lists the realtor's listings; "New listing" opens the
// Listing Setup modal and inserts a row; edit/delete via Supabase. Tapping a
// listing opens its detail view (/landlord/[id]). Stage 1: no KV workspace.
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { normalizeProvince } from '../lib/provinces';
import HomeView from '../components/dashboard/HomeView';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { redirect: { destination: '/signin?next=/landlord', permanent: false } };
  }
  let [{ data: profile }, { data: listings }] = await Promise.all([
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
  return {
    props: {
      userId: user.id,
      userEmail: user.email || '',
      initialProfile: profile || { id: user.id, email: user.email },
      initialListings: listings || [],
    },
  };
}

export default function LandlordPage(props) { return <HomeView {...props} />; }
