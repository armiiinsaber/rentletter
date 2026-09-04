// lib/profileBackfill.js  SERVER ONLY (pages/landlord.js getServerSideProps). Backfill province
// once: new signups carry it in user metadata; existing accounts with no province default to
// Ontario. Only writes when profiles.province is unset, so a realtor's later change in settings
// is never overwritten. No-ops when the column is not migrated yet. Runs under the realtor's own
// session on the server, never in the browser.
import { normalizeProvince } from './provinces';

export async function backfillProvince(supabase, user, profile) {
  if (!profile || (profile.province !== null && profile.province !== undefined)) return profile;
  const chosen = normalizeProvince(user?.user_metadata?.province);
  try {
    const { data: updated } = await supabase.from('profiles').update({ province: chosen }).eq('id', user.id).select().single();
    return updated || { ...profile, province: chosen };
  } catch (e) { return { ...profile, province: chosen }; }
}
