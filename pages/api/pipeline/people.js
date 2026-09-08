// /api/pipeline/people  GET. The realtor's People list (lib/pipeline.js listPeople), for the
// dashboard's client retry when the page did not bring the signals. Session and plan through
// requireRealtor; the list reads only consent rows with this profile_id, through the service role.
import { requireRealtor as realRequireRealtor } from '../../../lib/realtorAuth';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { listPeople } from '../../../lib/pipeline';
import { logServerError } from '../../../lib/serverLog';

export function createHandler({ requireRealtor = realRequireRealtor, admin = getSupabaseAdminClient } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const ctx = await requireRealtor(req, res); if (!ctx) return;
    try {
      const { data: listings } = await ctx.supabase.from('listings').select('*').eq('profile_id', ctx.user.id);
      const people = await listPeople({ profileId: ctx.user.id, listings: listings || [], admin: admin() });
      return res.status(200).json({ people });
    } catch (e) {
      logServerError('[pipeline/people]', e, { userId: ctx.user.id });
      return res.status(500).json({ error: 'Could not load people.' });
    }
  };
}

export default createHandler();
