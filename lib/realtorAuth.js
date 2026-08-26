// lib/realtorAuth.js — SERVER-ONLY helper shared by the referral routes: the signed-in realtor
// (Supabase session) + their profile. Listing ownership is checked through the realtor's own
// client (RLS), never the admin client.
import { getSupabaseServerClient, isSupabaseConfigured } from './supabase/server';

export async function requireRealtor(req, res) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) { res.status(503).json({ error: 'Service temporarily unavailable.' }); return null; }
  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { res.status(401).json({ error: 'Not signed in.' }); return null; }
  const { data: profile } = await supabase.from('profiles').select('id, full_name, brokerage, province, report_signature').eq('id', user.id).maybeSingle();
  return { supabase, user, profile: profile || { id: user.id } };
}
