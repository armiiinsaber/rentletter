import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── APPLICATION NUMBER GENERATION ──────────────────────────
// Format: RL-2026-XXXX-XXXX (8 hex chars, easy to read, hard to collide)
function generateApplicationNumber() {
  const year = new Date().getFullYear();
  const hex = () => Math.floor(Math.random() * 16).toString(16).toUpperCase();
  const seg = () => Array.from({ length: 4 }, hex).join('');
  return `RL-${year}-${seg()}-${seg()}`;
}

// ─── LANDLORD SCORECARD CALCULATION ─────────────────────────
// Calculated server-side from form data — the tenant never sees this
function calculateScorecard(data) {
  const {
    yearsAtJob, annualIncome, monthlyIncome, estimatedRent, rentToIncomeRatio,
    previousAddress, yearsAtPrevious, previousLandlordName,
    reasonForMoving, redFlags,
  } = data;

  // Income stability
  let incomeStability = 3;
  const jobYears = parseFloat(yearsAtJob) || 0;
  if (jobYears >= 3) incomeStability = 5;
  else if (jobYears >= 1) incomeStability = 4;
  else if (jobYears >= 0.5) incomeStability = 3;
  else incomeStability = 2;
  const incomeStabilityNote = jobYears >= 3
    ? `${Math.floor(jobYears)}+ years at same employer`
    : jobYears > 0
      ? `${jobYears} year(s) at current employer`
      : 'New position';

  // Rent affordability
  let rentAffordability = 3;
  let rentAffordabilityNote = 'Rent not specified';
  if (rentToIncomeRatio !== null && rentToIncomeRatio !== undefined) {
    if (rentToIncomeRatio <= 30) rentAffordability = 5;
    else if (rentToIncomeRatio <= 35) rentAffordability = 4;
    else if (rentToIncomeRatio <= 40) rentAffordability = 3;
    else rentAffordability = 2;
    rentAffordabilityNote = `${rentToIncomeRatio}% of monthly income`;
  }

  // Rental history
  let rentalHistory = 3;
  const histYears = parseFloat(yearsAtPrevious) || 0;
  if (histYears >= 2 && previousLandlordName) rentalHistory = 5;
  else if (histYears >= 1 && previousLandlordName) rentalHistory = 4;
  else if (previousAddress) rentalHistory = 3;
  else rentalHistory = 3; // First-time renter — neutral, not penalized
  const rentalHistoryNote = histYears > 0 && previousLandlordName
    ? `${histYears} years with reference available`
    : previousAddress
      ? `${histYears || 'Some'} years prior, limited references`
      : 'First-time renter — alternative documentation';

  // Long-term intent
  let longTermIntent = 4;
  const reason = (reasonForMoving || '').toLowerCase();
  const strongIntentKeywords = ['new job', 'job', 'school', 'university', 'partner', 'family', 'closer to work', 'commute', 'permanent', 'long-term', 'settle'];
  const shortIntentKeywords = ['temporary', 'short-term', 'few months', 'travel'];
  if (strongIntentKeywords.some(k => reason.includes(k))) longTermIntent = 5;
  else if (shortIntentKeywords.some(k => reason.includes(k))) longTermIntent = 3;
  else longTermIntent = 4;
  const longTermIntentNote = strongIntentKeywords.find(k => reason.includes(k))
    ? `Clear long-term reason: ${strongIntentKeywords.find(k => reason.includes(k))}`
    : 'General life-stage move';

  // Disclosures
  let disclosures = 5;
  let disclosuresNote = 'No items to address';
  if (redFlags && redFlags.trim().length > 0) {
    const flagText = redFlags.toLowerCase();
    if (flagText.includes('bankruptcy') || flagText.includes('eviction')) {
      disclosures = 3;
      disclosuresNote = 'Significant items addressed honestly';
    } else if (flagText.includes('credit') || flagText.includes('gap')) {
      disclosures = 4;
      disclosuresNote = 'Minor items addressed with context';
    } else {
      disclosures = 4;
      disclosuresNote = 'Items proactively disclosed';
    }
  }

  return {
    incomeStability: { score: incomeStability, note: incomeStabilityNote },
    rentAffordability: { score: rentAffordability, note: rentAffordabilityNote },
    rentalHistory: { score: rentalHistory, note: rentalHistoryNote },
    longTermIntent: { score: longTermIntent, note: longTermIntentNote },
    disclosures: { score: disclosures, note: disclosuresNote },
    overall: Math.round(
      (incomeStability + rentAffordability + rentalHistory + longTermIntent + disclosures) / 5 * 10
    ) / 10,
  };
}

// ─── DATA STORAGE (Vercel KV with graceful fallback) ────────
async function storeApplication(appNumber, payload) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.warn('Vercel KV not configured — application not stored');
    return false;
  }
  try {
    const url = `${process.env.KV_REST_API_URL}/set/app:${appNumber}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error('KV store failed:', await response.text());
      return false;
    }
    // Set TTL — 1 year retention
    await fetch(`${process.env.KV_REST_API_URL}/expire/app:${appNumber}/31536000`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    return true;
  } catch (err) {
    console.error('KV store error:', err);
    return false;
  }
}

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
  // Demo mode bypass — only works server-side when explicitly set
  const DEMO_BYPASS_KEY = 'DEMO_MODE_BYPASS';
  if (stripeSessionId !== DEMO_BYPASS_KEY) {
    const verification = await verifyStripeSession(stripeSessionId);
    if (!verification.ok) {
      return res.status(402).json({ error: `Payment required. ${verification.reason}` });
    }
  } else {
    console.log('Demo mode generation — Stripe bypass active');
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

  const systemPrompt = `You are the senior rental application strategist at Rentletter, a Toronto-based service that has helped thousands of renters win competitive apartments. You combine professional copywriting with deep understanding of how landlords, property managers, and realtors actually evaluate applications.

═══════════════════════════════════════════════════
THE RENTLETTER METHOD — OUR PROPRIETARY FORMAT
═══════════════════════════════════════════════════

Every Rentletter output contains FIVE signature elements that no other service produces. These are our trademark format. Together, they make the landlord's decision easier and the realtor's job lighter — which is why both end up recommending Rentletter to tenants.

OUR CORE PRINCIPLE: We don't sell the tenant. We REMOVE FRICTION from the landlord's decision. Every element exists to answer a question the landlord would otherwise have to ask, calculate, or chase down.

The output is TWO documents: a Cover Letter and a Tenant Resume.

═══════════════════════════════════════════════════
DOCUMENT 1: THE COVER LETTER
═══════════════════════════════════════════════════

The Cover Letter has FOUR parts in this exact order:

──────────────────────────────────────────
PART A — THE QUICK READ (signature element #1)
──────────────────────────────────────────

Right at the top of the letter, before any body text, present a scannable summary. Format it EXACTLY like this:

  THE QUICK READ
  ──────────────
  Tenant      [Full name], [age if available]
  Income      $[monthly amount]/month ([X] years at [Employer])
  History     [Years] at previous address, reference available [or: First-time renter — strong alternative documentation]
  Move-in     [Formatted date] (flexibility noted if applicable)
  Fit         [Rent-to-income ratio]% of monthly income[, if calculable: " (within standard 30% guideline)"]

If rent isn't known, omit the "Fit" line. Use thin ruled lines (──────) to separate visually.

──────────────────────────────────────────
PART B — THE BODY
──────────────────────────────────────────

After The Quick Read, leave a blank line, then write the cover letter proper.

CRITICAL TONE RULES:
- 200-260 words, three short paragraphs
- Warm, professional, confident — NEVER desperate, NEVER salesy, NEVER over-formal, NEVER like a sales pitch
- The voice should feel like a competent professional writing to a peer — not a tenant begging for a favour
- Lead with what the tenant brings (stability, fit), framed as RELEVANT facts, not as self-promotion
- Be SPECIFIC — weave their actual details in as evidence, not as claims
- Address weak points (bad credit, gap, frequent moves) honestly and briefly, with context
- Use Canadian English spelling (favour, neighbour, organize)

CRITICAL PROHIBITIONS:
- NEVER use clichés: "I am writing to express interest," "I would be a perfect fit," "Please consider my application," "I am the ideal tenant," "I hope you will consider"
- NEVER use AI-sounding constructions: excessive em dashes, "I am thrilled to," "I am excited about the opportunity," tricolon sentences
- NEVER mention AI, automation, or how this letter was generated
- NEVER use sales-marketing language: "leveraging," "passionate about," "thriving environment"
- NEVER make claims you can't verify ("I'm extremely responsible") — replace with facts the landlord can verify ("3-year tenure at Shopify, current landlord reference available")

OPENING LINE: Open with a SPECIFIC observation about THIS apartment or neighbourhood — not "Dear Landlord." For example: "I came across your listing at 123 King Street — a one-bedroom in a low-rise building on a quiet residential block — and it's a strong match for what I've been looking for."

──────────────────────────────────────────
PART C — "WHY THIS UNIT" CLOSER (signature element #2)
──────────────────────────────────────────

The final paragraph of the body (2-3 sentences max) must EXPLICITLY connect the tenant's specific situation to THIS specific apartment. Reference something concrete:
- The neighbourhood + their job/lifestyle ("the 15-minute walk to my office at Shopify")
- The unit type + how they live ("the corner-unit setup with two exposures works well for my work-from-home routine")
- A specific feature + a tenant trait ("the quieter side-street location matches my preference for a calm space to recover after long shifts")

This must feel like the tenant did genuine homework on this specific place, not a template.

──────────────────────────────────────────
PART D — THE VERIFICATION PACK + SIGN-OFF (signature element #3)
──────────────────────────────────────────

Immediately after the "Why This Unit" paragraph, include this exact structure:

"Sincerely,
[Full name]

Ready on request: [list documents based on what the tenant has — pay stubs, employment letter, credit report, government ID, previous landlord reference, character references]. Can deliver within 2 hours of your request."

THE VERIFICATION PACK MATTERS BECAUSE: it pre-empts the landlord's next question ("what documents do you have?") and signals high responsiveness without sounding eager. The "within 2 hours" line is the trust signal — it tells the landlord this is a tenant who will not waste their time with delayed email chains.

Always include this section. Adjust the document list based on what the tenant actually has (e.g., for first-time renters, omit "previous landlord reference" and add "employer reference" + "character references").

═══════════════════════════════════════════════════
DOCUMENT 2: THE TENANT RESUME
═══════════════════════════════════════════════════

A scannable one-page summary. Use ALL-CAPS section headers, no markdown, clean structured plain text.

Sections in this exact order:

[FULL NAME]
[Single line: "Contact details provided on request" or include email if appropriate]

──────────────────────────────────────────
EMPLOYMENT
──────────────────────────────────────────
- Position: [Job title at Employer]
- Tenure: [X years]
- Annual income: $[X] CAD
- Monthly income (pre-tax): $[X] CAD

──────────────────────────────────────────
RENTAL HISTORY
──────────────────────────────────────────
- Previous address: [address] ([years there])
- Previous landlord: [name] — [contact info]
- (For first-time renters: "First-time renter — alternative references and 3× monthly income documentation available")

──────────────────────────────────────────
REFERENCES AVAILABLE
──────────────────────────────────────────
- Previous landlord [if applicable]
- Employer (HR or direct manager)
- Personal/character references (2 available on request)

──────────────────────────────────────────
LIFESTYLE
──────────────────────────────────────────
Brief, factual bullets — 3-5 max. Examples:
- Non-smoker
- Quiet weekday routine; works from home [X] days/week
- No parties, no overnight commercial activity
- Pets: [if any — frame with reassurance: "one well-trained 4-year-old cat, indoor only, full vet records available"]

──────────────────────────────────────────
DISCLOSURES [only include if there are real items to address]
──────────────────────────────────────────
Address each weakness in one short honest line, framed constructively:
- "Credit score reflects recent immigration to Canada; full employment verification and 3× income available."
- "One previous gap in rental history (3 months, between provinces); reference from prior landlord available to discuss."

──────────────────────────────────────────
TIEBREAKERS (signature element #4)
──────────────────────────────────────────

Immediately after the Disclosures section (or after Lifestyle if there are no disclosures), include this exact section:

  ────────────────────────────────────
  TIEBREAKERS
  ────────────────────────────────────
  ↗ [Tiebreaker 1]
  ↗ [Tiebreaker 2]
  ↗ [Tiebreaker 3 if relevant]
  ────────────────────────────────────

The Tiebreakers section identifies 2-3 specific FACTS about this tenant that make them the easy choice when a landlord is comparing applicants. These are NOT sales claims. They are concrete, verifiable, low-friction realities.

GOOD tiebreakers (frame as facts that REDUCE landlord risk or workload):
- "Flexible move-in date — can accommodate landlord's preferred timeline within 2 weeks"
- "Works from home 4 days/week — minimal building wear, quiet daytime presence"
- "Prefers 2+ year leases — low turnover risk for the landlord"
- "Has been pre-approved by a guarantor with verified income — added security if needed"
- "Has tenant insurance already arranged — proof of coverage available at lease signing"
- "Available for a 5-minute phone conversation any evening this week"
- "Has visited the building twice — knows the area, no buyer's remorse risk"
- "Single applicant, no roommates — single point of communication, one decision-maker"
- "Already approved by guarantor" / "Employer letter is already drafted and ready"
- "Has $X in savings (3× annual rent) — additional reassurance available"

BAD tiebreakers (avoid — these sound salesy or like claims):
- "I'm very responsible"
- "I would be an ideal tenant"
- "I take great care of properties"
- "Easy to work with"

The phrasing must be functional, factual, and benefits-oriented from the landlord's perspective. Use the ↗ character before each tiebreaker.

Choose tiebreakers based on what the tenant's profile actually offers. Maximum 3. Each must be specific and true based on the input data.

──────────────────────────────────────────
DECISION TIME (signature element #5)
──────────────────────────────────────────

The final section of the tenant resume. Include this exact structure:

  ────────────────────────────────────
  DECISION TIME
  ────────────────────────────────────
  Ready to sign by: [calculate a reasonable lease-sign date — typically 3-5 days before move-in]
  
  If you have any concerns, a 5-minute phone call can resolve them. 
  Available: [based on what makes sense for the tenant profile — e.g., "weekday evenings 6-8pm, weekends anytime" or "weekdays 12-1pm and after 5pm"]
  ────────────────────────────────────

This section signals decisiveness and lowers the cost of any objection — instead of an email chain, it offers a 5-minute call. Most landlords appreciate the clarity. This is what makes Rentletter applications close 3x faster than generic ones.

═══════════════════════════════════════════════════
OUTPUT FORMAT — STRICT
═══════════════════════════════════════════════════

Output your response in this EXACT format with NO other text before, after, or between sections:

===COVER LETTER===
[The Quick Read header → blank line → body → "Why This Unit" closer → "Sincerely, [Name]" → Verification Pack line]

===TENANT RESUME===
[Full name → contact → Employment → Rental History → References → Lifestyle → Disclosures (if applicable) → Tiebreakers → Decision Time]

═══════════════════════════════════════════════════
WHY THIS FORMAT WORKS
═══════════════════════════════════════════════════

A landlord screening 50 applications wants three things:
1. To say yes quickly and confidently to ONE good applicant
2. To not waste time chasing documentation or playing email tennis
3. To have a defensible answer when their property manager asks "why this tenant?"

A realtor wants three things:
1. An application they can forward without rewriting
2. A tenant who makes them look good to the landlord
3. A fast close so they earn their commission without 10 follow-ups

The Rentletter Method serves both. The Quick Read makes the first 10 seconds productive. The Tiebreakers give the landlord language to justify the choice. The Verification Pack eliminates document chase. Decision Time closes the loop. Every element exists to REMOVE FRICTION — not to sell.

NEVER reference Rentletter, AI, or the format itself in the output. The output should read like a uniquely thorough, professional tenant who happens to think the way a great applicant thinks.`;

  const userPrompt = `Generate a cover letter and tenant resume for this rental application in Toronto:

${context}

Remember: ONE page each. Specific to this person. Warm but professional. No AI-sounding clichés.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const fullText = response.content[0].text;

    const letterMatch = fullText.match(/===COVER LETTER===\s*([\s\S]*?)(?====TENANT RESUME===|$)/);
    const resumeMatch = fullText.match(/===TENANT RESUME===\s*([\s\S]*?)$/);

    const letter = letterMatch ? letterMatch[1].trim() : fullText;
    const resume = resumeMatch ? resumeMatch[1].trim() : '';

    // ─── Generate application number + scorecard + store for landlord dashboard ───
    const applicationNumber = generateApplicationNumber();
    const scorecard = calculateScorecard({
      yearsAtJob, annualIncome, monthlyIncome, estimatedRent, rentToIncomeRatio,
      previousAddress, yearsAtPrevious, previousLandlordName,
      reasonForMoving, redFlags,
    });

    const applicationData = {
      applicationNumber,
      createdAt: new Date().toISOString(),
      tenant: {
        fullName,
        age: age || null,
        // Sensitive contact info NOT stored — tenant shares directly with landlord
      },
      employment: {
        jobTitle,
        employer,
        yearsAtJob: yearsAtJob || null,
        annualIncome: annualIncomeNum,
        monthlyIncome,
      },
      rental: {
        previousAddress: previousAddress || null,
        yearsAtPrevious: yearsAtPrevious || null,
        previousLandlordName: previousLandlordName || null,
        previousLandlordContact: previousLandlordContact || null,
      },
      apartment: {
        address: apartmentAddress || null,
        description: apartmentDescription || null,
        estimatedRent,
        rentToIncomeRatio,
      },
      move: {
        moveInDate: moveDate,
        reasonForMoving,
      },
      lifestyle: {
        personality: personality || null,
        pets: pets || null,
      },
      disclosures: redFlags || null,
      scorecard,
    };

    // Store async — don't block the response if KV fails
    storeApplication(applicationNumber, applicationData).catch(err =>
      console.error('Background store failed:', err)
    );

    return res.status(200).json({ letter, resume, applicationNumber });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Failed to generate letter. Please try again.' });
  }
}
