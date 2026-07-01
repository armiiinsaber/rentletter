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
import { reasonLabel } from '../../../lib/setAsideReasons';

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
    if (ctx.active.length + ctx.setAside.length === 0) {
      return res.status(400).json({ error: 'No applicants to present yet.' });
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
    const total = ctx.active.length + ctx.setAside.length;
    // Screenable facts only — no protected-class data leaves here.
    const toCandidate = (row, i) => {
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
        referencesProvided: Array.isArray(a.references) ? a.references.length : 0,
        scorecardOverall: a.scorecard?.overall ?? null,
      };
    };
    const ranked = ctx.active.map(toCandidate);
    const topMatches = ranked.slice(0, 5);
    const alsoRanked = ranked.slice(5);
    const setAside = ctx.setAside.map((row) => ({
      name: row.application?.full_name || 'Applicant',
      reason: reasonLabel(row.decisionReasonCode),
    }));

    const systemPrompt = `You format a FULL RANKED LIST of rental applicants into a deliberately, fussily laid-out PLAIN-TEXT message a Canadian realtor pastes into iMessage/SMS for their landlord client. Everyone is included and ranked best fit first — no culling. The landlord must absorb the whole list in seconds on a phone.

PRODUCE EXACTLY THIS STRUCTURE (omit a whole section only if it has no entries):

RENTLETTER  |  <address> — $<rent>/mo · <beds>BR
Ranked applicants from <realtor name>, <brokerage> — <TOTAL> total, best fit first

TOP MATCHES
[ 1 ]  <NAME IN UPPERCASE> — <role>, <employer>
       Income ......... $<amount>/yr  (<pct>% rent-to-income)
       Tenure ......... <years> yrs
       References ..... <n> provided
       Fit ............ <short factual phrase>

————————————————————————————

[ 2 ]  <NAME IN UPPERCASE> — ...

ALSO RANKED
[ 6 ]  <NAME IN UPPERCASE> — ...
       (same labelled block)

SET ASIDE
- <NAME IN UPPERCASE> — <reason>

————————————————————————————
Reply to set up viewings. Figures are applicant-reported.
<realtor name> · <brokerage> · <phone>

RULES:
- "TOP MATCHES" holds the candidates in topMatches (max 5), keeping their rank numbers. "ALSO RANKED" holds alsoRanked (continue the rank numbers). Put the section header on its own line, then a blank line, then the blocks.
- Candidate first line: "[ <rank> ]  " (space inside brackets, two spaces after) then the NAME IN ALL CAPS, then " — " then role, employer.
- Labelled lines indented exactly 7 spaces. Each: label, one space, "." leader dots, one space, value — padded so the "label + dots" segment is 15 chars wide and EVERY value lines up. Labels verbatim in order: Income, Tenure, References, Fit. Omit a line only if the fact is missing.
- Income value: "$<amount>/yr" then two spaces then "(<pct>% rent-to-income)" if a ratio exists. If householdIncome is present, use it and write "$<total>/yr (household)".
- Fit value: ONE short factual phrase from the data (e.g. "comfortable on income", "within typical range", "long, stable tenure"). Under ~4 words.
- This is a RANKING-ONLY shortlist: do NOT include any document-verification content — no "Documents verified", no "Not verified", no credit score, no verified-facts line. Verification is sent separately, per finalist.
- SET ASIDE: one line per applicant — "- <NAME IN UPPERCASE> — <reason verbatim from the data>". No labelled block, no scores. These were de-prioritized for screenable reasons; present them neutrally.
- Between candidate blocks (within a section) put a blank line, a 28 em-dash rule, a blank line. Use one em-dash rule before the sign-off.

STYLE:
- TRUE plain text only. NO emojis. NO markdown (no #, *, _, backticks, tables). Only keyboard punctuation, "·" middots, "." leader dots, "—" em-dash rules.
- Short lines that won't wrap badly on a narrow phone.

COMPLIANCE (Ontario Human Rights Code) — STRICT:
- Facts ONLY from: income, employment tenure, rent-to-income, references, scorecard fit, and the provided set-aside reasons. Use the data; never invent.
- NEVER mention or imply protected grounds: race, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance.
- Say "household" rather than "couple/family". Do not infer age from job/student status.
- Be factual and neutral. Do not over-claim.

Output ONLY the message text — no preamble, no explanation.`;

    const userPrompt = `REALTOR: ${JSON.stringify(realtor)}
UNIT: ${JSON.stringify(unit)}
TOTAL: ${total}
topMatches: ${JSON.stringify(topMatches, null, 2)}
alsoRanked: ${JSON.stringify(alsoRanked, null, 2)}
setAside: ${JSON.stringify(setAside, null, 2)}

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
