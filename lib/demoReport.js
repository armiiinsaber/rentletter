// lib/demoReport.js — SERVER. Builds the demo dashboard's report context from lib/demoFixture.js.
// No auth, no database, no user input beyond a fixture listing id and a map of fixture
// linkId to { status, withdrawnAt } (validated against the vocabulary, so the PDF reflects the
// sandbox's current set asides and withdrawals). Nothing is stored.
import { buildDemoApplicants, DEMO_LISTINGS, DEMO_PROFILE } from './demoFixture';
import { fitFor } from './fitScore';
import { rankApplicants, landlordVerification } from './listingReportData';
import { DECISION_STATUS_VALUES } from './listingApplicantsVocabulary';
import { buildSnapshot } from './reportSnapshot';
import { reportText } from './reportText';

export function demoReportContext(listingId, decisionsJson) {
  const listing = DEMO_LISTINGS.find((l) => l.id === String(listingId || ''));
  if (!listing) return null;
  let decisions = {};
  try { decisions = JSON.parse(decisionsJson || '{}') || {}; } catch (e) { decisions = {}; }
  // Every applicant gets its Fit (the sort and the reason lines read it), whether or not the
  // sandbox passed a decision for them.
  const applicants = (buildDemoApplicants()[listing.id] || []).map((a) => {
    const d = decisions[a.linkId];
    const status = d && typeof d === 'object' && DECISION_STATUS_VALUES.includes(d.status) ? d.status : a.decisionStatus;
    const withdrawnAt = d && typeof d === 'object' && typeof d.withdrawnAt === 'string' && d.withdrawnAt ? d.withdrawnAt : null;
    const row = { ...a, decisionStatus: status, withdrawnAt };
    return { ...row, application: { ...row.application, fit: fitFor(row, listing) } };
  });
  const { active, setAside } = rankApplicants(applicants);
  return { listing, profile: DEMO_PROFILE, active, setAside };
}

export function demoVerificationContext(linkId) {
  const by = buildDemoApplicants();
  for (const listingId of Object.keys(by)) {
    const a = by[listingId].find((x) => x.linkId === String(linkId || ''));
    if (a) return { listing: DEMO_LISTINGS.find((l) => l.id === listingId), profile: DEMO_PROFILE, applicantName: a.application.full_name, verification: landlordVerification(a.docVerifications) };
  }
  return null;
}

// The sandbox's frozen report: the same builder the real send uses, over the fixture. The
// sandbox token is DEMO-{listingId}; answers and opens live in the browser (lib/demoAdapter.js).
export function demoSnapshot(listingId, decisionsJson = '{}') {
  const ctx = demoReportContext(listingId, decisionsJson);
  if (!ctx) return null;
  return buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: ctx.profile });
}

// The paste ready text: the same template over the same payload, with the sandbox page link.
export function demoReportText(ctx) {
  const payload = buildSnapshot({ listing: ctx.listing, applicants: ctx.active, profile: ctx.profile });
  return reportText(payload, { pageUrl: `https://rentletter.ca/r/DEMO-${ctx.listing.id}` });
}
