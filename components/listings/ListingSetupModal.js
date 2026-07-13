// components/listings/ListingSetupModal.js
// Create/edit a listing. Unit basics + landlord-client contact + OHRC-compliant
// landlord preferences. Used in create mode (from "New listing") and edit mode.
// Save is gated on address + monthly rent + bedrooms; the listing is named from
// its address. Maps 1:1 to the Supabase `listings` columns. Presentation matches
// the design system; fully rounded; fits mobile.
import { useState } from 'react';
import { C, R } from '../theme';
import { isValidEmail } from '../../lib/validation';
import { UNIT_TYPE_OPTIONS, formatUnit } from '../../lib/unitType';

const EMPTY = {
  address: '', monthly_rent: '', bedrooms: '',
  allows_pets: 'no', allows_smoking: 'no', parking_included: 'no', ev_parking: 'no',
  landlord_name: '', landlord_email: '', landlord_phone: '',
  // AFFORDABILITY: max rent-to-income is the SINGLE input. pref_min_annual_income is no
  // longer independently settable — it is derived from ratio × rent on save (see
  // buildPayload) so the two columns can never contradict each other.
  pref_rent_to_income_max_pct: 30, pref_min_years_at_job: '',
  pref_employment_full_time: true, pref_employment_contract: true,
  pref_employment_self_employed: false, pref_employment_part_time: false,
  pref_earliest_move_in: '', pref_latest_move_in: '', pref_min_lease_term_months: 12,
  pref_max_occupants: '', pref_smoking_allowed: false,
  pref_parking_spots: '', pref_requires_landlord_reference: true,
  pref_requires_employer_verification: true, pref_guarantor_accepted: true,
  pref_notes: '',
};

const inputStyle = {
  width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: R.ctrl,
  border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none',
};
const fieldLabel = { fontSize: 13, color: C.ink, fontWeight: 600, display: 'block', marginBottom: 4 };
const sectionLabel = { fontSize: 10, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 18, marginBottom: 10 };

function intOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}
function dateOrNull(v) {
  return v && String(v).trim() ? v : null;
}

export default function ListingSetupModal({ mode = 'create', initial = null, onCancel, onSave, saving = false }) {
  const seed = { ...EMPTY };
  if (initial) {
    for (const k of Object.keys(EMPTY)) {
      if (initial[k] !== null && initial[k] !== undefined) seed[k] = initial[k] === null ? EMPTY[k] : initial[k];
    }
    // Legacy rows saved before the affordability inputs were unified could hold a min
    // income with no ratio. Convert that intent into the ratio input (the single source)
    // so it isn't silently dropped: ratio = rent×12 ÷ income. Rows with BOTH fields keep
    // their saved ratio — the ratio wins and the stored min income is ignored.
    if ((initial.pref_rent_to_income_max_pct === null || initial.pref_rent_to_income_max_pct === undefined)
      && initial.pref_min_annual_income > 0 && initial.monthly_rent > 0) {
      const derived = Math.round((initial.monthly_rent * 12 * 100) / initial.pref_min_annual_income);
      if (derived >= 1 && derived <= 100) seed.pref_rent_to_income_max_pct = derived;
    }
  }
  const [form, setForm] = useState(seed);
  const [confirming, setConfirming] = useState(false); // create-time "are you sure" step
  const [triedSave, setTriedSave] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const creating = mode === 'create';

  // Required fields to create/save a listing. Rent is CRITICAL — ranking's rent-to-income
  // math depends on it — so it must be a positive number, not just non-empty. Screening
  // preferences stay optional.
  const rentNum = parseInt(String(form.monthly_rent).replace(/[^\d]/g, ''), 10);
  const emailValid = isValidEmail(form.landlord_email);
  const req = {
    address: !!String(form.address).trim(),
    monthly_rent: Number.isFinite(rentNum) && rentNum > 0,
    bedrooms: !!String(form.bedrooms).trim(),
    landlord_name: !!String(form.landlord_name).trim(),
    landlord_email: emailValid,
  };
  const allValid = Object.values(req).every(Boolean);
  const canSave = allValid && !saving;
  const emailError = (triedSave || String(form.landlord_email).trim())
    ? (!String(form.landlord_email).trim() ? 'Landlord email is required.' : (!emailValid ? 'Enter a valid email (name@example.com).' : ''))
    : '';

  const REQ_LABELS = { address: 'Address', monthly_rent: 'Monthly rent', bedrooms: 'Unit type', landlord_name: 'Landlord name', landlord_email: 'Valid landlord email' };
  const missing = Object.keys(req).filter((k) => !req[k]).map((k) => REQ_LABELS[k]);

  // Income floor implied by the ratio at this listing's rent: annual income where rent is
  // exactly `ratio`% of monthly income. Live helper under the ratio input + the saved value.
  const ratioPct = intOrNull(form.pref_rent_to_income_max_pct);
  const impliedMinIncome = ratioPct > 0 && Number.isFinite(rentNum) && rentNum > 0
    ? Math.round((rentNum * 12 * 100) / ratioPct)
    : null;

  const buildPayload = () => {
    const name = String(form.address).trim().slice(0, 80) || 'New listing';
    return {
      name,
      address: String(form.address).trim(),
      monthly_rent: intOrNull(form.monthly_rent),
      bedrooms: String(form.bedrooms).trim(),
      allows_pets: form.allows_pets === 'yes' ? 'yes' : 'no',
      allows_smoking: form.allows_smoking,
      parking_included: form.parking_included,
      ev_parking: form.ev_parking === 'yes' ? 'yes' : 'no',
      landlord_name: String(form.landlord_name).trim() || null,
      landlord_email: String(form.landlord_email).trim().toLowerCase() || null,
      landlord_phone: String(form.landlord_phone).trim() || null,
      // AFFORDABILITY — READ RULE: max rent-to-income is the single source of truth.
      // pref_min_annual_income is DERIVED (ratio × this listing's rent), never entered,
      // so the two columns stay consistent for every downstream consumer. For rows saved
      // before this change where both were set independently: the RATIO WINS and the
      // stored min income is ignored — no data migration; legacy rows normalize the next
      // time they're edited and saved here.
      pref_min_annual_income: impliedMinIncome,
      pref_rent_to_income_max_pct: ratioPct,
      pref_min_years_at_job: numOrNull(form.pref_min_years_at_job),
      pref_employment_full_time: !!form.pref_employment_full_time,
      pref_employment_contract: !!form.pref_employment_contract,
      pref_employment_self_employed: !!form.pref_employment_self_employed,
      pref_employment_part_time: !!form.pref_employment_part_time,
      pref_earliest_move_in: dateOrNull(form.pref_earliest_move_in),
      pref_latest_move_in: dateOrNull(form.pref_latest_move_in),
      pref_min_lease_term_months: intOrNull(form.pref_min_lease_term_months),
      pref_max_occupants: intOrNull(form.pref_max_occupants),
      pref_smoking_allowed: !!form.pref_smoking_allowed,
      pref_parking_spots: intOrNull(form.pref_parking_spots),
      pref_requires_landlord_reference: !!form.pref_requires_landlord_reference,
      pref_requires_employer_verification: !!form.pref_requires_employer_verification,
      pref_guarantor_accepted: !!form.pref_guarantor_accepted,
      pref_notes: String(form.pref_notes).trim() || null,
    };
  };

  // Clicking Create/Save: block if anything required is missing/invalid. On CREATE, valid
  // input opens the confirmation step; on EDIT, save directly (no "are you sure" on edits).
  const handleSaveClick = () => {
    if (!allValid) { setTriedSave(true); return; }
    if (creating) setConfirming(true);
    else onSave(buildPayload());
  };
  // The actual create — only reachable from the confirmation step, and re-guarded.
  const confirmCreate = () => {
    if (!allValid || saving) return;
    onSave(buildPayload());
  };

  const Req = () => <span aria-hidden="true" style={{ color: C.red, fontWeight: 800, marginLeft: 3 }}>*</span>;

  const Check = ({ k, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.ink, cursor: 'pointer', padding: '4px 0' }}>
      <input type="checkbox" checked={!!form[k]} onChange={(e) => set({ [k]: e.target.checked })} style={{ width: 16, height: 16, accentColor: C.red }} />
      {label}
    </label>
  );

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 15, 16, 0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(16px, 4vw, 32px)', zIndex: 100,
      }}>
      <div onClick={(e) => e.stopPropagation()} className="rl-modal"
        style={{ background: C.paper, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}` }}>

        {/* Header */}
        <div style={{ padding: 'clamp(20px, 4vw, 28px)', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            {creating ? 'New listing' : 'Listing setup'}
          </div>
          <h3 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Unit basics and landlord preferences
          </h3>
          {creating && (
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, marginTop: 8 }}>
              Fields marked <span style={{ color: C.red, fontWeight: 700 }}>*</span> are required — address, monthly rent, unit type, and your landlord client's name and email. Everything else can be set now or edited later.
            </p>
          )}
        </div>

        <div style={{ padding: 'clamp(16px, 3vw, 24px) clamp(20px, 4vw, 28px)' }}>
          {/* UNIT */}
          <div style={{ ...sectionLabel, marginTop: 0 }}>Unit</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Address<Req /></span>
              <input type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="88 Bay Street" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Monthly rent (CAD)<Req /></span>
              <input type="text" inputMode="numeric" value={form.monthly_rent} onChange={(e) => set({ monthly_rent: e.target.value.replace(/[^\d]/g, '') })} placeholder="2400" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Unit type<Req /></span>
              <select value={UNIT_TYPE_OPTIONS.some((o) => o.value === form.bedrooms) ? form.bedrooms : ''} onChange={(e) => set({ bedrooms: e.target.value })} style={inputStyle}>
                {UNIT_TYPE_OPTIONS.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}
              </select></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 10 }}>
            <label><span style={fieldLabel}>Pets allowed</span>
              <select value={form.allows_pets === 'yes' ? 'yes' : 'no'} onChange={(e) => set({ allows_pets: e.target.value })} style={inputStyle}>
                <option value="yes">Yes</option><option value="no">No</option>
              </select></label>
            <label><span style={fieldLabel}>Smoking</span>
              <select value={form.allows_smoking} onChange={(e) => set({ allows_smoking: e.target.value })} style={inputStyle}>
                <option value="no">Not allowed</option><option value="outdoor">Outdoor only</option><option value="yes">Allowed</option>
              </select></label>
            <label><span style={fieldLabel}>Parking</span>
              <select value={form.parking_included} onChange={(e) => set({ parking_included: e.target.value })} style={inputStyle}>
                <option value="no">Not included</option><option value="yes">Included</option>
              </select></label>
            <label><span style={fieldLabel}>EV parking</span>
              <select value={form.ev_parking === 'yes' ? 'yes' : 'no'} onChange={(e) => set({ ev_parking: e.target.value })} style={inputStyle}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select></label>
          </div>

          {/* LANDLORD CLIENT */}
          <div style={sectionLabel}>Landlord client</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Name<Req /></span>
              <input type="text" value={form.landlord_name} onChange={(e) => set({ landlord_name: e.target.value })} placeholder="Pat Owner" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Email<Req /></span>
              <input type="email" value={form.landlord_email} onChange={(e) => set({ landlord_email: e.target.value })} placeholder="owner@email.com"
                style={{ ...inputStyle, borderColor: emailError ? C.red : C.rule }} />
              {emailError && <span style={{ display: 'block', fontSize: 12, color: C.red, marginTop: 4 }}>{emailError}</span>}</label>
            <label><span style={fieldLabel}>Phone <span style={{ color: C.inkMute, fontWeight: 400 }}>(optional)</span></span>
              <input type="text" value={form.landlord_phone} onChange={(e) => set({ landlord_phone: e.target.value })} placeholder="(416) 555-0199" style={inputStyle} /></label>
          </div>

          {/* OHRC notice — preserved word-for-word */}
          <div style={{ margin: '18px 0', padding: '12px 14px', background: C.paperDeep, borderRadius: R.ctrl, borderLeft: `4px solid ${C.inkSoft}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
            <strong>Why some fields aren't here:</strong> Ontario's Human Rights Code prohibits screening tenants on gender, age, family status, race, religion, disability, or receipt of public assistance. The fields below are legally screenable criteria. Stating discriminatory preferences in writing can trigger HRTO complaints — for both you and your landlord client.
          </div>

          {/* PREFERENCES — financial. ONE affordability input: max rent-to-income. The
              income equivalent is derived live from this listing's rent (read-only), so
              the old separate "minimum annual income" field can never contradict it. */}
          <div style={{ ...sectionLabel, marginTop: 0 }}>Financial</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Max rent-to-income (%)</span>
              <input type="number" min="0" max="100" inputMode="numeric" value={form.pref_rent_to_income_max_pct} onChange={(e) => set({ pref_rent_to_income_max_pct: e.target.value })} placeholder="30" style={inputStyle} />
              <span style={{ display: 'block', fontSize: 12, color: C.inkMute, lineHeight: 1.5, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {impliedMinIncome
                  ? <>≈ ${impliedMinIncome.toLocaleString()}/yr minimum income at ${rentNum.toLocaleString()}/mo</>
                  : ratioPct > 0
                    ? 'Add the monthly rent above to see the income equivalent.'
                    : 'Set a ratio to see the income equivalent at this rent.'}
              </span></label>
            <label><span style={fieldLabel}>Min years at job</span>
              <input type="number" min="0" step="0.5" inputMode="decimal" value={form.pref_min_years_at_job} onChange={(e) => set({ pref_min_years_at_job: e.target.value })} placeholder="e.g. 1" style={inputStyle} /></label>
          </div>

          {/* employment */}
          <div style={sectionLabel}>Acceptable employment types</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
            <Check k="pref_employment_full_time" label="Full-time" />
            <Check k="pref_employment_contract" label="Contract" />
            <Check k="pref_employment_self_employed" label="Self-employed" />
            <Check k="pref_employment_part_time" label="Part-time" />
          </div>

          {/* timing */}
          <div style={sectionLabel}>Timing & occupancy</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Earliest move-in</span>
              <input type="date" value={form.pref_earliest_move_in || ''} onChange={(e) => set({ pref_earliest_move_in: e.target.value })} style={inputStyle} /></label>
            <label><span style={fieldLabel}>Latest move-in</span>
              <input type="date" value={form.pref_latest_move_in || ''} onChange={(e) => set({ pref_latest_move_in: e.target.value })} style={inputStyle} /></label>
            <label><span style={fieldLabel}>Min lease term (months)</span>
              <input type="number" min="0" inputMode="numeric" value={form.pref_min_lease_term_months} onChange={(e) => set({ pref_min_lease_term_months: e.target.value })} placeholder="12" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Max occupants</span>
              <input type="number" min="0" inputMode="numeric" value={form.pref_max_occupants} onChange={(e) => set({ pref_max_occupants: e.target.value })} placeholder="e.g. 2" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Parking spots</span>
              <input type="number" min="0" inputMode="numeric" value={form.pref_parking_spots} onChange={(e) => set({ pref_parking_spots: e.target.value })} placeholder="e.g. 1" style={inputStyle} /></label>
          </div>
          <div style={{ marginTop: 8 }}>
            <Check k="pref_smoking_allowed" label="Smoking allowed" />
          </div>

          {/* verification */}
          <div style={sectionLabel}>Verification</div>
          <Check k="pref_requires_landlord_reference" label="Require previous-landlord reference" />
          <Check k="pref_requires_employer_verification" label="Require employer verification" />
          <Check k="pref_guarantor_accepted" label="Guarantor accepted" />

          {/* notes */}
          <div style={sectionLabel}>Additional notes (optional)</div>
          <textarea
            value={form.pref_notes} onChange={(e) => set({ pref_notes: e.target.value })} rows={3}
            placeholder="e.g. Quiet building, no home business, long-term tenant preferred."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 11, color: C.red, marginTop: 6, lineHeight: 1.5 }}>
            Reminder: do NOT include preferences about gender, age, family status, race, religion, disability, or income source. These can trigger HRTO complaints.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: 'clamp(16px, 3vw, 22px) clamp(20px, 4vw, 28px)', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', position: 'sticky', bottom: 0, background: C.paper }}>
          {!allValid && (
            <span style={{ flex: '1 1 100%', minWidth: 0, fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, order: -1 }}>
              Still needed: <span style={{ color: C.inkSoft, fontWeight: 600 }}>{missing.join(', ')}</span>.
            </span>
          )}
          <button onClick={onCancel}
            style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSaveClick} disabled={!canSave}
            title={canSave ? '' : 'Complete the required fields first'}
            style={{ background: canSave ? C.red : C.ruleDark, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.7 }}>
            {saving ? 'Saving…' : creating ? 'Create listing' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* CREATE-TIME CONFIRMATION — extra check before the listing is created. */}
      {confirming && (
        <div onClick={(e) => { e.stopPropagation(); if (!saving) setConfirming(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 15, 16, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px, 4vw, 32px)', zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} className="rl-modal"
            style={{ background: C.paper, maxWidth: 440, width: '100%', border: `1px solid ${C.rule}`, padding: 'clamp(20px, 4vw, 28px)' }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Confirm new listing</div>
            <h3 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>Create this listing?</h3>
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, marginBottom: 16 }}>You can edit the details later — nothing here is locked in.</p>
            <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '14px 16px', marginBottom: 18 }}>
              {[
                ['Address', String(form.address).trim()],
                ['Monthly rent', rentNum ? `$${rentNum.toLocaleString()}` : '—'],
                ['Unit type', formatUnit(form.bedrooms) || '—'],
                // Join name + email with a middot ONLY when both exist (filter(Boolean) drops an
                // empty side → no leading/trailing dot). Non-breaking spaces keep the middot glued
                // between the two so it can never wrap to a line edge as an orphan "·".
                ['Landlord', [String(form.landlord_name).trim(), String(form.landlord_email).trim().toLowerCase()].filter(Boolean).join(' · ')],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '5px 0', fontSize: 13 }}>
                  <span style={{ color: C.inkMute, fontWeight: 600, minWidth: 0, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setConfirming(false)} disabled={saving}
                style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmCreate} disabled={saving}
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creating…' : 'Confirm & create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
