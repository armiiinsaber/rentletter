// lib/requireEntitlement.js — SERVER-ONLY. The write-path gate for realtor API routes: loads the
// signed-in realtor's own profile row (RLS client), asks lib/entitlements.js, and answers 402
// with a short JSON body when the product isn't unlocked. The decision itself lives ONLY in
// getEntitlement; this just applies it at the server edge. Never used on tenant or landlord
// routes.
//
//   const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;
//   → { profile, entitlement }  or  null (402 already sent)
import { getEntitlement } from './entitlements';

export async function requireEntitlement(req, res, supabase, user) {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const entitlement = getEntitlement(profile || { id: user.id });
  if (!entitlement.canUseProduct) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(402).json({ error: 'Your plan doesn’t cover this right now. Choose a plan to continue.', code: 'payment_required', status: entitlement.status });
    return null;
  }
  return { profile: profile || { id: user.id }, entitlement };
}
