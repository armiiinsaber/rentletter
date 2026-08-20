// lib/applicationMap.js
// Map a KV app:{RL} record (shape produced by generate.js) to a row in the
// Supabase `applications` table. Column names must match the Stage 1 schema.
// Server-side only (used by the bridge routes).
function intOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function strOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

export function kvAppToRow(app) {
  const t = app.tenant || {};
  const e = app.employment || {};
  const r = app.rental || {};
  const ap = app.apartment || {};
  const m = app.move || {};
  const h = app.household || {};
  const l = app.lifestyle || {};
  const v = app.vehicle || null;
  const smoker = ['no', 'yes', 'outdoor'].includes(h.smoker) ? h.smoker : 'no';

  return {
    application_number: app.applicationNumber,
    email: app.email || null,
    // tenant
    full_name: t.fullName || null,
    age: strOrNull(t.age),
    date_of_birth: t.dateOfBirth || null,
    phone: t.phone || null,
    // employment
    job_title: e.jobTitle || null,
    employer: e.employer || null,
    years_at_job: strOrNull(e.yearsAtJob),
    annual_income: intOrNull(e.annualIncome),
    monthly_income: intOrNull(e.monthlyIncome),
    // rental history
    prev_address: r.previousAddress || null,
    years_at_previous: strOrNull(r.yearsAtPrevious),
    prev_landlord_name: r.previousLandlordName || null,
    prev_landlord_contact: r.previousLandlordContact || null,
    current_rent: intOrNull(r.currentRent),
    // unit of interest
    apartment_address: ap.address || null,
    apartment_description: ap.description || null,
    estimated_rent: intOrNull(ap.estimatedRent),
    rent_to_income_ratio: intOrNull(ap.rentToIncomeRatio),
    // move
    move_in_date: m.moveInDate || null,
    reason_for_moving: m.reasonForMoving || null,
    // household
    number_of_occupants: strOrNull(h.numberOfOccupants),
    occupants_details: h.occupantsDetails || null,
    smoker,
    ev_parking_needed: h.evParkingNeeded === 'yes' ? 'yes' : 'no',
    // lifestyle / vehicle
    personality: l.personality || null,
    pets: l.pets || null,
    vehicle_make_model: v ? (v.makeModel || null) : null,
    vehicle_year: v ? strOrNull(v.year) : null,
    // nested
    co_applicant: app.coApplicant || null,
    references: Array.isArray(app.references) ? app.references : [],
    scorecard: app.scorecard || null,
    disclosures: app.disclosures || null,
    // letter + tenant control
    cover_letter: app.coverLetter || null,
    owner_token: app.ownerToken || null,
    revoked: !!app.revoked,
    // tenant-side profile edits (db/profile-edits.sql) — see OPTIONAL_COLUMNS below
    profile_updated_at: app.updatedAt || null,
    profile_revision: Number(app.profileRevision) || 0,
    // employment type / business name / after-tax income (db/employment-income.sql)
    employment_type: e.employmentType || null,
    business_name: e.businessName || null,
    net_income: intOrNull(e.netIncome),
    net_income_source: e.netIncome ? (e.netIncomeSource === 'stated' ? 'stated' : 'estimated') : null,
  };
}

// Columns added by later migrations. If the DB doesn't have them yet, the bridge retries the
// write without them so the tenant/mirror path never breaks on an un-run migration.
export const OPTIONAL_COLUMNS = ['profile_updated_at', 'profile_revision', 'employment_type', 'business_name', 'net_income', 'net_income_source'];
