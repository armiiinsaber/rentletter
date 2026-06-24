// lib/listingReportData.js
// Server-only: authorize + load the data needed for a landlord report (PDF / text /
// email). The serverClient enforces realtor RLS (owns the listing + profile); the
// adminClient (service-role) reads application bodies (owner_token already stripped
// by fetchListingApplicants).
//
// MODEL: no culling. Everyone is RANKED vs the landlord's criteria by scorecard
// overall (best-fit-first). Withdrawn applicants are excluded. Set-aside applicants
// (de-prioritized with an OHRC-safe reason) sort below the active list.
import { fetchListingApplicants } from './supabaseBridge';

// Collapse legacy statuses: only 'set_aside' and 'withdrawn' are special; everything
// else (none / shortlist / reject / null) is an active ranked applicant.
export function normalizeStatus(s) {
  if (s === 'set_aside') return 'set_aside';
  if (s === 'withdrawn') return 'withdrawn';
  return 'ranked';
}

const byScore = (x, y) =>
  (y.application?.scorecard?.overall ?? 0) - (x.application?.scorecard?.overall ?? 0);

// Returns { active, setAside } — each best-fit-first; withdrawn excluded.
export function rankApplicants(list) {
  const active = [];
  const setAside = [];
  for (const a of list || []) {
    const st = normalizeStatus(a.decisionStatus);
    if (st === 'withdrawn') continue;
    (st === 'set_aside' ? setAside : active).push(a);
  }
  active.sort(byScore);
  setAside.sort(byScore);
  return { active, setAside };
}

// Returns { listing, profile, active, setAside } or null if the realtor doesn't own
// the listing (RLS returns no row).
export async function loadReportContext(serverClient, adminClient, listingId, userId) {
  const { data: listing } = await serverClient
    .from('listings').select('*').eq('id', listingId).maybeSingle();
  if (!listing) return null;
  const { data: profile } = await serverClient
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  const applicants = await fetchListingApplicants(adminClient, listing.id);
  const { active, setAside } = rankApplicants(applicants);
  return { listing, profile: profile || { id: userId }, active, setAside };
}
