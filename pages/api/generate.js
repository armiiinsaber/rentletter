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

  const context = `
TENANT PROFILE:
- Name: ${fullName}${age ? `, age ${age}` : ''}
- Job: ${jobTitle} at ${employer}${yearsAtJob ? ` (${yearsAtJob} years)` : ''}
- Annual income: $${parseInt(annualIncome).toLocaleString()} CAD

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

  const systemPrompt = `You are an expert rental application copywriter who has helped thousands of Toronto renters win competitive apartments in tight markets.

You write cover letters that signal three things landlords care about most:
1. STABILITY — steady income, long tenure at job, good rental history
2. RESPONSIBILITY — quiet, clean, pays on time, takes care of property
3. SPECIFICITY — real person with real reasons, not a generic template

CRITICAL RULES:
- Letter must be ONE PAGE — around 250-300 words, three short paragraphs
- Tone: warm, professional, confident — NEVER desperate, NEVER salesy, NEVER over-formal
- Lead with what they bring (income, stability), not what they want
- Be SPECIFIC to their situation — weave in their actual details naturally
- If they have weak points (bad credit, gap), address them honestly but briefly
- Sign off with full name and a line offering to provide additional documentation on request
- DO NOT use clichés like "I am writing to express interest" or "I would be a perfect fit" or "Please consider my application"
- DO NOT use em dashes excessively or AI-sounding constructions
- DO NOT mention you are AI
- Use Canadian English spelling
- Open with something distinctive, not generic — pull a specific detail from their story

You also write a SCANNABLE TENANT RESUME — a one-page summary the landlord can scan in 10 seconds:
- Header with name
- EMPLOYMENT section with job, employer, tenure, income
- RENTAL HISTORY section with previous address and landlord contact
- REFERENCES section
- PERSONAL NOTES section
- Use clear ALL-CAPS section headers and clean structured text — no markdown asterisks or hashtags

Output your response in this EXACT format with NO other text before, after, or between sections:

===COVER LETTER===
[the letter, starting with the date and addressee]

===TENANT RESUME===
[the resume in clean structured plain text format]`;

  const userPrompt = `Generate a cover letter and tenant resume for this rental application in Toronto:

${context}

Remember: ONE page each. Specific to this person. Warm but professional. No AI-sounding clichés.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
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
