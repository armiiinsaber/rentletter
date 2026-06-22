// lib/supabase/client.js
// Browser Supabase client (publishable/anon key). Cookie-based session via
// @supabase/ssr so getServerSideProps + API routes see the same session.
// Singleton — one instance per browser tab.
import { createBrowserClient } from '@supabase/ssr';

let browserClient = null;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return browserClient;
}
