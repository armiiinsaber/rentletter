// /api/applicants/analyze-documents
// Realtor-authenticated batch document intelligence. The realtor drops UP TO 6 documents
// (jpg/png/pdf, base64) for one applicant; ALL are read in ONE Claude vision call that
// categorizes each, extracts ONLY screenable facts, cross-references them, and compares to
// the application's stated values. Returns ONE organized report.
//
// PROCESS-AND-DISCARD: the raw file bytes exist ONLY in this function's memory for the
// single Claude call. They are NEVER written to disk, Storage/buckets, or logs, and are
// dropped as soon as the call returns. Only the STRUCTURED RESULT (no images) is persisted
// to listing_applicants.doc_verifications. OHRC-safe by construction (prompt + facts shape).
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import {
  authorizeApplicant, screenableFacts, parseJsonObject,
  ALLOWED_DOC_MIME, MAX_DOCS, MAX_TOTAL_BYTES,
} from '../../../lib/applicantAnalysis';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Allow the batch payload (≤6 docs, base64) through Next's default 1MB body cap.
export const config = { api: { bodyParser: { sizeLimit: '26mb' } } };

const SYSTEM_PROMPT = `You are a meticulous rental-document verification assistant for a Canadian realtor. The realtor has uploaded one or more documents for a SINGLE rental applicant. Read EVERY document and return ONE organized, factual verification report.

YOUR TASKS
(a) CATEGORIZE each document. The COMMON types — categorize into one of these whenever the document matches — are: "pay stub", "employment letter", "credit report", "bank statement", "government ID", "reference letter". These cover the large majority of uploads. (A "credit report" is a consumer/credit report from a bureau — Equifax, TransUnion, or Experian — showing a credit score and/or tradelines.)
- Do NOT limit yourself to that list. Read and understand EVERY document. If a document is a real supporting document of a different type (e.g. utility bill, tax document / T4, offer letter), categorize it accurately with a clear, specific label (e.g. "utility bill", "tax document (T4)") and extract its relevant screenable facts.
- If a document does NOT appear to be a relevant rental-screening document — blank, unreadable, unrelated, or clearly not about this applicant — set its documentType to "Other / Unrecognized", set "unrecognized": true, and briefly note in "notes" what it appears to be so the realtor knows it may not be a valid supporting document. Do NOT invent any facts from an unclear document.
- Always prefer the specific named category when it fits; use a clear custom label otherwise; only fall back to "Other / Unrecognized" when it genuinely isn't a recognizable supporting document. Set "unrecognized": true ONLY in that fallback case; otherwise false.
(b) EXTRACT only SCREENABLE, FACTUAL fields visible in each document: stated income/amount, pay frequency, employer name, employment type (full-time/part-time/contract), job title, document dates / pay period, and the applicant NAME exactly as printed (needed only to cross-reference identity). Capture nothing else.
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
    { "filename": "<the provided filename>", "documentType": "<pay stub | employment letter | credit report | bank statement | government ID | reference letter | a clear specific custom label | Other / Unrecognized>", "unrecognized": <true if it is not a recognizable supporting document, else false>, "extracted": { "applicantName": <string|null>, "income": <string|null>, "payFrequency": <string|null>, "employer": <string|null>, "employmentType": <string|null>, "jobTitle": <string|null>, "documentDate": <string|null> }, "notes": "<short factual note; for Other / Unrecognized say what it appears to be>" }
  ],
  "crossReference": [ { "field": "<e.g. Applicant name | Employer | Income>", "status": "consistent" | "discrepancy", "detail": "<short factual detail>" } ],
  "comparisons": [ { "field": "Income" | "Employer" | "Job title", "stated": <string|null>, "found": <string|null>, "status": "match" | "close" | "mismatch" | "not_found" } ],
  "overallSummary": "<one or two neutral sentences>",
  "confidence": "high" | "medium" | "low"
}
Output the JSON now.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId, files } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });
  if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: 'Add at least one document.' });
  if (files.length > MAX_DOCS) return res.status(400).json({ error: `Up to ${MAX_DOCS} documents at a time.` });

  // Validate each file (type + decode size) and total payload. We measure bytes from the
  // base64 length; we do NOT store the bytes.
  let totalBytes = 0;
  for (const f of files) {
    const mime = String(f?.type || '').toLowerCase();
    if (!ALLOWED_DOC_MIME.includes(mime)) return res.status(400).json({ error: 'Only JPG, PNG, or PDF files are supported.' });
    const data = String(f?.data || '');
    if (!data || data.length < 16) return res.status(400).json({ error: 'One of the files looks empty.' });
    totalBytes += Math.floor((data.length * 3) / 4);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({ error: 'Those documents are too large together (max 25MB). Try fewer or smaller files.' });
  }

  // Authorize: realtor must own the listing AND this link must be on it.
  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[analyze-documents] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  const facts = screenableFacts(ctx.application, ctx.listing);
  const hasPdf = files.some((f) => String(f.type).toLowerCase() === 'application/pdf');

  // Build ONE multimodal message: each document as an image/document block (labelled with
  // its filename) followed by the stated-values + instruction text. `content` holds the raw
  // bytes only transiently, in memory, for this single call.
  const content = [];
  files.forEach((f, i) => {
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
    }, null, 2)}\n\nAnalyze ALL ${files.length} document(s) together and return the STRICT JSON report now.`,
  });

  let parsed;
  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      },
      hasPdf ? { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } } : undefined,
    );
    const raw = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    parsed = parseJsonObject(raw);
  } catch (e) {
    // Log ONLY the error message — never the file bytes or document contents.
    console.error('[analyze-documents] anthropic error:', e?.message || e);
    return res.status(502).json({ error: 'Could not read those documents. Please try again.' });
  } finally {
    // PROCESS-AND-DISCARD: drop all references to the raw bytes immediately. Nothing here
    // is written to disk, Storage, or logs.
    for (const f of files) { if (f) f.data = null; }
    content.length = 0;
  }

  if (!parsed || !Array.isArray(parsed.documents)) {
    return res.status(502).json({ error: 'The analysis came back unreadable. Please try again.' });
  }

  // Shape the persisted run (structured facts only — no images).
  const run = {
    analyzedAt: new Date().toISOString(),
    documentCount: files.length,
    documents: Array.isArray(parsed.documents) ? parsed.documents.slice(0, MAX_DOCS) : [],
    crossReference: Array.isArray(parsed.crossReference) ? parsed.crossReference : [],
    comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons : [],
    overallSummary: typeof parsed.overallSummary === 'string' ? parsed.overallSummary.slice(0, 1200) : '',
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  };

  // Persist ONLY the structured result. Accumulate across analyses (most recent last).
  let verifications = [run];
  try {
    const admin = getSupabaseAdminClient();
    const existing = ctx.junction.doc_verifications;
    verifications = Array.isArray(existing) ? [...existing, run] : [run];
    const { error: upErr } = await admin
      .from('listing_applicants')
      .update({ doc_verifications: verifications })
      .eq('id', linkId);
    if (upErr) {
      console.error('[analyze-documents] persist error:', upErr.message);
      // Still return the result so the realtor sees it; warn that it wasn't saved.
      return res.status(200).json({ result: run, verifications, saved: false });
    }
  } catch (e) {
    console.error('[analyze-documents] persist exception:', e?.message || e);
    return res.status(200).json({ result: run, verifications, saved: false });
  }

  return res.status(200).json({ result: run, verifications, saved: true });
}
