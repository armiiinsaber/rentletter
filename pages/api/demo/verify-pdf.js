// /api/demo/verify-pdf?linkId=demo-link-…  — DEMO ONLY. Verification PDF from the fixture.
import { demoVerificationContext } from '../../../lib/demoReport';
import { buildVerificationPdf } from '../../../lib/landlordReportPdf';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = demoVerificationContext(req.query.linkId);
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });
  try {
    const bytes = await buildVerificationPdf({ ...ctx, fonts: null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="demo-verification-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    logServerError('[demo/verify-pdf]', e, { linkId: req.query.linkId });
    return res.status(500).json({ error: 'Could not generate the verification PDF.', code: 'report_failed' });
  }
}
