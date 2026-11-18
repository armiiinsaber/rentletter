// lib/profileFacts.js  PURE, isomorphic. THE one list of what may ever leave a tenant's profile
// for another realtor (docs/design/profile-and-circle.md sections 6.2 and 6.3).
//
// PROFILE_FACT_KEYS is closed. A fact not on it is never shared, never shown to a realtor through
// a share and never put in a share payload: sharePayload builds its answer from this list and
// nothing else, and assertSharePayload refuses anything it did not build. The database view
// public.tenant_profile_shareable (db/015-profile-verified-email.sql) holds the same list and
// tests/profileFacts.test.mjs compares the two.
//
// The tenant's own profile keeps every answer they typed, for their own next application; this
// list limits what a SHARE shows, not what the tenant may reuse.
//
// What is never on the list, and why:
//   · the Fit score, any rank, the checklist, a decision, a realtor's notes: they belong to one
//     realtor's listing (lib/fitScore.js) and have no key here;
//   · household size, who the tenant applies with and how they are related, age, date of birth:
//     protected grounds or proxies for them under the Ontario and BC Human Rights Codes;
//   · where income comes from: an amount is shared, never its type (receipt of public assistance
//     in Ontario, lawful source of income in BC);
//   · pets: free text, and it can name a service animal, which is disability. The tenant's own
//     profile keeps the answer for their next application; it is never shared;
//   · smoker, net income, current rent, personal references, business name: not needed by a
//     realtor who has not yet received an application, so not sent.
//
// Every shared fact carries its source and its date:
//   typed      "Typed by the tenant on DATE"
//   document   "Read from a document on DATE"
// The word "verified" is never used here. In this codebase it is said only when a realtor
// confirmed something themselves (lib/creditShared.js, lib/parties.js), and a realtor's
// confirmation belongs to that realtor's listing: it does not travel.

// key: the apply form's key (lib/tenantProfile.js EMPTY_FORM). label: the words a realtor reads.
export const PROFILE_FACTS = Object.freeze([
  Object.freeze({ key: 'fullName', label: 'Name' }),
  Object.freeze({ key: 'email', label: 'Email' }),
  Object.freeze({ key: 'phone', label: 'Phone' }),
  Object.freeze({ key: 'employer', label: 'Employer' }),
  Object.freeze({ key: 'jobTitle', label: 'Job title' }),
  Object.freeze({ key: 'employmentType', label: 'Employment type' }),
  Object.freeze({ key: 'yearsAtJob', label: 'Time at job' }),
  Object.freeze({ key: 'annualIncome', label: 'Income before tax' }),
  Object.freeze({ key: 'previousAddress', label: 'Current address' }),
  Object.freeze({ key: 'yearsAtPrevious', label: 'Time at that address' }),
  Object.freeze({ key: 'previousLandlordName', label: 'Landlord reference' }),
  Object.freeze({ key: 'previousLandlordContact', label: 'Landlord contact' }),
  Object.freeze({ key: 'moveInDate', label: 'Move in date' }),
]);
export const PROFILE_FACT_KEYS = Object.freeze(PROFILE_FACTS.map((f) => f.key));
const ALLOWED = new Set(PROFILE_FACT_KEYS);
export const isProfileFactKey = (k) => ALLOWED.has(k);

// The facts a document read may add, by kind (the closed list of section 4.3; the table arrives
// with the vault). Nothing about a date of birth, a photo, an ID number, status in Canada, the
// type of income or a family is a kind.
export const PROFILE_CHECK_KINDS = Object.freeze(['identity_name_matches', 'identity_document_current', 'income_annual_gross', 'employer_name', 'employment_start']);
const CHECK_LABEL = Object.freeze({ identity_name_matches: 'Name on ID', identity_document_current: 'ID in date', income_annual_gross: 'Income before tax', employer_name: 'Employer', employment_start: 'Started' });
// The keys each kind's value may hold, and nothing else.
const CHECK_VALUE_KEYS = Object.freeze({ identity_name_matches: ['matches'], identity_document_current: ['current'], income_annual_gross: ['cents'], employer_name: ['name'], employment_start: ['month'] });

export const SOURCE = Object.freeze({ TYPED: 'typed', DOCUMENT: 'document' });
// "November 17, 2026", in Toronto, or null for no date.
export function longDate(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(t));
}
// The one sentence under a shared fact.
export function sourceLine(source, at) {
  const date = longDate(at);
  if (source === SOURCE.DOCUMENT) return date ? `Read from a document on ${date}` : 'Read from a document';
  return date ? `Typed by the tenant on ${date}` : 'Typed by the tenant';
}

const text = (v) => (v == null ? '' : String(v).trim());

// The whitelisted keys of a facts object that hold something, and nothing else. Any other key,
// whatever it is called, is dropped here.
export function shareableFacts(facts) {
  const out = {};
  if (!facts || typeof facts !== 'object') return out;
  for (const key of PROFILE_FACT_KEYS) { const v = text(facts[key]); if (v) out[key] = v; }
  return out;
}

// One document check as it may be shared: its kind from the closed list, its value cut down to
// that kind's own keys, when it was read. Anything else about the row is left behind.
function shareableCheck(row) {
  if (!row || !PROFILE_CHECK_KINDS.includes(row.kind)) return null;
  const value = {};
  for (const k of CHECK_VALUE_KEYS[row.kind]) if (row.value && row.value[k] !== undefined) value[k] = row.value[k];
  if (!Object.keys(value).length) return null;
  const at = row.read_at || row.readAt || null;
  return { kind: row.kind, label: CHECK_LABEL[row.kind], value, source: SOURCE.DOCUMENT, at, line: sourceLine(SOURCE.DOCUMENT, at) };
}

// THE share payload: what a realtor who holds an approved share is sent. Built from the
// whitelist alone.
//   profile: { id, facts, factsUpdatedAt, emailVerifiedAt }  (the row of tenant_profile_shareable)
//   checks:  document check rows ({ kind, value, read_at })
export function sharePayload(profile, checks = []) {
  const p = profile || {};
  const at = p.factsUpdatedAt || p.facts_updated_at || null;
  const typed = shareableFacts(p.facts);
  return {
    profileId: p.id || null,
    emailProvedAt: p.emailVerifiedAt || p.email_verified_at || null,
    facts: PROFILE_FACTS.filter((f) => typed[f.key] !== undefined).map((f) => ({ key: f.key, label: f.label, value: typed[f.key], source: SOURCE.TYPED, at, line: sourceLine(SOURCE.TYPED, at) })),
    checks: (Array.isArray(checks) ? checks : []).map(shareableCheck).filter(Boolean),
  };
}

// The server's last line before a share payload leaves: throws when anything in it was not
// built from the lists above. Called by lib/profileShareStore.js on every read.
const PAYLOAD_KEYS = ['profileId', 'emailProvedAt', 'facts', 'checks'];
const FACT_KEYS = ['key', 'label', 'value', 'source', 'at', 'line'];
const CHECK_KEYS = ['kind', 'label', 'value', 'source', 'at', 'line'];
export function assertSharePayload(payload) {
  const fail = (what) => { throw new Error(`share payload refused: ${what}`); };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('not an object');
  for (const k of Object.keys(payload)) if (!PAYLOAD_KEYS.includes(k)) fail(`the key ${k}`);
  if (!Array.isArray(payload.facts) || !Array.isArray(payload.checks)) fail('facts and checks must be lists');
  for (const f of payload.facts) {
    if (!f || typeof f !== 'object') fail('a fact that is not an object');
    for (const k of Object.keys(f)) if (!FACT_KEYS.includes(k)) fail(`the key ${k} on a fact`);
    if (!isProfileFactKey(f.key)) fail(`the fact ${f.key}`);
    if (typeof f.value !== 'string') fail(`the value of ${f.key}`);
    if (f.source !== SOURCE.TYPED) fail(`the source of ${f.key}`);
    if (f.line !== sourceLine(SOURCE.TYPED, f.at)) fail(`the source line of ${f.key}`);
  }
  for (const c of payload.checks) {
    if (!c || typeof c !== 'object') fail('a check that is not an object');
    for (const k of Object.keys(c)) if (!CHECK_KEYS.includes(k)) fail(`the key ${k} on a check`);
    if (!PROFILE_CHECK_KINDS.includes(c.kind)) fail(`the check ${c.kind}`);
    if (!c.value || typeof c.value !== 'object') fail(`the value of ${c.kind}`);
    for (const k of Object.keys(c.value)) if (!CHECK_VALUE_KEYS[c.kind].includes(k)) fail(`the key ${k} in ${c.kind}`);
    if (c.source !== SOURCE.DOCUMENT) fail(`the source of ${c.kind}`);
    if (c.line !== sourceLine(SOURCE.DOCUMENT, c.at)) fail(`the source line of ${c.kind}`);
  }
  return payload;
}
