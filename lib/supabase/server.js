// lib/supabase/server.js
// Cookie-aware server Supabase client (publishable/anon key) for the Pages
// Router. Works in BOTH getServerSideProps (ctx.req/ctx.res) and API routes
// (req/res) — both expose `req.cookies` and `res.setHeader`. Reads the signed-in
// realtor's session from cookies and refreshes it via Set-Cookie. RLS applies.
import { createServerClient, serializeCookieHeader } from '@supabase/ssr';

// True only when both public Supabase env vars are present. Callers (gated
// getServerSideProps, auth callback) check this first and redirect to /signin
// instead of letting createServerClient throw a 500 on a missing/blank URL.
export function isSupabaseConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseServerClient(req, res) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies || {}).map(([name, value]) => ({
            name,
            value: value || '',
          }));
        },
        setAll(cookiesToSet) {
          res.setHeader(
            'Set-Cookie',
            cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options)
            )
          );
        },
      },
    }
  );
}
