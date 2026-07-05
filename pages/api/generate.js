import Anthropic from '@anthropic-ai/sdk';
import { bump, logEvent, COUNTERS } from '../../lib/stats';
import {
  incomeLevelScore, rentAffordabilityScore, employmentStabilityScore,
  rentalHistoryScore, overallScore,
} from '../../lib/scoring';

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
    yearsAtJob, householdAnnualIncome, householdRentToIncomeRatio, hasCoApplicant,
    previousAddress, yearsAtPrevious, previousLandlordName, referencesCount,
    reasonForMoving, redFlags,
  } = data;

  // Employment tenure/stability — smooth ramp (see lib/scoring.js). Note keeps the years phrasing.
  const jobYears = parseFloat(yearsAtJob) || 0;
  const incomeStability = employmentStabilityScore(jobYears);
  const incomeStabilityNote = jobYears >= 3
    ? `${Math.floor(jobYears)}+ years at same employer`
    : jobYears > 0
      ? `${jobYears} year(s) at current employer`
      : 'New position';

  // Rent affordability — smooth Toronto-calibrated blend of rent-to-income + a diminishing
  // income-level buffer, on HOUSEHOLD income when there is a co-applicant (see lib/scoring.js).
  let rentAffordability = 3;
  let rentAffordabilityNote = 'Rent not specified';
  if (householdRentToIncomeRatio !== null && householdRentToIncomeRatio !== undefined) {
    rentAffordability = rentAffordabilityScore(householdAnnualIncome, householdRentToIncomeRatio);
    rentAffordabilityNote = `${householdRentToIncomeRatio}% of ${hasCoApplicant ? 'combined household' : 'monthly'} income`;
  }

  // Rental history + references — smooth base from prior tenancy, references corroborate.
  const histYears = parseFloat(yearsAtPrevious) || 0;
  const rentalHistory = rentalHistoryScore({
    yearsAtPrevious: histYears, previousLandlordName, previousAddress, referencesCount,
  });
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
    overall: overallScore({
      incomeStability, rentAffordability, rentalHistory, longTermIntent, disclosures,
    }),
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

// Update only the coverLetter field of an existing application (used in letter-purchase flow)
async function updateApplicationLetter(appNumber, letter) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return false;
  try {
    // Fetch existing
    const getRes = await fetch(`${process.env.KV_REST_API_URL}/get/app:${appNumber}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const data = await getRes.json();
    if (!data?.result) {
      console.error('updateApplicationLetter: application not found:', appNumber);
      return false;
    }
    const existing = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    existing.coverLetter = letter;
    existing.letterPurchasedAt = new Date().toISOString();
    // Save back
    await fetch(`${process.env.KV_REST_API_URL}/set/app:${appNumber}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(existing),
    });
    return true;
  } catch (err) {
    console.error('updateApplicationLetter error:', err);
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

// ─── PASS TOKEN VERIFICATION (30-day unlimited) ─────────────
async function verifyPassToken(passToken) {
  if (!passToken) return { ok: false, reason: 'No pass token provided' };
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return { ok: false, reason: 'Pass system not configured' };
  }

  const normalized = String(passToken).trim().toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(normalized)) {
    return { ok: false, reason: 'Invalid pass token format' };
  }

  try {
    const lookupRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/pass:${normalized}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );

    if (!lookupRes.ok) return { ok: false, reason: 'Pass lookup failed' };

    const data = await lookupRes.json();
    if (!data || !data.result) return { ok: false, reason: 'Pass not found or expired' };

    let pass;
    try {
      pass = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (parseErr) {
      return { ok: false, reason: 'Pass data corrupted' };
    }

    if (new Date(pass.expiresAt).getTime() < Date.now()) {
      return { ok: false, reason: 'Pass has expired' };
    }

    return { ok: true, pass };
  } catch (err) {
    console.error('Pass verification error:', err);
    return { ok: false, reason: 'Pass verification error' };
  }
}
async function incrementPassUsage(passToken) {  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return;
  const normalized = String(passToken).trim().toUpperCase();
  try {
    const lookupRes = await fetch(
      `${process.env.KV_REST_API_URL}/get/pass:${normalized}`,
      { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } }
    );
    if (!lookupRes.ok) return;
    const data = await lookupRes.json();
    if (!data?.result) return;

    const pass = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    pass.lettersGenerated = (pass.lettersGenerated || 0) + 1;
    pass.lastUsedAt = new Date().toISOString();

    await fetch(`${process.env.KV_REST_API_URL}/set/pass:${normalized}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pass),
    });
    // Reset TTL to preserve expiration
    const ttlSec = Math.floor((new Date(pass.expiresAt).getTime() - Date.now()) / 1000);
    if (ttlSec > 0) {
      await fetch(`${process.env.KV_REST_API_URL}/expire/pass:${normalized}/${ttlSec}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
    }
  } catch (err) {
    console.error('Increment pass usage failed:', err);
  }
}

// ─── TEMPLATED TENANT RESUME (NO AI) ──────────────
// Builds a structured, professional resume from form data alone.
// Zero API tokens used. This is the FREE tier.
function buildTemplatedResume(data) {
  const {
    fullName, age, dateOfBirth, phone, email,
    jobTitle, employer, yearsAtJob, annualIncome, monthlyIncome,
    previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
    currentRent,
    moveDate, reasonForMoving,
    apartmentAddress, apartmentDescription,
    numberOfOccupants, occupantsDetails, smoker,
    hasCoApplicant, coApplicantName, coApplicantRelationship, coApplicantJobTitle, coApplicantEmployer, coApplicantIncome,
    personality, pets,
    hasVehicle, vehicleMakeModel, vehicleYear,
    references,
    estimatedRent, rentToIncomeRatio,
    redFlags,
  } = data;

  const fmtIncome = (n) => n ? `$${Number(n).toLocaleString()}` : '—';
  const yearsLabel = (y) => {
    if (!y) return null;
    const n = parseFloat(y);
    if (isNaN(n)) return y;
    if (n < 1) return `${Math.round(n * 12)} months`;
    if (n === 1) return '1 year';
    return `${n} years`;
  };

  const lines = [];
  lines.push(`TENANT APPLICATION SUMMARY`);
  lines.push(``);
  lines.push(`Applicant: ${fullName}`);
  if (age) lines.push(`Age: ${age}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  lines.push(``);
  lines.push(`— EMPLOYMENT —`);
  lines.push(`${jobTitle} at ${employer || 'employer'}`);
  if (yearsAtJob) lines.push(`Tenure: ${yearsLabel(yearsAtJob)}`);
  lines.push(`Annual income: ${fmtIncome(annualIncome)}`);
  if (monthlyIncome) lines.push(`Monthly income: ${fmtIncome(monthlyIncome)}`);
  if (estimatedRent && rentToIncomeRatio) {
    lines.push(`Rent-to-income ratio: ${rentToIncomeRatio}% (rent $${estimatedRent.toLocaleString()} / monthly income $${monthlyIncome.toLocaleString()})`);
  }
  lines.push(``);

  if (previousAddress || previousLandlordName) {
    lines.push(`— RENTAL HISTORY —`);
    if (previousAddress) lines.push(`Previous address: ${previousAddress}`);
    if (yearsAtPrevious) lines.push(`Duration: ${yearsLabel(yearsAtPrevious)}`);
    if (previousLandlordName) {
      lines.push(`Previous landlord: ${previousLandlordName}${previousLandlordContact ? ` (${previousLandlordContact})` : ''}`);
    }
    if (currentRent) lines.push(`Current rent: $${Number(currentRent).toLocaleString()}/mo`);
    lines.push(``);
  }

  lines.push(`— UNIT OF INTEREST —`);
  if (apartmentAddress) lines.push(`Address: ${apartmentAddress}`);
  if (apartmentDescription) lines.push(`Details: ${apartmentDescription}`);
  if (moveDate) lines.push(`Desired move-in: ${moveDate}`);
  if (reasonForMoving) lines.push(`Reason for moving: ${reasonForMoving}`);
  lines.push(``);

  lines.push(`— HOUSEHOLD —`);
  lines.push(`Occupants: ${numberOfOccupants || '1'}`);
  if (occupantsDetails) lines.push(`Details: ${occupantsDetails}`);
  lines.push(`Smoker: ${smoker === 'yes' ? 'Yes' : 'No'}`);
  if (pets && pets.toLowerCase() !== 'none' && pets.toLowerCase() !== 'no') {
    lines.push(`Pets: ${pets}`);
  }
  if (hasVehicle && vehicleMakeModel) {
    lines.push(`Vehicle: ${vehicleMakeModel}${vehicleYear ? ` (${vehicleYear})` : ''}`);
  }
  lines.push(``);

  if (hasCoApplicant && coApplicantName) {
    lines.push(`— CO-APPLICANT —`);
    lines.push(`Name: ${coApplicantName}`);
    if (coApplicantRelationship) lines.push(`Relationship: ${coApplicantRelationship}`);
    if (coApplicantJobTitle) lines.push(`Role: ${coApplicantJobTitle}${coApplicantEmployer ? ` at ${coApplicantEmployer}` : ''}`);
    if (coApplicantIncome) lines.push(`Annual income: ${fmtIncome(coApplicantIncome)}`);
    lines.push(``);
  }

  if (Array.isArray(references) && references.length > 0) {
    lines.push(`— REFERENCES —`);
    references.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.name}${r.relationship ? ` (${r.relationship})` : ''}${r.contact ? ` — ${r.contact}` : ''}`);
    });
    lines.push(``);
  }

  if (personality) {
    lines.push(`— ABOUT THE APPLICANT —`);
    lines.push(personality);
    lines.push(``);
  }

  if (redFlags) {
    lines.push(`— DISCLOSURES —`);
    lines.push(redFlags);
    lines.push(``);
  }

  return lines.join('\n').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { stripeSessionId, passToken, mode, applicationNumber: existingAppNumber, ...formData } = req.body;
  // mode: 'application' (free, default) | 'letter' (premium, requires payment)
  const requestMode = mode === 'letter' ? 'letter' : 'application';

  const {
    email,
    apartmentAddress, apartmentDescription,
    fullName, age, dateOfBirth, phone,
    jobTitle, employer, yearsAtJob, annualIncome,
    previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
    currentRent,
    moveInDate, reasonForMoving,
    numberOfOccupants, occupantsDetails, smoker, evParkingNeeded,
    hasCoApplicant, coApplicantName, coApplicantAge, coApplicantEmployer,
    coApplicantJobTitle, coApplicantIncome, coApplicantRelationship,
    personality, pets, redFlags,
    hasVehicle, vehicleMakeModel, vehicleYear,
    reference1Name, reference1Relationship, reference1Contact,
    reference2Name, reference2Relationship, reference2Contact,
  } = formData;

  if (!fullName || !jobTitle || !annualIncome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ── ACCESS GATE ──
  // Application mode: always free, no AI used.
  // Letter mode: gated by Stripe session or valid pass — uses AI tokens.
  const DEMO_BYPASS_KEY = 'DEMO_MODE_BYPASS';
  let accessMethod = requestMode === 'application' ? 'free' : null;

  if (requestMode === 'letter') {
    // Letter mode REQUIRES payment proof
    if (stripeSessionId === DEMO_BYPASS_KEY) {
      accessMethod = 'demo';
    } else if (passToken) {
      const passValid = await verifyPassToken(passToken);
      if (!passValid.ok) {
        return res.status(402).json({ error: `Pass invalid. ${passValid.reason}` });
      }
      accessMethod = 'pass';
      incrementPassUsage(passToken).catch(err => console.error('Pass increment failed:', err));
    } else if (stripeSessionId) {
      const verification = await verifyStripeSession(stripeSessionId);
      if (!verification.ok) {
        return res.status(402).json({ error: `Payment required for cover letter. ${verification.reason}` });
      }
      accessMethod = 'stripe';
    } else {
      return res.status(402).json({ error: 'Payment required to generate cover letter. Submit your application first (free), then add a cover letter.' });
    }
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
- Name: ${fullName}${age ? `, age ${age}` : ''}${dateOfBirth ? ` (DOB: ${dateOfBirth})` : ''}
${phone ? `- Phone: ${phone}` : ''}
- Job: ${jobTitle} at ${employer}${yearsAtJob ? ` (${yearsAtJob} years)` : ''}
- Annual income: $${annualIncomeNum.toLocaleString()} CAD
- Monthly income (pre-tax): ${monthlyIncomeFormatted}
${estimatedRent ? `- Estimated rent: $${estimatedRent.toLocaleString()}/month` : ''}
${rentToIncomeRatio ? `- Rent-to-income ratio: ${rentToIncomeRatio}% (${rentToIncomeRatio <= 30 ? 'within 30% guideline' : rentToIncomeRatio <= 35 ? 'slightly above 30% guideline but manageable' : 'above standard guideline'})` : ''}

CURRENT RENTAL:
${previousAddress ? `- Current address: ${previousAddress}${yearsAtPrevious ? ` (${yearsAtPrevious} years there)` : ''}` : '- No previous rental in Canada / first-time renter'}
${currentRent ? `- Current rent: $${parseInt(currentRent).toLocaleString()}/month` : ''}
${previousLandlordName ? `- Current/previous landlord: ${previousLandlordName}${previousLandlordContact ? ` (${previousLandlordContact})` : ''}` : ''}

HOUSEHOLD:
- Total occupants: ${numberOfOccupants || '1'}
${occupantsDetails ? `- Occupant details: ${occupantsDetails}` : ''}
- Smoker status: ${smoker === 'no' ? 'Non-smoker' : smoker === 'outdoor' ? 'Smokes outdoors only' : 'Smoker'}
${hasCoApplicant ? `
CO-APPLICANT:
- Name: ${coApplicantName}${coApplicantAge ? `, age ${coApplicantAge}` : ''}
- Relationship to primary applicant: ${coApplicantRelationship}
- Job: ${coApplicantJobTitle || 'Not specified'} at ${coApplicantEmployer || 'Not specified'}
${coApplicantIncome ? `- Annual income: $${parseInt(coApplicantIncome).toLocaleString()} CAD` : ''}
- COMBINED HOUSEHOLD ANNUAL INCOME: $${(annualIncomeNum + (parseInt(coApplicantIncome) || 0)).toLocaleString()} CAD
` : ''}

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

${hasVehicle ? `VEHICLE:
- ${vehicleMakeModel || 'Not specified'}${vehicleYear ? ` (${vehicleYear})` : ''}
` : ''}

${(reference1Name || reference2Name) ? `REFERENCES PROVIDED BY NAME:
${reference1Name ? `- ${reference1Name}${reference1Relationship ? ` (${reference1Relationship})` : ''}${reference1Contact ? `, contact: ${reference1Contact}` : ''}` : ''}
${reference2Name ? `- ${reference2Name}${reference2Relationship ? ` (${reference2Relationship})` : ''}${reference2Contact ? `, contact: ${reference2Contact}` : ''}` : ''}
NOTE: Reference these by name in the Tenant Resume's References section. This is more persuasive than 'references available on request.'
` : ''}
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
If the tenant has provided REFERENCES BY NAME in the input data, list each one with their name and relationship (do not include contact info in the document — landlord can request it). Format:
- Sarah Johnson — Current manager at [employer]
- David Chen — Personal reference, friend of 5 years
If no named references are provided, list role-based references that are available on request:
- Previous landlord [if applicable]
- Employer (HR or direct manager)
- Personal/character references (2 available on request)

Named references are always more persuasive than "on request." Always list them by name when provided.

──────────────────────────────────────────
HOUSEHOLD (include if multi-occupant or co-applicant)
──────────────────────────────────────────
If the household has more than 1 occupant or a co-applicant, include this section:
- Total occupants: [number]
- [Brief description if provided]
If there is a CO-APPLICANT in the input data, include their information clearly. Frame the application as joint:
- Co-applicant: [Name], [Relationship to primary]
- Their employment: [Job title at Employer]
- Their income: $[X]/year
- COMBINED household income: $[X]/year
This matters because most rentals consider total household income for affordability calculations. Highlight the combined figure.

──────────────────────────────────────────
LIFESTYLE
──────────────────────────────────────────
Brief, factual bullets — 3-5 max. Always include smoker status. Examples:
- Non-smoker (or "Outdoor smoking only" or "Smoker" — match the input)
- Quiet weekday routine; works from home [X] days/week
- No parties, no overnight commercial activity
- Pets: [if any — frame with reassurance: "one well-trained 4-year-old cat, indoor only, full vet records available"]

──────────────────────────────────────────
VEHICLE (only if provided)
──────────────────────────────────────────
If vehicle information is provided, include a single line:
- Vehicle: [Make/model] ([Year]) — relevant if parking is included with the unit

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
    let letter = '';
    let resume = '';
    let applicationNumber = existingAppNumber || null;

    if (requestMode === 'letter') {
      // LETTER MODE: tenant has paid. Generate ONLY the cover letter via AI.
      // Cheaper Haiku model is fine here; this is a one-shot personalized letter.
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const fullText = response.content[0].text;
      const letterMatch = fullText.match(/===COVER LETTER===\s*([\s\S]*?)(?====TENANT RESUME===|$)/);
      letter = letterMatch ? letterMatch[1].trim() : fullText;

      // Letter mode: also build the templated resume so the response is complete
      resume = buildTemplatedResume({
        fullName, age, dateOfBirth, phone, email,
        jobTitle, employer, yearsAtJob, annualIncome, monthlyIncome,
        previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
        currentRent, moveDate, reasonForMoving,
        apartmentAddress, apartmentDescription,
        numberOfOccupants, occupantsDetails, smoker,
        hasCoApplicant, coApplicantName, coApplicantRelationship, coApplicantJobTitle, coApplicantEmployer, coApplicantIncome,
        personality, pets,
        hasVehicle, vehicleMakeModel, vehicleYear,
        references: [
          ...(reference1Name ? [{ name: reference1Name, relationship: reference1Relationship, contact: reference1Contact }] : []),
          ...(reference2Name ? [{ name: reference2Name, relationship: reference2Relationship, contact: reference2Contact }] : []),
        ],
        estimatedRent, rentToIncomeRatio, redFlags,
      });
    } else {
      // APPLICATION MODE (default, free): build the templated resume, no AI used.
      resume = buildTemplatedResume({
        fullName, age, dateOfBirth, phone, email,
        jobTitle, employer, yearsAtJob, annualIncome, monthlyIncome,
        previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
        currentRent, moveDate, reasonForMoving,
        apartmentAddress, apartmentDescription,
        numberOfOccupants, occupantsDetails, smoker,
        hasCoApplicant, coApplicantName, coApplicantRelationship, coApplicantJobTitle, coApplicantEmployer, coApplicantIncome,
        personality, pets,
        hasVehicle, vehicleMakeModel, vehicleYear,
        references: [
          ...(reference1Name ? [{ name: reference1Name, relationship: reference1Relationship, contact: reference1Contact }] : []),
          ...(reference2Name ? [{ name: reference2Name, relationship: reference2Relationship, contact: reference2Contact }] : []),
        ],
        estimatedRent, rentToIncomeRatio, redFlags,
      });
      // letter stays empty for application mode — tenant gets it after they buy the upsell
    }

    // ─── Generate application number + scorecard + store for landlord dashboard ───
    if (!applicationNumber) {
      applicationNumber = generateApplicationNumber();
    }
    // Score on HOUSEHOLD income (primary + co-applicant) — the honest affordability signal for a
    // dual-income household. The letter/display `rentToIncomeRatio` above is left untouched.
    const coApplicantIncomeNum = hasCoApplicant ? (parseInt(coApplicantIncome) || 0) : 0;
    const householdAnnualIncome = annualIncomeNum + coApplicantIncomeNum;
    const householdMonthlyIncome = Math.round(householdAnnualIncome / 12);
    const householdRentToIncomeRatio = (estimatedRent && householdMonthlyIncome)
      ? Math.round((estimatedRent / householdMonthlyIncome) * 100)
      : null;
    const referencesCount = (reference1Name ? 1 : 0) + (reference2Name ? 1 : 0);

    const scorecard = calculateScorecard({
      yearsAtJob, householdAnnualIncome, householdRentToIncomeRatio,
      hasCoApplicant: !!(hasCoApplicant && coApplicantIncomeNum > 0),
      previousAddress, yearsAtPrevious, previousLandlordName, referencesCount,
      reasonForMoving, redFlags,
    });

    const applicationData = {
      applicationNumber,
      createdAt: new Date().toISOString(),
      email: email || null,
      tenant: {
        fullName,
        age: age || null,
        dateOfBirth: dateOfBirth || null,
        phone: phone || null,
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
        currentRent: currentRent ? parseInt(currentRent) : null,
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
      household: {
        numberOfOccupants: numberOfOccupants || '1',
        occupantsDetails: occupantsDetails || null,
        smoker: smoker || 'no',
        evParkingNeeded: evParkingNeeded === 'yes' ? 'yes' : 'no',
      },
      coApplicant: hasCoApplicant ? {
        name: coApplicantName || null,
        age: coApplicantAge || null,
        relationship: coApplicantRelationship || null,
        jobTitle: coApplicantJobTitle || null,
        employer: coApplicantEmployer || null,
        annualIncome: coApplicantIncome ? parseInt(coApplicantIncome) : null,
      } : null,
      lifestyle: {
        personality: personality || null,
        pets: pets || null,
      },
      vehicle: hasVehicle ? {
        makeModel: vehicleMakeModel || null,
        year: vehicleYear || null,
      } : null,
      references: [
        ...(reference1Name ? [{
          name: reference1Name,
          relationship: reference1Relationship || null,
          contact: reference1Contact || null,
        }] : []),
        ...(reference2Name ? [{
          name: reference2Name,
          relationship: reference2Relationship || null,
          contact: reference2Contact || null,
        }] : []),
      ],
      disclosures: redFlags || null,
      scorecard,
      // ── Owner token: a secret only the tenant knows; lets them view audit log & revoke ──
      ownerToken: generateOwnerToken(),
      revoked: false,
      coverLetter: letter || null, // populated only in letter mode; null otherwise
    };

    if (requestMode === 'letter' && existingAppNumber) {
      // Letter mode: just update the existing record's coverLetter field rather than rewrite the whole thing
      updateApplicationLetter(existingAppNumber, letter).catch(err =>
        console.error('Background letter update failed:', err)
      );
    } else {
      // Application mode: store the full record
      storeApplication(applicationNumber, applicationData).catch(err =>
        console.error('Background store failed:', err)
      );
    }

    // Instrument: track event
    bump(COUNTERS.APPLICATIONS_GENERATED);
    logEvent('letters', { applicationNumber, mode: requestMode });

    return res.status(200).json({
      letter, resume, applicationNumber,
      ownerToken: applicationData.ownerToken,
      mode: requestMode,
    });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Failed to generate letter. Please try again.' });
  }
}

// Generate a 32-char owner token the tenant uses to manage their application
function generateOwnerToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
