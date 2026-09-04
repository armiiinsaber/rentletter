// pages/landlord/[id].js
// Listing DETAIL — Supabase-backed (RLS), gated. Listing info + landlord
// preferences, edit/delete, the tenant invite link (KV via /api/listings/invite),
// and the listing's APPLICANTS (Supabase: listing_applicants ⨝ applications).
// Decisions (active / set aside with a reason / withdrawn_at) persist to listing_applicants
// under realtor RLS, so they survive sign-out/sign-in.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../lib/supabase/admin';
import { fetchListingApplicants, attachDocVerifications } from '../../lib/supabaseBridge';
import ListingView from '../../components/dashboard/ListingView';
import { logServerError } from '../../lib/serverLog';
import { latestSnapshots } from '../../lib/reportSnapshotStore';

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
  const id = ctx.params.id;
  const [profileRead, { data: listing }] = await Promise.all([
    readProfile(supabase, user, '[listing] profile read'),
    supabase.from('listings').select('*').eq('id', id).single(), // RLS: only owner sees it
  ]);
  if (profileRead.failed) return sessionRedirect(`/landlord/${encodeURIComponent(String(id))}`);
  const profile = profileRead.profile; // null only when the read succeeded and found no row
  if (!listing) {
    return { redirect: { destination: '/landlord', permanent: false } };
  }
  // Ownership confirmed by RLS above → read applicant bodies with the service-role
  // client (applications has no realtor RLS). owner_token is stripped in the helper.
  let initialApplicants = [];
  try {
    const admin = getSupabaseAdminClient();
    initialApplicants = await fetchListingApplicants(admin, listing.id);
    // Attach doc_verifications/ai_insight via the shared STRICT two-key helper (same as the
    // applicants-refresh and landlord-report paths), so attribution is identical everywhere.
    await attachDocVerifications(admin, listing.id, initialApplicants, 'dashboard');
    // The latest report snapshot for the Present to landlord line (absent table: no line).
    const latest = (await latestSnapshots(admin, [listing.id])).get(String(listing.id));
    if (latest) listing.snapshot = latest.meta;
  } catch (e) {
    console.error('[listing gSSP] applicants read failed:', e?.message || e);
  }
  return { props: { initialProfile: profile || { id: user.id, email: user.email }, initialListing: JSON.parse(JSON.stringify(listing)), initialApplicants } };
}

export default function ListingPage(props) { return <ListingView {...props} />; }
