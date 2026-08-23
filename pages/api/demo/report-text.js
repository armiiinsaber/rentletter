// /api/demo/report-text?listing=demo-…&decisions={…}  — DEMO ONLY, deterministic (no AI).
import { demoReportContext, demoReportText } from '../../../lib/demoReport';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = demoReportContext(req.query.listing, req.query.decisions);
  if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
  if (ctx.active.length + ctx.setAside.length === 0) return res.status(400).json({ error: 'No applicants to present yet.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ text: demoReportText(ctx) });
}
