// /api/application/manage
// Tenant-side endpoint to view audit log + revoke an application.
// Authenticated by the owner token issued at generation time.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { applicationNumber, ownerToken, action } = req.body;

  if (!applicationNumber || !ownerToken) {
    return res.status(400).json({ error: 'Application number and owner token required.' });
  }

  const appNum = String(applicationNumber).trim().toUpperCase();
  if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(appNum)) {
    return res.status(400).json({ error: 'Invalid application number format.' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  try {
    // Load the application
    const appRes = await fetch(`${process.env.KV_REST_API_URL}/get/app:${appNum}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const appData = await appRes.json();
    if (!appData?.result) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    const application = typeof appData.result === 'string' ? JSON.parse(appData.result) : appData.result;

    // Authenticate via owner token
    if (!application.ownerToken || application.ownerToken !== String(ownerToken).trim()) {
      return res.status(401).json({ error: 'Invalid owner token.' });
    }

    // ─── ACTION: VIEW (default) ───
    if (!action || action === 'view') {
      // Load audit log
      const logRes = await fetch(`${process.env.KV_REST_API_URL}/get/auditlog:${appNum}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      const logData = await logRes.json();
      let log = [];
      if (logData?.result) {
        try { log = JSON.parse(logData.result); } catch (e) { log = []; }
      }
      return res.status(200).json({
        applicationNumber: appNum,
        revoked: !!application.revoked,
        createdAt: application.createdAt,
        lookups: log,
        lookupCount: log.length,
      });
    }

    // ─── ACTION: REVOKE ───
    if (action === 'revoke') {
      application.revoked = true;
      application.revokedAt = new Date().toISOString();
      await fetch(`${process.env.KV_REST_API_URL}/set/app:${appNum}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(application),
      });
      return res.status(200).json({ ok: true, revoked: true });
    }

    // ─── ACTION: UN-REVOKE ───
    if (action === 'unrevoke') {
      application.revoked = false;
      delete application.revokedAt;
      await fetch(`${process.env.KV_REST_API_URL}/set/app:${appNum}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(application),
      });
      return res.status(200).json({ ok: true, revoked: false });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error('Manage application error:', e);
    return res.status(500).json({ error: 'Failed to manage application.' });
  }
}
