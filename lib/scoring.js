// lib/scoring.js
// Toronto-calibrated applicant affordability scoring. Pure math — browser + server safe,
// no imports. Single source of truth so pages/api/generate.js (real applications) and
// pages/demo/dashboard.js (demo) produce the SAME curve.
//
// The scorecard shape is unchanged: five 0–5 sub-scores (incomeStability, rentAffordability,
// rentalHistory, longTermIntent, disclosures) + an equal-weight `overall`. Only the numbers
// are now continuous instead of hard bands, so small differences move the score only a little
// and the other factors break ties.
//
// OHRC: only ever screenable factors — income, rent-to-income, employment tenure, rental
// history, references, disclosures. Never age, family status, income source, etc.

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Linear interpolation across sorted [x, y] anchor points (flat beyond the ends).
function interp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }
  return last[1];
}

// ── GROUP 1 — Income as a smooth diminishing-returns curve (0–5) ─────────────────────────────
// Toronto reality: pre-tax income with strong diminishing returns. Steep under ~$60k (real risk
// for a solo/primary earner), modest bumps through the $60–110k band, asymptotically flat past
// ~$120k (higher Ontario brackets flatten take-home), effectively flat past ~$250k. A $5k gap is
// noise; ~$20k steps register. Pass HOUSEHOLD/combined income when there is a second earner.
export function incomeLevelScore(annualHouseholdIncome) {
  const x = Math.max(0, Number(annualHouseholdIncome) || 0);
  if (x <= 0) return 2.5; // unknown → neutral
  const MID = 56000;   // inflection — below here risk climbs fast
  const WIDTH = 16000; // transition width
  const s = 5 / (1 + Math.exp(-(x - MID) / WIDTH));
  return round2(s);
}

// ── GROUP 2 — Rent-to-income calibrated to Toronto (0–5) ──────────────────────────────────────
// ≤39% is comfortable/normal here → near-full marks (35–39% is NOT penalized). Above 39% it
// declines gently; the steep penalty only kicks in past ~50%. Smooth (piecewise-linear, no hard
// band jumps) so a few percent either way never swings the score.
export function rentToIncomeScore(ratioPct) {
  const r = Number(ratioPct);
  if (!isFinite(r) || r <= 0) return 3; // unknown rent → neutral
  return round2(interp(r, [
    [0, 5.0], [30, 5.0], [39, 4.7], [50, 3.8], [60, 2.4], [70, 1.2], [100, 1.0],
  ]));
}

// The heavyweight "can they afford THIS unit" sub-score (0–5). Blends the Toronto rent-to-income
// signal (primary — it is this unit's rent) with the diminishing income-level buffer. Continuous,
// so two comfortably-affordable applicants in the same income neighbourhood land within a hair of
// each other and the tenure / history / references factors decide the order.
export function rentAffordabilityScore(annualHouseholdIncome, ratioPct) {
  const s = 0.6 * rentToIncomeScore(ratioPct) + 0.4 * incomeLevelScore(annualHouseholdIncome);
  return round1(clamp(s, 1, 5));
}

// ── Tie-breakers ─────────────────────────────────────────────────────────────────────────────
// Employment tenure/stability (0–5). Smooth ramp: a new position is a real (screenable) risk,
// full marks by ~4 years. Enough resolution that a 4-year vs 1-year gap actually separates two
// otherwise-similar applicants.
export function employmentStabilityScore(yearsAtJob) {
  const y = Math.max(0, Number(yearsAtJob) || 0);
  return round1(interp(y, [
    [0, 2.5], [0.5, 3.0], [1, 3.7], [2, 4.4], [3, 4.8], [4, 5.0],
  ]));
}

// Rental history + references (0–5). Base from prior tenancy (a landlord reference is worth most),
// first-time renters stay neutral (not penalized), and corroborating references nudge it up — so
// "2 references" outranks "0 references" when everything else is equal.
export function rentalHistoryScore({ yearsAtPrevious, previousLandlordName, previousAddress, referencesCount = 0 }) {
  const histYears = Math.max(0, Number(yearsAtPrevious) || 0);
  let base;
  if (histYears >= 2 && previousLandlordName) base = 4.5;
  else if (histYears >= 1 && previousLandlordName) base = 3.8;
  else if (previousAddress) base = 3.0;
  else base = 3.0; // first-time renter — neutral, not penalized
  const refs = Math.max(0, Number(referencesCount) || 0);
  const refBump = refs >= 2 ? 0.7 : refs === 1 ? 0.35 : 0;
  return round1(clamp(base + refBump, 1, 5));
}

// Equal-weight overall, matching the demo's default weights (all 1.0).
export function overallScore(scores) {
  const { incomeStability, rentAffordability, rentalHistory, longTermIntent, disclosures } = scores;
  return round1((incomeStability + rentAffordability + rentalHistory + longTermIntent + disclosures) / 5);
}
