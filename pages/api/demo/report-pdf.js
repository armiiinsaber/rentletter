// /api/demo/report-pdf?listing=demo-…&decisions={…}
// DEMO ONLY. Builds the landlord report PDF from lib/demoFixture.js (fake people). No auth, no
// database, no email. The only inputs are a fixture listing id and fixture decision statuses.
import { demoReportContext } from '../../../lib/demoReport';
import { buildLandlordReportPdf } from '../../../lib/landlordReportPdf';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = demoReportContext(req.query.listing, req.query.decisions);
  if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
  if (ctx.active.length + ctx.setAside.length === 0) return res.status(400).json({ error: 'No applicants to present yet.' });
  try {
    const bytes = await buildLandlordReportPdf({ ...ctx, fonts: null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="demo-shortlist-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    logServerError('[demo/report-pdf]', e, { listing: req.query.listing });
    return res.status(500).json({ error: 'Failed to generate PDF.', code: 'report_failed' });
  }
}
