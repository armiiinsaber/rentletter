// /api/landlord/get-share-activity
// Realtor checks what their landlord client did with a share link.

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
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = req.headers['x-rl-session'];
  const session = await getSession(sessionToken);
  if (!session?.email) return res.status(401).json({ error: 'Not signed in.' });

  const { token } = req.query;
  if (!token || !/^[a-f0-9]{40}$/.test(String(token))) {
    return res.status(400).json({ error: 'Invalid token.' });
  }

  const base = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');

  try {
    const tokenRes = await fetch(`${base}/get/lshare:${token}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData?.result) {
      return res.status(404).json({ error: 'Share not found or expired.' });
    }
    const share = typeof tokenData.result === 'string' ? JSON.parse(tokenData.result) : tokenData.result;

    // Verify the requesting realtor owns this share
    if (share.realtorEmail !== session.email) {
      return res.status(403).json({ error: 'Not your share link.' });
    }

    return res.status(200).json({
      landlordEmail: share.landlordEmail,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
      applicationNumbers: share.applicationNumbers,
      landlordRemovedApps: share.landlordRemovedApps || [],
      landlordNotes: share.landlordNotes || {},
      landlordActivity: share.landlordActivity || [],
    });
  } catch (e) {
    console.error('[get-share-activity] error:', e);
    return res.status(500).json({ error: 'Could not load share activity.' });
  }
}
