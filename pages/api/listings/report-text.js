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

    const systemPrompt = `You format a tenant shortlist into a deliberately, fussily laid-out PLAIN-TEXT message a Canadian realtor pastes into iMessage/SMS for their landlord client. The whole point is meticulous typographic alignment a person could do by hand but never would — the landlord must absorb the entire shortlist in seconds on a phone.

PRODUCE EXACTLY THIS STRUCTURE (no deviation):

RENTLETTER  |  <address> — $<rent>/mo · <beds>BR
Shortlist from <realtor name>, <brokerage> — ranked best fit first (<N>)

[ 1 ]  <NAME IN UPPERCASE> — <role>, <employer>
       Income ......... $<amount>/yr  (<pct>% rent-to-income)
       Tenure ......... <years> yrs
       References ..... <n> provided
       Fit ............ <short factual phrase>

————————————————————————————

[ 2 ]  <NAME IN UPPERCASE> — <role>, <employer>
       Income ......... ...
       ...

————————————————————————————
Reply to set up viewings. Figures are applicant-reported.
<realtor name> · <brokerage> · <phone>

ALIGNMENT RULES (critical):
- Header line 1 starts with "RENTLETTER  |  " (two spaces, pipe, two spaces). Include rent and "<beds>BR" only if provided.
- Candidate first line: "[ <rank> ]  " (space inside the brackets, two spaces after) then the NAME IN ALL CAPS, then " — " then role, employer.
- Labelled lines are indented exactly 7 spaces (to sit under the name). Each is: label, one space, a run of "." leader dots, one space, value — padded so EVERY value across ALL candidates starts in the same column. Use these four labels verbatim, in this order: Income, Tenure, References, Fit. The "label + dots" segment must be 15 characters wide (e.g. "Income ........." / "Tenure ........." / "References ....." / "Fit ............"). Omit a line only if that fact is entirely missing.
- Income value: "$<amount>/yr" then two spaces then "(<pct>% rent-to-income)" if a ratio exists. If a co-applicant income exists, use the household total and label it "Income" with value "$<total>/yr (household)".
- Fit value: ONE short factual phrase derived from the data (e.g. "comfortable on income", "within typical range", "long, stable tenure", "references in hand"). Keep it under ~4 words.
- Between candidates put a blank line, a rule of 28 em dashes (————————————————————————————), then a blank line. Use the same rule before the sign-off.

STYLE:
- TRUE plain text only. NO emojis. NO markdown (no #, *, _, backticks, tables). Only keyboard punctuation, "·" middots, "." leader dots, and "—" em-dash rules.
- Keep every line short enough to not wrap badly on a narrow phone — prefer short labelled lines over sentences.

COMPLIANCE (Ontario Human Rights Code) — STRICT:
- Facts ONLY from: income, employment tenure, rent-to-income, references, scorecard fit. Use the provided data; never invent.
- NEVER mention or imply protected grounds: race, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance.
- Say "household" rather than "couple/family". Do not infer age from job/student status.
- Be factual and neutral. Do not over-claim (if references were "provided" don't say "excellent references").

Output ONLY the message text — no preamble, no explanation.`;

    const userPrompt = `REALTOR: ${JSON.stringify(realtor)}
UNIT: ${JSON.stringify(unit)}
RANKED SHORTLIST (in order): ${JSON.stringify(candidates, null, 2)}

Write the paste-ready plain-text message now.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
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
