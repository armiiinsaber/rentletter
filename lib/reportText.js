// lib/reportText.js  PURE. The paste ready message for the landlord, a template over the frozen
// payload (lib/reportSnapshot.js): greeting, one line per applicant (rank, name, Fit and word,
// the sentence), the page link, the sign off. No model call, no dash characters.
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
  out.push(`${n} applicant${n === 1 ? '' : 's'} for ${l.address || l.name || 'the unit'}, best fit first${verified ? `, ${verified} verified` : ''}.`);
  out.push('');
  for (const a of p.applicants || []) {
    const fit = a.fit && a.fit.score != null ? `Fit ${Number(a.fit.score).toFixed(1)} (${String(a.fit.label || '').toUpperCase()})` : 'Rent share unknown';
    out.push(`${a.rank}. ${a.name}, ${fit}.${a.sentence ? ` ${a.sentence}` : ''}`);
  }
  out.push('');
  if (pageUrl) { out.push(`Open the report to see them and tell me who you would like to meet: ${pageUrl}`); out.push(''); }
  out.push(r.name || 'Your realtor');
  const sig = [r.brokerage, r.phone].filter(Boolean).join(' · ');
  if (sig) out.push(sig);
  return out.join('\n');
}
