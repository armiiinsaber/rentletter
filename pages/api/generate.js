import { newApplicationNumber, newOwnerToken } from '../../lib/applicationIds';
import { bump, logEvent, COUNTERS } from '../../lib/stats';
import { kvIncr, kvExpire, kvGet } from '../../lib/kv';
import { checkSubmitLimits } from '../../lib/rateLimit';
import { inviteRent } from '../../lib/inviteResolve';
import { isSupabaseConfigured as inviteSupabaseConfigured } from '../../lib/supabase/server';
import { getSupabaseAdminClient as inviteAdminClient } from '../../lib/supabase/admin';
import { confirmationSignature } from '../../lib/sendSignature';
import { loadInviteListing } from '../../lib/inviteResolve';
import { isSandboxToken } from '../../lib/features';
import { ageRuleFor, AGE_ROLE, submittedAge } from '../../lib/applyAge';
import { inviteArchived, ARCHIVED_REFUSAL } from '../../lib/listingArchive';

// The listing's province, for the age rule (lib/applyAge.js): the owning realtor's, from the
// listings row by invite token, the KV invite record when there is no row. The sandbox listing is
// in Ontario (pages/api/invite/resolve.js). null when unknown: the rule reads that as Ontario, as
// the apply page does before its invite resolves.
async function submitProvince(inviteToken, record) {
  if (isSandboxToken(inviteToken)) return 'ON';
  if (!/^[a-f0-9]{20}$/.test(String(inviteToken || ''))) return null;
  const admin = inviteSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? inviteAdminClient() : null;
  const found = admin ? await loadInviteListing(admin, inviteToken) : null;
  if (found && found.profile && found.profile.province) return found.profile.province;
  return record && record.province ? record.province : null;
}


// The application number and the owner token come from lib/applicationIds.js, the same module
// every validator reads, so the two can never drift apart again.
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

// ─── TEMPLATED TENANT RESUME (NO AI) ──────────────
// Builds a structured, professional resume from form data alone.
// Zero API tokens used. This is the FREE tier.
function buildTemplatedResume(data) {
  const {
    fullName, phone, email,
    jobTitle, employer, yearsAtJob, annualIncome, monthlyIncome,
    previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
    currentRent,
    moveDate,
    apartmentAddress, apartmentDescription,
    numberOfOccupants, smoker,
    hasCoApplicant, coApplicantName, coApplicantJobTitle, coApplicantEmployer, coApplicantIncome,
    pets,
    references,
    estimatedRent, rentToIncomeRatio,
  } = data;

  const fmtIncome = (n) => n ? `$${Number(n).toLocaleString()}` : 'not set';
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
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  lines.push(``);
  lines.push(` · EMPLOYMENT · `);
  lines.push(`${jobTitle} at ${employer || 'employer'}`);
  if (yearsAtJob) lines.push(`Tenure: ${yearsLabel(yearsAtJob)}`);
  lines.push(`Annual income: ${fmtIncome(annualIncome)}`);
  if (monthlyIncome) lines.push(`Monthly income: ${fmtIncome(monthlyIncome)}`);
  if (estimatedRent && rentToIncomeRatio) {
    lines.push(`Rent to income ratio: ${rentToIncomeRatio}% (rent $${estimatedRent.toLocaleString()} / monthly income $${monthlyIncome.toLocaleString()})`);
  }
  lines.push(``);

  if (previousAddress || previousLandlordName) {
    lines.push(` · RENTAL HISTORY · `);
    if (previousAddress) lines.push(`Previous address: ${previousAddress}`);
    if (yearsAtPrevious) lines.push(`Duration: ${yearsLabel(yearsAtPrevious)}`);
    if (previousLandlordName) {
      lines.push(`Previous landlord: ${previousLandlordName}${previousLandlordContact ? ` (${previousLandlordContact})` : ''}`);
    }
    if (currentRent) lines.push(`Current rent: $${Number(currentRent).toLocaleString()}/mo`);
    lines.push(``);
  }

  lines.push(` · UNIT OF INTEREST · `);
  if (apartmentAddress) lines.push(`Address: ${apartmentAddress}`);
  if (apartmentDescription) lines.push(`Details: ${apartmentDescription}`);
  if (moveDate) lines.push(`Desired move in: ${moveDate}`);
  lines.push(``);

  lines.push(` · HOUSEHOLD · `);
  lines.push(`Occupants: ${numberOfOccupants || '1'}`);
  lines.push(`Smoker: ${smoker === 'yes' ? 'Yes' : 'No'}`);
  if (pets && pets.toLowerCase() !== 'none' && pets.toLowerCase() !== 'no') {
    lines.push(`Pets: ${pets}`);
  }
  lines.push(``);

  if (hasCoApplicant && coApplicantName) {
    lines.push(` · CO-APPLICANT · `);
    lines.push(`Name: ${coApplicantName}`);
    if (coApplicantJobTitle) lines.push(`Role: ${coApplicantJobTitle}${coApplicantEmployer ? ` at ${coApplicantEmployer}` : ''}`);
    if (coApplicantIncome) lines.push(`Annual income: ${fmtIncome(coApplicantIncome)}`);
    lines.push(``);
  }

  if (Array.isArray(references) && references.length > 0) {
    lines.push(` · REFERENCES · `);
    references.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.name}${r.relationship ? ` (${r.relationship})` : ''}${r.contact ? `, ${r.contact}` : ''}`);
    });
    lines.push(``);
  }



  return lines.join('\n').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // The cover letter is no longer offered: `mode: 'letter'` answers 410 and nothing here calls a
  // model. Payment proof, pass tokens and a client supplied application number are ignored (every
  // submission stores a new record under a fresh number).
  const { stripeSessionId, passToken, mode, applicationNumber: _ignoredAppNumber, inviteToken, ...formData } = req.body; // eslint-disable-line no-unused-vars
  if (mode === 'letter') return res.status(410).json({ error: 'Cover letters are no longer offered. Your application was already submitted.' });
  // The public invite link: 10 submissions an hour per invite token, 30 per IP (lib/rateLimit.js).
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const limited = await checkSubmitLimits({ incr: kvIncr, expire: kvExpire }, { token: inviteToken, ip: clientIp });
  if (!limited.ok) return res.status(429).json({ error: limited.message });
  // An archived listing takes no applications (db/025-listing-archive.sql): read from the listings
  // row at submit time, before anything is stored, counted or signed for the confirmation email.
  // Before db/025 has run, or on any error, the submission goes through as it always has.
  if (await inviteArchived(inviteToken)) return res.status(ARCHIVED_REFUSAL.status).json(ARCHIVED_REFUSAL.body);
  const requestMode = 'application';

  const {
    email,
    apartmentAddress, apartmentDescription,
    fullName, phone, ageConfirmed,
    jobTitle, employer, yearsAtJob, annualIncome,
    // Employment type + registered business name (self-employed), and the tenant's after-tax
    // figure (estimated by lib/taxEstimate or stated by the tenant). annualIncome stays GROSS —
    // it is what Fit is calibrated on; netIncome is display-only and never scored.
    employmentType, businessName, netIncome, netIncomeSource,
    previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
    currentRent,
    moveInDate,
    numberOfOccupants, smoker,
    hasCoApplicant, coApplicantName, coApplicantEmployer,
    coApplicantJobTitle, coApplicantIncome,
    pets,
    reference1Name, reference1Relationship, reference1Contact,
    reference2Name, reference2Relationship, reference2Contact,
  } = formData;
  // The free text "about yourself" field was removed from every form; the stored shape keeps the
  // key and writes null.
  const personality = null;

  if (!fullName || !jobTitle || !annualIncome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // The age rule (lib/applyAge.js), before anything is stored: an explicit yes from the page or a
  // 400 and nothing written. The province is read only when an s. 4 answer came with the request,
  // since it decides whether that answer is kept (Ontario alone).
  const province = formData.withdrawnFromParentalControl === true ? await submitProvince(inviteToken, /^[a-f0-9]{20}$/.test(String(inviteToken || '')) ? await kvGet(`linvite:${inviteToken}`) : null) : null;
  const age = submittedAge(formData, ageRuleFor(province, AGE_ROLE.APPLICANT));
  if (!age.ok) return res.status(400).json({ error: age.error });

  const moveDate = moveInDate
    ? new Date(moveInDate).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'as soon as possible';

  // Pre-calculate financial metrics so the AI doesn't have to do math
  const annualIncomeNum = parseInt(annualIncome) || 0;
  const monthlyIncome = Math.round(annualIncomeNum / 12);
  const monthlyIncomeFormatted = `$${monthlyIncome.toLocaleString()}/month`;

  // The rent the application arrived under: the listings row by invite_token first, the KV record
  // only when there is no row (lib/inviteResolve.js), null when it did not come through a link.
  // So estimated_rent is never null for a live listing, however old the KV record.
  let estimatedRent = null;
  let rentToIncomeRatio = null;
  if (/^[a-f0-9]{20}$/.test(String(inviteToken || ''))) {
    const inviteAdmin = inviteSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? inviteAdminClient() : null;
    estimatedRent = await inviteRent(inviteAdmin, inviteToken, await kvGet(`linvite:${inviteToken}`));
    if (estimatedRent && monthlyIncome) rentToIncomeRatio = Math.round((estimatedRent / monthlyIncome) * 100);
  }

  try {
    let applicationNumber = null;
    // The templated resume, from the form alone. No model call anywhere in this route.
    const resume = buildTemplatedResume({
      fullName, phone, email,
      jobTitle, employer, yearsAtJob, annualIncome, monthlyIncome,
      previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact,
      currentRent, moveDate,
      apartmentAddress, apartmentDescription,
      numberOfOccupants, smoker,
      hasCoApplicant, coApplicantName, coApplicantJobTitle, coApplicantEmployer, coApplicantIncome,
      pets,
      references: [
        ...(reference1Name ? [{ name: reference1Name, relationship: reference1Relationship, contact: reference1Contact }] : []),
        ...(reference2Name ? [{ name: reference2Name, relationship: reference2Relationship, contact: reference2Contact }] : []),
      ],
      estimatedRent, rentToIncomeRatio,
    });

    // ─── Generate application number + scorecard + store for landlord dashboard ───
    applicationNumber = newApplicationNumber();
    // Score on HOUSEHOLD income (primary + co-applicant) — the honest affordability signal for a
    // dual-income household. The display `rentToIncomeRatio` above is left untouched.
    const coApplicantIncomeNum = hasCoApplicant ? (parseInt(coApplicantIncome) || 0) : 0;
    const householdAnnualIncome = annualIncomeNum + coApplicantIncomeNum;
    const householdMonthlyIncome = Math.round(householdAnnualIncome / 12);
    const householdRentToIncomeRatio = (estimatedRent && householdMonthlyIncome)
      ? Math.round((estimatedRent / householdMonthlyIncome) * 100)
      : null;
    const referencesCount = (reference1Name ? 1 : 0) + (reference2Name ? 1 : 0);

    // The scorecard is no longer computed: Fit (lib/fitScore.js) is the number, derived at read
    // time. The key stays on the record and is written null.
    void householdRentToIncomeRatio; void referencesCount; void householdAnnualIncome;
    const scorecard = null;

    const applicationData = {
      applicationNumber,
      createdAt: new Date().toISOString(),
      email: email || null,
      // The date of birth is asked on the form only to check the age rule for the listing's
      // province (lib/applyAge.js); the answer is stored, the date and the age never are. The s. 4
      // answer sits beside it only for an Ontario applicant admitted at 16 or 17; it is never copied
      // to the applications table (lib/applicationMap.js) and no realtor read sees it.
      tenant: {
        fullName,
        ageConfirmed: ageConfirmed === true,
        phone: phone || null,
        ...(age.withdrawnFromParentalControl ? { withdrawnFromParentalControl: true } : {}),
      },
      employment: {
        jobTitle,
        employer,
        yearsAtJob: yearsAtJob || null,
        annualIncome: annualIncomeNum, // GROSS (before tax) · scored
        monthlyIncome,
        employmentType: ['full-time', 'part-time', 'contract', 'self-employed'].includes(employmentType) ? employmentType : null,
        businessName: employmentType === 'self-employed' && businessName ? String(businessName).slice(0, 160) : null,
        netIncome: parseInt(netIncome) > 0 ? parseInt(netIncome) : null, // after tax · display only
        netIncomeSource: netIncomeSource === 'stated' ? 'stated' : 'estimated',
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
        reasonForMoving: null, // removed from every form; the key stays, always null
      },
      household: {
        numberOfOccupants: numberOfOccupants || '1',
        smoker: smoker || 'no',
        evParkingNeeded: null, // removed from every form; the key stays, always null
      },
      coApplicant: hasCoApplicant ? {
        name: coApplicantName || null,
        age: null, // never written: a protected ground; the key stays for older records
        relationship: null, // never written: a family status proxy; the key stays
        jobTitle: coApplicantJobTitle || null,
        employer: coApplicantEmployer || null,
        annualIncome: coApplicantIncome ? parseInt(coApplicantIncome) : null,
      } : null,
      lifestyle: {
        personality: personality || null,
        pets: pets || null,
      },
      vehicle: null, // removed from every form; the key stays, always null
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
      disclosures: null, // removed from every form; the key stays, always null
      scorecard,
      // ── Owner token: a secret only the tenant knows; lets them view audit log & revoke ──
      ownerToken: newOwnerToken(),
      revoked: false,
      coverLetter: null, // the cover letter is no longer generated; the key stays, always null
    };

    storeApplication(applicationNumber, applicationData).catch(err =>
      console.error('Background store failed:', err)
    );

    // Instrument: track event
    bump(COUNTERS.APPLICATIONS_GENERATED);
    logEvent('letters', { applicationNumber, mode: requestMode });

    return res.status(200).json({
      letter: null, resume, applicationNumber,
      ownerToken: applicationData.ownerToken,
      // The confirmation email's credential (lib/sendSignature.js): /api/send accepts nothing else.
      emailSig: confirmationSignature({ applicationNumber, email: email || '' }),
      mode: requestMode,
    });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Could not submit the application. Please try again.' });
  }
}

