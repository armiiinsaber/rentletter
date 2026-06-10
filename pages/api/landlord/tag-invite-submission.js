// /api/landlord/tag-invite-submission
// PUBLIC endpoint called by the tenant client after a successful submission
// via /apply/[token]. Records that this application was submitted through
// this invite, so when the realtor reloads their dashboard, the application
// appears in the right listing automatically.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, applicationNumber } = req.body || {};

  if (!token || !/^[a-f0-9]{20}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid invite token.' });
  }
  if (!applicationNumber || !/^RL-[A-Z0-9-]+$/i.test(String(applicationNumber))) {
    return res.status(400).json({ error: 'Invalid application number.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  try {
    // 1. Fetch the invite to confirm it's valid and learn whose listing this is for
    const inviteRes = await fetch(`${base}/get/linvite:${token}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const inviteData = await inviteRes.json();
    if (!inviteData?.result) {
      return res.status(404).json({ error: 'Invite not found.' });
    }
    const invite = typeof inviteData.result === 'string' ? JSON.parse(inviteData.result) : inviteData.result;

    // 2. Push the new application number into a per-invite submission list
    // and increment the count
    await fetch(`${base}/lpush/invite_submissions:${token}/${encodeURIComponent(applicationNumber)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    // Trim to last 200 to bound storage
    await fetch(`${base}/ltrim/invite_submissions:${token}/0/199`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Update invite with new submission count
    invite.submissionCount = (invite.submissionCount || 0) + 1;
    invite.lastSubmissionAt = new Date().toISOString();
    await fetch(`${base}/set/linvite:${token}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invite),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[tag-invite-submission] error:', e);
    return res.status(500).json({ error: 'Could not tag submission.' });
  }
}
