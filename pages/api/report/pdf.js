// /api/report/pdf?token=…  GET. The landlord's PDF, built from the frozen payload with the page
// token as the credential (the same PDF the email carried). Sandbox tokens build from the fixture.
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { isReportToken } from '../../../lib/applicationIds';
import { snapshotByToken } from '../../../lib/reportSnapshotStore';
import { buildLandlordReportPdf } from '../../../lib/landlordReportPdf';
import { loadPairingFonts } from '../../../lib/pdfFonts';
import { demoSnapshot } from '../../../lib/demoReport';
import { logServerError } from '../../../lib/serverLog';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const t = String(req.query.token || '');
  let payload = null;
  try {
    if (/^DEMO-[a-z0-9-]{1,40}$/.test(t)) payload = demoSnapshot(t.slice(5));
    else if (isReportToken(t)) {
      if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Service unavailable.' });
      const row = await snapshotByToken(getSupabaseAdminClient(), t);
      if (row && !(row.expires_at && new Date(row.expires_at).getTime() < Date.now())) payload = row.payload;
    }
    if (!payload) return res.status(404).json({ error: 'This report is not available.' });
    const bytes = await buildLandlordReportPdf({ payload, fonts: t.startsWith('DEMO-') ? null : loadPairingFonts(payload.realtor?.brandFonts) });
    const slug = String(payload.listing?.address || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="applicants-${slug}.pdf"`);
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    logServerError('[report/pdf]', e, { token: t.slice(0, 6) });
    return res.status(500).json({ error: 'Could not build the PDF.' });
  }
}
