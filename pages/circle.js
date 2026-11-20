// pages/circle.js
// The realtor's Circle: the realtors they work with (components/dashboard/CircleView.js). Gated
// behind a Supabase session; everything the screen shows is read through POST /api/circle, which
// checks the session and the entitlement again and answers from the caller's own id. Reached from
// the main navigation, beside Listings.
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getEntitlement } from '../lib/entitlements';
import CircleView from '../components/dashboard/CircleView';
import { registerScreenView } from '../components/nav/routes';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/circle', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const initialProfile = profile || { id: user.id, email: user.email };
  return { props: { initialProfile, entitlement: getEntitlement(initialProfile) } };
}

export default function CirclePage(props) { return <CircleView {...props} />; }

// A return to this screen draws this page at once, in its own place, from what it showed
// (components/nav/routes.js): when the page lands it takes over the same screen.
registerScreenView('circle', CirclePage);
