// lib/nudges.js  SERVER ONLY (takes the service role client and the KV helpers).
// The automatic reminders for a pending document request, in the realtor's name: one at 48
// hours, one at 5 days, never a third. Runs from pages/api/cron/nudges.js every morning.
//
// selectNudge(ctx, now) is pure and decides for ONE pending request:
//   { nudge: 1 | 2 } to send, { skip: reason } to leave alone, { drop: reason } to leave the
//   pending set (report present, applicant set aside or withdrawn, listing not active).
// runNudges(deps, { now, log }) reads the pending set, loads the rows, sends, records
// documents_nudged, appends nudgedAt on the pointer, and prunes the set.
import { DECISION_STATUS } from './listingApplicantsVocabulary.js';
import { listingOpen } from './listingState.js';

export const NUDGE_ONE_AFTER_MS = 48 * 60 * 60 * 1000;
export const NUDGE_TWO_AFTER_MS = 5 * 24 * 60 * 60 * 1000;

const hasReport = (junction, pointer) => {
  if (pointer && pointer.status === 'received') return true;
  if (!junction) return false;
  if (junction.docs_submitted_at) return true;
  const v = junction.doc_verifications;
  return Array.isArray(v) ? v.length > 0 : !!(v && typeof v === 'object' && Object.keys(v).length);
};

// ctx: { pointer, junction, listing, application }
export function selectNudge(ctx, now = new Date()) {
  const { pointer, junction, listing, application } = ctx || {};
  if (!pointer || !pointer.requestedAt) return { drop: 'no request' };
  if (!junction) return { drop: 'applicant gone' };
  if (hasReport(junction, pointer)) return { drop: 'report present' };
  if (junction.withdrawn_at || junction.withdrawnAt) return { drop: 'withdrawn' };
  if ((junction.decision_status || junction.decisionStatus) === DECISION_STATUS.REJECT) return { drop: 'set aside' };
  if (!listing) return { drop: 'listing gone' };
  if (!listingOpen(listing)) return { drop: `listing ${listing.status}` };
  const email = String(application?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { skip: 'no email' };
  const sent = Array.isArray(pointer.nudgedAt) ? pointer.nudgedAt.filter(Boolean) : [];
  if (sent.length >= 2) return { skip: 'both sent' };
  const age = new Date(now).getTime() - new Date(pointer.requestedAt).getTime();
  if (sent.length === 0) return age >= NUDGE_ONE_AFTER_MS ? { nudge: 1 } : { skip: 'under 48 hours' };
  return age >= NUDGE_TWO_AFTER_MS ? { nudge: 2 } : { skip: 'under 5 days' };
}

export const nudgeFrom = (realtorName) => `${realtorName || 'Your realtor'} via Rentletter <hello@rentletter.ca>`;

// The email, in the realtor's voice. Nudge two adds one line after the first paragraph.
export function nudgeEmail({ nudge, listingName, realtorName, applicantName, uploadUrl }) {
  const unit = listingName || 'the unit';
  const who = realtorName || 'your realtor';
  const first = String(applicantName || '').trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : 'Hi,';
  const paras = [
    `Your application for ${unit} is in. It is waiting on one thing: a pay stub or employment letter.`,
    ...(nudge === 2 ? ['This is the last reminder.'] : []),
    `Two minutes, held for 14 days for ${who}'s review, then deleted.`,
  ];
  const subject = `${unit}: documents for your application`;
  const text = `${greeting}\n\n${paras.join('\n\n')}\n\nAdd documents: ${uploadUrl}\n\n${who}\n`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">${esc(greeting)}</p>
        ${paras.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        <p style="margin:20px 0 0;"><a href="${uploadUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:8px;font-weight:700;">Add documents</a></p>
        <p style="margin:20px 0 0;">${esc(who)}</p>
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">Sent through Rentletter on behalf of ${esc(who)}. This link is private to you.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, greeting, paras };
}

// deps: { admin, kv: { smembers, mget, set, srem, appKey, uploadUrl, ttl }, send(mail) -> Promise, recordEvent(admin, evt) }
export async function runNudges(deps, { now = new Date(), log = console.log } = {}) {
  const { admin, kv, send, recordEvent } = deps;
  const out = { pending: 0, sent: 0, skipped: 0, dropped: 0, errors: 0, detail: [] };
  const linkIds = await kv.smembers();
  out.pending = linkIds.length;
  if (!linkIds.length) { log(`[nudges] pending=0 sent=0`); return out; }
  const pointers = await kv.mget(linkIds.map((id) => kv.appKey(id)));
  const { data: junctions, error: jErr } = await admin.from('listing_applicants').select('*').in('id', linkIds);
  if (jErr) throw jErr;
  const byId = Object.fromEntries((junctions || []).map((j) => [String(j.id), j]));
  const listingIds = [...new Set((junctions || []).map((j) => j.listing_id).filter(Boolean))];
  const appIds = [...new Set((junctions || []).map((j) => j.application_id).filter(Boolean))];
  const { data: listings } = listingIds.length ? await admin.from('listings').select('*').in('id', listingIds) : { data: [] };
  const { data: apps } = appIds.length ? await admin.from('applications').select('id, full_name, email').in('id', appIds) : { data: [] };
  const listingById = Object.fromEntries((listings || []).map((l) => [String(l.id), l]));
  const appById = Object.fromEntries((apps || []).map((a) => [String(a.id), a]));
  const profileIds = [...new Set((listings || []).map((l) => l.profile_id).filter(Boolean))];
  const { data: profiles } = profileIds.length ? await admin.from('profiles').select('id, full_name, email').in('id', profileIds) : { data: [] };
  const profileById = Object.fromEntries((profiles || []).map((p) => [String(p.id), p]));

  for (let i = 0; i < linkIds.length; i++) {
    const linkId = linkIds[i];
    const pointer = pointers[i] || null;
    const junction = byId[String(linkId)] || null;
    const listing = junction ? listingById[String(junction.listing_id)] || null : null;
    const application = junction ? appById[String(junction.application_id)] || null : null;
    const decision = selectNudge({ pointer, junction, listing, application }, now);
    if (decision.drop) { await kv.srem(linkId); out.dropped++; out.detail.push(`${linkId}: dropped, ${decision.drop}`); continue; }
    if (decision.skip) { out.skipped++; continue; }
    const profile = profileById[String(listing.profile_id)] || {};
    const realtorName = profile.full_name || 'Your realtor';
    const mail = nudgeEmail({ nudge: decision.nudge, listingName: listing.name || listing.address, realtorName, applicantName: application.full_name, uploadUrl: kv.uploadUrl(pointer.token) });
    try {
      await send({ from: nudgeFrom(realtorName), to: String(application.email).trim(), reply_to: profile.email || undefined, subject: mail.subject, html: mail.html, text: mail.text });
      const stamp = new Date(now).toISOString();
      await kv.set(kv.appKey(linkId), { ...pointer, nudgedAt: [...(Array.isArray(pointer.nudgedAt) ? pointer.nudgedAt : []), stamp] }, kv.ttl);
      await recordEvent(admin, { profileId: listing.profile_id, listingId: listing.id, applicationId: application.id, type: 'documents_nudged', payload: { nudge: decision.nudge, applicantName: application.full_name || null, listingName: listing.name || listing.address || null, linkId } });
      out.sent++; out.detail.push(`${linkId}: nudge ${decision.nudge}`);
    } catch (e) { out.errors++; log(`[nudges] ${linkId}: send failed: ${e?.message || e}`); }
  }
  log(`[nudges] pending=${out.pending} sent=${out.sent} skipped=${out.skipped} dropped=${out.dropped} errors=${out.errors}`);
  return out;
}
