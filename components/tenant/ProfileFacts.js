// components/tenant/ProfileFacts.js
// Shared tenant-facing rendering of the rental facts — as a read profile and as per-section
// inline editing — over the FLAT apply-form shape (lib/tenantProfile EMPTY_FORM). Used by:
//   /my-application          the unified profile (edits apply to FUTURE applications)
//   /my-application/[rl]     one submitted snapshot (edits change what that realtor sees)
// Pure presentation + local draft plumbing; the caller owns persistence.
import { C, R } from '../theme';
import { Icon } from '../ui';
import { Field, Textarea, SelectField, ToggleField } from '../apply/fields';
import { serializePets } from '../../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../../lib/taxEstimate';

export const EMP_LABEL = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' };
const PROV_NAME = { ON: 'Ontario', BC: 'British Columbia' };
export const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return n ? `$${n.toLocaleString('en-CA')}` : null; };
const phoneDigits = (v) => String(v || '').replace(/\D/g, '');
export function formatPhone(v) {
  const d = phoneDigits(v).slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
const tenureLabel = (yrs) => {
  const n = parseFloat(yrs); if (!Number.isFinite(n) || n <= 0) return null;
  const y = Math.floor(n), m = Math.round((n - y) * 12);
  return [y ? `${y} yr${y === 1 ? '' : 's'}` : null, m ? `${m} mo` : null].filter(Boolean).join(' ');
};
const dateNice = (iso) => { if (!iso) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso); return isNaN(d) ? iso : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); };
export const guessProvince = (f) => (/\b(BC|B\.C\.|British Columbia|Vancouver|Victoria|Burnaby|Surrey|Richmond|Kelowna)\b/i.test(`${f?.previousAddress || ''} ${f?.apartmentAddress || ''}`) ? 'BC' : 'ON');

// ── atoms ─────────────────────────────────────────────────────────────────────────────────
export const Eyebrow = ({ children, color = C.red, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, ...style }}>
    <span aria-hidden="true" style={{ width: 22, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
    <span style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span>
  </div>
);
export function Row({ label, value, multiline }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="mp-row">
      <div className="mp-row-label">{label}</div>
      <div className="mp-row-value" style={{ color: empty ? C.inkMute : C.ink, fontWeight: empty ? 500 : 600, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{empty ? 'Not provided' : value}</div>
    </div>
  );
}
export function Empty({ children }) {
  return <div style={{ padding: '16px 18px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>{children}</div>;
}
export function Section({ id, title, blurb, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved, saveLabel = 'Save changes', footer }) {
  return (
    <section id={id} className="rl-card rl-in mp-section" aria-labelledby={`${id}-h`}>
      <div className="mp-section-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`${id}-h`} style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</h2>
          {blurb && !editing && <p style={{ fontSize: 12.5, color: C.inkMute, lineHeight: 1.5, marginTop: 3 }}>{blurb}</p>}
        </div>
        {!editing && canEdit && <button type="button" onClick={onEdit} className="mp-editbtn" aria-label={`Edit ${title}`}><Icon name="edit" size={14} /> Edit</button>}
        {!editing && justSaved && <span style={{ fontSize: 12, color: C.green, fontWeight: 700, flexShrink: 0 }}>✓ Saved</span>}
      </div>
      {editing ? (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
          {footer}
          <div className="mp-actions">
            <button type="button" onClick={onSave} disabled={saving} className="rl-btn" style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', minHeight: 44, opacity: saving ? 0.75 : 1 }}>{saving ? 'Saving…' : saveLabel}</button>
            <button type="button" onClick={onCancel} disabled={saving} style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>Cancel</button>
          </div>
        </div>
      ) : <div className="mp-rows">{rows}</div>}
    </section>
  );
}

export const ProfileStyles = () => (
  <style jsx global>{`
    .mp-wrap { max-width: 760px; margin: 0 auto; padding: clamp(28px, 5vw, 48px) clamp(16px, 4vw, 32px) 72px; }
    .mp-section { padding: clamp(18px, 4vw, 26px); margin-bottom: 14px; }
    .mp-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .mp-editbtn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; background: transparent; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: ${R.pill}px; padding: 7px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; min-height: 34px; }
    .mp-rows { display: flex; flex-direction: column; }
    .mp-row { display: grid; grid-template-columns: 150px 1fr; gap: 4px 18px; padding: 10px 0; border-top: 1px solid ${C.rule}; }
    .mp-row:first-child { border-top: none; padding-top: 0; }
    .mp-row-label { font-size: 11.5px; color: ${C.inkMute}; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.5; padding-top: 2px; }
    .mp-row-value { font-size: 15px; line-height: 1.5; min-width: 0; overflow-wrap: anywhere; }
    .mp-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; padding-top: 16px; border-top: 1px solid ${C.rule}; }
    .mp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 18px; }
    .mp-stat { background: ${C.paper}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 14px 12px; min-width: 0; }
    .mp-stat-l { font-size: 10.5px; color: ${C.inkMute}; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
    .mp-stat-v { font-size: 15px; color: ${C.ink}; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
    .mp-quote { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(17px, 2.6vw, 20px); line-height: 1.45; color: ${C.ink}; letter-spacing: -0.01em; }
    .mp-header { border-bottom: 1px solid ${C.rule}; padding: clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px); display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .mp-ghost { background: transparent; color: ${C.inkSoft}; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid ${C.rule}; border-radius: ${R.pill}px; padding: 8px 14px; min-height: 36px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .mp-ink { position: relative; overflow: hidden; background: ${C.ink}; color: ${C.paper}; border-radius: ${R.card}px; padding: clamp(20px, 4vw, 28px); }
    .mp-ink-tick { position: absolute; top: 0; left: 0; width: 44px; height: 3px; background: ${C.red}; }
    .mp-input { width: 100%; padding: 15px 16px; font-size: 16px; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; background: ${C.card}; color: ${C.ink}; outline: none; }
    .mp-btn { background: ${C.ink}; color: ${C.paper}; border: none; border-radius: ${R.ctrl}px; padding: 16px; font-size: 15px; font-weight: 700; cursor: pointer; min-height: 52px; width: 100%; }
    .mp-btn:disabled { background: ${C.ruleDark}; cursor: not-allowed; }
    .mp-alert { padding: 11px 14px; background: ${C.redTint}; border-left: 3px solid ${C.danger}; border-radius: ${R.ctrl}px; font-size: 13px; color: ${C.ink}; line-height: 1.5; }
    .mp-note { padding: 12px 16px; background: ${C.paperDeep}; border-radius: ${R.ctrl}px; font-size: 13px; color: ${C.inkSoft}; line-height: 1.55; }
    @media (max-width: 480px) {
      .mp-row { grid-template-columns: 1fr; gap: 2px; }
      .mp-actions button { flex: 1 1 100%; }
    }
  `}</style>
);

// ── the seven fact sections, read + edit, over the flat form ──────────────────────────────
// props: facts (flat form), draft (flat form | null), editing (section id | null), setDraft,
//        canEdit, saving, justSaved, onEdit(id), onCancel(), onSave(), editFooter (node shown
//        inside every edit form, e.g. the coherence checkbox), contactEditable (bool)
export function FactSections({ facts: f0, draft, editing, setDraft, canEdit, saving, justSaved, onEdit, onCancel, onSave, editFooter, contactEditable = true, saveLabel }) {
  const f = f0 || {};
  const selfEmp = f.employmentType === 'self-employed';
  const hasRental = !!(f.previousAddress || f.previousLandlordName || f.yearsAtPrevious);
  const province = guessProvince(f);
  const refs = [1, 2].filter((n) => f[`reference${n}Name`]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const updateEmployment = (patch) => setDraft((d) => { const n = { ...d, ...patch }; n.businessName = n.employmentType === 'self-employed' ? n.employer : ''; return n; });
  const updateGross = (v) => setDraft((d) => { const n = { ...d, annualIncome: v }; if (n.netIncomeSource !== 'stated') n.netIncome = v ? String(estimateNetIncome(v, province).net || '') : ''; return n; });
  const updateNet = (v) => setDraft((d) => ({ ...d, netIncome: v, netIncomeSource: 'stated' }));
  const resetNet = () => setDraft((d) => ({ ...d, netIncomeSource: 'estimated', netIncome: d.annualIncome ? String(estimateNetIncome(d.annualIncome, province).net || '') : '' }));
  const updateReference = (patch) => setDraft((d) => { const n = { ...d, ...patch }; n.previousLandlordContact = [String(n.prevLandlordEmail).trim(), String(n.prevLandlordPhone).trim()].filter(Boolean).join(' · '); return n; });
  const updateTenure = (patch) => setDraft((d) => { const n = { ...d, ...patch }; const y = parseInt(n.tenureYears, 10), m = parseInt(n.tenureMonths, 10); const t = (Number.isFinite(y) ? y : 0) + (Number.isFinite(m) ? m / 12 : 0); n.yearsAtPrevious = t > 0 ? String(Math.round(t * 10) / 10) : ''; return n; });
  const updatePets = (patch) => setDraft((d) => { const n = { ...d, ...patch }; n.pets = serializePets(n); return n; });
  const updateRentalStatus = (v) => setDraft((d) => { const n = { ...d, rentalStatus: v }; if (v === 'none') Object.assign(n, { previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '', prevLandlordEmail: '', prevLandlordPhone: '', tenureYears: '', tenureMonths: '', currentRent: '' }); return n; });
  const sec = (id) => ({ id, editing: editing === id, canEdit, saving, justSaved: justSaved === id, onEdit: () => onEdit(id), onCancel, onSave, footer: editFooter, saveLabel });
  const d = draft || {};
  const contactParts = String(f.previousLandlordContact || '').split(' · ').filter(Boolean);

  return (
    <>
      <Section {...sec('employment')} title="Employment & income" blurb="What realtors screen on first."
        rows={<>
          <Row label="Job title" value={f.jobTitle} />
          <Row label={selfEmp ? 'Business' : 'Employer'} value={f.employer ? `${f.employer}${EMP_LABEL[f.employmentType] ? ` · ${EMP_LABEL[f.employmentType]}` : ''}` : null} />
          <Row label={selfEmp ? 'Years in business' : 'Time in role'} value={f.yearsAtJob ? `${f.yearsAtJob} yr${String(f.yearsAtJob) === '1' ? '' : 's'}` : null} />
          <Row label="Income before tax" value={money(f.annualIncome) ? `${money(f.annualIncome)} CAD/yr` : null} />
          <Row label="After tax" value={money(f.netIncome) ? `${money(f.netIncome)} CAD/yr ${f.netIncomeSource === 'stated' ? '(you entered)' : '(estimate)'}` : null} />
        </>}>
        {draft && <>
          <SelectField label="Employment type" value={d.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[{ value: '', label: 'Select…' }, { value: 'full-time', label: 'Full-time' }, { value: 'part-time', label: 'Part-time' }, { value: 'contract', label: 'Contract' }, { value: 'self-employed', label: 'Self-employed (own or family business)' }]} />
          <Field label="Job title" required value={d.jobTitle} onChange={(v) => set('jobTitle', v)} />
          <Field label={d.employmentType === 'self-employed' ? 'Registered business name' : 'Employer'} required value={d.employer} onChange={(v) => updateEmployment({ employer: v })} hint={d.employmentType === 'self-employed' ? 'The business as it’s registered — your own, or a family business you work for.' : undefined} />
          <Field label={d.employmentType === 'self-employed' ? 'Years in business' : 'Years at this job'} value={d.yearsAtJob} onChange={(v) => set('yearsAtJob', v)} placeholder="3" />
          <Field label="Annual income before tax (CAD)" required value={d.annualIncome} onChange={updateGross} placeholder="85,000" type="number" inputMode="numeric" hint="Gross — before deductions." />
          <div>
            <Field label="Estimated after-tax income (CAD/yr)" value={d.netIncome} onChange={updateNet} type="number" inputMode="numeric" hint={d.netIncomeSource === 'stated' ? 'You entered this yourself.' : `Estimate for ${PROV_NAME[province]} at ${TAX_YEAR} rates — please correct if yours is different.`} />
            {d.netIncomeSource === 'stated' && <button type="button" onClick={resetNet} style={{ marginTop: 6, background: 'transparent', border: 'none', padding: 0, color: C.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Use the {PROV_NAME[province]} estimate instead</button>}
          </div>
        </>}
      </Section>

      <Section {...sec('contact')} title="Contact" canEdit={canEdit && contactEditable}
        rows={<><Row label="Email" value={f.email} /><Row label="Phone" value={f.phone} /></>}>
        {draft && <>
          <Field label="Email" required value={d.email} onChange={(v) => set('email', v)} type="email" inputMode="email" />
          <Field label="Phone" required value={d.phone} onChange={(v) => set('phone', formatPhone(v))} type="tel" inputMode="tel" />
        </>}
      </Section>

      <Section {...sec('rental')} title="Rental history" blurb="A landlord who can vouch for your tenancy carries more weight than anything else here."
        rows={hasRental ? <>
          <Row label="Address" value={f.previousAddress} />
          <Row label="Time there" value={tenureLabel(f.yearsAtPrevious)} />
          <Row label="Rent" value={money(f.currentRent) ? `${money(f.currentRent)}/mo` : null} />
          <Row label="Landlord reference" value={f.previousLandlordName ? `${f.previousLandlordName}${contactParts.length ? ` · ${contactParts.join(' · ')}` : ''}` : null} />
        </> : <Empty>No previous rental listed. Plenty of strong applications start here — if you’ve rented before, adding a landlord reference is the single biggest upgrade you can make.</Empty>}>
        {draft && <>
          <SelectField label="Your rental situation" value={d.rentalStatus} onChange={updateRentalStatus} options={[{ value: 'current', label: 'I’m renting now' }, { value: 'previous', label: 'I’ve rented before, but not right now' }, { value: 'none', label: 'No previous rental to list' }]} />
          {d.rentalStatus !== 'none' && <>
            <Field label="Rental address" value={d.previousAddress} onChange={(v) => set('previousAddress', v)} />
            <div className="mp-grid2">
              <SelectField label="Time there — years" value={d.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[{ value: '', label: 'Select…' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })), { value: '10', label: '10+' }]} />
              <SelectField label="… plus months" value={d.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[{ value: '', label: '0' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
              <Field label="Rent (CAD/mo)" value={d.currentRent} onChange={(v) => set('currentRent', v)} type="number" inputMode="numeric" />
            </div>
            <Field label="Landlord’s name" value={d.previousLandlordName} onChange={(v) => set('previousLandlordName', v)} />
            <div className="mp-grid2">
              <Field label="Their email" value={d.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} type="email" inputMode="email" />
              <Field label="Their phone" value={d.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} type="tel" inputMode="tel" />
            </div>
          </>}
        </>}
      </Section>

      <Section {...sec('move')} title="Your move" blurb="Update this before you apply somewhere new if your timing has changed."
        rows={<><Row label="Move-in date" value={dateNice(f.moveInDate)} /><Row label="Reason" value={f.reasonForMoving} multiline /></>}>
        {draft && <>
          <Field label="Desired move-in date" value={d.moveInDate} onChange={(v) => set('moveInDate', v)} type="date" />
          <Textarea label="Why are you moving?" value={d.reasonForMoving} onChange={(v) => set('reasonForMoving', v)} />
        </>}
      </Section>

      <Section {...sec('household')} title="Household, pets & parking"
        rows={<>
          <Row label="Occupants" value={f.numberOfOccupants ? `${f.numberOfOccupants}${f.occupantsDetails ? ` — ${f.occupantsDetails}` : ''}` : null} />
          <Row label="Smoking / vaping" value={{ no: 'No', yes: 'Yes', outdoor: 'Outdoor only' }[f.smoker] || 'No'} />
          <Row label="Pets" value={f.pets || 'None'} />
          <Row label="Co-tenant" value={f.hasCoApplicant ? [f.coApplicantName, [f.coApplicantJobTitle, f.coApplicantEmployer].filter(Boolean).join(' at '), money(f.coApplicantIncome) ? `${money(f.coApplicantIncome)}/yr` : null].filter(Boolean).join(' · ') || 'Yes' : 'Applying on my own'} />
          <Row label="Vehicle" value={f.hasVehicle ? [f.vehicleMakeModel, f.vehicleYear].filter(Boolean).join(' · ') || 'Yes' : 'None'} />
          <Row label="EV parking" value={f.evParkingNeeded === 'yes' ? 'Needed' : 'Not needed'} />
        </>}>
        {draft && <>
          <div className="mp-grid2">
            <Field label="Total occupants" value={d.numberOfOccupants} onChange={(v) => set('numberOfOccupants', v)} type="number" inputMode="numeric" />
            <SelectField label="Smoking or vaping?" value={d.smoker} onChange={(v) => set('smoker', v)} options={[{ value: 'no', label: 'No' }, { value: 'outdoor', label: 'Outdoor only' }, { value: 'yes', label: 'Yes' }]} />
          </div>
          <Textarea label="Other occupants (optional)" value={d.occupantsDetails} onChange={(v) => set('occupantsDetails', v)} />
          <ToggleField label="Do you have pets?" value={d.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
          {d.hasPets && (
            <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="mp-grid2">
                <SelectField label="Type" value={d.petType} onChange={(v) => updatePets({ petType: v })} options={[{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }, { value: 'catdog', label: 'Cats & dogs' }, { value: 'other', label: 'Other' }]} />
                <SelectField label="How many" value={d.petCount} onChange={(v) => updatePets({ petCount: v })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3+', label: '3 or more' }]} />
                <SelectField label="Size of largest (optional)" value={d.petSize} onChange={(v) => updatePets({ petSize: v })} options={[{ value: '', label: 'Select…' }, { value: 'small', label: 'Small (under 25 lb)' }, { value: 'medium', label: 'Medium (25–60 lb)' }, { value: 'large', label: 'Large (60+ lb)' }]} />
              </div>
              <ToggleField label="Spayed / neutered" value={d.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
              <ToggleField label="House-trained" value={d.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
              <Field label="Anything else about your pet(s) (optional)" value={d.petNotes} onChange={(v) => updatePets({ petNotes: v })} />
            </div>
          )}
          <ToggleField label="Applying with a co-tenant? (another adult who’ll be on the lease)" value={d.hasCoApplicant} onChange={(v) => set('hasCoApplicant', v)} />
          {d.hasCoApplicant && (
            <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Full name" value={d.coApplicantName} onChange={(v) => set('coApplicantName', v)} />
              <Field label="Job title" value={d.coApplicantJobTitle} onChange={(v) => set('coApplicantJobTitle', v)} />
              <Field label="Employer" value={d.coApplicantEmployer} onChange={(v) => set('coApplicantEmployer', v)} />
              <Field label="Annual income before tax (CAD)" value={d.coApplicantIncome} onChange={(v) => set('coApplicantIncome', v)} type="number" inputMode="numeric" />
            </div>
          )}
          <ToggleField label="Do you have a vehicle?" value={d.hasVehicle} onChange={(v) => set('hasVehicle', v)} />
          {d.hasVehicle && (
            <div className="mp-grid2">
              <Field label="Make and model" value={d.vehicleMakeModel} onChange={(v) => set('vehicleMakeModel', v)} />
              <Field label="Year" value={d.vehicleYear} onChange={(v) => set('vehicleYear', v)} type="number" inputMode="numeric" />
            </div>
          )}
          <SelectField label="Do you need EV parking?" value={d.evParkingNeeded} onChange={(v) => set('evParkingNeeded', v)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
        </>}
      </Section>

      <Section {...sec('words')} title="In your own words" blurb="Goes to the landlord exactly as you write it."
        rows={<>
          {f.personality
            ? <blockquote className="mp-quote" style={{ margin: '2px 0 14px', paddingLeft: 16, borderLeft: `3px solid ${C.red}` }}>“{f.personality}”</blockquote>
            : <div style={{ marginBottom: 10 }}><Empty>You haven’t added an intro yet. A few lines about how you live — work-from-home, quiet evenings, long-term plans — is what makes an application feel like a person.</Empty></div>}
          <Row label="Anything addressed" value={f.redFlags} multiline />
        </>}>
        {draft && <>
          <div>
            <Textarea label="Tell the landlord a bit about yourself and how you live" value={d.personality} onChange={(v) => set('personality', v.slice(0, 500))} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, color: C.inkMute, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{String(d.personality || '').length}/500</div>
          </div>
          <p className="mp-note" style={{ margin: 0 }}>One thing you can skip: your background, beliefs, or family. Landlords aren’t allowed to consider those, so leaving them out will never affect your application.</p>
          <Textarea label="Anything to address? (gaps in history, credit, etc.)" value={d.redFlags} onChange={(v) => set('redFlags', v)} />
        </>}
      </Section>

      <Section {...sec('references')} title="References"
        rows={refs.length ? refs.map((n) => <Row key={n} label={`Reference ${n}`} value={[f[`reference${n}Name`], f[`reference${n}Relationship`], f[`reference${n}Contact`]].filter(Boolean).join(' · ')} />)
          : <Empty>No references yet. Two people who can vouch for you — named, with a way to reach them — are more persuasive than “references available.”</Empty>}>
        {draft && [1, 2].map((n) => (
          <div key={n} style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Reference {n}</div>
            <Field label="Full name" value={d[`reference${n}Name`]} onChange={(v) => set(`reference${n}Name`, v)} />
            <div className="mp-grid2">
              <Field label="Relationship" value={d[`reference${n}Relationship`]} onChange={(v) => set(`reference${n}Relationship`, v)} />
              <Field label="Phone or email" value={d[`reference${n}Contact`]} onChange={(v) => set(`reference${n}Contact`, v)} />
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}
