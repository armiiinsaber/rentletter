// /api/pass/create  POST
// GONE. The 30 day pass only served the paid cover letter, which Rentletter no longer makes
// (pages/api/generate.js answers 410 for mode letter). No Stripe session is read or created,
// no pass is minted, no email is sent. Kept as a route so an old redirect gets a clear answer.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(410).json({ error: 'Rentletter no longer sells letters.' });
}
