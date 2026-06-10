// /api/landlord/get-invite-submissions
// Realtor's dashboard calls this to pull all submissions from their invite links.
// Returns: for each invite token the realtor owns, the list of RL numbers.
// Dashboard uses this to auto-populate listings with the right applicants.

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
    const record = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return record;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  const { inviteTokens } = req.body || {};
  if (!Array.isArray(inviteTokens) || inviteTokens.length === 0) {
    return res.status(200).json({ submissions: {} });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const cleanedTokens = inviteTokens
    .map(t => String(t || '').trim())
    .filter(t => /^[a-f0-9]{20}$/.test(t))
    .slice(0, 30);

  const submissions = {}; // { inviteToken: { listingId, applicationNumbers: [] } }

  await Promise.all(cleanedTokens.map(async (token) => {
    try {
      // First verify this invite belongs to the requesting realtor
      const inviteRes = await fetch(`${base}/get/linvite:${token}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const inviteData = await inviteRes.json();
      if (!inviteData?.result) return;
      const invite = typeof inviteData.result === 'string' ? JSON.parse(inviteData.result) : inviteData.result;
      if (invite.realtorEmail !== session.email) return; // not theirs, skip

      // Fetch the list of submissions
      const subRes = await fetch(`${base}/lrange/invite_submissions:${token}/0/-1`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const subData = await subRes.json();
      const appNumbers = Array.isArray(subData?.result) ? subData.result : [];

      submissions[token] = {
        listingId: invite.listingId,
        applicationNumbers: appNumbers,
      };
    } catch (e) {
      // skip this one
    }
  }));

  return res.status(200).json({ submissions });
}
