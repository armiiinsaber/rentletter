// lib/tenantProfile.js
// ISOMORPHIC (no fs, no env). The tenant profile is the application record itself — the
// KV app:{RL} document generate.js writes. This module is the single place that knows how
// to go between that stored shape and the flat FORM shape the apply page edits:
//
//   formFromApplication(app)           stored record  → flat form (prefill / edit)
//   buildApplicationFromForm(app, f)   flat form      → stored record (update), keeping
//                                      identity fields (RL number, ownerToken, createdAt,
//                                      apartment/listing facts, revoked state) untouched
//
// Used by: /my-application (view + edit), /apply/[token] (prefill from a saved profile),
// /api/application/manage (update). Form keys are the exact keys generate.js expects —
// never rename them.
import { calculateScorecard } from './scorecard';

// Same application schema the homepage form + generate.js use. Do not rename keys.
export const EMPTY_FORM = {
  email: '',
  apartmentAddress: '', apartmentDescription: '',
  fullName: '', age: '', dateOfBirth: '', phone: '',
  jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
  // annualIncome is GROSS (before tax). employmentType: '' | full-time | part-time | contract |
  // self-employed. businessName only when self-employed. netIncome = after-tax figure;
  // netIncomeSource 'estimated' (lib/taxEstimate) or 'stated' (tenant overwrote it).
  employmentType: '', businessName: '', netIncome: '', netIncomeSource: 'estimated',
  previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
  currentRent: '',
  moveInDate: '', reasonForMoving: '',
  numberOfOccupants: '1', occupantsDetails: '', smoker: 'no', evParkingNeeded: 'no',
  hasCoApplicant: false,
  coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
  coApplicantIncome: '', coApplicantRelationship: '',
  pets: '', redFlags: '',
  hasVehicle: false,
  vehicleMakeModel: '', vehicleYear: '',
  reference1Name: '', reference1Relationship: '', reference1Contact: '',
  reference2Name: '', reference2Relationship: '', reference2Contact: '',
  // ── Tenancy Profile: structured capture (UI-side). generate.js whitelists its stored
  // record, so these DO NOT persist as-is — each is serialized into one of the whitelisted
  // keys above before submit (contact → previousLandlordContact, tenure → yearsAtPrevious,
  // pet details → pets). rentalStatus is a UI controller (drives which fields show). ──
  rentalStatus: 'current', // 'current' | 'previous' | 'none'
  prevLandlordEmail: '', prevLandlordPhone: '',
  tenureYears: '', tenureMonths: '',
  hasPets: false, petType: 'cat', petCount: '1', petSize: '', petSpayedNeutered: false, petTrained: false, petNotes: '',
};

// ── Pets: structured answers ⇄ the stored free-text `pets` string ───────────────────────
export const PET_SIZE_LABELS = { small: 'small (under 25 lb)', medium: 'medium (25 to 60 lb)', large: 'large (60+ lb)' };
export function serializePets(f) {
  if (!f.hasPets) return '';
  const plural = f.petCount !== '1';
  const count = f.petCount === '3+' ? '3 or more' : f.petCount;
  const type = f.petType === 'catdog'
    ? (plural ? 'cats & dogs' : 'cat & dog')
    : `${{ cat: 'cat', dog: 'dog', other: 'pet' }[f.petType] || 'pet'}${plural ? 's' : ''}`;
  const traits = [
    f.petSize ? PET_SIZE_LABELS[f.petSize] : null,
    f.petSpayedNeutered ? 'spayed/neutered' : null,
    f.petTrained ? 'house-trained' : null,
  ].filter(Boolean).join(', ');
  const note = String(f.petNotes || '').trim();
  return `${count} ${type}${traits ? `, ${traits}` : ''}${note ? `. ${note}` : ''}`;
}
// Best-effort inverse of serializePets (we control the format). Anything we can't place
// lands in petNotes so nothing the tenant wrote is lost.
export function parsePets(str) {
  const s = String(str || '').trim();
  if (!s) return { hasPets: false, petType: 'cat', petCount: '1', petSize: '', petSpayedNeutered: false, petTrained: false, petNotes: '' };
  const out = { hasPets: true, petType: 'other', petCount: '1', petSize: '', petSpayedNeutered: false, petTrained: false, petNotes: '' };
  const m = s.match(/^(1|2|3 or more)\s+(cats? & dogs?|cat & dog|cats?|dogs?|pets?)(?:\s+ · \s+([^.]*))?(?:\.\s*(.*))?$/s);
  if (!m) { out.petNotes = s; return out; }
  out.petCount = m[1] === '3 or more' ? '3+' : m[1];
  const t = m[2];
  out.petType = /&/.test(t) ? 'catdog' : /^cat/.test(t) ? 'cat' : /^dog/.test(t) ? 'dog' : 'other';
  const traits = String(m[3] || '').split(',').map((x) => x.trim());
  for (const tr of traits) {
    const size = Object.keys(PET_SIZE_LABELS).find((k) => PET_SIZE_LABELS[k] === tr);
    if (size) out.petSize = size;
    else if (tr === 'spayed/neutered') out.petSpayedNeutered = true;
    else if (tr === 'house-trained') out.petTrained = true;
  }
  out.petNotes = String(m[4] || '').trim();
  return out;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────
const s = (v) => (v === null || v === undefined ? '' : String(v));
// generate.js stores moveInDate as a display string ("March 1, 2026") — or 'as soon as
// possible'. Turn it back into yyyy-mm-dd for the date input; unparseable → ''.
export function isoFromStoredDate(v) {
  const str = s(v).trim();
  if (!str || /^as soon/i.test(str)) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// ── Stored record → flat form ───────────────────────────────────────────────────────────
export function formFromApplication(app) {
  const a = app || {};
  const t = a.tenant || {}, e = a.employment || {}, r = a.rental || {}, ap = a.apartment || {};
  const m = a.move || {}, h = a.household || {}, l = a.lifestyle || {}, v = a.vehicle || null, co = a.coApplicant || null;
  const refs = Array.isArray(a.references) ? a.references : [];
  const f = { ...EMPTY_FORM };

  f.email = s(a.email);
  f.apartmentAddress = s(ap.address); f.apartmentDescription = s(ap.description);
  f.fullName = s(t.fullName); f.dateOfBirth = s(t.dateOfBirth); f.phone = s(t.phone);
  f.age = f.dateOfBirth ? s(ageFromDob(f.dateOfBirth) ?? '') : s(t.age);
  f.jobTitle = s(e.jobTitle); f.employer = s(e.employer); f.yearsAtJob = s(e.yearsAtJob); f.annualIncome = s(e.annualIncome);
  f.employmentType = ['full-time', 'part-time', 'contract', 'self-employed'].includes(e.employmentType) ? e.employmentType : '';
  f.businessName = s(e.businessName); f.netIncome = s(e.netIncome); f.netIncomeSource = e.netIncomeSource === 'stated' ? 'stated' : 'estimated';

  f.previousAddress = s(r.previousAddress); f.yearsAtPrevious = s(r.yearsAtPrevious);
  f.previousLandlordName = s(r.previousLandlordName); f.previousLandlordContact = s(r.previousLandlordContact);
  f.currentRent = s(r.currentRent);
  f.rentalStatus = (f.previousAddress || f.previousLandlordName || f.yearsAtPrevious) ? 'current' : 'none';
  // contact was stored as "email · phone" (either may be absent)
  for (const part of f.previousLandlordContact.split(' · ').map((x) => x.trim()).filter(Boolean)) {
    if (/@/.test(part)) f.prevLandlordEmail = part; else if (/\d{3}/.test(part)) f.prevLandlordPhone = part;
  }
  const yrs = parseFloat(f.yearsAtPrevious);
  if (Number.isFinite(yrs) && yrs > 0) {
    const whole = Math.floor(yrs), months = Math.round((yrs - whole) * 12);
    f.tenureYears = String(Math.min(whole, 10));
    f.tenureMonths = months > 0 && months < 12 ? String(months) : '';
  }

  f.moveInDate = isoFromStoredDate(m.moveInDate); f.reasonForMoving = s(m.reasonForMoving);
  f.numberOfOccupants = s(h.numberOfOccupants) || '1'; f.occupantsDetails = s(h.occupantsDetails);
  f.smoker = ['no', 'yes', 'outdoor'].includes(h.smoker) ? h.smoker : 'no';
  f.evParkingNeeded = h.evParkingNeeded === 'yes' ? 'yes' : 'no';

  if (co) {
    f.hasCoApplicant = true;
    f.coApplicantName = s(co.name); f.coApplicantAge = s(co.age); f.coApplicantRelationship = s(co.relationship);
    f.coApplicantJobTitle = s(co.jobTitle); f.coApplicantEmployer = s(co.employer); f.coApplicantIncome = s(co.annualIncome);
  }
  f.pets = s(l.pets); f.redFlags = s(a.disclosures);
  Object.assign(f, parsePets(f.pets));
  if (v) { f.hasVehicle = true; f.vehicleMakeModel = s(v.makeModel); f.vehicleYear = s(v.year); }
  if (refs[0]) { f.reference1Name = s(refs[0].name); f.reference1Relationship = s(refs[0].relationship); f.reference1Contact = s(refs[0].contact); }
  if (refs[1]) { f.reference2Name = s(refs[1].name); f.reference2Relationship = s(refs[1].relationship); f.reference2Contact = s(refs[1].contact); }
  return f;
}

// The facts a tenant may edit through `update` (everything they typed). Listing facts
// (apartment.*) and identity fields are NOT in this list and are never overwritten.
export const EDITABLE_FORM_KEYS = Object.keys(EMPTY_FORM).filter((k) => !['apartmentAddress', 'apartmentDescription'].includes(k));

// ── Flat form → stored record (mirrors generate.js's applicationData block exactly) ─────
// Returns a NEW record. Preserves: applicationNumber, createdAt, ownerToken, revoked(At),
// apartment, coverLetter. Recomputes: monthlyIncome, rentToIncomeRatio, scorecard.
// Stamps: updatedAt, profileRevision. Throws Error(message) on invalid required input.
export function buildApplicationFromForm(existing, rawForm) {
  const f = { ...EMPTY_FORM };
  for (const k of EDITABLE_FORM_KEYS) if (rawForm && rawForm[k] !== undefined) f[k] = rawForm[k];
  const str = (v, max = 500) => { const x = s(v).trim(); return x ? x.slice(0, max) : null; };
  const int = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

  const fullName = str(f.fullName, 120), jobTitle = str(f.jobTitle, 120), employer = str(f.employer, 160);
  const annualIncomeNum = int(f.annualIncome) || 0;
  if (!fullName || !jobTitle || !employer || !annualIncomeNum) throw new Error('Full name, job title, employer and annual income are required.');
  const email = str(f.email, 200);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(s(f.dateOfBirth)) ? s(f.dateOfBirth) : (existing?.tenant?.dateOfBirth || null);

  const monthlyIncome = Math.round(annualIncomeNum / 12);
  const ap = existing?.apartment || {};
  const estimatedRent = int(ap.estimatedRent) || (() => { const m = s(ap.description).match(/\$\s*([\d,]+)/); return m ? int(m[1]) : null; })();
  const rentToIncomeRatio = estimatedRent && monthlyIncome ? Math.round((estimatedRent / monthlyIncome) * 100) : null;

  const hasCo = !!f.hasCoApplicant;
  const coIncome = hasCo ? (int(f.coApplicantIncome) || 0) : 0;
  const householdAnnualIncome = annualIncomeNum + coIncome;
  const householdMonthlyIncome = Math.round(householdAnnualIncome / 12);
  const householdRentToIncomeRatio = estimatedRent && householdMonthlyIncome ? Math.round((estimatedRent / householdMonthlyIncome) * 100) : null;

  const rentalNone = f.rentalStatus === 'none';
  const previousAddress = rentalNone ? null : str(f.previousAddress, 200);
  const yearsAtPrevious = rentalNone ? null : str(f.yearsAtPrevious, 10);
  const previousLandlordName = rentalNone ? null : str(f.previousLandlordName, 120);
  const previousLandlordContact = rentalNone ? null : str(f.previousLandlordContact, 200);
  const references = [
    ...(str(f.reference1Name, 120) ? [{ name: str(f.reference1Name, 120), relationship: str(f.reference1Relationship, 120), contact: str(f.reference1Contact, 160) }] : []),
    ...(str(f.reference2Name, 120) ? [{ name: str(f.reference2Name, 120), relationship: str(f.reference2Relationship, 120), contact: str(f.reference2Contact, 160) }] : []),
  ];
  const redFlags = str(f.redFlags, 1500);
  const reasonForMoving = str(f.reasonForMoving, 500);
  const moveInDate = /^\d{4}-\d{2}-\d{2}$/.test(s(f.moveInDate))
    ? new Date(`${f.moveInDate}T00:00:00`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
    : (existing?.move?.moveInDate || 'as soon as possible');

  const scorecard = calculateScorecard({
    yearsAtJob: s(f.yearsAtJob), householdAnnualIncome, householdRentToIncomeRatio,
    hasCoApplicant: !!(hasCo && coIncome > 0),
    previousAddress, yearsAtPrevious, previousLandlordName, referencesCount: references.length,
  });

  return {
    ...existing,
    email,
    tenant: { fullName, age: dateOfBirth ? s(ageFromDob(dateOfBirth) ?? '') || null : (str(f.age, 3) || null), dateOfBirth, phone: str(f.phone, 40) },
    employment: {
      jobTitle, employer, yearsAtJob: str(f.yearsAtJob, 10), annualIncome: annualIncomeNum, monthlyIncome,
      employmentType: ['full-time', 'part-time', 'contract', 'self-employed'].includes(f.employmentType) ? f.employmentType : null,
      businessName: f.employmentType === 'self-employed' ? str(f.businessName, 160) : null,
      netIncome: int(f.netIncome) || null,
      netIncomeSource: f.netIncomeSource === 'stated' ? 'stated' : 'estimated',
    },
    rental: { previousAddress, yearsAtPrevious, previousLandlordName, previousLandlordContact, currentRent: rentalNone ? null : int(f.currentRent) },
    apartment: { ...ap, estimatedRent: estimatedRent ?? ap.estimatedRent ?? null, rentToIncomeRatio },
    move: { moveInDate, reasonForMoving },
    household: {
      numberOfOccupants: str(f.numberOfOccupants, 4) || '1',
      occupantsDetails: str(f.occupantsDetails, 500),
      smoker: ['no', 'yes', 'outdoor'].includes(f.smoker) ? f.smoker : 'no',
      evParkingNeeded: f.evParkingNeeded === 'yes' ? 'yes' : 'no',
    },
    coApplicant: hasCo ? {
      name: str(f.coApplicantName, 120), age: str(f.coApplicantAge, 3), relationship: str(f.coApplicantRelationship, 60),
      jobTitle: str(f.coApplicantJobTitle, 120), employer: str(f.coApplicantEmployer, 160), annualIncome: int(f.coApplicantIncome),
    } : null,
    lifestyle: { personality: null, pets: str(f.hasPets ? serializePets(f) : '', 300) },
    vehicle: f.hasVehicle ? { makeModel: str(f.vehicleMakeModel, 80), year: str(f.vehicleYear, 4) } : null,
    references,
    disclosures: redFlags,
    scorecard,
    updatedAt: new Date().toISOString(),
    profileRevision: (Number(existing?.profileRevision) || 0) + 1,
  };
}

// What the tenant-side `view` returns — everything they wrote, never ownerToken, never the
// realtor-only scorecard or cover letter.
export function publicProfile(app) {
  const a = app || {};
  return {
    email: a.email || null,
    tenant: a.tenant || {},
    employment: a.employment || {},
    rental: a.rental || {},
    apartment: a.apartment || {},
    move: a.move || {},
    household: a.household || {},
    coApplicant: a.coApplicant || null,
    lifestyle: a.lifestyle || {},
    vehicle: a.vehicle || null,
    references: Array.isArray(a.references) ? a.references : [],
    disclosures: a.disclosures || null,
  };
}
