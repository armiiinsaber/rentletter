// pages/auth/callback.js
// Handles Supabase email link redirects (signup confirmation, and any password recovery link
// still pointing here). Exchanges the PKCE ?code for a cookie session server side, then redirects
// to ?next (the dashboard by default). The PKCE code verifier was stored as a cookie by the
// browser client at signUp. A recovery link goes to /reset-password, which can also read the
// tokens Supabase puts in the fragment: a fragment never reaches this server.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../lib/supabase/server';
import { redeemPromoFromCookie } from '../../lib/promoCookie';

export async function getServerSideProps(ctx) {
  const code = typeof ctx.query.code === 'string' ? ctx.query.code : null;
  const rawNext = typeof ctx.query.next === 'string' ? ctx.query.next : '';
  const type = typeof ctx.query.type === 'string' ? ctx.query.type : '';
  const linkError = typeof ctx.query.error_code === 'string' ? ctx.query.error_code : (typeof ctx.query.error === 'string' ? ctx.query.error : '');
  const recovery = type === 'recovery' || rawNext.startsWith('/reset-password');
  // Only allow internal redirect targets.
  const next = rawNext.startsWith('/') ? rawNext : (recovery ? '/reset-password' : '/dashboard');
  // A dead or spent link says so on the page that can offer another one.
  if (linkError) {
    return { redirect: { destination: recovery ? `/reset-password?error=${encodeURIComponent(linkError)}` : `/signin?error=${encodeURIComponent('Your link is invalid or has expired. Please try again.')}`, permanent: false } };
  }

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
          destination: recovery ? `/reset-password?error=${encodeURIComponent('invalid_link')}` : `/signin?error=${encodeURIComponent('Your link is invalid or has expired. Please try again.')}`,
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
