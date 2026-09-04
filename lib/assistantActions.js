// lib/assistantActions.js
// THE ACTION REGISTRY for the dashboard assistant (Layer 2). ISOMORPHIC: the server uses the
// names/params to validate an intent; the browser uses describe() + execute().
//
// STRUCTURAL GUARDRAIL — what is NOT here, by design:
//   • no action selects, recommends, ranks, compares or scores a tenant (the realtor decides;
//     "finalist" below records the realtor's OWN stated decision and only fires on confirm);
//   • nothing touching protected grounds (OHRC / BC Code) — preferences are the existing
//     screenable pref_* columns only, whitelisted below;
//   • nothing destructive (no delete listing/application, no withdraw/set-aside). Those stay manual.
// The assistant can only do what the realtor could click: every execute() hits an EXISTING
// realtor-authenticated route or the realtor's own Supabase session (RLS). No service role.
// EVERY action is proposed, shown as a confirmation card (describe), and fires only on confirm.

// Preferences the assistant may change. Screenable facts only. Never add anything else.
export const PREF_FIELDS = {
  pref_min_annual_income: { label: 'Minimum annual income', type: 'number', fmt: (v) => `$${Number(v).toLocaleString('en-CA')}` },
  pref_rent_to_income_max_pct: { label: 'Maximum rent to income', type: 'number', fmt: (v) => `${v}%` },
  pref_min_years_at_job: { label: 'Minimum years at job', type: 'number', fmt: (v) => `${v}` },
  pref_requires_landlord_reference: { label: 'Landlord reference required', type: 'boolean', fmt: (v) => (v ? 'yes' : 'no') },
  pref_requires_employer_verification: { label: 'Employer verification required', type: 'boolean', fmt: (v) => (v ? 'yes' : 'no') },
};

// Transport comes from the dashboard adapter on ctx (lib/dashboardAdapter): the real one is
// window.fetch + the realtor's Supabase session; the demo routes the same calls into a fixture.
const xfetch = (ctx, url, init) => (ctx?.adapter?.fetch ? ctx.adapter.fetch(url, init) : fetch(url, init));
const post = async (ctx, url, body) => { const r = await xfetch(ctx, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || 'Request failed.'); return j; };
import { DECISION_PRIORITY } from './listingApplicantsVocabulary';
const listingOf = (ctx, id) => (ctx.listings || []).find((l) => l.id === id);
const applicantOf = (ctx, linkId) => (ctx.applicants || []).find((a) => a.linkId === linkId);
const lname = (l) => l?.name || l?.address || 'this listing';

export const ACTIONS = {
  create_invite_link: {
    label: 'Create an applicant invite link',
    params: { listingId: 'listing' },
    prompt: 'create/get/regenerate the tenant application invite link for a listing',
    describe: (ctx, p) => ({ title: `Create the invite link for ${lname(listingOf(ctx, p.listingId))}`, lines: ['Generates (or returns) the listing scoped link tenants use to apply.', 'Nothing is sent to anyone.'], confirm: 'Create link' }),
    execute: async (ctx, p) => { const j = await post(ctx, '/api/listings/invite', { listingId: p.listingId }); return { text: `Invite link ready: ${j.url || j.inviteUrl || '(see listing page)'}`, url: j.url || j.inviteUrl }; },
  },
  request_documents: {
    label: 'Request documents from an applicant',
    params: { listingId: 'listing', linkId: 'applicant' },
    prompt: 'send an applicant a secure document upload request (pay stubs, employment letter, credit report) by email',
    describe: (ctx, p) => { const a = applicantOf(ctx, p.linkId); return { title: `Email ${a?.name || 'the applicant'} a document request`, lines: [`To: ${a?.email || 'the email on their application'}`, `Subject: Documents for ${lname(listingOf(ctx, p.listingId))}`, 'A secure upload link, valid 7 days. Files are analyzed, then held for your review for 14 days or until you delete them.'], confirm: 'Send request' }; },
    execute: async (ctx, p) => { const a = applicantOf(ctx, p.linkId); const j = await post(ctx, '/api/applicants/request-documents', { listingId: p.listingId, linkId: p.linkId, applicationId: a?.applicationId, sendEmail: true }); return { text: j.emailed ? `Sent to ${j.tenantEmail || a?.name || 'the applicant'}.` : `Request created${j.url ? `, link: ${j.url}` : ''}. ${j.emailError || 'Email not sent; share the link from the listing page.'}` }; },
  },
  generate_report: {
    label: 'Generate the landlord report (PDF)',
    params: { listingId: 'listing' },
    prompt: 'generate/download the co branded landlord shortlist report PDF for a listing',
    describe: (ctx, p) => ({ title: `Generate the landlord report for ${lname(listingOf(ctx, p.listingId))}`, lines: ['Builds the co branded shortlist PDF with your branding and downloads it here.', 'Nothing is emailed.'], confirm: 'Generate PDF' }),
    execute: async (ctx, p) => { const r = await xfetch(ctx, `/api/listings/report-pdf?listingId=${encodeURIComponent(p.listingId)}`); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || 'Could not generate the PDF.'); } const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `rentletter-report-${(lname(listingOf(ctx, p.listingId))).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); return { text: 'Report downloaded.' }; },
  },
  email_report: {
    label: 'Email the landlord report',
    params: { listingId: 'listing' },
    prompt: 'email the landlord shortlist report to the landlord on file for a listing',
    describe: (ctx, p) => { const l = listingOf(ctx, p.listingId); return { title: `Email the shortlist report to ${l?.landlord_name || l?.landlord_email || 'the landlord'}`, lines: [`To: ${l?.landlord_email || 'no landlord email on this listing'}`, `Subject: Your shortlist for ${lname(l)}`, `Reply to: you. The PDF attaches with your branding.`], confirm: 'Send email', blocked: !l?.landlord_email ? 'This listing has no landlord email. Add it in the listing settings first.' : null }; },
    execute: async (ctx, p) => { const j = await post(ctx, '/api/listings/send-report', { listingId: p.listingId }); return { text: j.preview ? `Demo: nothing sent. In the product this goes to ${j.sentTo}.` : `Sent to ${j.sentTo}.` }; },
  },
  mark_finalist: {
    label: 'Mark an applicant as a finalist',
    params: { listingId: 'listing', linkId: 'applicant', finalist: 'boolean' },
    prompt: 'mark or unmark an applicant as a finalist (a label the realtor applies; only when the realtor states it themselves)',
    describe: (ctx, p) => { const a = applicantOf(ctx, p.linkId); return { title: `${p.finalist === false ? 'Remove the finalist mark from' : 'Mark'} ${a?.name || 'the applicant'}${p.finalist === false ? '' : ' as a finalist'}`, lines: ['A label on your listing only, nothing is sent to the applicant or landlord.', 'This records your decision; Rentletter does not suggest finalists.'], confirm: p.finalist === false ? 'Remove mark' : 'Mark finalist' }; },
    execute: async (ctx, p) => { await post(ctx, '/api/applicants/decision', { linkId: p.linkId, priority: p.finalist === false ? DECISION_PRIORITY.NORMAL : DECISION_PRIORITY.TOP }); return { text: p.finalist === false ? 'Finalist mark removed.' : 'Marked as a finalist.' }; },
  },
  refer_applicant: {
    label: 'Refer an applicant to another realtor',
    params: { listingId: 'listing', linkId: 'applicant', toName: 'string', toEmail: 'email', note: 'string?' },
    prompt: 'refer/pass an applicant to another realtor by name and email (the applicant must consent by email first)',
    describe: (ctx, p) => { const a = applicantOf(ctx, p.linkId); return { title: `Ask ${a?.name || 'the applicant'} to approve a referral to ${p.toName}`, lines: [`To the applicant: ${a?.email || 'their email'}, a consent request`, `Receiving realtor: ${p.toName} <${p.toEmail}>`, p.note ? `Your note: “${p.note}”` : 'No note.', 'Nothing is shared with the other realtor until the applicant approves.'], confirm: 'Send consent request' }; },
    execute: async (ctx, p) => { const j = await post(ctx, '/api/referrals/create', { listingId: p.listingId, linkId: p.linkId, toName: p.toName, toEmail: p.toEmail, note: p.note || '' }); return { text: `Consent request sent. You’ll see “Pending applicant approval” on the card until they answer.`, referral: j.referral }; },
  },
  update_preferences: {
    label: 'Change a listing’s screening preferences',
    params: { listingId: 'listing', patch: 'prefs' },
    prompt: 'change a listing\'s screening preferences: minimum income, max rent to income %, min years at job, min lease term, max occupants, landlord reference required, employer verification required, guarantor accepted',
    describe: (ctx, p) => ({ title: `Update preferences on ${lname(listingOf(ctx, p.listingId))}`, lines: Object.entries(p.patch || {}).map(([k, v]) => `${PREF_FIELDS[k]?.label || k}: ${PREF_FIELDS[k]?.fmt ? PREF_FIELDS[k].fmt(v) : v}`), confirm: 'Save preferences', blocked: Object.keys(p.patch || {}).length ? null : 'No recognised preference in that request.' }),
    execute: async (ctx, p) => { await post(ctx, '/api/listings/update', { listingId: p.listingId, ...p.patch }); return { text: 'Preferences saved.' }; },
  },
};

// ── server-side validation of a model-proposed intent against the registry + context ───────
export function validateIntent(intent, ctx) {
  if (!intent || typeof intent !== 'object') return null;
  const def = ACTIONS[intent.action]; if (!def) return null;
  const p = intent.params || {}; const out = {};
  const listingIds = new Set((ctx.listings || []).map((l) => l.id)); const linkIds = new Set((ctx.applicants || []).map((a) => a.linkId));
  for (const [k, t] of Object.entries(def.params)) {
    const v = p[k];
    if (t === 'listing') { if (!listingIds.has(v)) return { missing: 'listing' }; out[k] = v; }
    else if (t === 'applicant') { if (!linkIds.has(v)) return { missing: 'applicant' }; out[k] = v; }
    else if (t === 'boolean') out[k] = v === false ? false : true;
    else if (t === 'email') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''))) return { missing: k }; out[k] = String(v).trim().toLowerCase(); }
    else if (t === 'string') { if (!String(v || '').trim()) return { missing: k }; out[k] = String(v).trim().slice(0, 400); }
    else if (t === 'string?') out[k] = v ? String(v).trim().slice(0, 400) : '';
    else if (t === 'prefs') {
      const patch = {};
      for (const [pk, pv] of Object.entries(v || {})) { const f = PREF_FIELDS[pk]; if (!f) continue; if (f.type === 'number') { const n = Number(String(pv).replace(/[^\d.]/g, '')); if (Number.isFinite(n) && n >= 0) patch[pk] = n; } else patch[pk] = !!pv; }
      if (!Object.keys(patch).length) return { missing: 'prefs' }; out[k] = patch;
    }
  }
  return { action: intent.action, params: out };
}

// Compact registry text for the intent prompt.
export function registryPrompt() {
  return Object.entries(ACTIONS).map(([k, d]) => `- ${k}: ${d.prompt}. params: ${Object.entries(d.params).map(([n, t]) => `${n} (${t})`).join(', ')}`).join('\n');
}
