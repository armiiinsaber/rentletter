// /api/tenant/prefill-ticket  POST { source, … }. TENANT side. The apply page calls it at the
// moment it fills the form from somewhere, and gets back a single use ticket to send with the
// submission (lib/prefillRecord.js; the mirror reads it and writes where the answers came from,
// db/014-prefill-record.sql). The server decides the source from what the caller can prove:
//
//   source 'profile'                the tenant session cookie: the ticket holds the signed in
//                                   profile's id and revision and is bound to that session
//   source 'previous_application'   { applicationNumber, ownerToken }: the legacy device path, the
//                                   owner token compared in constant time, as /api/application/manage does
//   source 'pipeline_invite'        { token }: the Pipeline invite's prefill token, which must
//                                   still be claimed
//
// The answer is { ok, ticket } or { ok: false }: never a reason, a fact, an id or a token. A
// caller that cannot prove its source gets no ticket and its application is recorded as typed
// fresh. Rate limited per IP. Nothing here is a realtor route and no realtor ever sees a ticket.
import crypto from 'crypto';
import { kvGet } from '../../../lib/kv';
import { rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { isApplicationNumber } from '../../../lib/applicationIds';
import { isPrefillToken, claimedKey } from '../../../lib/pipeline';
import { PREFILL_SOURCE, mintTicket, sessionProof } from '../../../lib/prefillRecord';

const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
const no = (res) => res.status(200).json({ ok: false });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (await rateLimited('prefillticket', clientIp(req), 30, 15 * 60)) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });
    const { source, applicationNumber, ownerToken, token } = req.body || {};
    let payload = null;
    if (source === PREFILL_SOURCE.PROFILE) {
      const s = await sessionProof(req);
      if (s) payload = { source, bound: 'session', profileId: s.profileId, revision: s.revision };
    } else if (source === PREFILL_SOURCE.PREVIOUS_APPLICATION) {
      const number = String(applicationNumber || '').trim().toUpperCase();
      const app = isApplicationNumber(number) ? await kvGet(`app:${number}`) : null;
      if (app && !app.revoked && safeEqual(app.ownerToken, String(ownerToken || '').trim())) payload = { source, bound: 'none' };
    } else if (source === PREFILL_SOURCE.PIPELINE_INVITE) {
      if (isPrefillToken(token) && (await kvGet(claimedKey(token)))) payload = { source, bound: 'none' };
    }
    if (!payload) return no(res);
    const ticket = await mintTicket(payload);
    return ticket ? res.status(200).json({ ok: true, ticket }) : no(res);
  } catch (e) {
    return no(res);
  }
}
