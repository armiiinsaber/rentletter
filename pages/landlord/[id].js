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
  const [{ data: profile }, { data: listing }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('listings').select('*').eq('id', id).single(), // RLS: only owner sees it
  ]);
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
  } catch (e) {
    console.error('[listing gSSP] applicants read failed:', e?.message || e);
  }
  return { props: { initialProfile: profile || { id: user.id, email: user.email }, initialListing: listing, initialApplicants } };
}

export default function ListingPage(props) { return <ListingView {...props} />; }
