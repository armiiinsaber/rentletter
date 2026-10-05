// lib/parties.js  PURE, isomorphic. The people on one application beside the primary: a co
// applicant or a guarantor (public.application_parties, db/002 and db/008). Each has their own
// invite, their own form, their own documents and their own standing. Nothing here feeds Fit:
// a party's income is stored and shown (income_sources), never scored, and Fit is byte identical
// with zero, one or two parties attached (tests/parties.test.mjs).
//
// OHRC and BC Code: a role on the lease is all that is asked. No relationship, no family status,
// nothing about who lives with whom. The occupant role stays in the enum and no screen offers it.
// A guarantor is a listing level setting (pref_guarantor_accepted) applied to every applicant.
//
//   PARTY_STATUS, ROLE_LABEL, STATUS_LABEL   the words every surface uses
//   partyVerificationLabel(party, confirmations)  stated | docs match | check docs | verified
//   partyFacts(party)                        the plain fact lines the realtor and the landlord read
//   clientParty(row, incomes, confirmations)  the shape the realtor's browser receives (no token)
//   canInviteRole(role, listing, parties)     whether the primary may invite that role here
import { PARTY_ROLE, INCOME_KIND } from './application-state.js';
import { readVerification } from './fitScore.js';

export const PARTY_STATUS = Object.freeze({ INVITED: 'invited', IN_PROGRESS: 'in_progress', SUBMITTED: 'submitted', DECLINED: 'declined', WITHDRAWN: 'withdrawn' });
export const PARTY_STATUSES = Object.freeze(Object.values(PARTY_STATUS));
export const ROLE_LABEL = Object.freeze({ [PARTY_ROLE.PRIMARY]: 'Primary', [PARTY_ROLE.CO_APPLICANT]: 'Co applicant', [PARTY_ROLE.GUARANTOR]: 'Guarantor', [PARTY_ROLE.OCCUPANT]: 'Occupant' });
export const STATUS_LABEL = Object.freeze({ invited: 'Invited', in_progress: 'In progress', submitted: 'Submitted', declined: 'Declined', withdrawn: 'Withdrawn' });
export const INCOME_KIND_LABEL = Object.freeze({ [INCOME_KIND.EMPLOYMENT]: 'Employment', [INCOME_KIND.SELF_EMPLOYED]: 'Self employment', [INCOME_KIND.OTHER]: 'Other' });
// The roles a primary may invite. The occupant role is never offered (the household question was
// removed; it is not coming back).
export const INVITABLE_ROLES = Object.freeze([PARTY_ROLE.CO_APPLICANT, PARTY_ROLE.GUARANTOR]);
export const MAX_PARTIES = 3;

// The words.
export const INVITE_CARD = Object.freeze({
  title: 'Applying with someone?',
  body: 'Each person gets their own email and their own short form: identity, employment and income, their own documents. You never see theirs and they never see yours.',
  addCoApplicant: 'Add a co applicant',
  addGuarantor: 'Add a guarantor',
  nameLabel: 'Their full name',
  emailLabel: 'Their email',
  send: 'Send the invite',
  cancel: 'Cancel',
  inviteAnother: 'Invite someone else',
  householdLine: 'Household income is shown, not scored.',
});
export const GUARANTOR_SENTENCE = 'A guarantor agrees to pay the rent if the tenants do not.';
export const PARTY_CONSENT_LINE = 'Your details go to the listing realtor beside the application you were invited to join. Documents are held for 14 days, then deleted. Nothing about the other people on the application is shown to you, and nothing about you is shown to them.';
export const DECLINE_LINE = 'Decline and the person who invited you is told. Nothing of yours is kept.';
export const WITHDRAW_LINE = 'Withdraw and the person who invited you is told. Your details stay on the application until it closes.';

const str = (v, n = 160) => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, n) : null; };
const int = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
export const money = (n) => (n != null ? `$${Number(n).toLocaleString('en-CA')}` : null);

// The same four labels the primary's card uses (lib/fitScore.js label rule), read from the party's
// own document report and the realtor's own confirmation of this party's employer
// (confirmations["party:<id>:employer"], db/screening.sql). "verified" is said only after that.
export const partyConfirmKey = (partyId) => `party:${partyId}:employer`;
export const isPartyConfirmKey = (key) => /^party:[\w-]{1,64}:employer$/.test(String(key || ''));
export function partyVerificationLabel(party, confirmations) {
  const conf = confirmations && typeof confirmations === 'object' ? confirmations : {};
  if (party && conf[partyConfirmKey(party.id)]) return 'verified';
  const v = readVerification(party && party.docVerifications ? party.docVerifications : null);
  if (v.state === 'mismatch' || v.state === 'unclear' || v.incomeMismatch || v.employerMismatch) return 'check docs';
  if (v.state === 'ok' && (v.incomeMatched || v.incomeClose)) return 'docs match';
  return 'stated';
}

// The fact lines for one party: role and standing first, then what they stated, then the
// documents. Plain words, no judgement, the same on the card, the checklist, the page and the PDF.
export function partyFacts(party, confirmations) {
  const p = party || {};
  const lines = [];
  const employer = [p.employer || p.businessName, p.jobTitle].filter(Boolean).join(', ');
  if (employer) lines.push(employer);
  if (p.yearsAtJob) lines.push(`${p.yearsAtJob} yrs at job`);
  if (p.annualIncome != null) lines.push(`Income ${money(p.annualIncome)} a year${p.incomeKind ? ` (${INCOME_KIND_LABEL[p.incomeKind] || p.incomeKind})` : ''}`);
  if (p.status === PARTY_STATUS.SUBMITTED) lines.push(`Income ${partyVerificationLabel(p, confirmations)}`);
  return lines;
}

// What the realtor's browser receives for a party: never the token, never the email of a party
// the realtor has no reason to contact directly (the realtor reaches the primary).
export function clientParty(row, incomes = [], confirmations = {}) {
  const r = row || {};
  // A party's own dates (db/008), not the applicant's: read by name so the state scan
  // (tests/stateReads.test.mjs) stays exact about who reads withdrawn_at on listing_applicants.
  const { invited_at: invitedAt = null, submitted_at: submittedAt = null, declined_at: declinedAt = null, withdrawn_at: withdrawnAt = null } = r;
  const sources = (incomes || []).filter((i) => i && String(i.application_party_id) === String(r.id)).map((i) => ({ kind: i.kind, amount: i.annual_amount, payer: i.payer || null }));
  const party = {
    id: r.id, role: r.role, roleLabel: ROLE_LABEL[r.role] || r.role, name: r.full_name || 'Invited', status: r.status || PARTY_STATUS.INVITED, statusLabel: STATUS_LABEL[r.status] || STATUS_LABEL.invited,
    phone: r.phone || null, employer: r.employer || null, businessName: r.business_name || null, jobTitle: r.job_title || null, yearsAtJob: r.years_at_job || null, employmentType: r.employment_type || null,
    annualIncome: r.annual_income != null ? Number(r.annual_income) : null, incomeKind: sources[0] ? sources[0].kind : null, incomeSources: sources,
    invitedAt, submittedAt, declinedAt, withdrawnAt, docsSubmittedAt: r.docs_submitted_at || null,
    docVerifications: r.doc_verifications && typeof r.doc_verifications === 'object' ? [r.doc_verifications.active || r.doc_verifications].filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : [],
  };
  party.label = partyVerificationLabel(party, confirmations);
  return party;
}

// Whether the primary may invite that role: a co applicant always, a guarantor only on a listing
// whose criteria accept one, and never past MAX_PARTIES people beside the primary (declined and
// withdrawn invites do not count).
export const listingAcceptsGuarantor = (listing) => !listing || listing.pref_guarantor_accepted !== false;
export function canInviteRole(role, listing, parties = []) {
  if (!INVITABLE_ROLES.includes(role)) return { ok: false, reason: 'role' };
  const live = (parties || []).filter((p) => p && p.status !== PARTY_STATUS.DECLINED && p.status !== PARTY_STATUS.WITHDRAWN);
  if (live.length >= MAX_PARTIES) return { ok: false, reason: 'full' };
  if (role === PARTY_ROLE.GUARANTOR && !listingAcceptsGuarantor(listing)) return { ok: false, reason: 'guarantor_not_accepted' };
  if (role === PARTY_ROLE.GUARANTOR && live.some((p) => p.role === PARTY_ROLE.GUARANTOR)) return { ok: false, reason: 'one_guarantor' };
  return { ok: true };
}

// The party form's fields, cleaned for the row. Nothing about anyone else, nothing protected.
export function partyRowFromForm(form, role) {
  const f = form || {};
  const employmentType = ['full-time', 'part-time', 'contract', 'self-employed'].includes(f.employmentType) ? f.employmentType : null;
  // Self employment is its own kind whatever the select says; otherwise the select, else employment.
  const incomeKind = employmentType === 'self-employed' ? INCOME_KIND.SELF_EMPLOYED : (Object.values(INCOME_KIND).includes(f.incomeKind) ? f.incomeKind : INCOME_KIND.EMPLOYMENT);
  return {
    full_name: str(f.fullName, 120), phone: str(f.phone, 40),
    address: role === PARTY_ROLE.GUARANTOR ? str(f.address, 200) : null,
    employment_type: employmentType, job_title: str(f.jobTitle, 120),
    employer: employmentType === 'self-employed' ? null : str(f.employer, 160), business_name: employmentType === 'self-employed' ? str(f.employer, 160) : null,
    years_at_job: str(f.yearsAtJob, 20), annual_income: int(f.annualIncome),
    incomeKind,
  };
}
// What a party must have given before they can submit: a name and either an income or a stated
// employer. The documents come after, like everyone's.
export function partyFormErrors(form, role) {
  const e = {};
  if (!str(form && form.fullName, 120)) e.fullName = 'Your full name, as on your ID.';
  if (role === PARTY_ROLE.GUARANTOR && !str(form && form.address, 200)) e.address = 'Your address, for the lease.';
  if (int(form && form.annualIncome) == null) e.annualIncome = 'Your annual income before tax, in dollars.';
  return e;
}
