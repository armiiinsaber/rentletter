// lib/realtorRoute.js  SERVER ONLY. The one gate every realtor write route runs before its
// work: method, configuration, the session (401), the entitlement (402, lib/entitlements.js
// through lib/requireEntitlement.js). Ownership is the route's own explicit check afterwards
// (lib/ownApplicant.js ownedApplicant or lib/listingStatus.js ownedListing), never RLS.
//
//   export default withRealtor(async ({ user, gate, admin, supabase }, req, res) => { ... });
//
// deps can be injected for tests: { configured, server, admin, entitlement }.
import { getSupabaseServerClient, isSupabaseConfigured } from './supabase/server';
import { getSupabaseAdminClient } from './supabase/admin';
import { requireEntitlement } from './requireEntitlement';
import { logServerError } from './serverLog';

export function withRealtor(handler, deps = {}) {
  const configured = deps.configured || (() => isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  const server = deps.server || getSupabaseServerClient;
  const admin = deps.admin || getSupabaseAdminClient;
  const entitlement = deps.entitlement || requireEntitlement;
  const label = deps.label || '[realtor route]';
  return async function realtorRoute(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!configured()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
    const supabase = server(req, res);
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    // Write path: needs an unlocked plan (lib/entitlements.js), 402 otherwise.
    const gate = await entitlement(req, res, supabase, user); if (!gate) return;
    try {
      return await handler({ user, gate, admin: admin(), supabase }, req, res);
    } catch (e) {
      logServerError(label, e, { userId: user.id });
      return res.status(500).json({ error: 'Could not save that. Try again.' });
    }
  };
}
