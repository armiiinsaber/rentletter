// lib/applicantAnalysis.js
// SERVER-ONLY shared helpers for the realtor document-intelligence + AI-insight routes.
// Authorizes that the signed-in realtor owns the listing (RLS read on `listings`) and the
// applicant link belongs to it, then loads the application body (owner_token + cover_letter
// stripped). Also: strict-JSON parsing and OHRC screenable-fact shaping. Never import on the
// client.
//
// This file is the SINGLE analysis engine shared by BOTH document paths — the realtor upload
// (/api/applicants/analyze-documents) and the tenant self-upload (/api/upload/submit) — so the
// persisted result is IDENTICAL no matter who uploaded. PROCESS-AND-DISCARD: raw document bytes
// live ONLY in `runDocumentAnalysis`'s memory for the single Claude call and are nulled before
// it returns; nothing raw is ever written to disk, Storage, or logs.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// ── Name-match safeguard ────────────────────────────────────────────────────────────────────
// Identity/authenticity check on screenable documents: do the name(s) printed on the analyzed
// documents actually belong to the applicant? Tolerant (case/accents/order/middle names/initials)
// so real matches aren't flagged, but a clearly different person IS. OHRC-safe — a NAME only.
const NAME_NOISE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'jr', 'sr', 'ii', 'iii', 'iv']);
function nameTokens(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z\s'\-.]/g, ' ')
    .replace(/[.'\-]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .filter((t) => !NAME_NOISE.has(t));
}
function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true; // initial vs full ("a" ~ "armin")
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}
// Compare ONE document name against the applicant's name → true (same person) | false
// (different person) | null (not enough to tell, e.g. a single name part).
function nameOnDocMatches(applicantName, docName) {
  const A = nameTokens(applicantName);
  const B = nameTokens(docName);
  if (!A.length || !B.length) return null;
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const used = new Set();
  let matched = 0;
  for (const t of short) {
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue;
      if (tokenMatch(t, long[i])) { matched++; used.add(i); break; }
    }
  }
  if (short.length === 1) return matched >= 1 ? null : false; // one name part → can't confirm
  return matched >= 2; // a real person match needs ≥2 aligned parts (first + last), order-free
}
// Aggregate across all document names → 'match' | 'mismatch' | 'unclear'. Any clearly-different
// name → mismatch; else at least one confirmed match → match; else unclear.
export function computeNameMatch(applicantName, documentNames) {
  const names = (documentNames || []).filter((n) => typeof n === 'string' && n.trim());
  if (!String(applicantName || '').trim() || names.length === 0) return 'unclear';
  const results = names.map((n) => nameOnDocMatches(applicantName, n));
  if (results.some((r) => r === false)) return 'mismatch';
  if (results.some((r) => r === true)) return 'match';
  return 'unclear';
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

// ── Document analysis engine (shared by realtor-upload + tenant-upload) ───────────────────────
const DOC_ANALYSIS_SYSTEM_PROMPT = `You are a meticulous rental-document verification assistant for a Canadian realtor. The realtor has uploaded one or more documents for a SINGLE rental applicant. Read EVERY document and return ONE organized, factual verification report.

YOUR TASKS
(a) CATEGORIZE each document. The COMMON types — categorize into one of these whenever the document matches — are: "pay stub", "employment letter", "credit report", "bank statement", "government ID", "reference letter". These cover the large majority of uploads. (A "credit report" is a consumer/credit report from a bureau — Equifax, TransUnion, or Experian — showing a credit score and/or tradelines.)
- Do NOT limit yourself to that list. Read and understand EVERY document. If a document is a real supporting document of a different type (e.g. utility bill, tax document / T4, offer letter), categorize it accurately with a clear, specific label (e.g. "utility bill", "tax document (T4)") and extract its relevant screenable facts.
- If a document does NOT appear to be a relevant rental-screening document — blank, unreadable, unrelated, or clearly not about this applicant — set its documentType to "Other / Unrecognized", set "unrecognized": true, and briefly note in "notes" what it appears to be so the realtor knows it may not be a valid supporting document. Do NOT invent any facts from an unclear document.
- Always prefer the specific named category when it fits; use a clear custom label otherwise; only fall back to "Other / Unrecognized" when it genuinely isn't a recognizable supporting document. Set "unrecognized": true ONLY in that fallback case; otherwise false.
(b) EXTRACT only SCREENABLE, FACTUAL fields visible in each document: stated income/amount, pay frequency, employer name, employment type (full-time/part-time/contract), job title, document dates / pay period, and the applicant NAME exactly as printed (needed only to cross-reference identity).
- For a CREDIT REPORT specifically, the credit SCORE is the single most important field — ALWAYS capture it if legible. Extract: creditScore (the number), scoreBand (the band/range label if shown, e.g. "Good", "Very Good"), bureau (Equifax / TransUnion / Experian), reportDate, and any clearly-stated factual screenable facts — accountsCount (number of accounts/tradelines), delinquencies (factual PRESENCE only, e.g. "2 late payments reported" — state the fact, never interpret or advise), collections (factual presence only), plus the employer if the report lists one (for cross-reference with other documents). Income is normally not on a credit report — leave income null there. A credit report may show a birth date or address — IGNORE those (see OHRC rules); capture only the score, band, bureau, dates, tradelines, delinquency/collection presence, and employer.
- Capture nothing beyond these screenable facts.
(c) CROSS-REFERENCE across the documents: does the applicant name match across documents and the ID? does the employer match between a pay stub and an employment letter? is the income consistent across documents? Report each as consistent or a discrepancy with a short factual detail.
(d) COMPARE the documents to the application's STATED values (provided below): income, employer, job title. For each, say whether the documents match, are close, mismatch, or were not found.
(e) Give a brief, neutral overall verification summary and a confidence level.

OHRC COMPLIANCE — ABSOLUTE, NON-NEGOTIABLE
- NEVER extract, infer, transcribe, or comment on any Ontario Human Rights Code protected ground: age, date of birth, race, colour, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex/gender, sexual orientation, gender identity, marital status, family status (children/dependants/pregnancy), disability, or receipt of public assistance.
- A government ID may show a birth date, photo, sex, or address. IGNORE all of it except the NAME (for identity cross-reference only). Do NOT output age, DOB, sex, photo description, or any physical/personal characteristic. If you catch yourself about to write any protected attribute, omit it.
- Speak only to money, employment, dates, references, and document consistency.

CONSISTENCY / HONESTY
- Report only what is actually legible. If a field is unreadable or absent, use null and note it. Do NOT invent numbers. Frame discrepancies factually and calmly (state the two values), never as an accusation.

OUTPUT — STRICT JSON ONLY. First character "{", last "}". No prose, no markdown, no code fences.
{
  "documents": [
    { "filename": "<the provided filename>", "documentType": "<pay stub | employment letter | credit report | bank statement | government ID | reference letter | a clear specific custom label | Other / Unrecognized>", "unrecognized": <true if it is not a recognizable supporting document, else false>, "extracted": { "applicantName": <string|null>, "income": <string|null>, "payFrequency": <string|null>, "employer": <string|null>, "employmentType": <string|null>, "jobTitle": <string|null>, "documentDate": <string|null>, "creditScore": <number|null — credit report only>, "scoreBand": <string|null>, "bureau": <"Equifax" | "TransUnion" | "Experian" | string | null>, "reportDate": <string|null>, "accountsCount": <number|null>, "delinquencies": <string|null — factual presence only>, "collections": <string|null — factual presence only> }, "notes": "<short factual note; for Other / Unrecognized say what it appears to be>" }
  ],
  "crossReference": [ { "field": "<e.g. Applicant name | Employer | Income>", "status": "consistent" | "discrepancy", "detail": "<short factual detail>" } ],
  "comparisons": [ { "field": "Income" | "Employer" | "Job title", "stated": <string|null>, "found": <string|null>, "status": "match" | "close" | "mismatch" | "not_found" } ],
  "overallSummary": "<one or two neutral sentences>",
  "confidence": "high" | "medium" | "low"
}
Output the JSON now.`;

// Runs the ONE multi-document Claude vision analysis for a single applicant and returns the
// structured `run` (the exact object shape persisted into listing_applicants.doc_verifications).
// `files` are base64 { name, type, data } already validated to ALLOWED_DOC_MIME by the caller.
// PROCESS-AND-DISCARD: the raw bytes are used only for this single call and nulled in `finally`.
// Throws Error with a `.code` ('config' | 'ai_error' | 'unreadable') on failure — the caller
// decides how to surface it. Callers must never log or persist anything but the returned run.
export async function runDocumentAnalysis({ files, application, listing }) {
  if (!process.env.ANTHROPIC_API_KEY) { const e = new Error('AI service not configured.'); e.code = 'config'; throw e; }
  const list = Array.isArray(files) ? files : [];
  const facts = screenableFacts(application, listing);
  const hasPdf = list.some((f) => String(f.type).toLowerCase() === 'application/pdf');

  // Build ONE multimodal message: each document as an image/document block (labelled with its
  // filename) followed by the stated-values + instruction text. `content` holds raw bytes only
  // transiently, in memory, for this single call.
  const content = [];
  list.forEach((f, i) => {
    const mime = String(f.type).toLowerCase();
    const filename = String(f.name || `document-${i + 1}`).slice(0, 120);
    content.push({ type: 'text', text: `DOCUMENT ${i + 1} — filename: "${filename}"` });
    if (mime === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: String(f.data) } });
    } else {
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: String(f.data) } });
    }
  });
  content.push({
    type: 'text',
    text: `APPLICATION'S STATED VALUES (compare the documents to these — screenable fields only):\n${JSON.stringify({
      statedName: facts.statedName,
      statedAnnualIncome: facts.statedAnnualIncome,
      statedEmployer: facts.statedEmployer,
      statedJobTitle: facts.statedJobTitle,
    }, null, 2)}\n\nAnalyze ALL ${list.length} document(s) together and return the STRICT JSON report now.`,
  });

  let parsed;
  let aiErr = null;
  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: DOC_ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
      hasPdf ? { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } } : undefined,
    );
    const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    parsed = parseJsonObject(raw);
  } catch (e) {
    // Log ONLY the error message — never the file bytes or document contents.
    console.error('[doc-analysis] anthropic error:', e?.message || e);
    aiErr = e;
  } finally {
    // PROCESS-AND-DISCARD: drop all references to the raw bytes immediately.
    for (const f of list) { if (f) f.data = null; }
    content.length = 0;
  }
  if (aiErr) { const e = new Error('Could not read those documents.'); e.code = 'ai_error'; throw e; }
  if (!parsed || !Array.isArray(parsed.documents)) { const e = new Error('The analysis came back unreadable.'); e.code = 'unreadable'; throw e; }

  const documents = parsed.documents.slice(0, MAX_DOCS);

  // NAME-MATCH SAFEGUARD: do the names printed on the (recognized) documents actually belong to
  // THIS applicant? Compared server-side against the authoritative full_name — tolerant of
  // case/accents/order/middle-names/initials, but a clearly different person is flagged.
  const applicantName = application?.full_name || '';
  const documentNames = documents
    .filter((d) => d && d.unrecognized !== true)
    .map((d) => (d.extracted && d.extracted.applicantName) || null)
    .filter((n) => typeof n === 'string' && n.trim());
  const nameMatch = computeNameMatch(applicantName, documentNames); // 'match' | 'mismatch' | 'unclear'

  return {
    analyzedAt: new Date().toISOString(),
    documentCount: list.length,
    documents,
    crossReference: Array.isArray(parsed.crossReference) ? parsed.crossReference : [],
    comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons : [],
    overallSummary: typeof parsed.overallSummary === 'string' ? parsed.overallSummary.slice(0, 1200) : '',
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    nameMatch,
    documentNames,
    applicantName,
  };
}

// ── AI insight engine (shared by realtor "Generate insight" + tenant-upload auto-insight) ─────
const INSIGHT_SYSTEM_PROMPT = `You are a Toronto rental-screening assistant writing a short, professional insight for a realtor about ONE applicant. You give the factual read a realtor could repeat to their landlord client and defend at the Landlord and Tenant Board or HRTO.

WHAT TO COVER (screenable facts ONLY):
- Income coverage versus the unit's rent (rent-to-income), and household income if a co-applicant is present.
- Employment stability and tenure; employment type if known.
- Rental history (years at previous address) and references provided / landlord reference.
- The document verification: which stated facts the uploaded documents CONFIRMED, anything that was CLOSE, and any MISMATCH or item NOT FOUND — plus cross-document consistency (name/employer/income matching across documents). State discrepancies factually and calmly (give both values), never as an accusation.

ABSOLUTE OHRC RULE — NON-NEGOTIABLE:
Speak ONLY to: income, rent-to-income, employment, tenure, references, verified document facts, and consistency. NEVER mention or imply any Ontario Human Rights Code protected ground: age, date of birth, race, colour, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex/gender, sexual orientation, gender identity, marital status, family status (children/dependants/pregnancy), disability, or receipt of public assistance. If the data hints at any of these, ignore it.

STANCE:
- This is "here's the read", NOT a recommendation. Do NOT tell the realtor to accept or reject. No verdict words like "approve", "deny", "reject".
- Be factual and defensible. Anchor every claim to the provided data. Do not invent numbers or assert references were positive — only that they were provided/confirmed.

FORMAT: one tight paragraph, 3-5 sentences. No headers, no bullets, no preamble — just the paragraph.`;

// Produces the ONE OHRC-safe insight paragraph from an applicant's screenable facts plus the
// latest document-verification run (structured facts only — no images). `verificationRun` is a
// doc_verifications entry (or null if none verified yet). Returns the trimmed insight string.
// Throws Error with a `.code` ('config' | 'ai_error' | 'empty' | 'blocked') so the realtor route
// can map exact status codes; the tenant route treats any failure as "no insight" (best-effort).
export async function generateApplicantInsight({ application, listing, verificationRun }) {
  if (!process.env.ANTHROPIC_API_KEY) { const e = new Error('AI service not configured.'); e.code = 'config'; throw e; }
  const facts = screenableFacts(application, listing);
  const latest = verificationRun || null;
  const verification = latest ? {
    documents: (latest.documents || []).map((d) => ({ type: d.documentType, extracted: d.extracted })),
    crossReference: latest.crossReference || [],
    comparisons: latest.comparisons || [],
    overallSummary: latest.overallSummary || '',
    confidence: latest.confidence || null,
  } : null;

  const userPrompt = `APPLICANT SCREENABLE FACTS:\n${JSON.stringify(facts, null, 2)}\n\n${
    verification
      ? `DOCUMENT VERIFICATION (from uploaded documents):\n${JSON.stringify(verification, null, 2)}\n\n`
      : 'No documents have been verified for this applicant yet — base the insight on the application facts only, and note that documents were not provided.\n\n'
  }Write the single OHRC-safe insight paragraph now.`;

  let insight;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: INSIGHT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    insight = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } catch (e) {
    console.error('[insight] anthropic error:', e?.message || e);
    const err = new Error('Could not generate the insight.'); err.code = 'ai_error'; throw err;
  }
  if (!insight) { const err = new Error('The insight came back empty.'); err.code = 'empty'; throw err; }
  // OHRC backstop: if protected-ground language slipped through, refuse rather than return it.
  if (containsProtectedLanguage(insight)) {
    console.warn('[insight] protected-ground language detected; refusing output.');
    const err = new Error('The insight was withheld for compliance.'); err.code = 'blocked'; throw err;
  }
  return insight;
}
