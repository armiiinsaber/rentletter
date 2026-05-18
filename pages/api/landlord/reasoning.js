// /api/landlord/reasoning
// Generate a defensible 2-paragraph decision rationale for a landlord's shortlist/reject decision.
// Output is grounded in the applicant's self-reported facts + the landlord's unit context.
// IMPORTANT: rationale focuses on financial fit, history, and stated intent — never on protected grounds.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { application, decision, unit, existingNotes } = req.body || {};

  if (!application || !decision) {
    return res.status(400).json({ error: 'Applicant data and decision required.' });
  }
  if (decision !== 'shortlist' && decision !== 'reject') {
    return res.status(400).json({ error: 'Decision must be shortlist or reject.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured.' });
  }

  // Build a compact, anonymized facts block
  const facts = {
    fullName: application.tenant?.fullName,
    employment: {
      job: application.employment?.jobTitle,
      employer: application.employment?.employer,
      years: application.employment?.yearsAtJob,
      annualIncome: application.employment?.annualIncome,
    },
    coApplicant: application.coApplicant ? {
      job: application.coApplicant.jobTitle,
      employer: application.coApplicant.employer,
      income: application.coApplicant.annualIncome,
    } : null,
    rental: {
      previousAddress: application.rental?.previousAddress,
      yearsAtPrevious: application.rental?.yearsAtPrevious,
      hasPreviousLandlordRef: !!application.rental?.previousLandlordName,
    },
    apartment: {
      address: application.apartment?.address,
      estimatedRent: application.apartment?.estimatedRent,
      rentToIncomeRatio: application.apartment?.rentToIncomeRatio,
    },
    move: {
      moveInDate: application.move?.moveInDate,
      reasonForMoving: application.move?.reasonForMoving,
    },
    household: {
      occupants: application.household?.numberOfOccupants,
      smoker: application.household?.smoker,
    },
    pets: application.lifestyle?.pets,
    vehicle: application.vehicle?.makeModel,
    referencesCount: (application.references || []).length,
    disclosures: application.disclosures,
    scorecard: {
      incomeStability: application.scorecard?.incomeStability?.score,
      rentAffordability: application.scorecard?.rentAffordability?.score,
      rentalHistory: application.scorecard?.rentalHistory?.score,
      longTermIntent: application.scorecard?.longTermIntent?.score,
      disclosures: application.scorecard?.disclosures?.score,
      overall: application.scorecard?.overall,
    },
  };

  const unitContext = unit && (unit.address || unit.monthlyRent) ? {
    address: unit.address,
    monthlyRent: unit.monthlyRent,
    bedrooms: unit.bedrooms,
    allowsPets: unit.allowsPets,
    allowsSmoking: unit.allowsSmoking,
    parkingIncluded: unit.parkingIncluded,
  } : null;

  const systemPrompt = `You are a Toronto rental-screening assistant helping a landlord write a defensible decision rationale.

CRITICAL COMPLIANCE RULES:
- The rationale MUST be based exclusively on financial fit, employment stability, rental history, references, stated intent, household composition relative to unit size, and disclosed lifestyle factors that affect the unit (smoking, pets if relevant).
- The rationale MUST NOT reference any of these (Ontario Human Rights Code protected grounds): race, ancestry, place of origin, citizenship, ethnic origin, creed/religion, sex, sexual orientation, gender identity, age, marital status, family status, disability, or receipt of public assistance.
- If a tenant is a student, refer to them as "an applicant whose income is education-stage" rather than referencing age.
- If a tenant has a co-applicant, refer to "the household" rather than "the couple" or any relational language.
- Be factual. Anchor every claim to the data in the facts block.
- Keep it professional and neutral — this is going into a record that could be reviewed by the Landlord & Tenant Board or HRTO.

FORMAT:
Write exactly two short paragraphs (3-4 sentences each), no headers, no bullets. The first paragraph states the financial and rental-fit case. The second paragraph addresses any concerns or caveats and why they do or don't change the decision.

OUTPUT: just the two paragraphs. Nothing else. No preamble like "Here is the rationale" — just the text itself.`;

  const userPrompt = `DECISION: ${decision === 'shortlist' ? 'SHORTLIST (lean toward selecting this applicant)' : 'REJECT (lean toward declining this applicant)'}

APPLICANT FACTS:
${JSON.stringify(facts, null, 2)}

${unitContext ? `UNIT CONTEXT:\n${JSON.stringify(unitContext, null, 2)}\n\n` : ''}${existingNotes ? `LANDLORD'S EXISTING NOTES (use as context, don't repeat verbatim):\n${existingNotes}\n\n` : ''}Now write the two-paragraph defensible rationale.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rationale = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n')
      .trim();

    if (!rationale) {
      return res.status(500).json({ error: 'AI returned empty response.' });
    }

    return res.status(200).json({ rationale });
  } catch (e) {
    console.error('[reasoning] Anthropic error:', e?.message || e);
    return res.status(500).json({ error: 'Could not generate rationale. Please try again.' });
  }
}
