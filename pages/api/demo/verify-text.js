// /api/demo/verify-text?linkId=demo-link-…  — DEMO ONLY. Deterministic verification text.
import { demoVerificationContext } from '../../../lib/demoReport';
import { verificationConfirmText } from '../../../lib/listingReportData';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const ctx = demoVerificationContext(req.query.linkId);
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ text: verificationConfirmText({ realtorName: ctx.profile.full_name, brokerage: ctx.profile.brokerage, phone: '', unitName: ctx.listing?.name, applicantName: ctx.applicantName, verification: ctx.verification }) });
}
