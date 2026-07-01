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
import { authorizeApplicant } from './applicantAnalysis';

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
  if (!latest || analyzed.length === 0) return { verified: false, reason: 'no_documents', message: 'Not verified — no documents provided' };

  // Name-match GATE: verified requires the document name to actually belong to this applicant.
  // A mismatch (or an unclear name) → NOT verified (the analysis is still saved — Option B).
  // Older runs (before the name-match safeguard) have no nameMatch → treated as pass-through.
  if (latest.nameMatch === 'mismatch') return { verified: false, reason: 'name_mismatch', message: 'Not verified — document name does not match applicant' };
  if (latest.nameMatch === 'unclear') return { verified: false, reason: 'name_unclear', message: 'Not verified — could not confirm the document name matches the applicant' };

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

// One-line plain-text version (used by the Stage-2 confirmation). Neutral wording. For a
// not-verified applicant it uses the reason message (e.g. name mismatch), else the default.
export function verificationText(v) {
  if (!v || !v.verified) return v?.message || 'Not verified — no documents provided';
  const parts = ['Documents verified'];
  if (v.incomeVerified) parts.push(`income verified${v.incomeFigure ? ` (${v.incomeFigure})` : ''}`);
  if (v.employmentVerified) parts.push('employment verified');
  if (v.credit && v.credit.score != null) {
    const meta = [v.credit.bureau, v.credit.band].filter(Boolean).join(', ');
    parts.push(`credit score ${v.credit.score}${meta ? ` (${meta})` : ''}`);
  }
  return parts.join(' · ');
}

// ── STAGE 2: single-applicant verification ──────────────────────────────────────────────────
// Authorize + load ONE applicant's landlord-safe verification (owner-only, strict two-key:
// linkId AND application_id). Returns { listing, profile, applicantName, verification } or
// { status, error }. Reads the applicant's OWN doc_verifications (from their junction row).
export async function loadApplicantVerification(serverClient, adminClient, listingId, linkId, applicationId, userId) {
  const ctx = await authorizeApplicant(serverClient, adminClient, listingId, linkId);
  if (!ctx) return { status: 404, error: 'Applicant not found.' };
  if (applicationId != null && String(ctx.junction.application_id) !== String(applicationId)) {
    return { status: 409, error: 'Applicant reference mismatch — please reload the page and try again.' };
  }
  const { data: profile } = await serverClient.from('profiles').select('*').eq('id', userId).maybeSingle();
  return {
    listing: ctx.listing,
    profile: profile || { id: userId },
    applicantName: ctx.application?.full_name || 'Applicant',
    verification: landlordVerification(ctx.junction.doc_verifications),
  };
}

// Deterministic iMessage-friendly copy-text for the Stage-2 confirmation (no AI). Matches the
// group report's leader-dot / em-dash-rule style. Shows verified facts, or the not-verified
// reason line (e.g. name mismatch).
export function verificationConfirmText({ realtorName, brokerage, phone, unitName, applicantName, verification }) {
  const v = verification || { verified: false };
  const RULE = '—'.repeat(28);
  const leader = (label, val) => `   ${label} ${'.'.repeat(Math.max(2, 14 - label.length))} ${val}`;
  const out = [];
  out.push('DOCUMENT VERIFICATION');
  out.push(String(applicantName || 'Applicant').toUpperCase());
  const sub = [unitName ? `For ${unitName}` : null, `Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}`].filter(Boolean).join('  ·  ');
  if (sub) out.push(sub);
  out.push(''); out.push(RULE); out.push('');
  if (v.verified) {
    out.push('Documents verified');
    if (v.incomeVerified) out.push(leader('Income', `verified${v.incomeFigure ? ` (${v.incomeFigure})` : ''}`));
    if (v.employmentVerified) out.push(leader('Employment', 'verified'));
    if (v.credit && v.credit.score != null) {
      const meta = [v.credit.bureau, v.credit.band].filter(Boolean).join(', ');
      out.push(leader('Credit', `${v.credit.score}${meta ? ` (${meta})` : ''}`));
    }
    if (!v.incomeVerified && !v.employmentVerified && !(v.credit && v.credit.score != null)) out.push('   Supporting documents reviewed.');
  } else {
    out.push(v.message || 'Not verified — no documents provided');
    out.push(v.reason === 'name_mismatch'
      ? 'The name on the supplied documents does not match this applicant.'
      : v.reason === 'name_unclear'
        ? 'The document name could not be confirmed against this applicant.'
        : 'No supporting documents have been reviewed for this applicant.');
  }
  out.push(''); out.push(RULE); out.push('');
  out.push('Verification reflects documents supplied to the realtor and reviewed via Rentletter; documents are not retained.');
  const sig = [realtorName, brokerage, phone].filter(Boolean).join(' · ');
  if (sig) out.push(sig);
  return out.join('\n');
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

  // The GROUP shortlist deliverable is RANKING ONLY — no per-applicant verification is attached
  // here. Document verification is a separate Stage-2, single-applicant confirmation
  // (see loadApplicantVerification / the verify-confirm route). landlordVerification() is kept
  // for that path; attachDocVerifications remains for the realtor dashboard read.
  const { active, setAside } = rankApplicants(applicants);
  return { listing, profile: profile || { id: userId }, active, setAside };
}
