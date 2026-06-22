// lib/supabase/admin.js
// Server-ONLY admin client using the secret/service-role key. Bypasses RLS.
// Never import this into client code and never expose the key to the browser.
// Reserved for Stage 2 (tenant-submission / lookup / manage / invite link).
import { createClient } from '@supabase/supabase-js';

let adminClient = null;

export function getSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdminClient must only be used on the server.');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }
  if (adminClient) return adminClient;
  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return adminClient;
}
