// lib/actions.js
// The assistant's action list. Pure and isomorphic: every item is an applicant state
// (lib/applicantState.js) or a listing level fact, phrased as what the realtor does next. One
// line each; tapping one lands on the applicant with the right panel open (the deep link params
// components/dashboard/ListingView.js reads: ?applicant={linkId}&panel=checklist|documents|report).
//
//   buildActions({ listings, applicantsByListing, now }) -> items, most urgent first:
//     { key, listingId, linkId, kind, title, detail, verb, panel, since, signature, urgency }
//   key is stable across loads (`${kind}:${linkId || listingId}`); signature is the applicant's
//   state plus its since (or the listing fact), so a dismissal holds only while nothing changed.
//   actionHref(item, paths) -> the deep link for the dashboard adapter's paths.
import { applicantState } from './applicantState.js';
import { isWithdrawn } from './listingApplicantsVocabulary.js';

const DAY = 86400000;
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'this applicant';
const days = (iso, now) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : 0);
const listingName = (l) => l?.name || l?.address || 'this listing';

// Priority order, most urgent first. Urgency numbers keep the sort explicit.
export const KIND_ORDER = Object.freeze(['check_docs', 'mismatch', 'verify', 'waiting', 'request', 'ready', 'sent_waiting']);
const URGENCY = Object.fromEntries(KIND_ORDER.map((k, i) => [k, KIND_ORDER.length - i]));

export function buildActions({ listings, applicantsByListing, now } = {}) {
  const t = now ? new Date(now).getTime() : Date.now();
  const out = [];
  for (const l of listings || []) {
    const apps = (applicantsByListing?.[l.id] || []).filter((a) => a && !isWithdrawn(a));
    let verified = 0, verifiedSince = '';
    let sentSince = null;
    for (const a of apps) {
      const app = a.application || {};
      const name = app.full_name || 'Applicant';
      const st = applicantState({ junction: a, verification: a.docVerifications?.[0] || null });
      const base = { listingId: l.id, linkId: a.linkId, since: st.since || null, signature: `${st.state}:${st.since || ''}` };
      const item = (kind, title, detail, verb, panel) => out.push({ key: `${kind}:${a.linkId}`, kind, title, detail, verb, panel, urgency: URGENCY[kind], ...base });
      switch (st.state) {
        case 'checked': item('check_docs', 'Documents differ', `${name} · ${listingName(l)}`, 'Review', 'documents'); break;
        case 'mismatch': item('mismatch', 'Name did not match', `${name} · ${listingName(l)}`, 'Review', 'documents'); break;
        case 'matched': { const fit = app.fit && app.fit.score != null ? `${Number(app.fit.score).toFixed(1)} ` : ''; item('verify', `Verify ${first(name)}`, `${fit}docs match · ${listingName(l)}`, 'Verify', 'checklist'); break; }
        case 'requested': { const n = days(st.since, t); if (n > 3) item('waiting', `Waiting ${n} days`, `${name} · documents requested`, 'Nudge', 'documents'); break; }
        case 'new': item('request', 'Request documents', `${name} · ${listingName(l)}`, 'Request', 'documents'); break;
        case 'verified': verified++; if (String(st.since || '') > verifiedSince) verifiedSince = String(st.since || ''); break;
        case 'sent': if (!sentSince || String(st.since || '') > sentSince) sentSince = String(st.since || ''); break;
        default: break;
      }
    }
    if (verified > 0 && !sentSince) out.push({ key: `ready:${l.id}`, kind: 'ready', listingId: l.id, linkId: null, title: 'Ready to send', detail: `${verified} verified · ${listingName(l)}`, verb: 'Send', panel: 'report', since: verifiedSince || null, signature: `ready:${verified}:${verifiedSince}`, urgency: URGENCY.ready });
    if (sentSince) { const n = days(sentSince, t); if (n > 5) out.push({ key: `sent_waiting:${l.id}`, kind: 'sent_waiting', listingId: l.id, linkId: null, title: `Sent ${n} days ago`, detail: `${listingName(l)} · no reply yet`, verb: 'Open', panel: 'report', since: sentSince, signature: `sent:${sentSince}`, urgency: URGENCY.sent_waiting }); }
  }
  out.sort((a, b) => b.urgency - a.urgency || String(a.since || '').localeCompare(String(b.since || '')) || a.key.localeCompare(b.key));
  return out;
}

// The items still showing after the realtor's dismissals ({ key: signature }): an item stays
// hidden only while its signature is unchanged.
export function visibleActions(items, dismissed) {
  const d = dismissed && typeof dismissed === 'object' && !Array.isArray(dismissed) ? dismissed : {};
  return (items || []).filter((i) => d[i.key] !== i.signature);
}

// The deep link for an item, through the adapter's paths (the real listing path or the demo one).
export function actionHref(item, paths) {
  const base = paths && typeof paths.listing === 'function' ? paths.listing(item.listingId) : `/landlord/${item.listingId}`;
  const q = [item.linkId ? `applicant=${encodeURIComponent(item.linkId)}` : null, `panel=${encodeURIComponent(item.panel)}`].filter(Boolean).join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${q}`;
}
