// lib/docRequest.js
// SERVER-ONLY KV helpers for the tenant document-request flow (Stage 1). A realtor requests
// documents from a selected finalist; the tenant uploads via a secure single-applicant link.
//
// Storage (Upstash KV, same store as the invite/share tokens):
//   docreq:{token}         → the full request record (resolved by the tenant upload page).
//   docreq:{token}:staging → transient per-file analysis results while the tenant uploads one
//                            document at a time (24h TTL). Holds ONLY extracted facts — never raw
//                            bytes — and is deleted once /api/upload/finalize commits the result.
//   docreq-app:{linkId}    → a per-applicant reverse pointer { token, status, requestedAt,
//                            receivedAt, nudgedAt[] } so the realtor can read status without the
//                            token being exposed anywhere else.
//   docreq-pending         → a SET of linkIds with a request minted and no report yet. The nudge
//                            cron (lib/nudges.js) reads it because KV keys cannot be scanned:
//                            sadd at mint (both paths), srem on finalize, set aside, withdraw,
//                            listing rented or closed, and when the cron finds a report.
// The tenant only ever sees their upload token; owner_token / internal ids are never surfaced.
// PRIVACY: raw uploaded files never pass through KV (they are held in the private bucket after
// analysis, lib/documentStore.js); this module only tracks request metadata,
// status (requested → received), and extracted facts. Files are process-and-discard (analyzed one
// at a time in /api/upload/analyze-file, committed in /api/upload/finalize).
import crypto from 'crypto';
import { note } from './queryTrace.js';

export const DOCREQ_TTL = 7 * 24 * 60 * 60; // 7 days, the request link expires after a week.
export const STAGING_TTL = 24 * 60 * 60;    // 24h, abandoned per-file staging cleans itself up.

function kvBase() { return (process.env.KV_REST_API_URL || '').replace(/\/+$/, ''); }
export function kvReady() { return !!(kvBase() && process.env.KV_REST_API_TOKEN); }
const authHeader = () => ({ Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` });

export const reqKey = (token) => `docreq:${token}`;
export const stagingKey = (token) => `docreq:${token}:staging`;
export const appKey = (linkId) => `docreq-app:${linkId}`;
export const isDocReqToken = (t) => /^[a-f0-9]{32}$/.test(String(t || ''));
export function newDocReqToken() { return crypto.randomBytes(16).toString('hex'); }

export async function kvGetJson(key) {
  if (!kvReady()) return null;
  const done = note('kv', 'get');
  try {
    const r = await fetch(`${kvBase()}/get/${key}`, { headers: authHeader() });
    const d = await r.json();
    if (!d?.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch (e) { return null; } finally { done(); }
}

// Many keys in one round trip (Upstash REST mget). Returns values aligned with keys, null where absent.
export async function kvMgetJson(keys) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return [];
  if (!kvReady()) return list.map(() => null);
  const done = note('kv', 'mget');
  try {
    const r = await fetch(`${kvBase()}/mget/${list.map(encodeURIComponent).join('/')}`, { headers: authHeader() });
    const d = await r.json();
    const arr = Array.isArray(d?.result) ? d.result : [];
    return list.map((_, i) => { const v = arr[i]; if (v == null) return null; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } });
  } catch (e) { return list.map(() => null); } finally { done(); }
}

export async function kvSetJson(key, value, ttlSeconds = DOCREQ_TTL) {
  if (!kvReady()) return false;
  const done = note('kv', 'set');
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
  } catch (e) { return false; } finally { done(); }
}

export const PENDING_KEY = 'docreq-pending';
async function kvCmd(parts) {
  if (!kvReady()) return null;
  try { const r = await fetch(`${kvBase()}/${parts.map(encodeURIComponent).join('/')}`, { method: 'POST', headers: authHeader() }); const d = await r.json(); return d?.result ?? null; } catch (e) { return null; }
}
export const kvSadd = (member) => kvCmd(['sadd', PENDING_KEY, String(member)]);
export const kvSrem = (member) => kvCmd(['srem', PENDING_KEY, String(member)]);
export async function kvSmembers() { const r = await kvCmd(['smembers', PENDING_KEY]); return Array.isArray(r) ? r.map(String) : []; }

// Mint one document request for one applicant: the record under docreq:{token}, the pointer under
// docreq-app:{linkId} with status requested and requestedAt, and the linkId in the pending set.
// Used by the realtor's button (pages/api/applicants/request-documents.js) and by the invite
// mirror at submission (pages/api/applications/mirror.js). Reuses a live request unless renew.
// Returns { token, status, requestedAt, minted }.
export async function mintRequest({ listingId, linkId, applicationId, tenantName, listingName, address, realtorName, brokerage }, { renew = false, now = new Date() } = {}) {
  const existing = renew ? null : await kvGetJson(appKey(linkId));
  if (existing && isDocReqToken(existing.token)) return { token: existing.token, status: existing.status || 'requested', requestedAt: existing.requestedAt || null, minted: false };
  const token = newDocReqToken();
  const requestedAt = new Date(now).toISOString();
  const record = {
    listingId: String(listingId).slice(0, 64), linkId: String(linkId).slice(0, 64),
    applicationId: applicationId ? String(applicationId) : null,
    tenantName: String(tenantName || '').slice(0, 120), listingName: String(listingName || '').slice(0, 120), address: String(address || '').slice(0, 160),
    realtorName: String(realtorName || '').slice(0, 120), brokerage: String(brokerage || '').slice(0, 160),
    status: 'requested', requestedAt, receivedAt: null, fileCount: 0,
  };
  await kvSetJson(reqKey(token), record, DOCREQ_TTL);
  await kvSetJson(appKey(linkId), { token, status: 'requested', requestedAt, receivedAt: null, nudgedAt: [] }, DOCREQ_TTL);
  await kvSadd(linkId);
  return { token, status: 'requested', requestedAt, minted: true };
}

export const uploadUrl = (token) => `https://rentletter.ca/upload/${token}`;

export async function kvDel(key) {
  if (!kvReady()) return false;
  try {
    const r = await fetch(`${kvBase()}/del/${key}`, { method: 'POST', headers: authHeader() });
    return r.ok;
  } catch (e) { return false; }
}
