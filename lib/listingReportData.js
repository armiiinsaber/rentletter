// lib/listingReportData.js
// Server-only: authorize + load the data needed for a landlord report (PDF / text /
// email). The serverClient enforces realtor RLS (owns the listing + profile); the
// adminClient (service-role) reads application bodies (owner_token already stripped
// by fetchListingApplicants).
//
// MODEL: no culling. Everyone is RANKED vs the landlord's criteria by scorecard
// overall (best-fit-first). Withdrawn applicants are excluded. Set-aside applicants
// (de-prioritized with an OHRC-safe reason) sort below the active list.
import { fetchListingApplicants, attachDocVerifications } from './supabaseBridge';

// Collapse legacy statuses: only 'set_aside' and 'withdrawn' are special; everything
// else (none / shortlist / reject / null) is an active ranked applicant.
export function normalizeStatus(s) {
  if (s === 'set_aside') return 'set_aside';
  if (s === 'withdrawn') return 'withdrawn';
  return 'ranked';
}

const byScore = (x, y) =>
  (y.application?.scorecard?.overall ?? 0) - (x.application?.scorecard?.overall ?? 0);

// Derive a LANDLORD-SAFE verification summary from the realtor-side doc_verifications jsonb.
// Landlord-safe means: only VERIFIED screenable facts (income/employment/credit score) +
// whether documents were analyzed. It DELIBERATELY EXCLUDES everything realtor-only: raw
// documents (never stored anyway), any 'mismatch'/'close' comparison, and any cross-reference
// 'discrepancy'. Never touches OHRC-protected data.
export function landlordVerification(docVerifications) {
  const runs = Array.isArray(docVerifications) ? docVerifications : [];
  const latest = runs.length ? runs[runs.length - 1] : null;
  const docs = latest && Array.isArray(latest.documents) ? latest.documents : [];
  // "Verified" requires THIS applicant's own doc_verifications to contain at least one
  // genuinely ANALYZED document — a recognized supporting document, not an empty run and not
  // only unrecognized/junk uploads. No documents → never "verified".
  const analyzed = docs.filter((d) => d && d.unrecognized !== true);
  if (!latest || analyzed.length === 0) return { verified: false };

  const comparisons = Array.isArray(latest.comparisons) ? latest.comparisons : [];
  // ONLY status 'match' counts as verified for the landlord. 'close'/'mismatch' (discrepancies)
  // are realtor-side only and are intentionally never read here.
  const matchOf = (re) => comparisons.find((c) => re.test(String(c.field || '')) && c.status === 'match');
  const incomeM = matchOf(/income/i);
  const employerM = matchOf(/employer/i);

  // Credit facts come straight from a recognized credit-report document in THIS applicant's run.
  const creditDoc = analyzed.find((d) => /credit\s*report/i.test(String(d.documentType || '')) && d.extracted);
  const ex = creditDoc ? (creditDoc.extracted || {}) : {};
  const credit = (creditDoc && (ex.creditScore != null || ex.scoreBand || ex.bureau))
    ? { score: ex.creditScore != null ? ex.creditScore : null, band: ex.scoreBand || null, bureau: ex.bureau || null }
    : null;

  return {
    verified: true,
    incomeVerified: !!incomeM,
    incomeFigure: incomeM ? (incomeM.found || incomeM.stated || null) : null,
    employmentVerified: !!employerM,
    employerName: employerM ? (employerM.found || employerM.stated || null) : null,
    credit,
  };
}

// One-line plain-text version (used by the text report). Neutral wording; never a red flag.
export function verificationText(v) {
  if (!v || !v.verified) return 'Not verified — no documents provided';
  const parts = ['Documents verified'];
  if (v.incomeVerified) parts.push(`income verified${v.incomeFigure ? ` (${v.incomeFigure})` : ''}`);
  if (v.employmentVerified) parts.push('employment verified');
  if (v.credit && v.credit.score != null) {
    const meta = [v.credit.bureau, v.credit.band].filter(Boolean).join(', ');
    parts.push(`credit score ${v.credit.score}${meta ? ` (${meta})` : ''}`);
  }
  return parts.join(' · ');
}

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

  // Attach a landlord-safe verification summary from doc_verifications (read-only; we do NOT
  // re-run analysis). Separate query so fetchListingApplicants (ranking flow) stays untouched;
  // graceful if the column doesn't exist yet → everyone is simply "not verified".
  // Strict two-key attribution (shared helper) → each applicant gets ONLY its own row's
  // doc_verifications; then derive the landlord-safe verification from it.
  await attachDocVerifications(adminClient, listing.id, applicants, 'report');
  for (const a of applicants) a.verification = landlordVerification(a.docVerifications);

  const { active, setAside } = rankApplicants(applicants);
  return { listing, profile: profile || { id: userId }, active, setAside };
}
