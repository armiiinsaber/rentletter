// /api/landlord/workspace
// Load/save the signed-in landlord's workspace (applications + decisions).

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
  const sessionToken = req.headers['x-rl-session'] || req.body?.sessionToken;
  const session = await getSession(sessionToken);
  if (!session?.email) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  const wsKey = `lworkspace:${session.email}`;

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${process.env.KV_REST_API_URL}/get/${wsKey}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const data = await r.json();
      if (!data?.result) return res.status(200).json({ applications: [], decisions: {} });
      const ws = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      return res.status(200).json(ws);
    } catch (e) {
      console.error('Workspace load error:', e);
      return res.status(500).json({ error: 'Failed to load workspace.' });
    }
  }

  if (req.method === 'POST') {
    const { applications, decisions } = req.body || {};
    try {
      // Cap workspace size for safety
      const safeApps = Array.isArray(applications) ? applications.slice(0, 200) : [];
      const safeDecisions = decisions && typeof decisions === 'object' ? decisions : {};
      await fetch(`${process.env.KV_REST_API_URL}/set/${wsKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applications: safeApps,
          decisions: safeDecisions,
          updatedAt: new Date().toISOString(),
        }),
      });
      // Refresh TTL to 30 days
      await fetch(`${process.env.KV_REST_API_URL}/expire/${wsKey}/2592000`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('Workspace save error:', e);
      return res.status(500).json({ error: 'Failed to save workspace.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
