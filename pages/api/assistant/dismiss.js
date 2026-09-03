// /api/assistant/dismiss
// GET  -> { dismissed: { key: signature }, lastOpenedKeys: [key] } for the signed in realtor.
// POST { key, signature } records a dismissal; POST { openedKeys: [key] } records what the panel
// showed when it was opened. Session, entitlement, KV per profile (assistant:{profileId}, 90
// days). Without KV the GET is empty and the POST answers 503, and nothing else is affected.
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { invalidateSignals } from '../../../lib/signalsCache';
import { requireEntitlement } from '../../../lib/requireEntitlement';
import { kvReady, kvGetJson, kvSetJson } from '../../../lib/docRequest';
import { logServerError } from '../../../lib/serverLog';

const TTL = 90 * 24 * 60 * 60;
const keyFor = (profileId) => `assistant:${profileId}`;
const MAX_KEYS = 400;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  // Both directions sit behind the plan gate (lib/entitlements.js), 402 otherwise.
  const gate = await requireEntitlement(req, res, supabase, user); if (!gate) return;

  try {
    const rec = (kvReady() && (await kvGetJson(keyFor(user.id)))) || {};
    const dismissed = rec.dismissed && typeof rec.dismissed === 'object' ? rec.dismissed : {};
    const lastOpenedKeys = Array.isArray(rec.lastOpenedKeys) ? rec.lastOpenedKeys : [];
    if (req.method === 'GET') return res.status(200).json({ dismissed, lastOpenedKeys });
    if (!kvReady()) return res.status(503).json({ error: 'Not available right now.' });
    const { key, signature, openedKeys } = req.body || {};
    let next = { dismissed, lastOpenedKeys };
    if (Array.isArray(openedKeys)) next.lastOpenedKeys = openedKeys.filter((k) => typeof k === 'string').slice(0, MAX_KEYS);
    else if (typeof key === 'string' && key && typeof signature === 'string') {
      const entries = Object.entries(dismissed).slice(-MAX_KEYS);
      next.dismissed = { ...Object.fromEntries(entries), [key.slice(0, 120)]: signature.slice(0, 120) };
    } else return res.status(400).json({ error: 'key and signature, or openedKeys, are required.' });
    const ok = await kvSetJson(keyFor(user.id), next, TTL);
    if (!ok) return res.status(503).json({ error: 'Not available right now.' });
    invalidateSignals(user.id);
    return res.status(200).json({ ok: true, ...next });
  } catch (e) {
    logServerError('[assistant/dismiss]', e, { userId: user.id });
    return res.status(500).json({ error: 'Could not save that.' });
  }
}
