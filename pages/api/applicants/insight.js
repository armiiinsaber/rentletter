// /api/applicants/insight
// Realtor-authenticated. Produces ONE short, professional, OHRC-safe insight paragraph for
// an applicant, drawing on the application's screenable facts AND the document-verification /
// cross-reference results (if any). It states the read on financial fit, tenure, references,
// employment stability, and verified/mismatched facts — never a protected ground, never a
// reject recommendation. Persisted to listing_applicants.ai_insight.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { authorizeApplicant, screenableFacts, containsProtectedLanguage } from '../../../lib/applicantAnalysis';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a Toronto rental-screening assistant writing a short, professional insight for a realtor about ONE applicant. You give the factual read a realtor could repeat to their landlord client and defend at the Landlord and Tenant Board or HRTO.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI service not configured.' });

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId, linkId } = req.body || {};
  if (!listingId || !linkId) return res.status(400).json({ error: 'Missing applicant reference.' });

  let ctx;
  try {
    const admin = getSupabaseAdminClient();
    ctx = await authorizeApplicant(supabase, admin, listingId, linkId);
  } catch (e) {
    console.error('[insight] authorize error:', e?.message || e);
    return res.status(500).json({ error: 'Could not load that applicant.' });
  }
  if (!ctx) return res.status(404).json({ error: 'Applicant not found.' });

  const facts = screenableFacts(ctx.application, ctx.listing);
  // Latest document-verification run (structured facts only — no images were ever stored).
  const runs = Array.isArray(ctx.junction.doc_verifications) ? ctx.junction.doc_verifications : [];
  const latest = runs.length ? runs[runs.length - 1] : null;
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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    insight = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } catch (e) {
    console.error('[insight] anthropic error:', e?.message || e);
    return res.status(502).json({ error: 'Could not generate the insight. Please try again.' });
  }

  if (!insight) return res.status(502).json({ error: 'The insight came back empty. Please try again.' });

  // OHRC backstop: if protected-ground language slipped through, refuse rather than persist it.
  if (containsProtectedLanguage(insight)) {
    console.warn('[insight] protected-ground language detected; refusing output.');
    return res.status(422).json({ error: 'The insight was withheld for compliance. Please try again.' });
  }

  let saved = true;
  try {
    const admin = getSupabaseAdminClient();
    const { error: upErr } = await admin.from('listing_applicants').update({ ai_insight: insight }).eq('id', linkId);
    if (upErr) { console.error('[insight] persist error:', upErr.message); saved = false; }
  } catch (e) {
    console.error('[insight] persist exception:', e?.message || e);
    saved = false;
  }

  return res.status(200).json({ insight, saved });
}
