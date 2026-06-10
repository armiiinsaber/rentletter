// /api/landlord/auth-verify
// Click magic link → verify token → create 30-day session token → return session
// Also loads existing landlord workspace (applications + decisions) if any

function generateSessionToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
  let token = '';
  for (let i = 0; i < 40; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { magicToken } = req.body;
  if (!magicToken) return res.status(400).json({ error: 'Magic token required' });

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Authentication temporarily unavailable.' });
  }

  // Look up the magic token
  try {
    const lookupRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/magic:${magicToken}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    const data = await lookupRes.json();
    if (!data?.result) {
      return res.status(404).json({ error: 'Sign-in link is invalid or has expired. Please request a new one.' });
    }

    const magicData = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    const email = magicData.email;

    // Delete the magic token (one-time use)
    await fetch(`${process.env.KV_REST_API_URL}/del/magic:${magicToken}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Create a 30-day session token
    const sessionToken = generateSessionToken();
    const sessionPayload = {
      email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await fetch(`${process.env.KV_REST_API_URL}/set/landlord-session:${sessionToken}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionPayload),
    });
    await fetch(`${process.env.KV_REST_API_URL}/expire/landlord-session:${sessionToken}/2592000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    // Load their existing workspace (if any)
    let workspace = { applications: [], decisions: {} };
    try {
      const workspaceRes = await fetch(
        `${process.env.KV_REST_API_URL}/get/landlord-workspace:${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
      );
      const workspaceData = await workspaceRes.json();
      if (workspaceData?.result) {
        workspace = typeof workspaceData.result === 'string'
          ? JSON.parse(workspaceData.result)
          : workspaceData.result;
      }
    } catch (err) {
      // No existing workspace, that's fine
    }

    return res.status(200).json({
      success: true,
      sessionToken,
      email,
      workspace,
    });
  } catch (err) {
    console.error('Magic verify error:', err);
    return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
}
