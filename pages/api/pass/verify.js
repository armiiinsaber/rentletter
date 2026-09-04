// /api/pass/verify  POST
// GONE. Passes only unlocked the paid cover letter, which Rentletter no longer makes. Nothing is
// looked up; every token answers 410 so a saved pass link stops at a clear line.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(410).json({ error: 'Rentletter no longer sells letters.', valid: false });
}
