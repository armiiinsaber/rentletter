// lib/reportText.js  PURE. The paste ready message for the landlord, a template over the frozen
// payload (lib/reportSnapshot.js): greeting, one line per applicant (rank, name, Fit and word,
// the sentence), the page link, the sign off. No model call, no dash characters.
import { displayAddress } from './listingAddress.js';
import { fitLine, fitLines } from './fitScore.js';
export function reportText(payload, { pageUrl = null } = {}) {
  const p = payload || {};
  const l = p.listing || {};
  const r = p.realtor || {};
  const first = String(l.landlordName || '').trim().split(/\s+/)[0];
  const n = (p.applicants || []).length;
  const verified = p.counts ? p.counts.verified : 0;
  const out = [];
  out.push(`Hi ${first || 'there'},`);
  out.push('');
  out.push(`${n} applicant${n === 1 ? '' : 's'} for ${displayAddress(l, 'the unit')}, best fit first${verified ? `, ${verified} verified` : ''}.`);
  out.push('');
  for (const a of p.applicants || []) {
    const fit = a.fit && a.fit.score != null ? `${fitLine(a.fit)} (${String(a.fit.label || '').toUpperCase()})` : a.fit && a.fit.incomplete ? fitLine(a.fit) : 'Rent share unknown';
    out.push(`${a.rank}. ${a.name}, ${fit}.${a.sentence ? ` ${a.sentence}` : ''}`);
    // Fit v2 (docs/fit-v2.md): the coverage line and the basis line, as on the page.
    for (const line of fitLines(a.fit).slice(1)) out.push(`   ${line}`);
    // The same rows as the page, in plain text: met ✓, missed •, unverified blank.
    for (const c of Array.isArray(a.criteria) ? a.criteria : []) out.push(`   ${c.status === 'met' ? '✓' : c.status === 'missed' ? '•' : ' '} ${c.text}`);
    // Credit (lib/creditShared.js), in the same words as the page.
    if (a.credit) out.push(`   Credit: ${a.credit.shared ? `${a.credit.label}, ${(a.credit.lines || []).join(', ')}` : a.credit.label}`);
    // The people on the application (lib/parties.js), in the same words as the page.
    for (const p of Array.isArray(a.parties) ? a.parties : []) out.push(`   ${p.name}, ${String(p.roleLabel).toLowerCase()}, ${String(p.statusLabel).toLowerCase()}${(p.facts || []).length ? `: ${p.facts.join(', ')}` : ''}`);
    if (Array.isArray(a.parties) && a.parties.length) out.push('   Household income is shown, not scored.');
  }
  out.push('');
  if (l.fitLine) { out.push(l.fitLine); out.push(''); }
  if (pageUrl) { out.push(`Open the report to see them and tell me who you would like to meet: ${pageUrl}`); out.push(''); }
  out.push(r.name || 'Your realtor');
  const sig = [r.brokerage, r.phone].filter(Boolean).join(' · ');
  if (sig) out.push(sig);
  return out.join('\n');
}
