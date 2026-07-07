// lib/docRequest.js
// SERVER-ONLY KV helpers for the tenant document-request flow (Stage 1). A realtor requests
// documents from a selected finalist; the tenant uploads via a secure single-applicant link.
//
// Storage (Upstash KV, same store as the invite/share tokens):
//   docreq:{token}     → the full request record (resolved by the tenant upload page).
//   docreq-app:{linkId}→ a per-applicant reverse pointer { token, status, ... } so the realtor
//                        can read status without the token being exposed anywhere else.
// The tenant only ever sees their upload token; owner_token / internal ids are never surfaced.
// PRIVACY: raw uploaded files are NEVER stored here — this module only tracks request metadata
// and status (requested → received). Files are process-and-discard (see /api/upload/submit).
import crypto from 'crypto';

export const DOCREQ_TTL = 7 * 24 * 60 * 60; // 7 days — the request link expires after a week.

function kvBase() { return (process.env.KV_REST_API_URL || '').replace(/\/+$/, ''); }
export function kvReady() { return !!(kvBase() && process.env.KV_REST_API_TOKEN); }
const authHeader = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });

export const reqKey = (token) => `docreq:${token}`;
export const appKey = (linkId) => `docreq-app:${linkId}`;
export const isDocReqToken = (t) => /^[a-f0-9]{32}$/.test(String(t || ''));
export function newDocReqToken() { return crypto.randomBytes(16).toString('hex'); }

export async function kvGetJson(key) {
  if (!kvReady()) return null;
  try {
    const r = await fetch(`${kvBase()}/get/${key}`, { headers: authHeader() });
    const d = await r.json();
    if (!d?.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch (e) { return null; }
}

export async function kvSetJson(key, value, ttlSeconds = DOCREQ_TTL) {
  if (!kvReady()) return false;
  try {
    const r = await fetch(`${kvBase()}/set/${key}`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!r.ok) return false;
    if (ttlSeconds) {
      await fetch(`${kvBase()}/expire/${key}/${ttlSeconds}`, { method: 'POST', headers: authHeader() });
    }
    return true;
  } catch (e) { return false; }
}
