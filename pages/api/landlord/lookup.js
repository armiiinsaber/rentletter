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

    return res.status(200).json({ application });
  } catch (err) {
    console.error('Lookup error:', err);
    return res.status(500).json({ error: 'Lookup failed. Please try again.' });
  }
}
