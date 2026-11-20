// lib/tenantVaultRules.js  PURE, isomorphic. The rules of the tenant's vault
// (docs/design/profile-and-circle.md sections 4.2, 4.3 and 7.1; db/018-profile-vault.sql):
// what kind a document is, how long each kind is kept, which may be renewed, and which facts a
// read of it may record. Nothing here reads a database, the clock of a server, or the network.
//
//   ID image                      14 days from upload, never renewed
//   income and employment files   90 days from upload, renewable by the tenant for 90 days more
//   a credit report               never stored in the profile
//   a fact read from a document   kept until the tenant removes it, or until the profile has been
//                                 idle for 12 months
//
// The facts a read may record are the closed list of lib/profileFacts.js PROFILE_CHECK_KINDS.
// One of the five, identity_document_current, is not read yet: the document reader
// (lib/applicantAnalysis.js) takes the name from an ID and nothing else, by design, so no expiry
// date is ever extracted from one. No date of birth, age, photo, ID number, status in Canada,
// type of income or anything about a family is a kind, and none is read.
import { kindOf } from './documentAuthority.js';
import { incomeComparison, nameOnDocMatches, employerTextStatus } from './documentAuthority.js';
import { monthKey } from './creditShared.js';
import { PROFILE_CHECK_KINDS } from './profileFacts.js';

export const VAULT_BUCKET = 'tenant-vault';
export const VAULT_KINDS = Object.freeze(['id', 'income', 'employment', 'other']);
export const VAULT_MIME = Object.freeze(['image/jpeg', 'image/png', 'application/pdf']);
export const VAULT_EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' });
export const VAULT_MAX_BYTES = 4 * 1024 * 1024; // one file a request, under the platform's body cap
export const VAULT_MAX_DOCUMENTS = 12;
export const ID_DAYS = 14;
export const DOCUMENT_DAYS = 90;
export const IDLE_MONTHS = 12;
export const TOMBSTONE_DAYS = 30;
export const DAY_MS = 24 * 3600 * 1000;

// TENANT_VAULT_ENABLED: on unless it is exactly false. Off stores nothing new; what is already
// stored stays, can still be deleted by the tenant, and still expires on time.
export const vaultEnabled = (env = process.env) => String((env && env.TENANT_VAULT_ENABLED) ?? '').trim().toLowerCase() !== 'false';

// The vault's kind for a document the reader described, or the reason it cannot be kept.
//   { kind } | { refused: 'credit' | 'unrecognized' }
export function vaultKindOf(doc) {
  const k = kindOf(doc);
  if (k === 'credit report') return { refused: 'credit' };
  if (!doc || doc.unrecognized === true || k === 'other') return { refused: 'unrecognized' };
  if (k === 'government ID') return { kind: 'id' };
  if (k === 'employment letter') return { kind: 'employment' };
  if (k === 'pay stub' || k === 'tax slip') return { kind: 'income' };
  return { kind: 'other' }; // a bank statement: kept for the tenant, no fact read from it
}
export const REFUSALS = Object.freeze({
  credit: 'A credit report is never kept in your profile. Share one with a realtor when a listing asks for it.',
  unrecognized: 'We could not tell what this document is, so it was not kept. Add your ID, a pay stub or an employment letter.',
});
export const KIND_LABEL = Object.freeze({ id: 'ID', income: 'Proof of income', employment: 'Employment letter', other: 'Other document' });

const iso = (t) => new Date(t).toISOString();
const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v));
export const expiryFor = (kind, uploadedAt) => iso(ms(uploadedAt) + (kind === 'id' ? ID_DAYS : DOCUMENT_DAYS) * DAY_MS);
export const canRenew = (kind) => kind === 'income' || kind === 'employment' || kind === 'other';
// A renewal keeps the file 90 days from the day it is renewed.
export const renewedExpiry = (now) => iso(ms(now) + DOCUMENT_DAYS * DAY_MS);
// A fact read for identity is fresh 12 months, the rest 90 days. A stale one is still shown, with its date.
export function freshUntil(checkKind, readAt) {
  const d = new Date(ms(readAt));
  if (/^identity_/.test(checkKind)) { d.setUTCMonth(d.getUTCMonth() + 12); return d.toISOString(); }
  return iso(d.getTime() + DOCUMENT_DAYS * DAY_MS);
}
export function idleCutoff(now) { const d = new Date(ms(now)); d.setUTCMonth(d.getUTCMonth() - IDLE_MONTHS); return d.toISOString(); }
export const tombstoneCutoff = (now) => iso(ms(now) - TOMBSTONE_DAYS * DAY_MS);
export const daysLeft = (expiresAt, now) => Math.max(0, Math.ceil((ms(expiresAt) - ms(now)) / DAY_MS));

// The facts one read document records, against what the tenant typed (facts: the profile's flat
// form). Each is { kind, value, agrees_with_typed, source_kind }; kinds outside the closed list
// are never produced. agrees_with_typed: true, false, or null when there is nothing to compare.
export function checksFromDocument(doc, vaultKind, facts = {}) {
  const ex = (doc && doc.extracted) || {};
  const f = facts || {};
  const out = [];
  const add = (kind, value, agrees) => { if (PROFILE_CHECK_KINDS.includes(kind)) out.push({ kind, value, agrees_with_typed: agrees === true ? true : agrees === false ? false : null, source_kind: vaultKind }); };
  if (vaultKind === 'id') {
    const m = nameOnDocMatches(f.fullName, ex.applicantName);
    if (m === true || m === false) add('identity_name_matches', { matches: m }, m);
    return out;
  }
  if (vaultKind === 'income' || vaultKind === 'employment') {
    const income = incomeComparison([doc], f.annualIncome);
    if (income.annual != null && income.annual > 0) add('income_annual_gross', { cents: Math.round(income.annual * 100) }, income.status === 'match' ? true : income.status === 'mismatch' ? false : null);
    const employer = typeof ex.employer === 'string' ? ex.employer.trim().slice(0, 160) : '';
    if (employer) { const s = employerTextStatus(f.employer, employer); add('employer_name', { name: employer }, s === 'match' ? true : s === 'mismatch' ? false : null); }
  }
  if (vaultKind === 'employment') {
    const month = monthKey(ex.startDate);
    if (month) add('employment_start', { month }, null);
  }
  return out;
}

// The words the tenant reads for one recorded fact.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function checkText(check) {
  const v = (check && check.value) || {};
  switch (check && check.kind) {
    case 'identity_name_matches': return { label: 'Name on ID', value: v.matches ? 'Matches your name' : 'Does not match your name' };
    case 'identity_document_current': return { label: 'ID in date', value: v.current ? 'In date' : 'Out of date' };
    case 'income_annual_gross': return { label: 'Income before tax', value: `$${Math.round(Number(v.cents || 0) / 100).toLocaleString('en-CA')} a year` };
    case 'employer_name': return { label: 'Employer', value: String(v.name || '') };
    case 'employment_start': { const m = /^(\d{4})-(\d{2})$/.exec(String(v.month || '')); return { label: 'Started', value: m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v.month || '') }; }
    default: return { label: '', value: '' };
  }
}
export const agreesText = (check) => (check && check.kind !== 'identity_name_matches' && check.agreesWithTyped === true ? 'Agrees with what you typed' : check && check.kind !== 'identity_name_matches' && check.agreesWithTyped === false ? 'Differs from what you typed' : null);
