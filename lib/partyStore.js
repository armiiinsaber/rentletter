// lib/partyStore.js  SERVER ONLY (takes the service role client). The rows, the tokens and the
// emails behind the parties on an application (lib/parties.js, db/002 and db/008).
//
//   partiesFor(admin, applicationIds)         -> { byApplication: Map<applicationId, row[]>, incomes, absent }
//   partyByToken(admin, token)                -> row | null
//   insertParty(admin, { applicationId, role, name, email })  -> { party, absent }
//   updateParty(admin, id, patch)             -> error | null
//   writeIncomeSources(admin, partyId, sources)
//   partyRecipients(admin, applicationId)     -> [{ partyId, name, email, url, role }] for the tenant facing emails
//   inviteEmail, declinedEmail, withdrawnEmail  pure
//   partyUrl(token)                           the party's own page, the only URL their token enters
// The party token is minted here and read here; it never reaches the realtor's browser.
import { newOwnerToken } from './applicationIds.js';
import { PARTY_STATUS, ROLE_LABEL, GUARANTOR_SENTENCE } from './parties.js';
import { PARTY_ROLE } from './application-state.js';

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
export const partyUrl = (token, site = siteBase()) => `${site}/party/${encodeURIComponent(token)}`;
export const isPartyToken = (t) => /^[A-Z2-9]{32}$/.test(String(t || '').trim().toUpperCase());
export const newPartyToken = () => newOwnerToken();

const msg = (e) => String((e && e.message) || '');
// The table or the invite columns are not there yet (db/002, then db/008).
export const partiesAbsent = (error) => !!error && (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || error.code === 'PGRST204' || /application_parties|party_token|schema cache/i.test(msg(error)));

export async function partiesFor(admin, applicationIds) {
  const ids = [...new Set((applicationIds || []).filter(Boolean).map(String))];
  const byApplication = new Map();
  if (!admin || !ids.length) return { byApplication, incomes: [], absent: false };
  const { data, error } = await admin.from('application_parties').select('*').in('application_id', ids);
  if (error) { if (partiesAbsent(error)) return { byApplication, incomes: [], absent: true }; throw error; }
  const rows = (data || []).filter((r) => r && r.role !== PARTY_ROLE.PRIMARY && r.role !== PARTY_ROLE.OCCUPANT).sort((a, b) => String(a.invited_at || a.created_at || '').localeCompare(String(b.invited_at || b.created_at || '')));
  for (const r of rows) { const k = String(r.application_id); if (!byApplication.has(k)) byApplication.set(k, []); byApplication.get(k).push(r); }
  let incomes = [];
  if (rows.length) {
    const { data: inc, error: iErr } = await admin.from('income_sources').select('*').in('application_party_id', rows.map((r) => r.id));
    if (iErr) { if (!partiesAbsent(iErr)) throw iErr; } else incomes = inc || [];
  }
  return { byApplication, incomes, absent: false };
}

export async function partyByToken(admin, token) {
  if (!admin || !isPartyToken(token)) return null;
  const { data, error } = await admin.from('application_parties').select('*').eq('party_token', String(token).trim().toUpperCase()).maybeSingle();
  if (error) { if (partiesAbsent(error)) return null; throw error; }
  return data || null;
}

export async function insertParty(admin, { applicationId, role, name, email }) {
  const row = { application_id: applicationId, role, full_name: String(name || '').trim().slice(0, 120), email: String(email || '').trim().toLowerCase().slice(0, 200), party_token: newPartyToken(), status: PARTY_STATUS.INVITED, invited_at: new Date().toISOString() };
  const { data, error } = await admin.from('application_parties').insert(row).select('*').single();
  if (error) { if (partiesAbsent(error)) return { party: null, absent: true }; throw error; }
  return { party: data, absent: false };
}

export async function updateParty(admin, id, patch) {
  const { error } = await admin.from('application_parties').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  return error || null;
}

// One row per income amount: the party's rows are replaced in full on every submit.
export async function writeIncomeSources(admin, partyId, sources) {
  const { error: delErr } = await admin.from('income_sources').delete().eq('application_party_id', partyId);
  if (delErr && !partiesAbsent(delErr)) throw delErr;
  const rows = (sources || []).filter((s) => s && Number.isFinite(Number(s.amount)) && Number(s.amount) >= 0).map((s) => ({ application_party_id: partyId, kind: s.kind, payer: s.payer ? String(s.payer).slice(0, 160) : null, annual_amount: Math.round(Number(s.amount)) }));
  if (!rows.length) return null;
  const { error } = await admin.from('income_sources').insert(rows);
  return error && !partiesAbsent(error) ? error : null;
}

// Everyone on the application who should receive what the primary receives: the parties still
// standing (invited, in progress, submitted) with an email. Each with their own page.
export async function partyRecipients(admin, applicationId) {
  const { byApplication } = await partiesFor(admin, [applicationId]);
  const rows = byApplication.get(String(applicationId)) || [];
  return rows
    .filter((p) => [PARTY_STATUS.INVITED, PARTY_STATUS.IN_PROGRESS, PARTY_STATUS.SUBMITTED].includes(p.status) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email || '').trim()))
    .map((p) => ({ partyId: p.id, role: p.role, name: p.full_name || ROLE_LABEL[p.role], email: String(p.email).trim().toLowerCase(), url: p.party_token ? partyUrl(p.party_token) : null }));
}

// ── The emails. Pure. In the primary's name for the invite, neutral throughout. ──
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function shell({ subject, greeting, lines, cta, foot }) {
  const text = `${greeting}\n\n${lines.join('\n\n')}\n\n${cta ? `${cta.label}: ${cta.url}\n\n` : ''}${foot}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf8f3;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#0f0f10;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e3ddd0;border-radius:12px;">
      <tr><td style="padding:24px;font-size:16px;line-height:1.5;">
        <p style="margin:0 0 12px;">${esc(greeting)}</p>
        ${lines.map((l) => `<p style="margin:0 0 12px;">${esc(l)}</p>`).join('')}
        ${cta ? `<p style="margin:20px 0 0;"><a href="${cta.url}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;background:#d72027;color:#faf8f3;text-decoration:none;border-radius:999px;font-weight:700;">${esc(cta.label)}</a></p>` : ''}
        <p style="margin:20px 0 0;font-size:12px;color:#86868b;">${esc(foot)}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html, lines };
}
export const partyFrom = () => 'Rentletter <hello@rentletter.ca>';
const firstOf = (name) => String(name || '').trim().split(/\s+/)[0];

// To the invited person: who asked, for which unit, what the form is, how to decline.
export function inviteEmail({ role, partyName, primaryName, listingName, realtorName, url }) {
  const unit = listingName || 'a rental';
  const who = primaryName || 'Someone';
  const first = firstOf(partyName);
  const roleLine = role === PARTY_ROLE.GUARANTOR
    ? `${who} named you as guarantor on their rental application for ${unit}. ${GUARANTOR_SENTENCE}`
    : `${who} is applying for ${unit} and named you as a co applicant.`;
  return shell({
    subject: `${unit}: ${who} is applying with you`,
    greeting: first ? `Hi ${first},` : 'Hi,',
    lines: [roleLine, `The form takes a few minutes: your details, your employment and income, then your own documents. ${realtorName || 'The listing realtor'} sees what you send beside the application; ${who} does not.`, `Not for you? Open the link and choose Decline. ${who} is told and can invite someone else.`],
    cta: { label: 'Open my form', url },
    foot: 'Sent through Rentletter. This link is private to you.',
  });
}
// To the primary: a party declined or withdrew, and they can invite someone else.
export function partyLeftEmail({ action, partyName, role, listingName, url }) {
  const unit = listingName || 'your rental application';
  const verb = action === 'withdrawn' ? 'withdrew from' : 'declined';
  return shell({
    subject: `${unit}: ${partyName || ROLE_LABEL[role] || 'Someone'} ${verb}`,
    greeting: 'Hi,',
    lines: [`${partyName || ROLE_LABEL[role] || 'The person you invited'} ${verb} your application for ${unit}${action === 'withdrawn' ? '' : ' before filling their form'}.`, 'You can invite someone else from your application page.'],
    cta: url ? { label: 'Open my application', url } : null,
    foot: 'Sent through Rentletter. This link is private to you.',
  });
}
