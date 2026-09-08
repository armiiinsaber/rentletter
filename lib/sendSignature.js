// lib/sendSignature.js  SERVER ONLY. The confirmation email is sent by a public route
// (pages/api/send.js), so the generate route signs what it hands the browser: an HMAC over the
// application number, the email and a 15 minute expiry, keyed by SEND_SECRET (CRON_SECRET as the
// fallback). send.js accepts nothing without a valid, unexpired signature.
import crypto from 'crypto';

export const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
export const signingKey = () => process.env.SEND_SECRET || process.env.CRON_SECRET || '';
const message = (applicationNumber, email, exp) => `${String(applicationNumber || '').trim().toUpperCase()}\n${String(email || '').trim().toLowerCase()}\n${Number(exp)}`;

export function signConfirmation({ applicationNumber, email, exp }, key = signingKey()) {
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(message(applicationNumber, email, exp)).digest('hex');
}

// { sig, exp } for the generate response; null when no secret is configured (send.js then refuses).
export function confirmationSignature({ applicationNumber, email, now = Date.now() }, key = signingKey()) {
  const exp = now + CONFIRMATION_TTL_MS;
  const sig = signConfirmation({ applicationNumber, email, exp }, key);
  return sig ? { sig, exp } : null;
}

// Constant time compare, expiry checked first. false for anything malformed.
export function verifyConfirmation({ applicationNumber, email, exp, sig }, { key = signingKey(), now = Date.now() } = {}) {
  if (!key || !sig || exp == null) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now || e > now + CONFIRMATION_TTL_MS + 60000) return false;
  const want = signConfirmation({ applicationNumber, email, exp: e }, key);
  const a = Buffer.from(String(sig)), b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
