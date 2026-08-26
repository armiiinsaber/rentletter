// pages/auth/callback.js
// Handles Supabase email-link redirects (signup confirmation + password
// recovery). Exchanges the PKCE ?code for a cookie session server-side, then
// redirects to ?next (defaults to the dashboard). The PKCE code verifier was
// stored as a cookie by the browser client at signUp / resetPasswordForEmail.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { redeemPromoFromCookie } from '../../lib/promoCookie';

export async function getServerSideProps(ctx) {
  const code = typeof ctx.query.code === 'string' ? ctx.query.code : null;
  const rawNext = typeof ctx.query.next === 'string' ? ctx.query.next : '';
  // Only allow internal redirect targets.
  const next = rawNext.startsWith('/') ? rawNext : '/landlord';

  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }

  if (code) {
    const supabase = getSupabaseServerClient(ctx.req, ctx.res);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user?.id) {
      // Personal invitation (/join/<code> set rl_promo): grant it now that the account exists.
      // Best effort — whatever happens, the signup succeeds; a failure leaves plan = 'none'.
      await redeemPromoFromCookie(ctx.req, ctx.res, data.user.id);
    }
    if (error) {
      return {
        redirect: {
          destination: `/signin?error=${encodeURIComponent('Your link is invalid or has expired. Please try again.')}`,
          permanent: false,
        },
      };
    }
  }

  return { redirect: { destination: next, permanent: false } };
}

export default function AuthCallback() {
  return null;
}
