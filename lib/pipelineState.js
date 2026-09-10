// lib/pipelineState.js  PURE, shared by the browser and the server. Pipeline: who was asked, who said yes.
//
//   (rowToForm lives in lib/pipelinePrefill.js: it needs the form shape, this module stays
//   importable by lib/actions.js without the tenant profile.)
//   peopleRows(...)             the list: one row per consent row, pending (asked, no answer yet) or
//                               consented, Fit against every active listing.
//   inviteEmail / renewalEmail  the two messages, in the realtor's voice.
//   pipelineFitItems(...)       the "Pipeline fits" item per new active listing (lib/actions.js).
import { computeFit } from './fitScore.js';
import { listingOpen, CONSENT_DAYS } from './listingState.js';

const DAY = 86400000;
export const PREFILL_TTL = 2 * DAY / 1000; // seconds: the invite's prefill link lives 48 hours and is claimed by the first browser that opens it
export const RENEW_BEFORE_DAYS = 7;
export const FIT_THRESHOLD = 4.0;
export const PIPELINE_PAUSED = null;

const s = (v) => (v == null ? '' : String(v));
const lower = (v) => s(v).trim().toLowerCase();
export const firstName = (name, email) => s(name).trim().split(/\s+/)[0] || s(email).split('@')[0] || 'there';
export const listingLabel = (l) => l?.name || l?.address || 'the unit';
export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
export const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
export const rentLine = (rent) => (Number(rent) > 0 ? `$${Number(rent).toLocaleString('en-CA')}` : '');

// The list. consents: rows for this realtor with status pending or consented and expires_at ahead
// (the caller filtered by profile_id; this filters status and expiry again). A pending row is an
// applicant who was asked when a unit went rented and has not answered: it shows, muted, and
// cannot be invited (lib/pipeline.js prepareInvite refuses it). Declined and expired never show. applications: the rows
// their application_id point to, owner_token and cover_letter already stripped. junctions: the
// listing_applicants rows for those applications (confirmations by application_id + listing_id).
// applicantsByListing: the active listings' applicants, for "applied" by email. Matching reads
// only what Fit reads: computeFit with verification null (the documents are gone) and the
// original junction row's confirmations, with their dates.
export function peopleRows({ consents, applications, junctions, listings, applicantsByListing, now = new Date() } = {}) {
  const t = new Date(now).getTime();
  // Only this realtor's active listings: a listing carrying another profile_id never scores.
  const activeFor = (profileId) => (listings || []).filter((l) => l && listingOpen(l) && (!l.profile_id || !profileId || String(l.profile_id) === String(profileId)));
  const allActive = (listings || []).filter((l) => l && listingOpen(l));
  const appById = new Map((applications || []).map((a) => [String(a.id), a]));
  const listingById = new Map((listings || []).map((l) => [String(l.id), l]));
  const emailsOn = new Map(allActive.map((l) => [String(l.id), new Set(((applicantsByListing || {})[l.id] || []).map((a) => lower(a?.application?.email)).filter(Boolean))]));
  const rows = [];
  for (const c of consents || []) {
    if (!c || (c.status !== 'consented' && c.status !== 'pending')) continue;
    if (c.expires_at && new Date(c.expires_at).getTime() <= t) continue;
    const app = c.application_id ? appById.get(String(c.application_id)) || null : null;
    const j = app ? (junctions || []).find((x) => String(x.application_id) === String(app.id) && String(x.listing_id) === String(c.listing_id)) : null;
    const confirmations = j && j.confirmations && typeof j.confirmations === 'object' ? j.confirmations : {};
    const email = lower(c.email) || lower(app?.email);
    const invites = Array.isArray(c.invites) ? c.invites.filter((i) => i && i.listingId) : [];
    const fits = [];
    for (const l of activeFor(c.profile_id)) {
      const fit = app ? computeFit({ application: app, listing: l, verification: null, confirmations }) : null;
      const inv = invites.filter((i) => String(i.listingId) === String(l.id)).sort((a, b) => s(b.at).localeCompare(s(a.at)))[0] || null;
      fits.push({ listingId: l.id, listingName: listingLabel(l), score: fit ? fit.score : null, label: fit ? fit.label : null, invitedAt: inv ? inv.at : null, applied: !!email && (emailsOn.get(String(l.id)) || new Set()).has(email) });
    }
    const scored = fits.filter((f) => f.score != null).sort((a, b) => b.score - a.score);
    const best = scored[0] ? { listingId: scored[0].listingId, listingName: scored[0].listingName, score: scored[0].score, label: scored[0].label } : null;
    const from = listingById.get(String(c.listing_id));
    const latestInvite = [...invites].sort((a, b) => s(b.at).localeCompare(s(a.at)))[0] || null;
    rows.push({
      id: c.id,
      status: c.status,
      askedAt: c.created_at || null,
      name: app?.full_name || null,
      email,
      display: app?.full_name || email,
      fromListingName: from ? listingLabel(from) : null,
      consentedAt: c.consented_at || c.created_at || null,
      expiresAt: c.expires_at || null,
      invites,
      lastInvitedAt: latestInvite ? latestInvite.at : null,
      fits,
      best,
      applied: fits.some((f) => f.applied),
      hasApplication: !!app,
    });
  }
  rows.sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? 1 : -1; // asked, no answer yet: after everyone who said yes
    if (!!a.best !== !!b.best) return a.best ? -1 : 1; // rows with no application last
    if (a.best && b.best && a.best.score !== b.best.score) return b.best.score - a.best.score;
    return s(a.consentedAt).localeCompare(s(b.consentedAt));
  });
  return rows;
}

// The invite. From "{realtorName} via Rentletter", reply to the realtor. A person with no
// application (rented link email only) gets no prefilled line and a link without ?from.
export const pipelineFrom = (realtorName) => `${realtorName || 'Your realtor'} via Rentletter <hello@rentletter.ca>`;
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function wrap({ greeting, lines, who, cta, url }) {
  const text = `${greeting}\n\n${lines.join('\n')}\n\n${cta}: ${url}\n\n${who}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">${esc(greeting)}</p>
        ${lines.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        <p style="margin:20px 0 0;"><a href="${url}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:8px;font-weight:700;">${esc(cta)}</a></p>
        <p style="margin:20px 0 0;">${esc(who)}</p>
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">Sent through Rentletter on behalf of ${esc(who)}.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { text, html };
}
export function inviteEmail({ listing, realtorName, applicantName, email, applyUrl, prefilled }) {
  const who = realtorName || 'Your realtor';
  const address = listing?.address || listing?.name || 'A unit';
  const beds = listing?.bedrooms != null && String(listing.bedrooms).trim() !== '' ? `${listing.bedrooms} bed` : '';
  const facts = [rentLine(listing?.monthly_rent) ? `${rentLine(listing.monthly_rent)} per month` : '', beds].filter(Boolean).join(', ');
  const greeting = `Hi ${firstName(applicantName, email)},`;
  const lines = [`You asked me to keep you in mind. ${address}${facts ? `, ${facts}` : ''}, is available.`];
  if (prefilled) lines.push('Your application from before is already filled in. It takes about two minutes.');
  const subject = `${address}: a unit you might like`;
  return { subject, greeting, lines, cta: 'Apply', url: applyUrl, signoff: who, ...wrap({ greeting, lines, who, cta: 'Apply', url: applyUrl }) };
}
export function renewalEmail({ realtorName, applicantName, email, expiresAt, keepUrl }) {
  const who = realtorName || 'Your realtor';
  const greeting = `Hi ${firstName(applicantName, email)},`;
  const lines = [`Your "keep me in mind" with ${who} ends on ${longDate(expiresAt)}. Tap below to keep it for another ${CONSENT_DAYS} days, or do nothing and it ends there.`];
  return { subject: 'Still looking?', greeting, lines, cta: 'Keep me in mind', url: keepUrl, signoff: who, ...wrap({ greeting, lines, who, cta: 'Keep me in mind', url: keepUrl }) };
}

// "Pipeline fits": one item per active listing created after the consent rows existed (a new
// listing) with any person at FIT_THRESHOLD or above. people: peopleRows output.
export function pipelineFitItems({ listings, people } = {}) {
  const out = [];
  for (const l of listings || []) {
    if (!l || !listingOpen(l)) continue;
    const n = (people || []).filter((p) => p.status !== 'pending' && !p.applied && (p.fits || []).some((f) => String(f.listingId) === String(l.id) && f.score != null && f.score >= FIT_THRESHOLD && !f.applied)).length;
    if (!n) continue;
    const anyBefore = (people || []).some((p) => p.consentedAt && l.created_at && new Date(p.consentedAt).getTime() <= new Date(l.created_at).getTime());
    if (!anyBefore) continue;
    out.push({ key: `pipeline_fit:${l.id}`, kind: 'pipeline_fit', listingId: l.id, linkId: null, title: 'Pipeline fits', detail: `${n} ${n === 1 ? 'person' : 'people'} at ${FIT_THRESHOLD.toFixed(1)} or above · ${listingLabel(l)}`, verb: 'Open', panel: 'people', name: null, listingName: listingLabel(l), reason: `${n} ${n === 1 ? 'person' : 'people'} at ${FIT_THRESHOLD.toFixed(1)} or above`, since: l.created_at || null, signature: `pipeline_fit:${l.id}:${n}` });
  }
  return out;
}
