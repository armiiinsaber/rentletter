// components/tenant/ProfileFacts.js
// The tenant's facts on the realtor's card. Shared read and edit rendering over the flat apply form
// shape (lib/tenantProfile EMPTY_FORM), used by /my-application (the profile: edits reach future
// applications) and /my-application/[rl] (one snapshot: edits reach that realtor). Everything is on
// the realtor tokens (components/ui.js GlobalStyle): the card, the eyebrow, the text button, the
// line and card gaps. Every "a · b" line is built by Dots so a wrap breaks between items and a dot
// never opens or closes a line; every prose line runs through noWidow (lib/typeset.js).
import { C, R } from '../theme';
import { Icon } from '../ui';
import { Field, Textarea, SelectField, ToggleField } from '../apply/fields';
import { serializePets } from '../../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../../lib/taxEstimate';
import { NBSP, noWidow, dateLong, money, moneyYr, moneyMo, count } from '../../lib/typeset';
import { DURATION, CURVE, MOTION_QUERY } from '../../lib/motion';

export { money, dateLong, noWidow };
export const EMP_LABEL = { 'full-time': 'Full time', 'part-time': 'Part time', contract: 'Contract', 'self-employed': 'Self employed' };
const PROV_NAME = { ON: 'Ontario', BC: 'British Columbia' };
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
  return [y ? `${y}${NBSP}yr${y === 1 ? '' : 's'}` : null, m ? `${m}${NBSP}mo` : null].filter(Boolean).join(' ');
};
export const guessProvince = (f) => (/\b(BC|B\.C\.|British Columbia|Vancouver|Victoria|Burnaby|Surrey|Richmond|Kelowna)\b/i.test(`${f?.previousAddress || ''} ${f?.apartmentAddress || ''}`) ? 'BC' : 'ON');

// ── atoms ─────────────────────────────────────────────────────────────────────────────────
// Dots: the items of an "a · b · c" line. Each item is an inline block that carries its own
// separator, so a wrap breaks between items and a dot never opens or closes a line.
export function Dots({ items, sep = '·' }) {
  const list = (items || []).filter((x) => x !== null && x !== undefined && x !== '');
  // The dot and its item share one text node, so the dot is never a word on its own.
  return (
    <>
      {list.map((it, i) => (
        <span key={i}>
          {i ? ' ' : ''}
          <span style={{ display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }}>{typeof it === 'string' ? `${i ? `${sep}${NBSP}` : ''}${noWidow(it)}` : <>{i ? `${sep}${NBSP}` : ''}{it}</>}</span>
        </span>
      ))}
    </>
  );
}
// A stored "a · b" string, rendered through Dots.
export const DotText = ({ text }) => <Dots items={String(text || '').split(' · ')} />;

export const Eyebrow = ({ children, style }) => (
  <div className="mp-eyebrow" style={style}><span className="mp-dash" aria-hidden="true" />{children}</div>
);
// One fact: the label over the value, on the line gap. Pairs sit in the two column .mp-facts grid.
export function Row({ label, value, multiline }) {
  const empty = value === null || value === undefined || value === '';
  // A long single value (an email, an address) takes the full row rather than breaking mid word.
  const wide = typeof value === 'string' && value.length > 22;
  return (
    <div className="mp-fact" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="mp-label">{label}</div>
      <div className={`mp-value${empty ? ' mp-empty' : ''}`} style={multiline ? { whiteSpace: 'pre-wrap' } : undefined}>{empty ? 'Not provided' : typeof value === 'string' ? noWidow(value) : value}</div>
    </div>
  );
}
export function Empty({ children }) {
  return <p className="mp-p" style={{ marginTop: 'var(--gap-card)' }}>{typeof children === 'string' ? noWidow(children) : children}</p>;
}
export function Section({ id, title, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved, saveLabel = 'Save', footer, single = false }) {
  return (
    <section id={id} className="rl-card mp-card" aria-labelledby={`${id}-h`}>
      <div className="mp-head">
        <h2 id={`${id}-h`} className="mp-h2" style={{ minWidth: 0 }}>{title}{!editing && justSaved && <span className="mp-saved"> Saved</span>}</h2>
        {!editing && canEdit && <button type="button" onClick={onEdit} className="mp-link" aria-label={`Edit ${title}`}>Edit</button>}
      </div>
      {editing ? (
        <div>
          <div className="mp-form">{children}</div>
          {footer}
          <div className="mp-actions">
            <button type="button" onClick={onSave} disabled={saving} className="mp-btn">{saving ? 'Saving' : saveLabel}</button>
            <button type="button" onClick={onCancel} disabled={saving} className="mp-link">Cancel</button>
          </div>
        </div>
      ) : <div className={`mp-facts${single ? ' mp-facts-1' : ''}`}>{rows}</div>}
    </section>
  );
}

// The tenant side styles: the realtor's tokens, nothing of their own. Rendered once per page.
export const ProfileStyles = () => (
  <style jsx global>{`
    .mp-page { min-height: 100vh; background: ${C.paperDeep}; }
    .mp-header { border-bottom: 1px solid var(--rule); background: ${C.paper}; padding: var(--s-3) var(--s-4); padding-top: calc(var(--s-3) + env(safe-area-inset-top, 0px)); display: flex; justify-content: space-between; align-items: center; gap: var(--s-4); min-height: 60px; }
    .mp-wrap { max-width: 760px; margin: 0 auto; padding: var(--gap-section) var(--s-4) var(--s-7); }
    .mp-sections > * + * { margin-top: var(--gap-section); }
    .mp-stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); }
    .mp-card { padding: var(--card-pad); }
    .mp-card > :last-child { margin-bottom: 0; }
    .mp-ink { background: ${C.ink}; color: ${C.paper}; border-radius: ${R.card}px; padding: var(--card-pad); }
    .mp-eyebrow { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; min-height: 12px; }
    .mp-dash { display: inline-block; width: 3px; height: 11px; background: ${C.red}; border-radius: 1px; flex-shrink: 0; }
    .mp-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.04em; text-transform: none; color: ${C.inkSoft}; }
    .mp-h1 { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; letter-spacing: -0.02em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
    .mp-h2 { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; text-wrap: balance; }
    .mp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 44px; }
    .mp-saved { font-family: var(--f-body); font-size: var(--t-body-2); font-weight: 600; color: ${C.inkMute}; letter-spacing: 0; }
    .mp-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-card) var(--s-4); align-items: start; margin-top: var(--gap-card); }
    .mp-facts-1 { grid-template-columns: minmax(0, 1fr); }
    .mp-fact { min-width: 0; }
    .mp-label { font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; text-wrap: balance; }
    .mp-value { margin-top: var(--gap-line); font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.ink}; font-weight: 600; min-width: 0; overflow-wrap: anywhere; text-wrap: pretty; }
    .mp-empty { color: ${C.inkMute}; font-weight: 500; }
    .mp-p { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: pretty; overflow-wrap: anywhere; margin: 0; }
    .mp-note { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: pretty; overflow-wrap: anywhere; }
    .mp-alert { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.danger}; font-weight: 600; text-wrap: pretty; overflow-wrap: anywhere; }
    .mp-link { background: transparent; border: none; padding: 0; min-height: 44px; display: inline-flex; align-items: center; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 700; text-decoration: underline; cursor: pointer; font-family: inherit; text-align: left; }
    .mp-link:disabled { opacity: 0.5; cursor: default; }
    .mp-btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 0 var(--gap-card); background: transparent; color: ${C.ink}; border: 1.5px solid ${C.ink}; border-radius: var(--btn-radius); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; font-family: inherit; text-decoration: none; }
    .mp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .mp-btn-red { background: var(--action); color: ${C.paper}; border-color: var(--action); }
    .mp-btn-auto { width: auto; }
    .mp-input { display: block; width: 100%; min-height: 44px; padding: 0 var(--s-3); font-size: 16px; border: 1px solid ${C.rule}; border-radius: ${R.ctrl}px; background: ${C.paper}; color: ${C.ink}; outline: none; font-family: inherit; }
    .mp-input:focus { border-color: ${C.ink}; }
    .mp-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); margin-top: var(--gap-card); }
    .mp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-card); }
    .mp-actions { display: flex; align-items: center; gap: var(--s-4); flex-wrap: wrap; margin-top: var(--gap-card); }
    .mp-actions .mp-btn { width: auto; flex: 1 1 200px; }
    .mp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); margin-top: var(--gap-card); align-items: start; }
    .mp-stat-v { margin-top: var(--gap-line); font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-wrap: pretty; }
    .mp-fold { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); margin-top: var(--gap-card); background: transparent; border: none; border-top: 1px solid var(--rule); border-radius: 0; padding: 0; font: inherit; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; cursor: pointer; text-align: left; }
    .mp-list { list-style: none; margin: 0; padding: 0; }
    .mp-list li { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); min-height: 44px; padding: var(--s-2) 0; border-top: 1px solid var(--rule); font-size: var(--t-body-2); line-height: var(--lh-body); }
    .mp-list li:first-child { border-top: none; }
    .mp-step { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: var(--lh-body); }
    .mp-progress { height: 2px; background: var(--rule); border-radius: 1px; margin-top: var(--gap-line); overflow: hidden; }
    .mp-progress > span { display: block; height: 100%; background: ${C.ink}; }
    .mp-toast { position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 300; background: ${C.ink}; color: ${C.paper}; padding: var(--s-3) var(--s-4); border-radius: ${R.ctrl}px; box-shadow: 0 8px 24px rgba(15,15,16,0.22); font-size: var(--t-body-2); font-weight: 600; max-width: calc(100vw - 32px); text-align: center; cursor: pointer; }
    .mp-sub { padding-left: var(--s-4); border-left: 2px solid var(--rule); display: grid; gap: var(--gap-card); }
    /* A card that mounts fades in, opacity only (lib/motion.js): it is present and laid out first,
       the fade follows, and nothing waits for it. Reduced motion: no animation at all. */
    @media ${MOTION_QUERY} {
      .mp-enter { animation: mp-fade ${DURATION.short}ms ${CURVE.enter} both; }
      @keyframes mp-fade { from { opacity: 0; } to { opacity: 1; } }
    }
  `}</style>
);

// ── the six fact cards, read + edit, over the flat form ───────────────────────────────────
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
  const occupants = Number(f.numberOfOccupants) || 0;

  return (
    <>
      <Section {...sec('employment')} title="Employment and income"
        rows={<>
          <Row label="Job title" value={f.jobTitle} />
          <Row label={selfEmp ? 'Business' : 'Employer'} value={f.employer ? <Dots items={[f.employer, EMP_LABEL[f.employmentType]]} /> : null} />
          <Row label={selfEmp ? 'Years in business' : 'Time in role'} value={f.yearsAtJob ? `${f.yearsAtJob}${NBSP}yr${String(f.yearsAtJob) === '1' ? '' : 's'}` : null} />
          <Row label="Income before tax" value={moneyYr(f.annualIncome)} />
          <Row label="After tax" value={moneyYr(f.netIncome) ? <Dots items={[moneyYr(f.netIncome), f.netIncomeSource === 'stated' ? 'you entered' : 'estimate']} /> : null} />
        </>}>
        {draft && <>
          <SelectField label="Employment type" value={d.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[{ value: '', label: 'Select' }, { value: 'full-time', label: 'Full time' }, { value: 'part-time', label: 'Part time' }, { value: 'contract', label: 'Contract' }, { value: 'self-employed', label: 'Self employed (own or family business)' }]} />
          <Field label="Job title" required value={d.jobTitle} onChange={(v) => set('jobTitle', v)} />
          <Field label={d.employmentType === 'self-employed' ? 'Registered business name' : 'Employer'} required value={d.employer} onChange={(v) => updateEmployment({ employer: v })} hint={d.employmentType === 'self-employed' ? 'The business as it is registered: your own, or a family business you work for.' : undefined} />
          <Field label={d.employmentType === 'self-employed' ? 'Years in business' : 'Years at this job'} value={d.yearsAtJob} onChange={(v) => set('yearsAtJob', v)} placeholder="3" />
          <Field label="Annual income before tax (CAD)" required value={d.annualIncome} onChange={updateGross} placeholder="85,000" type="number" inputMode="numeric" hint="Gross, before deductions." />
          <div>
            <Field label="Estimated after tax income (CAD per year)" value={d.netIncome} onChange={updateNet} type="number" inputMode="numeric" hint={d.netIncomeSource === 'stated' ? 'You entered this yourself.' : `Estimate for ${PROV_NAME[province]} at ${TAX_YEAR} rates. Correct it if yours is different.`} />
            {d.netIncomeSource === 'stated' && <button type="button" onClick={resetNet} className="mp-link">Use the {PROV_NAME[province]} estimate instead</button>}
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

      <Section {...sec('rental')} title="Rental history" single={!hasRental}
        rows={hasRental ? <>
          <Row label="Address" value={f.previousAddress} />
          <Row label="Time there" value={tenureLabel(f.yearsAtPrevious)} />
          <Row label="Rent" value={moneyMo(f.currentRent)} />
          <Row label="Landlord reference" value={f.previousLandlordName ? <Dots items={[f.previousLandlordName, ...contactParts]} /> : null} />
        </> : <Row label="Previous rental" value="None listed" />}>
        {draft && <>
          <SelectField label="Your rental situation" value={d.rentalStatus} onChange={updateRentalStatus} options={[{ value: 'current', label: 'I am renting now' }, { value: 'previous', label: 'I have rented before, but not right now' }, { value: 'none', label: 'No previous rental to list' }]} />
          {d.rentalStatus !== 'none' && <>
            <Field label="Rental address" value={d.previousAddress} onChange={(v) => set('previousAddress', v)} />
            <div className="mp-grid2">
              <SelectField label="Time there, years" value={d.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[{ value: '', label: 'Select' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })), { value: '10', label: '10 or more' }]} />
              <SelectField label="Plus months" value={d.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[{ value: '', label: '0' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
              <Field label="Rent (CAD per month)" value={d.currentRent} onChange={(v) => set('currentRent', v)} type="number" inputMode="numeric" />
            </div>
            <Field label="Landlord's name" value={d.previousLandlordName} onChange={(v) => set('previousLandlordName', v)} />
            <div className="mp-grid2">
              <Field label="Their email" value={d.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} type="email" inputMode="email" />
              <Field label="Their phone" value={d.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} type="tel" inputMode="tel" />
            </div>
          </>}
        </>}
      </Section>

      <Section {...sec('move')} title="Your move" single
        rows={<Row label="Move in date" value={dateLong(f.moveInDate)} />}>
        {draft && <Field label="Desired move in date" value={d.moveInDate} onChange={(v) => set('moveInDate', v)} type="date" />}
      </Section>

      <Section {...sec('household')} title="Household and pets"
        rows={<>
          <Row label="Occupants" value={occupants ? <Dots items={[count(occupants, 'person', 'people'), f.occupantsDetails]} /> : null} />
          <Row label="Smoking or vaping" value={{ no: 'No', yes: 'Yes', outdoor: 'Outdoor only' }[f.smoker] || 'No'} />
          <Row label="Pets" value={f.pets || 'None'} />
          <Row label="Co tenant" value={f.hasCoApplicant ? <Dots items={[f.coApplicantName || 'Yes', [f.coApplicantJobTitle, f.coApplicantEmployer].filter(Boolean).join(' at '), moneyYr(f.coApplicantIncome)]} /> : 'Applying alone'} />
        </>}>
        {draft && <>
          <div className="mp-grid2">
            <Field label="Total occupants" value={d.numberOfOccupants} onChange={(v) => set('numberOfOccupants', v)} type="number" inputMode="numeric" />
            <SelectField label="Smoking or vaping" value={d.smoker} onChange={(v) => set('smoker', v)} options={[{ value: 'no', label: 'No' }, { value: 'outdoor', label: 'Outdoor only' }, { value: 'yes', label: 'Yes' }]} />
          </div>
          <Textarea label="Other occupants (optional)" value={d.occupantsDetails} onChange={(v) => set('occupantsDetails', v)} />
          <ToggleField label="Do you have pets?" value={d.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
          {d.hasPets && (
            <div className="mp-sub">
              <div className="mp-grid2">
                <SelectField label="Type" value={d.petType} onChange={(v) => updatePets({ petType: v })} options={[{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }, { value: 'catdog', label: 'Cats and dogs' }, { value: 'other', label: 'Other' }]} />
                <SelectField label="How many" value={d.petCount} onChange={(v) => updatePets({ petCount: v })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3+', label: '3 or more' }]} />
                <SelectField label="Size of largest (optional)" value={d.petSize} onChange={(v) => updatePets({ petSize: v })} options={[{ value: '', label: 'Select' }, { value: 'small', label: 'Small (under 25 lb)' }, { value: 'medium', label: 'Medium (25 to 60 lb)' }, { value: 'large', label: 'Large (over 60 lb)' }]} />
              </div>
              <ToggleField label="Spayed or neutered" value={d.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
              <ToggleField label="House trained" value={d.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
              <Field label="Anything else about your pets (optional)" value={d.petNotes} onChange={(v) => updatePets({ petNotes: v })} />
            </div>
          )}
          <ToggleField label="Applying with a co tenant, another adult on the lease?" value={d.hasCoApplicant} onChange={(v) => set('hasCoApplicant', v)} />
          {d.hasCoApplicant && (
            <div className="mp-sub">
              <Field label="Full name" value={d.coApplicantName} onChange={(v) => set('coApplicantName', v)} />
              <Field label="Job title" value={d.coApplicantJobTitle} onChange={(v) => set('coApplicantJobTitle', v)} />
              <Field label="Employer" value={d.coApplicantEmployer} onChange={(v) => set('coApplicantEmployer', v)} />
              <Field label="Annual income before tax (CAD)" value={d.coApplicantIncome} onChange={(v) => set('coApplicantIncome', v)} type="number" inputMode="numeric" />
            </div>
          )}
        </>}
      </Section>

      <Section {...sec('references')} title="References" single={refs.length === 0}
        rows={refs.length ? refs.map((n) => <Row key={n} label={`Reference ${n}`} value={<Dots items={[f[`reference${n}Name`], f[`reference${n}Relationship`], f[`reference${n}Contact`]]} />} />)
          : <Row label="References" value={count(0, 'provided', 'provided')} />}>
        {draft && [1, 2].map((n) => (
          <div key={n} className="mp-sub">
            <div className="mp-label">Reference {n}</div>
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
export const Chevron = ({ open }) => <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', color: C.inkMute, flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>;
