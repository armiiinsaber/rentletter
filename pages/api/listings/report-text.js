// /api/listings/report-text
// Realtor-authenticated. Composes a clean, paste-ready PLAIN-TEXT message a realtor
// can drop into Messages/email for their landlord client, summarizing the listing's
// ranked shortlist. Uses Claude (same pattern as reasoning.js). OHRC-safe: reasons
// are drawn only from screenable facts (income, tenure, references, fit) — never
// protected grounds. Copy-only; no SMS/Twilio.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { loadReportContext } from '../../../lib/listingReportData';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured.' });
  }

  const supabase = getSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ error: 'listingId required.' });

  try {
    const admin = getSupabaseAdminClient();
    const ctx = await loadReportContext(supabase, admin, listingId, user.id);
    if (!ctx) return res.status(404).json({ error: 'Listing not found.' });
    if (ctx.shortlisted.length === 0) {
      return res.status(400).json({ error: 'Shortlist some applicants first.' });
    }

    const realtor = {
      name: ctx.profile?.full_name || 'Your realtor',
      brokerage: ctx.profile?.brokerage || null,
      phone: ctx.profile?.phone || null,
    };
    const unit = {
      name: ctx.listing?.name || ctx.listing?.address || 'the unit',
      rent: ctx.listing?.monthly_rent || null,
      bedrooms: ctx.listing?.bedrooms || null,
    };
    // Screenable facts only — no protected-class data leaves here.
    const candidates = ctx.shortlisted.map((row, i) => {
      const a = row.application || {};
      return {
        rank: i + 1,
        name: a.full_name || 'Applicant',
        role: [a.job_title, a.employer].filter(Boolean).join(' at ') || null,
        annualIncome: a.annual_income || null,
        householdIncome: a.co_applicant?.annualIncome
          ? (Number(a.annual_income) || 0) + (Number(a.co_applicant.annualIncome) || 0)
          : null,
        yearsAtJob: a.years_at_job || null,
        rentToIncomePct: a.rent_to_income_ratio ?? null,
        hasLandlordReference: !!a.prev_landlord_name,
        referencesProvided: Array.isArray(a.references) ? a.references.length : 0,
        scorecardOverall: a.scorecard?.overall ?? null,
        fitNotes: a.scorecard ? [
          a.scorecard.incomeStability?.note,
          a.scorecard.rentAffordability?.note,
          a.scorecard.rentalHistory?.note,
        ].filter(Boolean) : [],
      };
    });

    const systemPrompt = `You write a short, professional message a Canadian realtor pastes into Messages or email for their landlord client. It summarizes a ranked tenant shortlist.

OUTPUT RULES:
- PLAIN TEXT ONLY. No markdown whatsoever: no asterisks, no #, no **bold**, no underscores, no backticks, no tables. Use line breaks and simple hyphen bullets ("- ") or numbered lines ("1)") only.
- Keep it tight and skimmable on a phone. Short lines.
- Lead with the realtor's name (and brokerage if given) and the unit.
- Then the candidates IN THE GIVEN RANK ORDER, each with a name and ONE short factual reason line.
- End with a brief sign-off inviting the landlord to reply.

COMPLIANCE (Ontario Human Rights Code) — STRICT:
- Reasons must come ONLY from: income, employment tenure, rent-to-income, references, scorecard fit. Use the provided facts; do not invent.
- NEVER mention or imply protected grounds: race, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance.
- Say "the household" rather than "the couple/family". Do not infer age from job/student status.
- Be factual and neutral. Do not over-claim (e.g. if references were "provided" don't say "excellent references").

Output ONLY the message text — no preamble, no explanation.`;

    const userPrompt = `REALTOR: ${JSON.stringify(realtor)}
UNIT: ${JSON.stringify(unit)}
RANKED SHORTLIST (in order): ${JSON.stringify(candidates, null, 2)}

Write the paste-ready plain-text message now.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    // Belt-and-suspenders: strip any stray markdown emphasis characters.
    text = text.replace(/[*_`#]+/g, '');
    if (!text) return res.status(500).json({ error: 'AI returned empty response.' });
    return res.status(200).json({ text });
  } catch (e) {
    console.error('[listings/report-text] error:', e?.message || e);
    return res.status(500).json({ error: 'Could not compose the message. Please try again.' });
  }
}
