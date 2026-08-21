// /api/tenant/request-link — POST { email }
// Magic-link recovery for the tenant profile. ENUMERATION-RESISTANT: the response is identical
// whether or not we know the email, and the timing is kept similar (we always do the lookup
// work). Rate-limited per email (3 / 15 min) and per IP (10 / 15 min). The token is never
// logged; only its hash is stored (15-min TTL, single-use).
import { Resend } from 'resend';
import { isEmail, normalizeEmail, kvReady, ensureProfileForEmail, createMagicLink, rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { magicLinkEmail } from '../../../lib/tenantEmails';

const GENERIC = { ok: true, message: 'If that email has an application with us, we’ve sent a link. It works once and expires in 15 minutes.' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const email = normalizeEmail(req.body?.email);
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!kvReady()) return res.status(503).json({ error: 'Service temporarily unavailable.' });

  // Rate limits — the generic response is returned even when limited (no signal either way).
  const [byEmail, byIp] = await Promise.all([rateLimited('link:email', email, 3, 900), rateLimited('link:ip', clientIp(req), 10, 900)]);
  if (byEmail || byIp) return res.status(200).json(GENERIC);

  try {
    // Lazy backfill: any application we can find for this email becomes (part of) its profile.
    const profile = await ensureProfileForEmail(email);
    if (profile) {
      const token = await createMagicLink(email);
      const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca';
      const url = `${site}/api/tenant/verify?t=${encodeURIComponent(token)}`;
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from: 'Rentletter <hello@rentletter.ca>', to: email, subject: 'Your Rentletter profile link', html: magicLinkEmail(url) });
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[tenant/request-link] RESEND_API_KEY not set — dev-only link:', url);
      }
    }
  } catch (e) {
    console.error('[tenant/request-link] failed', e?.message || e); // never the token, never the email
  }
  return res.status(200).json(GENERIC);
}
