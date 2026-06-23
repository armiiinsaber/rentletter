// lib/listingReportData.js
// Server-only: authorize + load the data needed for a landlord report (PDF / text /
// email). The serverClient enforces realtor RLS (owns the listing + profile); the
// adminClient (service-role) reads application bodies (owner_token already stripped
// by fetchListingApplicants).
import { fetchListingApplicants } from './supabaseBridge';

// Rank: 'top' priority first, then scorecard overall desc.
export function rankShortlist(list) {
  return [...list].sort((a, b) => {
    const pa = a.decisionPriority === 'top' ? 0 : 1;
    const pb = b.decisionPriority === 'top' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const sa = a.application?.scorecard?.overall ?? 0;
    const sb = b.application?.scorecard?.overall ?? 0;
    return sb - sa;
  });
}

// Returns { listing, profile, shortlisted } or null if the realtor doesn't own
// the listing (RLS returns no row).
export async function loadReportContext(serverClient, adminClient, listingId, userId) {
  const { data: listing } = await serverClient
    .from('listings').select('*').eq('id', listingId).maybeSingle();
  if (!listing) return null;
  const { data: profile } = await serverClient
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  const applicants = await fetchListingApplicants(adminClient, listing.id);
  const shortlisted = rankShortlist(applicants.filter((a) => a.decisionStatus === 'shortlist'));
  return { listing, profile: profile || { id: userId }, shortlisted };
}
