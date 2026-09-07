// lib/referenceQuestions.js  PURE, shared by the answer page, the answer route, the checklist
// and the sandbox. The six questions a previous landlord answers, fixed text, closed options,
// about the tenancy only. Every question has Prefer not to say. No free text anywhere.
// OHRC and BC Code: nothing here touches a protected ground; the answers never move Fit.
export const PNS = 'pns';
export const QUESTIONS = Object.freeze([
  { key: 'rented', text: (first) => `Did ${first} rent from you?`, options: [['yes', 'Yes'], ['no', 'No'], [PNS, 'Prefer not to say']] },
  { key: 'when', text: () => 'Roughly when?', kind: 'range', options: [[PNS, 'Prefer not to say']] },
  { key: 'rentOnTime', text: () => 'Was rent paid on time?', options: [['always', 'Always'], ['mostly', 'Mostly'], ['often_late', 'Often late'], [PNS, 'Prefer not to say']] },
  { key: 'damage', text: () => 'Any damage beyond normal wear?', options: [['none', 'None'], ['minor', 'Minor'], ['significant', 'Significant'], [PNS, 'Prefer not to say']] },
  { key: 'notice', text: () => 'Was proper notice given when they left?', options: [['yes', 'Yes'], ['no', 'No'], ['still_there', 'Still living there'], [PNS, 'Prefer not to say']] },
  { key: 'again', text: () => 'Would you rent to them again?', options: [['yes', 'Yes'], ['no', 'No'], [PNS, 'Prefer not to say']] },
]);
export const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
export const REQUEST_DAYS = 14;
export const RESEND_AFTER_DAYS = 5;

// Question 1 answered No hides 2 to 6: the response is "not their tenant".
export const visibleQuestions = (answers) => ((answers || {}).rented === 'no' ? QUESTIONS.slice(0, 1) : QUESTIONS);
export const isNotTheirTenant = (answers) => !!answers && answers.rented === 'no';

const monthOk = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const yearOk = (y, now) => Number.isInteger(y) && y >= now.getFullYear() - 40 && y <= now.getFullYear() + 1;
const point = (p, now) => (p && monthOk(Number(p.m)) && yearOk(Number(p.y), now) ? { m: Number(p.m), y: Number(p.y) } : null);

// The closed answer set from whatever the client sent: unknown values are refused (null), a
// missing question reads as Prefer not to say. A No on question 1 keeps only that answer.
export function normalizeAnswers(input, { now = new Date() } = {}) {
  const a = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const q of QUESTIONS) {
    const v = a[q.key];
    if (q.kind === 'range') {
      if (v == null || v === PNS) { out.when = PNS; continue; }
      if (typeof v !== 'object') return null;
      const from = point(v.from, now), to = point(v.to, now);
      if (!from && !to) { out.when = PNS; continue; }
      out.when = { from, to };
      continue;
    }
    if (v == null) { out[q.key] = PNS; continue; }
    if (!q.options.some(([code]) => code === v)) return null;
    out[q.key] = v;
  }
  if (out.rented === 'no') return { rented: 'no', notTheirTenant: true };
  return out;
}

const label = (q, code) => (q.options.find(([c]) => c === code) || [])[1] || null;
const whenText = (w) => {
  if (!w || w === PNS) return 'no answer';
  const f = w.from ? `${MONTHS[w.from.m - 1]} ${w.from.y}` : null, t = w.to ? `${MONTHS[w.to.m - 1]} ${w.to.y}` : null;
  return f && t ? `${f} to ${t}` : f ? `from ${f}` : t ? `to ${t}` : 'no answer';
};
// The compact line on the checklist. Prefer not to say reads "no answer"; a No on question 1
// reads "Not their tenant".
export function answerSummary(answers) {
  if (!answers || typeof answers !== 'object') return null;
  if (isNotTheirTenant(answers)) return 'Not their tenant';
  const pick = (key) => { const q = QUESTIONS.find((x) => x.key === key); const v = answers[key]; return v == null || v === PNS ? 'no answer' : label(q, v) || 'no answer'; };
  return [`Rented from them: ${pick('rented')}`, `When: ${whenText(answers.when)}`, `Rent on time: ${pick('rentOnTime')}`, `Damage: ${pick('damage')}`, `Notice: ${pick('notice')}`, `Would rent again: ${pick('again')}`].join(' · ');
}
export const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
export const emailIn = (raw) => (String(raw || '').match(/[^\s@·,;|]+@[^\s@·,;|]+\.[^\s@·,;|]+/) || [null])[0];

// The email to the previous landlord, in the realtor's voice. The tenant is never emailed.
export const referenceFrom = (realtorName) => `${realtorName || 'Your realtor'} via Rentletter <hello@rentletter.ca>`;
export function referenceEmail({ applicantName, realtorName, brokerage, answerUrl }) {
  const parts = String(applicantName || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || 'The applicant', last = parts.length > 1 ? parts[parts.length - 1] : '';
  const who = realtorName || 'Your realtor';
  const subject = `A quick reference for ${first}${last ? ` ${last[0]}.` : '.'}`;
  const lines = [
    `${first}${last ? ` ${last}` : ''} listed you as their previous landlord and gave me your email. Six quick questions, two minutes, one tap each.`,
    `Nothing else is asked and nothing is shared with ${first}.`,
  ];
  const signoff = brokerage ? `${who}, ${brokerage}` : who;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const text = `Hi,\n\n${lines.join('\n')}\n\nAnswer the six questions: ${answerUrl}\n\n${signoff}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">Hi,</p>
        ${lines.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        <p style="margin:20px 0 0;"><a href="${answerUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:8px;font-weight:700;">Answer the six questions</a></p>
        <p style="margin:20px 0 0;">${esc(signoff)}</p>
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">Sent through Rentletter on behalf of ${esc(who)}.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, lines, signoff, greeting: 'Hi,' };
}
