// lib/reportSentence.js  PURE. One sentence per applicant on the landlord page, the PDF and the
// text, built from facts only, each clause dropped when its fact is missing:
//   "{job title} at {employer}, {tenure}. Income covers the rent at {ratio}%. Landlord reference on file."
// No free text from anyone enters here.
export function reportSentence({ jobTitle, employer, yearsAtJob, rentSharePct, landlordReference } = {}) {
  const role = [String(jobTitle || '').trim(), String(employer || '').trim()].filter(Boolean).join(' at ');
  const years = Number(yearsAtJob);
  const tenure = Number.isFinite(years) && years > 0 ? `${Number.isInteger(years) ? years : years.toFixed(1)} year${years === 1 ? '' : 's'} at the job` : '';
  const out = [];
  const first = [role, tenure].filter(Boolean).join(', ');
  if (first) out.push(`${first}.`);
  const ratio = Number(rentSharePct);
  if (Number.isFinite(ratio) && ratio > 0) out.push(`Income covers the rent at ${Math.round(ratio)}%.`);
  if (landlordReference) out.push('Landlord reference on file.');
  return out.join(' ');
}
