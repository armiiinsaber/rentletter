// lib/demoReport.js — SERVER. Builds the demo dashboard's report context from lib/demoFixture.js.
// No auth, no database, no user input beyond a fixture listing id and a map of fixture
// linkId to { status, withdrawnAt } (validated against the vocabulary, so the PDF reflects the
// sandbox's current set asides and withdrawals). Nothing is stored.
import { buildDemoApplicants, DEMO_LISTINGS, DEMO_PROFILE } from './demoFixture';
import { rankApplicants, landlordVerification } from './listingReportData';
import { DECISION_STATUS_VALUES, isFinalist } from './listingApplicantsVocabulary';

export function demoReportContext(listingId, decisionsJson) {
  const listing = DEMO_LISTINGS.find((l) => l.id === String(listingId || ''));
  if (!listing) return null;
  let decisions = {};
  try { decisions = JSON.parse(decisionsJson || '{}') || {}; } catch (e) { decisions = {}; }
  const applicants = (buildDemoApplicants()[listing.id] || []).map((a) => {
    const d = decisions[a.linkId];
    if (!d || typeof d !== 'object') return a;
    const status = DECISION_STATUS_VALUES.includes(d.status) ? d.status : a.decisionStatus;
    const withdrawnAt = typeof d.withdrawnAt === 'string' && d.withdrawnAt ? d.withdrawnAt : null;
    return { ...a, decisionStatus: status, withdrawnAt };
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

// Deterministic paste-ready text (the real route composes this with Claude; the sandbox
// must not spend AI calls on fixture data). Screenable facts only.
export function demoReportText(ctx) {
  const RULE = '—'.repeat(28);
  const money = (n) => (n ? `$${Number(n).toLocaleString('en-CA')}` : '—');
  const out = [`SHORTLIST — ${String(ctx.listing.name || ctx.listing.address).toUpperCase()}`, `${money(ctx.listing.monthly_rent)}/mo · ${ctx.active.length + ctx.setAside.length} applicants reviewed`, '', RULE, ''];
  ctx.active.forEach((row, i) => {
    const a = row.application || {};
    out.push(`${i + 1}. ${a.full_name}${isFinalist(row) ? '  ★ finalist' : ''}`);
    out.push(`   ${[a.job_title, a.employer].filter(Boolean).join(' at ')}${a.employment_type ? ` (${a.employment_type.replace('-', ' ')})` : ''}`);
    out.push(`   Income ${money(a.annual_income)} gross${a.net_income ? ` · ~${money(a.net_income)} after tax (${a.net_income_source || 'estimated'})` : ''} · rent ${a.rent_to_income_ratio}% of income`);
    out.push(`   ${a.years_at_job || '—'} yrs at job · moving ${a.move_in_date || '—'}`);
    out.push('');
  });
  if (ctx.setAside.length) { out.push(RULE); out.push(''); out.push(`Set aside: ${ctx.setAside.map((r) => r.application?.full_name).join(', ')}`); out.push(''); }
  out.push(RULE); out.push('');
  out.push('Ranking reflects stated income, tenure and references only. Run credit checks wherever you already do.');
  out.push([ctx.profile.full_name, ctx.profile.brokerage].filter(Boolean).join(' · '));
  return out.join('\n');
}
