// pages/profile.js
// The realtor's profile: identity, logo, brand colours and fonts, and Sign out. Gated behind a
// Supabase session (RLS); the page itself is components/dashboard/ProfileView.js, which the
// sandbox mounts too. Reachable from the header's identity circle.
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import ProfileView from '../components/dashboard/ProfileView';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/profile', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { props: { initialProfile: profile || { id: user.id, email: user.email } } };
}

export default function ProfilePage(props) { return <ProfileView {...props} />; }
