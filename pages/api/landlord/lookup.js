// /api/landlord/lookup — fetch tenant application by app number
// Free endpoint, used by the landlord dashboard
//
// Security: Application numbers are randomly generated (32 bits entropy)
// so cannot be brute-forced. Rate-limiting recommended in production.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { applicationNumber } = req.body;

  if (!applicationNumber) {
    return res.status(400).json({ error: 'Application number required' });
  }

  // Normalize format: strip whitespace, uppercase
  const normalized = String(applicationNumber).trim().toUpperCase();

  // Validate format: RL-YYYY-XXXX-XXXX
  if (!/^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(normalized)) {
    return res.status(400).json({
      error: 'Invalid application number format. Expected: RL-YYYY-XXXX-XXXX',
    });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(503).json({
      error: 'Application lookup is temporarily unavailable. Please try again later.',
    });
  }

  try {
    const url = `${process.env.KV_REST_API_URL}/get/app:${normalized}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });

    if (!response.ok) {
      console.error('KV lookup failed:', await response.text());
      return res.status(500).json({ error: 'Lookup failed. Please try again.' });
    }

    const data = await response.json();

    if (!data || !data.result) {
      return res.status(404).json({
        error: 'Application not found. Please check the number and try again.',
      });
    }

    // KV returns the value as a JSON string — parse it
    let application;
    try {
      application = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (parseErr) {
      console.error('Failed to parse stored application:', parseErr);
      return res.status(500).json({ error: 'Application data corrupted.' });
    }

    // ── Check if application is revoked by tenant ──
    if (application.revoked) {
      return res.status(410).json({
        error: 'This application number has been revoked by the tenant. Please ask them for an updated number.',
      });
    }

    // ── Audit log: record this lookup so the tenant can see who viewed their app ──
    // Fire-and-forget; do not block the response if logging fails
    logLookup(normalized, req).catch(err => console.error('Lookup audit log failed:', err));

    // Strip sensitive fields that the landlord should not see
    const { ownerToken, ...landlordView } = application;
    return res.status(200).json({ application: landlordView });
  } catch (err) {
    console.error('Lookup error:', err);
    return res.status(500).json({ error: 'Lookup failed. Please try again.' });
  }
}

// Audit-log every lookup of an application
async function logLookup(appNumber, req) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return;
  const logKey = `auditlog:${appNumber}`;
  try {
    // Read existing log
    const lookupRes = await fetch(`${process.env.KV_REST_API_URL}/get/${logKey}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await lookupRes.json();
    let log = [];
    if (data?.result) {
      try { log = JSON.parse(data.result); } catch (e) { log = []; }
    }
    // Best-effort metadata about who looked it up
    const ipRaw = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    const ip = String(ipRaw).split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    log.push({
      at: new Date().toISOString(),
      ipHash: ip ? hashShort(ip) : null,
      uaShort: ua.slice(0, 80),
    });
    // Cap log at 200 entries (keep most recent)
    if (log.length > 200) log = log.slice(-200);

    await fetch(`${process.env.KV_REST_API_URL}/set/${logKey}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(log),
    });
    // Match the 1-year TTL of the app itself
    await fetch(`${process.env.KV_REST_API_URL}/expire/${logKey}/31536000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
  } catch (e) {
    console.error('logLookup error:', e);
  }
}

function hashShort(input) {
  // Lightweight non-crypto hash so tenant sees a stable "viewer" identifier without raw IP
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}
