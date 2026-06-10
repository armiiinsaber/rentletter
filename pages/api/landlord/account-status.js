// /api/landlord/account-status
// Returns the current account's trial/founder/subscription status.
// Used by the dashboard to decide whether to show countdown or paywall.

import { getOrCreateAccount, evaluateAccount } from '../../../lib/account';

async function getSession(sessionToken) {
  if (!sessionToken) return null;
  const clean = String(sessionToken).trim();
  if (!/^[a-f0-9]{48}$/.test(clean)) return null;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const r = await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${clean}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await r.json();
    if (!data?.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  // getOrCreateAccount handles the lazy init in case the account was missed at signup
  const record = await getOrCreateAccount(session.email);
  const status = evaluateAccount(record);
  return res.status(200).json(status);
}
