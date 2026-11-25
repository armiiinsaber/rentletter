// components/dashboard/commandSearch.js  PURE, browser and tests.
// What the command menu (components/dashboard/CommandMenu.js) finds, from what the browser already
// holds: the realtor's listings by address and unit, the applicants on them by name, and the
// actions. Nothing here reads or asks for anything.
//   commandResults({ query, listings, applicantsByListing, canArchive })
//     -> [{ id, kind: 'listing' | 'applicant' | 'action', label, detail, listingId?, linkId?, action? }]
//   With no words typed: the actions, then the listings most recently made. With words: every result
//   whose words hold each word typed, any case and accent; listings, then applicants, then actions.
//   COMMAND_ACTIONS
import { displayLabel } from '../../lib/listingAddress.js';
import { isWithdrawn } from '../../lib/listingApplicantsVocabulary.js';

export const COMMAND_ACTIONS = Object.freeze([
  { action: 'new', label: 'New listing', words: 'new listing add create' },
  { action: 'pipeline', label: 'Pipeline', words: 'pipeline people' },
  { action: 'circle', label: 'Circle', words: 'circle realtors referrals' },
  { action: 'shared', label: 'Shared with you', words: 'shared with you profiles' },
  { action: 'profile', label: 'Profile', words: 'profile brand logo account sign out' },
  { action: 'archived', label: 'Archived listings', words: 'archived archive listings' },
].map((a) => Object.freeze(a)));
export const LIMIT = 6;
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const wordsOf = (q) => fold(q).split(/[\s,]+/).filter(Boolean);
const holds = (text, words) => { const t = fold(text); return words.every((w) => t.includes(w)); };

export function commandResults({ query = '', listings = [], applicantsByListing = {}, canArchive = false } = {}) {
  const words = wordsOf(query);
  const actions = COMMAND_ACTIONS.filter((a) => a.action !== 'archived' || canArchive).map((a) => ({ id: `action:${a.action}`, kind: 'action', label: a.label, detail: '', action: a.action, words: `${a.label} ${a.words}` }));
  const all = (listings || []).filter((l) => l && l.id != null);
  const byId = new Map(all.map((l) => [l.id, l]));
  const listing = (l) => ({ id: `listing:${l.id}`, kind: 'listing', label: displayLabel(l, 'Untitled listing'), detail: l.archived_at ? 'Archived' : '', listingId: l.id, words: [displayLabel(l, ''), l.address, l.unit ? `unit ${l.unit}` : ''].join(' ') });
  if (!words.length) {
    const recent = [...all].filter((l) => !l.archived_at).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 4).map(listing);
    return [...actions, ...recent].map(({ words: w, ...r }) => r);
  }
  const people = [];
  for (const [listingId, apps] of Object.entries(applicantsByListing || {})) {
    const l = byId.get(listingId) || byId.get(Number(listingId));
    if (!l) continue;
    for (const a of apps || []) {
      if (!a || isWithdrawn(a)) continue;
      const name = String((a.application && a.application.full_name) || a.name || '').trim();
      if (!name || !a.linkId) continue;
      people.push({ id: `applicant:${a.linkId}`, kind: 'applicant', label: name, detail: displayLabel(l, 'A listing'), listingId: l.id, linkId: a.linkId, words: name });
    }
  }
  const found = (list) => list.filter((r) => holds(r.words, words));
  return [...found(all.map(listing)).slice(0, LIMIT), ...found(people).slice(0, LIMIT), ...found(actions)].map(({ words: w, ...r }) => r);
}
