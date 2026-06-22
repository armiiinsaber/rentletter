// components/listings/ListingSetupModal.js
// Create/edit a listing. Unit basics + landlord-client contact + OHRC-compliant
// landlord preferences. Used in create mode (from "New listing") and edit mode.
// Save is gated on address + monthly rent + bedrooms; the listing is named from
// its address. Maps 1:1 to the Supabase `listings` columns. Presentation matches
// the design system; fully rounded; fits mobile.
import { useState } from 'react';
import { C, R } from '../theme';

const EMPTY = {
  address: '', monthly_rent: '', bedrooms: '',
  allows_pets: 'any', allows_smoking: 'no', parking_included: 'no',
  landlord_name: '', landlord_email: '', landlord_phone: '',
  pref_min_annual_income: '', pref_rent_to_income_max_pct: 30, pref_min_years_at_job: '',
  pref_employment_full_time: true, pref_employment_contract: true,
  pref_employment_self_employed: false, pref_employment_part_time: false,
  pref_earliest_move_in: '', pref_latest_move_in: '', pref_min_lease_term_months: 12,
  pref_max_occupants: '', pref_smoking_allowed: false, pref_pets_policy: 'case-by-case',
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
  }
  const [form, setForm] = useState(seed);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const creating = mode === 'create';
  const canSave = !!(String(form.address).trim() && String(form.monthly_rent).trim() && String(form.bedrooms).trim()) && !saving;

  const handleSave = () => {
    if (!canSave) return;
    const name = String(form.address).trim().slice(0, 80) || 'New listing';
    const payload = {
      name,
      address: String(form.address).trim(),
      monthly_rent: intOrNull(form.monthly_rent),
      bedrooms: String(form.bedrooms).trim(),
      allows_pets: form.allows_pets,
      allows_smoking: form.allows_smoking,
      parking_included: form.parking_included,
      landlord_name: String(form.landlord_name).trim() || null,
      landlord_email: String(form.landlord_email).trim().toLowerCase() || null,
      landlord_phone: String(form.landlord_phone).trim() || null,
      pref_min_annual_income: intOrNull(form.pref_min_annual_income),
      pref_rent_to_income_max_pct: intOrNull(form.pref_rent_to_income_max_pct),
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
      pref_pets_policy: form.pref_pets_policy,
      pref_parking_spots: intOrNull(form.pref_parking_spots),
      pref_requires_landlord_reference: !!form.pref_requires_landlord_reference,
      pref_requires_employer_verification: !!form.pref_requires_employer_verification,
      pref_guarantor_accepted: !!form.pref_guarantor_accepted,
      pref_notes: String(form.pref_notes).trim() || null,
    };
    onSave(payload);
  };

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
              Add the unit's address, monthly rent, and bedrooms to create the listing. Cancel won't create anything.
            </p>
          )}
        </div>

        <div style={{ padding: 'clamp(16px, 3vw, 24px) clamp(20px, 4vw, 28px)' }}>
          {/* UNIT */}
          <div style={{ ...sectionLabel, marginTop: 0 }}>Unit</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Address</span>
              <input type="text" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="88 Bay Street" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Monthly rent (CAD)</span>
              <input type="text" inputMode="numeric" value={form.monthly_rent} onChange={(e) => set({ monthly_rent: e.target.value.replace(/[^\d]/g, '') })} placeholder="2400" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Bedrooms</span>
              <input type="text" value={form.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} placeholder="2" style={inputStyle} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 10 }}>
            <label><span style={fieldLabel}>Pets</span>
              <select value={form.allows_pets} onChange={(e) => set({ allows_pets: e.target.value })} style={inputStyle}>
                <option value="any">No preference</option><option value="yes">Allowed</option><option value="no">Not allowed</option>
              </select></label>
            <label><span style={fieldLabel}>Smoking</span>
              <select value={form.allows_smoking} onChange={(e) => set({ allows_smoking: e.target.value })} style={inputStyle}>
                <option value="no">Not allowed</option><option value="outdoor">Outdoor only</option><option value="yes">Allowed</option>
              </select></label>
            <label><span style={fieldLabel}>Parking</span>
              <select value={form.parking_included} onChange={(e) => set({ parking_included: e.target.value })} style={inputStyle}>
                <option value="no">Not included</option><option value="yes">Included</option>
              </select></label>
          </div>

          {/* LANDLORD CLIENT */}
          <div style={sectionLabel}>Landlord client (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Name</span>
              <input type="text" value={form.landlord_name} onChange={(e) => set({ landlord_name: e.target.value })} placeholder="Pat Owner" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Email</span>
              <input type="email" value={form.landlord_email} onChange={(e) => set({ landlord_email: e.target.value })} placeholder="owner@email.com" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Phone</span>
              <input type="text" value={form.landlord_phone} onChange={(e) => set({ landlord_phone: e.target.value })} placeholder="(416) 555-0199" style={inputStyle} /></label>
          </div>

          {/* OHRC notice — preserved word-for-word */}
          <div style={{ margin: '18px 0', padding: '12px 14px', background: C.paperDeep, borderRadius: R.ctrl, borderLeft: `4px solid ${C.inkSoft}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>
            <strong>Why some fields aren't here:</strong> Ontario's Human Rights Code prohibits screening tenants on gender, age, family status, race, religion, disability, or receipt of public assistance. The fields below are legally screenable criteria. Stating discriminatory preferences in writing can trigger HRTO complaints — for both you and your landlord client.
          </div>

          {/* PREFERENCES — financial */}
          <div style={{ ...sectionLabel, marginTop: 0 }}>Financial</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label><span style={fieldLabel}>Minimum annual income</span>
              <input type="number" min="0" inputMode="numeric" value={form.pref_min_annual_income} onChange={(e) => set({ pref_min_annual_income: e.target.value })} placeholder="e.g. 80000" style={inputStyle} /></label>
            <label><span style={fieldLabel}>Max rent-to-income (%)</span>
              <input type="number" min="0" max="100" inputMode="numeric" value={form.pref_rent_to_income_max_pct} onChange={(e) => set({ pref_rent_to_income_max_pct: e.target.value })} placeholder="30" style={inputStyle} /></label>
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
            <label><span style={fieldLabel}>Pets policy</span>
              <select value={form.pref_pets_policy} onChange={(e) => set({ pref_pets_policy: e.target.value })} style={inputStyle}>
                <option value="case-by-case">Case by case</option><option value="no">No pets</option><option value="yes">Pets welcome</option>
              </select></label>
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
        <div style={{ padding: 'clamp(16px, 3vw, 22px) clamp(20px, 4vw, 28px)', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', position: 'sticky', bottom: 0, background: C.paper }}>
          <button onClick={onCancel}
            style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave}
            title={canSave ? '' : 'Add address, monthly rent, and bedrooms first'}
            style={{ background: canSave ? C.red : C.ruleDark, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.7 }}>
            {saving ? 'Saving…' : creating ? 'Create listing' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
