// /api/referrals/consent — PUBLIC, token-authenticated (the applicant's single-use link).
//   GET  ?t=   → who/what would be shared (current facts), status
//   POST {t, decision:'approve'|'decline'} → records the decision; on approve mints the
//        derived application and emails Realtor 2 (+ Realtor 1 the outcome). Token is consumed.
import { Resend } from 'resend';
import { referralForToken, decideReferral, currentFacts, effectiveStatus, SHARED_FIELDS, kvReady } from '../../../lib/referrals';
import { receivedEmail, inviteEmail, outcomeEmail } from '../../../lib/referralEmails';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { logServerError } from '../../../lib/serverLog';

async function realtorEmail(profileId) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try { const { data } = await getSupabaseAdminClient().auth.admin.getUserById(profileId); return data?.user?.email || null; } catch (e) { return null; }
}
async function send(to, subject, html) {
  if (!to) return;
  if (process.env.RESEND_API_KEY) { const resend = new Resend(process.env.RESEND_API_KEY); await resend.emails.send({ from: 'Rentletter <hello@rentletter.ca>', to, subject, html }); }
  else if (process.env.NODE_ENV !== 'production') console.warn('[referrals/consent] email (dev, not sent):', subject, '→', to);
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });
  const t = String((req.method === 'GET' ? req.query.t : req.body?.t) || '');
  const ref = await referralForToken(t);
  if (!ref) return res.status(404).json({ error: 'This link has expired or was already used.', code: 'expired' });
  const status = effectiveStatus(ref);

  if (req.method === 'GET') {
    const facts = status === 'pending' ? await currentFacts(ref) : null;
    return res.status(200).json({
      status, from: { name: ref.from.name, brokerage: ref.from.brokerage }, to: { name: ref.to.name, brokerage: ref.to.brokerage, email: ref.to.email.replace(/^(.).+(@.+)$/, '$1…$2') },
      note: ref.note, applicantName: ref.applicantName, expiresAt: ref.expiresAt, factsSource: facts?.source || null,
      fields: facts ? SHARED_FIELDS.map(([label, get]) => ({ label, value: get(facts.form) || null })) : [],
      verification: ref.verification ? { analyzedAt: ref.verification.analyzedAt, documentsCount: ref.verification.documentsCount } : null,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const approve = req.body?.decision === 'approve';
  if (!approve && req.body?.decision !== 'decline') return res.status(400).json({ error: 'Choose approve or decline.' });
  try {
    const out = await decideReferral(t, approve);
    if (!out.ok) return res.status(410).json({ error: 'This link has expired or was already used.', code: out.reason });
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca';
    const r = out.ref;
    // Realtor 1 learns the outcome (a decline says only that). Realtor 2 is told only on approval.
    send(await realtorEmail(r.from.profileId), approve ? 'Referral approved' : 'Referral declined', outcomeEmail({ approved: approve, applicantName: r.applicantName, toName: r.to.name, dashboardUrl: `${site}/landlord` })).catch(() => {});
    if (approve) {
      const html = r.to.profileId
        ? receivedEmail({ fromName: r.from.name, fromBrokerage: r.from.brokerage, applicantName: r.applicantName, note: r.note, dashboardUrl: `${site}/landlord#referrals` })
        : inviteEmail({ fromName: r.from.name, fromBrokerage: r.from.brokerage, applicantName: r.applicantName, note: r.note, signupUrl: `${site}/signup?ref=1&from=${encodeURIComponent(r.from.name || '')}&email=${encodeURIComponent(r.to.email)}` });
      send(r.to.email, r.to.profileId ? `${r.from.name || 'A realtor'} referred an applicant to you` : `${r.from.name || 'A realtor'} referred an applicant to you on Rentletter`, html).catch(() => {});
    }
    return res.status(200).json({ ok: true, status: r.status });
  } catch (e) {
    logServerError('[referrals/consent]', e, { referralId: ref.id });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
