// lib/stripe.js — SERVER-ONLY. A small client for the Stripe REST API (form-encoded, Bearer
// secret) and webhook signature verification, on Node's fetch + crypto — no SDK, no new
// dependency. Import only from pages/api/** and other server-only modules.
import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';
const VERSION = '2024-06-20';
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

// { a: { b: 1 }, items: [{ price: 'x' }] } → a[b]=1&items[0][price]=x
function encode(params, prefix, out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }

export async function stripe(method, path, params, { idempotencyKey } = {}) {
  const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new StripeError('Stripe is not configured.', 503, 'not_configured');
  const headers = { Authorization: `Bearer ${key}`, 'Stripe-Version': VERSION };
  let url = `${API}${path}`; let body;
  if (method === 'GET') { const q = encode(params).toString(); if (q) url += `?${q}`; }
  else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = encode(params).toString(); if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey; }
  const r = await fetch(url, { method, headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new StripeError(j?.error?.message || `Stripe ${r.status}`, r.status, j?.error?.code);
  return j;
}

// Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>] — HMAC-SHA256(secret, `${t}.${rawBody}`).
// Constant-time compare; 5-minute tolerance against replay of an old payload.
export function verifyStripeSignature(rawBody, header, secret, { toleranceSec = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret || !header || !rawBody) return false;
  const parts = Object.create(null); const sigs = [];
  for (const kv of String(header).split(',')) { const i = kv.indexOf('='); if (i < 0) continue; const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); if (k === 'v1') sigs.push(v); else parts[k] = v; }
  const t = Number(parts.t); if (!t || !sigs.length) return false;
  if (Math.abs(now - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const eb = Buffer.from(expected, 'utf8');
  return sigs.some((s) => { const sb = Buffer.from(s, 'utf8'); return sb.length === eb.length && crypto.timingSafeEqual(sb, eb); });
}

// Read the raw request body (the Next body parser is disabled on the webhook route).
export function readRawBody(req) {
  return new Promise((resolve, reject) => { const chunks = []; req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject); });
}
