import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Verify the Stripe checkout session was actually paid
async function verifyStripeSession(sessionId) {
  if (!sessionId) return { ok: false, reason: 'No session ID provided' };
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY not set');
    return { ok: false, reason: 'Stripe not configured' };
  }
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const session = await res.json();
    if (session.error) return { ok: false, reason: session.error.message };
    if (session.payment_status !== 'paid') return { ok: false, reason: 'Payment not completed' };
    return { ok: true, session };
  } catch (err) {
    return { ok: false, reason: 'Stripe verification failed' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { stripeSessionId, ...formData } = req.body;

  const {
    apartmentAddress, apartmentDescription,
    fullName, age,
    jobTitle, employer, yearsAtJob, annualIncome,
    previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
    moveInDate, reasonForMoving,
    personality, pets, redFlags,
  } = formData;

  if (!fullName || !jobTitle || !annualIncome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── PAYMENT GATE — block Claude API unless Stripe says paid ──
  const verification = await verifyStripeSession(stripeSessionId);
  if (!verification.ok) {
    return res.status(402).json({ error: `Payment required. ${verification.reason}` });
  }

  const moveDate = moveInDate
    ? new Date(moveInDate).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'as soon as possible';

  // Pre-calculate financial metrics so the AI doesn't have to do math
  const annualIncomeNum = parseInt(annualIncome) || 0;
  const monthlyIncome = Math.round(annualIncomeNum / 12);
  const monthlyIncomeFormatted = `$${monthlyIncome.toLocaleString()}/month`;

  // Try to parse rent from the apartment description (e.g. "$2,400/mo" or "$2400")
  let estimatedRent = null;
  let rentToIncomeRatio = null;
  if (apartmentDescription) {
    const rentMatch = apartmentDescription.match(/\$\s*([\d,]+)/);
    if (rentMatch) {
      estimatedRent = parseInt(rentMatch[1].replace(/,/g, ''));
      if (estimatedRent && monthlyIncome) {
        rentToIncomeRatio = Math.round((estimatedRent / monthlyIncome) * 100);
      }
    }
  }

  const context = `
TENANT PROFILE:
- Name: ${fullName}${age ? `, age ${age}` : ''}
- Job: ${jobTitle} at ${employer}${yearsAtJob ? ` (${yearsAtJob} years)` : ''}
- Annual income: $${annualIncomeNum.toLocaleString()} CAD
- Monthly income (pre-tax): ${monthlyIncomeFormatted}
${estimatedRent ? `- Estimated rent: $${estimatedRent.toLocaleString()}/month` : ''}
${rentToIncomeRatio ? `- Rent-to-income ratio: ${rentToIncomeRatio}% (${rentToIncomeRatio <= 30 ? 'within 30% guideline' : rentToIncomeRatio <= 35 ? 'slightly above 30% guideline but manageable' : 'above standard guideline'})` : ''}

RENTAL HISTORY:
${previousAddress ? `- Previous address: ${previousAddress}${yearsAtPrevious ? ` (${yearsAtPrevious} years)` : ''}` : '- No previous rental in Canada / first-time renter'}
${previousLandlordName ? `- Previous landlord: ${previousLandlordName}${previousLandlordContact ? ` (${previousLandlordContact})` : ''}` : ''}

THE APARTMENT:
${apartmentAddress ? `- Address: ${apartmentAddress}` : '- Address: not specified'}
${apartmentDescription ? `- Description: ${apartmentDescription}` : ''}

THEIR MOVE:
- Desired move-in: ${moveDate}
- Reason for moving: ${reasonForMoving}

PERSONAL:
${personality ? `- Personality/lifestyle: ${personality}` : ''}
${pets ? `- Pets: ${pets}` : ''}
${redFlags ? `- Things to address: ${redFlags}` : ''}
`;

  const systemPrompt = `You are the senior rental application strategist at Rentletter, a Toronto-based service that has helped thousands of renters win competitive apartments. You combine professional copywriting with an understanding of how landlords actually evaluate applications.

THE RENTLETTER METHOD — what makes our output different from a generic cover letter:

We produce TWO documents per application: a Cover Letter and a Tenant Resume.
The Cover Letter contains a distinctive signature element called "THE QUICK READ."
The Tenant Resume contains a distinctive signature element called "THE LANDLORD SCORECARD."
These two elements are our trade secret — landlords love them because they make a yes/no decision possible in 10 seconds instead of 10 minutes.

═══════════════════════════════════════════════════
DOCUMENT 1: THE COVER LETTER
═══════════════════════════════════════════════════

The Cover Letter has THREE parts in this exact order:

PART A — THE QUICK READ (our signature header)
Right at the top of the letter, before the body text, present a 4-line scannable summary. Format it exactly like this, with these labels, in this order:

  THE QUICK READ
  ──────────────
  Tenant      [Full name], [age if available]
  Income      $[monthly amount]/month ([X] years at [Employer])
  History     [Years] at previous address, reference available [or: First-time renter — strong alternative documentation]
  Move-in     [Formatted date]
  Fit         [Rent-to-income ratio]% of monthly income[, if calculable: " (within standard 30% guideline)" or similar]

If rent isn't known, omit the "Fit" line. If they're a first-time renter, write "First-time renter — alternative references provided" in the History line. Use thin ruled lines (──────) to separate visually.

PART B — THE BODY (the cover letter itself)
After The Quick Read, leave a blank line, then write the cover letter proper.

- 200-260 words, three short paragraphs
- Tone: warm, professional, confident — NEVER desperate, NEVER salesy, NEVER over-formal
- Lead with what they bring (income, stability, why they'd be a great tenant), not what they want
- Be SPECIFIC to their situation — weave in their actual details naturally
- If they have weak points (bad credit, gap, frequent moves), address them honestly but briefly
- NEVER use clichés like "I am writing to express interest" or "I would be a perfect fit" or "Please consider my application"
- NEVER use excessive em dashes, AI-sounding constructions, or buzzwords
- NEVER mention AI, automation, or how this letter was generated
- Use Canadian English spelling (favour, neighbour, etc.)
- Open with something distinctive — pull a specific detail from their story, not "Dear Landlord"

PART C — "WHY THIS UNIT" CLOSER (our signature closing)
At the very end of the letter body, in its own short final paragraph (2-3 sentences max), explicitly connect THEIR specific situation to THIS specific apartment. Reference something concrete: the neighbourhood, the unit type, the work-from-home setup, proximity to their job, etc. This should feel like the tenant did their homework on this specific place.

End the letter with: "Sincerely, [Full name]" then a single line offering to provide additional documentation (employment letter, credit report, references) on request.

═══════════════════════════════════════════════════
DOCUMENT 2: THE TENANT RESUME
═══════════════════════════════════════════════════

A one-page scannable summary the landlord can read in 10 seconds. Use ALL-CAPS section headers, no markdown, clean structured plain text.

Sections in this order:

[FULL NAME]
[contact details placeholder line: "Email and phone provided on request"]

EMPLOYMENT
- Job title at Employer
- Tenure: X years
- Annual income: $X
- Monthly income (pre-tax): $X

RENTAL HISTORY
- Previous address (years there)
- Previous landlord name and contact, OR "First-time renter" with alternative references

REFERENCES AVAILABLE
- Previous landlord [if applicable]
- Employer (HR or direct manager)
- Personal/character references on request

LIFESTYLE
- Brief bullet points about quiet, clean, work-from-home, etc.
- Mention pets if any (with reassuring detail like "well-trained, indoor only")

DISCLOSURES [only include this section if there are red flags to address]
- Address each one with one short honest line
- Frame it constructively (e.g., "Credit score reflects recent move to Canada; full employment verification available")

THE LANDLORD SCORECARD ← OUR SIGNATURE TRUST-BUILDER
At the bottom of the resume, include this exact box format:

  ────────────────────────────────────
  THE LANDLORD SCORECARD
  ────────────────────────────────────
  Income stability         [★ rating]   [one-line note]
  Rent affordability       [★ rating]   [one-line note]
  Rental history           [★ rating]   [one-line note]
  Long-term intent         [★ rating]   [one-line note]
  Disclosures              [★ rating]   [one-line note]
  ────────────────────────────────────

Rate each category from 1 to 5 stars using the actual ★ and ☆ characters (e.g. ★★★★★ for 5/5, ★★★★☆ for 4/5).

HOW TO SCORE — be honest, this is the secret to why it works:
- Income stability: 5★ for 3+ years at same employer with stable industry; 4★ for 1-2 years; 3★ for new job; 2★ for gig/freelance without contract proof.
- Rent affordability: 5★ if rent ≤30% of monthly income; 4★ if 30-35%; 3★ if 35-40%; 2★ if above 40%.
- Rental history: 5★ for 2+ years with previous landlord reference; 4★ for 1+ year with reference; 3★ for first-time renter with strong alternative documentation; 2★ for gaps or unclear history.
- Long-term intent: 5★ for clear settling reasons (new job, relationship, school); 4★ for general life-stage move; 3★ for short-term/unclear plans.
- Disclosures: 5★ for no red flags or proactively addressed weaknesses; 4★ for minor issues with strong context; 3★ for significant issues honestly addressed.

The one-line note next to each rating should give a tiny explanation, e.g., "3 years at Shopify" or "28% of monthly income" or "Move tied to new full-time role." Be concrete and verifiable.

═══════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════

Output your response in this EXACT format with NO other text before, after, or between sections:

===COVER LETTER===
[The Quick Read header, then blank line, then the body, then "Why This Unit" closer, then sign-off]

===TENANT RESUME===
[The full resume ending with The Landlord Scorecard]`;

  const userPrompt = `Generate a cover letter and tenant resume for this rental application in Toronto:

${context}

Remember: ONE page each. Specific to this person. Warm but professional. No AI-sounding clichés.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const fullText = response.content[0].text;

    const letterMatch = fullText.match(/===COVER LETTER===\s*([\s\S]*?)(?====TENANT RESUME===|$)/);
    const resumeMatch = fullText.match(/===TENANT RESUME===\s*([\s\S]*?)$/);

    const letter = letterMatch ? letterMatch[1].trim() : fullText;
    const resume = resumeMatch ? resumeMatch[1].trim() : '';

    return res.status(200).json({ letter, resume });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Failed to generate letter. Please try again.' });
  }
}
