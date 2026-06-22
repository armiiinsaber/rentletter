// pages/auth/callback.js
// Handles Supabase email-link redirects (signup confirmation + password
// recovery). Exchanges the PKCE ?code for a cookie session server-side, then
// redirects to ?next (defaults to the dashboard). The PKCE code verifier was
// stored as a cookie by the browser client at signUp / resetPasswordForEmail.
import { getSupabaseServerClient } from '../../lib/supabase/server';

export async function getServerSideProps(ctx) {
  const code = typeof ctx.query.code === 'string' ? ctx.query.code : null;
  const rawNext = typeof ctx.query.next === 'string' ? ctx.query.next : '';
  // Only allow internal redirect targets.
  const next = rawNext.startsWith('/') ? rawNext : '/landlord';

  if (code) {
    const supabase = getSupabaseServerClient(ctx.req, ctx.res);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
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
