// lib/applicantAnalysis.js
// SERVER-ONLY shared helpers for the realtor document-intelligence + AI-insight routes.
// Authorizes that the signed-in realtor owns the listing (RLS read on `listings`) and the
// applicant link belongs to it, then loads the application body (owner_token + cover_letter
// stripped). Also: strict-JSON parsing and OHRC screenable-fact shaping. Never import on the
// client. NOTE: raw uploaded document bytes are NEVER handled here and NEVER persisted —
// they live only in the analyze route's memory for the single Claude call.

export const ALLOWED_DOC_MIME = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_DOCS = 6;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB across all files (decoded)

// Authorize + load. Returns { listing, junction, application } or null if the realtor
// doesn't own the listing (RLS) or the link isn't on it. Selecting '*' tolerates the
// doc_verifications/ai_insight columns being absent until the SQL is run.
export async function authorizeApplicant(serverClient, admin, listingId, linkId) {
  if (!listingId || !linkId) return null;
  const { data: listing } = await serverClient
    .from('listings').select('*').eq('id', listingId).maybeSingle();
  if (!listing) return null; // RLS: not the owner (or no such listing)
  const { data: junction } = await admin
    .from('listing_applicants')
    .select('*, application:applications(*)')
    .eq('id', linkId)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (!junction) return null;
  const application = { ...(junction.application || {}) };
  delete application.owner_token;  // never expose to the realtor
  delete application.cover_letter; // not needed for analysis
  return { listing, junction, application };
}

// Compact, SCREENABLE-ONLY facts the AI may reason over. Deliberately excludes any
// field that could touch an OHRC protected ground (age, DOB, family status, etc.).
export function screenableFacts(application, listing) {
  const a = application || {};
  const l = listing || {};
  const coIncome = a.co_applicant?.annualIncome ?? a.co_applicant?.annual_income ?? null;
  return {
    statedName: a.full_name || null,
    statedAnnualIncome: a.annual_income ?? null,
    statedHouseholdIncome: coIncome != null ? (Number(a.annual_income) || 0) + Number(coIncome) : null,
    statedEmployer: a.employer || null,
    statedJobTitle: a.job_title || null,
    statedEmploymentTenureYears: a.years_at_job ?? null,
    statedCurrentRent: a.current_rent ?? null,
    rentToIncomePct: a.rent_to_income_ratio ?? null,
    yearsAtPreviousAddress: a.years_at_previous ?? null,
    referencesProvided: Array.isArray(a.references) ? a.references.length : 0,
    hasPreviousLandlordReference: !!a.prev_landlord_name,
    unitMonthlyRent: l.monthly_rent ?? null,
    unitMinAnnualIncomePref: l.pref_min_annual_income ?? null,
    unitMaxRentToIncomePref: l.pref_rent_to_income_max_pct ?? null,
  };
}

// Parse a strict JSON object from a model reply (tolerating stray fences/prose).
export function parseJsonObject(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
}

// Defence-in-depth: detect obvious OHRC protected-ground language so the insight route can
// refuse to persist anything that slipped past the prompt. (The prompt is the primary
// guard; this is a backstop, not a scrubber.)
const PROTECTED_PATTERNS = [
  /\b(race|racial|ethnic(?:ity)?|ancestry|skin colour|colored|nationality|national origin|place of origin|immigrant|citizenship)\b/i,
  /\b(religio(?:n|us)|creed|christian|muslim|jewish|hindu|sikh|buddhist|faith)\b/i,
  /\b(\d{2,3}\s*years?\s*old|elderly|young(?:er)?|middle-aged|retiree|age\b)\b/i,
  /\b(married|single|divorced|widow(?:ed)?|spouse|husband|wife|couple|boyfriend|girlfriend|partner)\b/i,
  /\b(pregnan|children|kids|child\b|family status|dependents|son|daughter|baby|infant)\b/i,
  /\b(disab(?:led|ility)|wheelchair|mental health|handicap|medical condition)\b/i,
  /\b(gender|male\b|female\b|transgender|sexual orientation|gay|lesbian|lgbt)\b/i,
  /\b(welfare|public assistance|social assistance|disability benefits|ODSP|Ontario Works)\b/i,
];
export function containsProtectedLanguage(text) {
  const s = String(text || '');
  return PROTECTED_PATTERNS.some((re) => re.test(s));
}
