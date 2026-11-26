// components/listings/ListingSetupModal.js
// Create or edit a listing. Maps 1:1 to the Supabase `listings` columns, and what it saves is
// exactly what it always saved (buildPayload below is unchanged); only how each answer is asked
// changed. What it collects:
//   the unit     address, unit or suite, monthly rent, bedrooms (Studio, Loft, 2-storey loft, 1 to
//                4+), move in date (possession_date), pets, smoking, parking;
//   the landlord client   name, email, phone;
//   the criteria the rent share cap (40 by default), a landlord reference, employer verification,
//                the credit report ask, a guarantor accepted, notes;
//   board details  MLS number, listing brokerage name, address and phone (from the profile), the
//                cooperating brokerage and its commission, lease term, parking spaces, locker,
//                furnished, heat, hydro, water, and the deposits the province allows;
//   and once, at the first listing, the realtor's province (written to the profile, never here).
// Required: the province when asked, the address, the rent, the bedrooms, the landlord's name and
// email (five, six with the province, so no grouping is needed on a desktop).
// How it asks: address first, then the rent and the basics, then the landlord client; everything
// optional sits behind one Add details link, with its defaults set. Taps before typing: the
// province, the bedrooms, the move in date, pets, smoking and parking are chips; the rent is one
// large field with the $ shown, formatted as typed. Labels sit above the fields, one column. An
// error shows beside its field once the realtor leaves it, in plain words; nothing typed is lost.
// On a phone (under 1024px) a new listing is three screens, one step each, with a thin progress
// line at the top, Back that keeps every answer, and Continue lifted above the keyboard
// (visualViewport). From 1024px it is one panel over the Listings view: the form in one column
// about 520px wide on the left, what tenants see on the right; Enter moves to the next field,
// Escape closes and keeps the draft, Tab stays inside the panel. What is typed is kept in this
// browser as a draft (localStorage, every read and write in try), restored when the form opens
// again, and cleared on save. After the save the screen is the apply link: one large Copy, and
// the system share sheet where there is one (done). Editing is the same form with no steps.
// inline: the same form in the page flow, with no sheet.
import { useEffect, useRef, useState } from 'react';
import css from 'styled-jsx/css';
import { DEFAULT_RENT_SHARE_CAP, CAP_HELPER, affordabilityPayload } from '../../lib/listingForm';
import { C, R } from '../theme';
import Sheet from '../Sheet';
import { displayAddress } from '../../lib/listingAddress';
import { isValidEmail } from '../../lib/validation';
import { formatUnit } from '../../lib/unitType';
import { needsRentConfirm, RENT_WARNING } from '../../lib/listingEditWarning';
import { PROVINCE_OPTIONS } from '../../lib/provinces';
import { CREDIT_ASK_LABEL } from '../../lib/creditShared';
import { BOARD_FIELDS, depositRules, depositCap, normalizeBoardDetails } from '../../lib/boardDetails';
import { Icon } from '../ui';
import { Pending } from '../brand/Loader';

// The form: six unit facts, the five criteria Fit reads, notes, the landlord client. The
// employment type, move in window, lease term, occupants, guarantor, parking spots, pets policy,
// smoking allowed and EV parking columns are no longer written or read; they stay in the table.
const EMPTY = {
  address: '', unit: '', monthly_rent: '', bedrooms: '',
  allows_pets: 'no', allows_smoking: 'no', parking_included: 'no',
  landlord_name: '', landlord_email: '', landlord_phone: '',
  // AFFORDABILITY (lib/listingForm.js): the rent share cap defaults to 40 on a new listing (the
  // database column default stays 30; a null cap reads as 40 everywhere). The minimum annual
  // income is a separate criterion, empty by default, stored only when the realtor types it.
  pref_rent_to_income_max_pct: DEFAULT_RENT_SHARE_CAP,
  pref_requires_landlord_reference: true, pref_requires_employer_verification: true,
  pref_ask_credit_report: false, // the upload step shows the credit row first; never required (lib/creditShared.js)
  pref_guarantor_accepted: true, // a guarantor may be invited on this listing, the same for every applicant (lib/parties.js)
  pref_notes: '',
  // BOARD DETAILS (lib/boardDetails.js, docs/form-data.md): what the board's forms ask for, typed
  // once here, every one optional, none a criterion, none read by Fit. The deposits shown depend
  // on the realtor's province; the write clears the ones the province does not allow.
  mls_number: '', listing_brokerage_name: '', listing_brokerage_address: '', listing_brokerage_phone: '',
  coop_brokerage_name: '', coop_commission: '', possession_date: '', lease_term_months: '',
  utilities_heat: '', utilities_hydro: '', utilities_water: '',
  parking_spaces: '', locker: '', furnished: '',
  deposit_last_month: '', deposit_key: '', deposit_security: '', deposit_pet: '',
};
const BOARD_PREFILL = ['listing_brokerage_name', 'listing_brokerage_address', 'listing_brokerage_phone'];

function intOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// What the form saves: exactly what it always saved, from the answers as the form holds them.
export function listingPayload(form, { askProvince = false, province = '', depositProvince = null } = {}) {
  const rentNum = parseInt(String(form.monthly_rent).replace(/[^\d]/g, ''), 10);
  const name = String(form.address).trim().slice(0, 80) || 'New listing';
  return {
    ...(askProvince && province ? { province } : {}),
    name,
    address: String(form.address).trim(),
    unit: String(form.unit).trim() || null,
    monthly_rent: intOrNull(form.monthly_rent),
    bedrooms: String(form.bedrooms).trim(),
    allows_pets: form.allows_pets === 'yes' ? 'yes' : 'no',
    allows_smoking: form.allows_smoking,
    parking_included: form.parking_included,
    landlord_name: String(form.landlord_name).trim() || null,
    landlord_email: String(form.landlord_email).trim().toLowerCase() || null,
    landlord_phone: String(form.landlord_phone).trim() || null,
    // AFFORDABILITY: the cap as typed, the one affordability rule (lib/listingForm.js). No income floor.
    ...affordabilityPayload(form),
    pref_requires_landlord_reference: !!form.pref_requires_landlord_reference,
    pref_requires_employer_verification: !!form.pref_requires_employer_verification,
    pref_ask_credit_report: !!form.pref_ask_credit_report,
    pref_guarantor_accepted: !!form.pref_guarantor_accepted,
    pref_notes: String(form.pref_notes).trim() || null,
    // BOARD DETAILS: cleaned the way the route cleans them, the province's deposits alone.
    ...normalizeBoardDetails(Object.fromEntries(BOARD_FIELDS.map((k) => [k, form[k]])), { province: depositProvince, monthlyRent: rentNum }).values,
  };
}
export const EMPTY_LISTING_FORM = EMPTY;

// ── The draft: this browser only, every read and write in try (a private window, blocked storage). ──
export const DRAFT_KEY = 'rl-listing-draft';
export function readListingDraft(key = DRAFT_KEY) { try { const raw = window.localStorage.getItem(key); const d = raw ? JSON.parse(raw) : null; return d && typeof d === 'object' && d.form ? d : null; } catch (e) { return null; } }
export function writeListingDraft(key, value) { try { window.localStorage.setItem(key || DRAFT_KEY, JSON.stringify(value)); } catch (e) { /* the form still works */ } }
export function clearListingDraft(key = DRAFT_KEY) { try { window.localStorage.removeItem(key); } catch (e) { /* nothing to clear */ } }

// ── Small pure helpers, shared with the tests ──
export const formatRent = (digits) => { const d = String(digits || '').replace(/[^\d]/g, ''); return d ? Number(d).toLocaleString('en-CA') : ''; };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Now, and the first of each of the next two months.
export function moveInChoices(now = new Date()) {
  const first = (k) => new Date(now.getFullYear(), now.getMonth() + k, 1);
  return [{ key: 'now', label: 'Now', value: ymd(now) }, ...[1, 2].map((k) => { const d = first(k); return { key: `m${k}`, label: `${MONTHS[d.getMonth()]} 1`, value: ymd(d) }; })];
}
const BEDS = [['Studio', 'Studio'], ['1', '1'], ['2', '2'], ['3', '3'], ['4+', '4+']];
const BEDS_MORE = [['Loft', 'Loft'], ['2-storey loft', '2-storey loft']];
// The steps on a phone, a new listing only.
export const STEPS = [
  { key: 'where', title: 'Where is it?' },
  { key: 'basics', title: 'Rent and basics' },
  { key: 'landlord', title: 'Your landlord client' },
];
// The words beside a field the realtor left, empty or wrong.
export const FIELD_ERRORS = {
  province: 'Choose the province.',
  address: 'Enter the street address.',
  monthly_rent: 'Enter the monthly rent.',
  bedrooms: 'Choose the bedrooms.',
  landlord_name: 'Enter your landlord client’s name.',
  landlord_email: 'Enter your landlord client’s email.',
  landlord_email_bad: 'This email does not look right.',
};

// A row of chips, one answer: a radio group (arrow keys move, Space and Enter pick).
function Chips({ id, label, options, value, onChange, optional = false, cols = null }) {
  const pick = (v) => onChange(optional && v === value ? '' : v);
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} className={`lf-chips${cols ? ` lf-chips-${cols}` : ''}`} data-chips={id}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v ? 'true' : 'false'} className="lf-chip" data-chip={v}
          onClick={() => pick(v)}
          onKeyDown={(e) => {
            const i = options.findIndex(([x]) => x === v);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); const n = options[(i + 1) % options.length]; pick(n[0]); e.currentTarget.parentElement.children[(i + 1) % options.length].focus(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); const n = options[(i - 1 + options.length) % options.length]; pick(n[0]); e.currentTarget.parentElement.children[(i - 1 + options.length) % options.length].focus(); }
          }}>{text}</button>
      ))}
    </div>
  );
}

// What tenants see on the apply page, built from what is typed (pages/apply/[token].js reads the
// same columns): the address, the rent, the bedrooms, the move in date, pets, smoking, parking, and
// the realtor who sends the link.
export function ListingPreview({ form, realtor = null }) {
  const rent = formatRent(form.monthly_rent);
  const where = displayAddress({ address: String(form.address || '').trim(), unit: String(form.unit || '').trim() });
  const move = form.possession_date ? new Date(`${String(form.possession_date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' }) : '';
  const facts = [
    rent ? `$${rent} a month` : null,
    formatUnit(form.bedrooms) || null,
    move ? `Move in ${move}` : null,
    form.allows_pets === 'yes' ? 'Pets allowed' : 'No pets',
    form.allows_smoking === 'yes' ? 'Smoking allowed' : form.allows_smoking === 'outdoor' ? 'Smoking outdoors' : 'No smoking',
    form.parking_included === 'yes' ? 'Parking included' : 'No parking',
  ];
  return (
    <section className="lf-preview" aria-label="What tenants see" data-listing-preview="">
      <div className="lf-eyebrow">What tenants see</div>
      <div className="lf-pcard">
        <div className="lf-pcard-k">Rental application</div>
        <div className={`lf-pcard-h${where ? '' : ' lf-pcard-empty'}`} data-preview-address="">{where || 'The address'}</div>
        {/* Facts, not statuses: a plain list, never pills. */}
        <ul className="lf-pfacts" aria-label="The listing">{facts.filter(Boolean).map((f) => <li key={f}>{f}</li>)}</ul>
        {realtor && realtor.name ? <div className="lf-pcard-by">Listed by {realtor.name}{realtor.brokerage ? `, ${realtor.brokerage}` : ''}</div> : null}
      </div>
    </section>
  );
}

// The screen after the save: the apply link, one large Copy, and Share where the system has it.
function DoneScreen({ done, onClose }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);
  const link = done.url || '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch (e) {
      try { const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } catch (err) { /* the link is on screen to copy */ }
    }
    setCopied(true); setTimeout(() => setCopied(false), 2400);
  };
  const share = async () => { try { await navigator.share({ title: done.label || 'Rental application', text: `Apply for ${done.label || 'the unit'}`, url: link }); } catch (e) { /* closed or not allowed */ } };
  return (
    <div className="lf-done" data-listing-done="">
      <div className="lf-eyebrow">Apply link</div>
      <h2 className="lf-done-h">{done.label || 'Your listing'}</h2>
      <p className="lf-done-p">Send this link to applicants.</p>
      {link ? (
        <>
          {/* The link on one line, without its scheme: Copy and Share carry it whole. */}
      <div className="lf-done-link" data-apply-link="" data-url={link}>{link.replace(/^https?:\/\//, '')}</div>
          <button type="button" className="lf-btn lf-btn-red lf-btn-big" onClick={copy} data-copy-link="">
            <Icon name={copied ? 'check' : 'copy'} size={18} strokeWidth={copied ? 2.5 : 1.75} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          {canShare ? <button type="button" className="lf-btn lf-btn-line lf-btn-big" onClick={share} data-share-link="">Share</button> : null}
        </>
      ) : <p className="lf-done-p" role="status">The link could not be made just now. Open the listing to get it.</p>}
      <div className="lf-done-more">
        {done.onOpen ? <button type="button" className="lf-btn lf-btn-quiet" onClick={done.onOpen}>Open the listing</button> : null}
        <button type="button" className="lf-btn lf-btn-quiet" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// draftKey: where this realtor's draft is kept (create only). realtor: { name, brokerage } for the
// preview. done: { url, label, onOpen } once the listing is saved: the screen is its apply link.
export default function ListingSetupModal({ open = true, mode = 'create', initial = null, activeApplicants = 0, askProvince = false, realtorProvince = null, prefill = null, onCancel, onSave, saving = false, inline = false, draftKey = null, realtor = null, done = null }) {
  // The realtor's province, asked once, at the first listing (lib/justInTime.js), written to the profile.
  const [province, setProvince] = useState('');
  const seed = { ...EMPTY };
  if (initial) {
    for (const k of Object.keys(EMPTY)) {
      if (initial[k] !== null && initial[k] !== undefined) seed[k] = initial[k] === null ? EMPTY[k] : initial[k];
    }
    // Existing listings keep whatever they stored; a null cap shows the 40 it reads as.
  }
  // Numbers and the furnished answer as the inputs hold them (strings); the brokerage from the profile.
  for (const k of ['lease_term_months', 'parking_spaces', 'deposit_last_month', 'deposit_key', 'deposit_security', 'deposit_pet']) seed[k] = seed[k] == null || seed[k] === '' ? '' : String(seed[k]);
  for (const k of ['monthly_rent']) seed[k] = seed[k] == null || seed[k] === '' ? '' : String(seed[k]).replace(/[^\d]/g, '');
  // Three states each, as the select holds them: included, not included, or not set.
  for (const k of ['utilities_heat', 'utilities_hydro', 'utilities_water']) seed[k] = seed[k] === true ? 'yes' : seed[k] === false ? 'no' : '';
  seed.furnished = seed.furnished === true ? 'yes' : seed.furnished === false ? 'no' : '';
  seed.possession_date = seed.possession_date ? String(seed.possession_date).slice(0, 10) : '';
  for (const k of BOARD_PREFILL) if (!String(seed[k] || '').trim() && prefill && prefill[k]) seed[k] = String(prefill[k]);
  const [form, setForm] = useState(seed);
  const [confirming, setConfirming] = useState(false); // the edit time rent warning
  const [touched, setTouched] = useState({});
  const [step, setStep] = useState(0);
  // Add details: closed on a new listing (its defaults are set), open when editing.
  const [detailsOpen, setDetailsOpen] = useState(mode !== 'create');
  // Board details: collapsed on every open.
  const [boardOpen, setBoardOpen] = useState(false);
  const [moreBeds, setMoreBeds] = useState(false);
  const [otherDate, setOtherDate] = useState(false);
  const [restored, setRestored] = useState(false);
  // The move in chips are dated from the client's clock, after mount.
  const [choices, setChoices] = useState([]);
  useEffect(() => { setChoices(moveInChoices(new Date())); }, []);
  const seedRef = useRef(JSON.stringify(seed));
  const rootRef = useRef(null);
  const creating = mode === 'create';
  // A laptop and wider (1024px): one panel with no steps. Read from the client after mount; the
  // sheet only ever draws there.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(min-width: 1024px)'); const on = () => setWide(mq.matches);
    on(); if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
  }, []);
  const stepped = creating && !inline && !wide;
  useEffect(() => {
    if (!open || inline) return;
    seedRef.current = JSON.stringify(seed);
    const draft = creating && !initial && draftKey ? readListingDraft(draftKey) : null;
    if (draft) {
      setForm({ ...seed, ...draft.form }); setProvince(draft.province || ''); setStep(Math.max(0, Math.min(STEPS.length - 1, Number(draft.step) || 0))); setDetailsOpen(!!draft.detailsOpen); setRestored(true);
    } else {
      setForm(seed); setProvince(''); setStep(0); setDetailsOpen(mode !== 'create'); setRestored(false);
    }
    setConfirming(false); setTouched({}); setBoardOpen(false);
    const bed = draft ? draft.form.bedrooms : seed.bedrooms;
    setMoreBeds(BEDS_MORE.some(([v]) => v === bed));
    const date = draft ? draft.form.possession_date : seed.possession_date;
    setOtherDate(!!date && !moveInChoices(new Date()).some((c) => c.value === date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const dirty = JSON.stringify(form) !== seedRef.current || !!province;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const leave = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  // The draft follows every change, a new listing only; nothing typed means nothing kept.
  useEffect(() => {
    if (!open || inline || !creating || !draftKey || done) return;
    if (dirty) writeListingDraft(draftKey, { form, province, step, detailsOpen, at: Date.now() });
    else clearListingDraft(draftKey);
  }, [open, inline, creating, draftKey, done, dirty, form, province, step, detailsOpen]);

  // Continue above the keyboard: the panel is lifted by what the keyboard covers (iOS keeps the
  // layout viewport and shrinks the visual one).
  useEffect(() => {
    if (!open || inline || typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport; const root = document.documentElement;
    const fit = () => { const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)); root.style.setProperty('--rl-kb', `${kb}px`); };
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); root.style.removeProperty('--rl-kb'); };
  }, [open, inline]);

  // Required fields to create/save a listing. Rent is CRITICAL — ranking's rent to income
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
  const provinceOk = !askProvince || !!province;
  // The deposits the province allows and their caps against the rent being typed (lib/boardDetails.js).
  const depositProvince = askProvince && province ? province : realtorProvince;
  const rules = depositRules(depositProvince);
  const boardCheck = normalizeBoardDetails(form, { province: depositProvince, monthlyRent: rentNum });
  const depositError = (key) => { const f = rules.fields.find((x) => x.key === key); const cap = f ? depositCap(f.cap, rentNum) : null; const n = parseInt(String(form[key] || '').replace(/[^\d]/g, ''), 10); return f && cap != null && Number.isFinite(n) && n > cap ? `At most $${cap.toLocaleString('en-CA')} on this rent.` : ''; };
  const allValid = Object.values(req).every(Boolean) && provinceOk && !boardCheck.error;
  const canSave = allValid && !saving;
  // The words beside a field once the realtor left it.
  const errorOf = (key) => {
    if (!touched[key]) return '';
    if (key === 'province') return provinceOk ? '' : FIELD_ERRORS.province;
    if (key === 'landlord_email') return !String(form.landlord_email).trim() ? FIELD_ERRORS.landlord_email : (!emailValid ? FIELD_ERRORS.landlord_email_bad : '');
    return req[key] ? '' : FIELD_ERRORS[key];
  };
  const stepValid = [provinceOk && req.address, req.monthly_rent && req.bedrooms, req.landlord_name && req.landlord_email && !boardCheck.error];

  const buildPayload = () => listingPayload(form, { askProvince, province, depositProvince });

  // Save: a new listing saves at once (the preview showed it); an edit that moves the rent under
  // live applicants asks first (lib/listingEditWarning.js).
  const handleSaveClick = () => {
    if (!allValid) { setTouched({ province: true, address: true, monthly_rent: true, bedrooms: true, landlord_name: true, landlord_email: true }); return; }
    if (!creating && needsRentConfirm(initial, buildPayload(), activeApplicants)) { setConfirming(true); return; }
    onSave(buildPayload());
  };
  const focusFirst = () => { requestAnimationFrame(() => { const el = rootRef.current && rootRef.current.querySelector(`[data-step-body="${step + 1}"] input, [data-step-body="${step + 1}"] [role=radio]`); if (el) el.focus({ preventScroll: true }); }); };
  const next = () => {
    if (!stepValid[step]) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    const sc = rootRef.current && rootRef.current.querySelector('.lf-scroll'); if (sc) sc.scrollTop = 0;
    focusFirst();
  };
  const back = () => { setStep((s) => Math.max(0, s - 1)); const sc = rootRef.current && rootRef.current.querySelector('.lf-scroll'); if (sc) sc.scrollTop = 0; };
  const startOver = () => { if (draftKey) clearListingDraft(draftKey); setForm(JSON.parse(seedRef.current)); setProvince(''); setStep(0); setTouched({}); setRestored(false); setDetailsOpen(false); };

  // Enter moves to the next field (the last one saves, or continues on a phone); Tab stays inside.
  const onKeyDown = (e) => {
    const root = rootRef.current; if (!root) return;
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && !el.disabled;
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('input:not([type=checkbox]):not([type=radio])')) {
      e.preventDefault();
      const fields = [...root.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')].filter(visible);
      const i = fields.indexOf(e.target);
      if (i >= 0 && i < fields.length - 1) { fields[i + 1].focus(); return; }
      if (stepped && step < STEPS.length - 1) next(); else if (canSave) handleSaveClick();
      return;
    }
    // Tab moves through every control in the panel and wraps at its ends; the form moves the focus
    // itself, so it holds where the browser's own Tab skips buttons (Safari's default).
    if (e.key === 'Tab') {
      const all = [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(visible)
        .filter((el) => !(el.getAttribute('role') === 'radio' && el.getAttribute('aria-checked') !== 'true' && el.parentElement.querySelector('[aria-checked="true"]')));
      if (!all.length) return;
      e.preventDefault();
      const i = all.indexOf(document.activeElement);
      const to = i < 0 ? (e.shiftKey ? all[all.length - 1] : all[0]) : all[(i + (e.shiftKey ? -1 : 1) + all.length) % all.length];
      to.focus();
    }
  };

  // A field is one label: its words above, the control and the error inside it, so the whole field
  // is the target a tap lands on (lib/motion.js), as the form's fields always were.
  const label = (id, text, optional = false) => <span id={`${id}-label`} className="lf-label">{text}{optional ? <span className="lf-opt"> (optional)</span> : null}</span>;
  const err = (key, id) => { const m = errorOf(key); return m ? <span className="lf-err" id={`${id}-err`} role="alert">{m}</span> : null; };
  const desc = (key, id) => (errorOf(key) ? `${id}-err` : undefined);

  // ── The three groups of fields ──
  const stepWhere = (
    <div className="lf-step" data-step-body="1">
      {askProvince && (
        <div className="lf-field">
          <span id="lf-province-label" className="lf-label">Province</span>
          <Chips id="lf-province" options={PROVINCE_OPTIONS.map((p) => [p.value, p.label])} value={province} onChange={(v) => { setProvince(v); leave('province'); }} cols={2} />
          {err('province', 'lf-province')}
        </div>
      )}
      <label className="lf-field" htmlFor="lf-address">
        {label('lf-address', 'Address')}
        {/* Typed here; an address service can sit behind this one field later, and the province
            above stays the one that decides the deposits. */}
        <input id="lf-address" data-address-field="" type="text" inputMode="text" autoComplete="street-address" enterKeyHint="next" autoCapitalize="words" value={form.address} onChange={(e) => set({ address: e.target.value })} onBlur={() => leave('address')} placeholder="88 Bay Street" className="lf-input" aria-invalid={errorOf('address') ? 'true' : undefined} aria-describedby={desc('address', 'lf-address')} />
        {err('address', 'lf-address')}
      </label>
      <label className="lf-field" htmlFor="lf-unit">
        {label('lf-unit', 'Unit or suite', true)}
        <input id="lf-unit" type="text" inputMode="text" autoComplete="address-line2" enterKeyHint="next" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="4B" className="lf-input lf-input-short" />
      </label>
    </div>
  );
  const stepBasics = (
    <div className="lf-step" data-step-body="2">
      <label className="lf-field" htmlFor="lf-rent">
        {label('lf-rent', 'Monthly rent')}
        <span className="lf-rent">
          <span className="lf-rent-sign" aria-hidden="true">$</span>
          <input id="lf-rent" type="text" inputMode="numeric" pattern="[0-9,]*" autoComplete="off" enterKeyHint="next" value={formatRent(form.monthly_rent)} onChange={(e) => set({ monthly_rent: e.target.value.replace(/[^\d]/g, '') })} onBlur={() => leave('monthly_rent')} placeholder="2400" className="lf-input lf-rent-input" aria-invalid={errorOf('monthly_rent') ? 'true' : undefined} aria-describedby={desc('monthly_rent', 'lf-rent')} />
          <span className="lf-rent-per" aria-hidden="true">a month</span>
        </span>
        {err('monthly_rent', 'lf-rent')}
      </label>
      <div className="lf-field">
        <span id="lf-beds-label" className="lf-label">Bedrooms</span>
        <Chips id="lf-beds" options={[...BEDS, ['__more', moreBeds ? 'Fewer' : 'Loft']]} value={BEDS_MORE.some(([v]) => v === form.bedrooms) ? '__more' : form.bedrooms}
          onChange={(v) => { if (v === '__more') { setMoreBeds((m) => !m); return; } set({ bedrooms: v }); leave('bedrooms'); }} cols={6} />
        {moreBeds ? <div className="lf-sub"><Chips id="lf-beds-more" options={BEDS_MORE} value={form.bedrooms} onChange={(v) => { set({ bedrooms: v }); leave('bedrooms'); }} /></div> : null}
        {err('bedrooms', 'lf-beds')}
      </div>
      <div className="lf-field">
        <span id="lf-move-label" className="lf-label">Move in<span className="lf-opt"> (optional)</span></span>
        <Chips id="lf-move" optional options={[...choices.map((c) => [c.value, c.label]), ['__other', 'Other']]} value={otherDate ? '__other' : form.possession_date}
          onChange={(v) => { if (v === '__other') { setOtherDate(true); return; } setOtherDate(false); set({ possession_date: v || '' }); }} cols={4} />
        {otherDate ? (
          <div className="lf-sub">
            <input id="lf-move-date" type="date" aria-label="Move in date" autoComplete="off" value={form.possession_date} onChange={(e) => set({ possession_date: e.target.value })} className="lf-input lf-input-short" />
          </div>
        ) : null}
      </div>
    </div>
  );
  const stepLandlord = (
    <div className="lf-step" data-step-body="3">
      <label className="lf-field" htmlFor="lf-landlord-name">
        {label('lf-landlord-name', 'Landlord’s name')}
        <input id="lf-landlord-name" type="text" inputMode="text" autoComplete="off" autoCapitalize="words" enterKeyHint="next" value={form.landlord_name} onChange={(e) => set({ landlord_name: e.target.value })} onBlur={() => leave('landlord_name')} placeholder="Pat Owner" className="lf-input" aria-invalid={errorOf('landlord_name') ? 'true' : undefined} aria-describedby={desc('landlord_name', 'lf-landlord-name')} />
        {err('landlord_name', 'lf-landlord-name')}
      </label>
      <label className="lf-field" htmlFor="lf-landlord-email">
        {label('lf-landlord-email', 'Landlord’s email')}
        <input id="lf-landlord-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="done" value={form.landlord_email} onChange={(e) => set({ landlord_email: e.target.value })} onBlur={() => leave('landlord_email')} placeholder="owner@email.com" className="lf-input" aria-invalid={errorOf('landlord_email') ? 'true' : undefined} aria-describedby={desc('landlord_email', 'lf-landlord-email')} />
        {err('landlord_email', 'lf-landlord-email')}
      </label>
    </div>
  );
  // A plain function, not a component: the row keeps its node (and its focus) as the form changes.
  const check = (k, text) => (
    <label className="lf-check" key={k}>
      <input type="checkbox" checked={!!form[k]} onChange={(e) => set({ [k]: e.target.checked })} />
      {text}
    </label>
  );
  // Everything optional, behind one link, with its defaults set.
  const details = (
    <div className="lf-details">
      <button type="button" className="lf-more" onClick={() => setDetailsOpen((o) => !o)} aria-expanded={detailsOpen} aria-controls="listing-more-details" data-add-details="">
        <span>{detailsOpen ? 'Hide details' : 'Add details'}</span>
        <span className={`m-chev ${detailsOpen ? 'open' : ''}`} aria-hidden="true" style={{ display: 'inline-flex' }}><Icon name="chevronD" size={16} /></span>
      </button>
      {!detailsOpen ? <p className="lf-hint">Pets, smoking, parking, screening and board details. The defaults are set.</p> : null}
      {detailsOpen && (
        <div id="listing-more-details" className="lf-more-body">
          <div className="lf-group">The unit</div>
          <div className="lf-field"><span id="lf-pets-label" className="lf-label">Pets</span><Chips id="lf-pets" options={[['no', 'No pets'], ['yes', 'Pets allowed']]} value={form.allows_pets === 'yes' ? 'yes' : 'no'} onChange={(v) => set({ allows_pets: v })} cols={2} /></div>
          <div className="lf-field"><span id="lf-smoking-label" className="lf-label">Smoking</span><Chips id="lf-smoking" options={[['no', 'Not allowed'], ['outdoor', 'Outdoor only'], ['yes', 'Allowed']]} value={form.allows_smoking} onChange={(v) => set({ allows_smoking: v })} cols={3} /></div>
          <div className="lf-field"><span id="lf-parking-label" className="lf-label">Parking</span><Chips id="lf-parking" options={[['no', 'Not included'], ['yes', 'Included']]} value={form.parking_included} onChange={(v) => set({ parking_included: v })} cols={2} /></div>
          <label className="lf-field" htmlFor="lf-landlord-phone">
            {label('lf-landlord-phone', 'Landlord’s phone', true)}
            <input id="lf-landlord-phone" type="tel" inputMode="tel" autoComplete="off" enterKeyHint="next" value={form.landlord_phone} onChange={(e) => set({ landlord_phone: e.target.value })} placeholder="(416) 555-0199" className="lf-input" />
          </label>

          {/* OHRC notice · preserved word-for-word */}
          <div className="lf-notice">
            <strong>Why some fields aren't here:</strong> Ontario's Human Rights Code prohibits screening tenants on gender, age, family status, race, religion, disability, or receipt of public assistance. The fields below are legally screenable criteria. Stating discriminatory preferences in writing can trigger HRTO complaints, for both you and your landlord{' '}client.
          </div>

          {/* PREFERENCES, financial. The rent share cap is the one affordability rule. No income floor
              exists anywhere in the product (docs/fit-v2.md). */}
          <div className="lf-group">Screening criteria</div>
          <label className="lf-field" htmlFor="lf-cap">
            {label('lf-cap', 'Max rent to income (%)')}
            <input id="lf-cap" type="number" min="0" max="100" inputMode="numeric" autoComplete="off" enterKeyHint="next" value={form.pref_rent_to_income_max_pct} onChange={(e) => set({ pref_rent_to_income_max_pct: e.target.value })} placeholder={String(DEFAULT_RENT_SHARE_CAP)} className="lf-input lf-input-short" />
            <span className="lf-help">{CAP_HELPER}</span>
          </label>
          {/* 20px between the rows: each 24px row then reaches a 44px hit area (lib/motion.js planHitAreas). */}
          <div className="lf-checks">
            {check('pref_requires_landlord_reference', 'Require previous landlord reference')}
            {check('pref_requires_employer_verification', 'Require employer verification')}
            {/* The credit report switch: the tenant's upload step shows the credit row first. It is
                never required and never a criterion (lib/creditShared.js). */}
            {check('pref_ask_credit_report', CREDIT_ASK_LABEL)}
            {/* A guarantor: a listing level setting, the same for every applicant (OHRC). */}
            {check('pref_guarantor_accepted', 'Guarantor accepted')}
          </div>

          <label className="lf-field" htmlFor="lf-notes">
            {label('lf-notes', 'Additional notes', true)}
            <textarea id="lf-notes" value={form.pref_notes} onChange={(e) => set({ pref_notes: e.target.value })} rows={3} placeholder="e.g. Quiet building, no home business, long term tenant preferred." className="lf-input lf-textarea" />
            <span className="lf-help lf-warn">Reminder: do NOT include preferences about gender, age, family status, race, religion, disability, or income source. These can trigger HRTO complaints.</span>
          </label>

          {/* BOARD DETAILS (lib/boardDetails.js): one 44px toggle row, collapsed on every open. What the
              board's forms ask for, typed once here and read by Form data once a tenant is accepted.
              Nothing here is required, a criterion, or read by Fit. The move in date (possession_date)
              is asked with the basics. */}
          <button type="button" onClick={() => setBoardOpen((o) => !o)} aria-expanded={boardOpen} aria-controls="listing-board-details" className="lf-board-toggle">
            <span className="lf-group lf-group-inline">Board details (optional)</span>
            <span className={`m-chev ${boardOpen ? 'open' : ''}`} aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex' }}><Icon name="chevronD" size={16} /></span>
          </button>
          {boardOpen && (
            <div id="listing-board-details" data-board-details="">
              <p className="lf-help" style={{ marginTop: 0 }}>What the board’s forms ask for, typed once. Form data lays it out to copy once a tenant is accepted.</p>
              {[
                ['mls_number', 'MLS number', 'C1234567', 'text'],
                ['listing_brokerage_name', 'Listing brokerage', 'Royal LePage Signature Realty', 'text'],
                ['listing_brokerage_address', 'Brokerage address', '8 Sample Ave, Toronto', 'text'],
                ['listing_brokerage_phone', 'Brokerage phone', '(416) 555 0100', 'tel'],
                ['coop_brokerage_name', 'Cooperating brokerage', 'Their brokerage', 'text'],
                ['coop_commission', 'Commission to the cooperating brokerage', 'Half a month’s rent plus HST', 'text'],
              ].map(([k, text, ph, type]) => (
                <label className="lf-field" key={k} htmlFor={`lf-${k}`}>
                  {label(`lf-${k}`, text)}
                  <input id={`lf-${k}`} type={type} inputMode={type === 'tel' ? 'tel' : 'text'} autoComplete="off" enterKeyHint="next" value={form[k]} onChange={(e) => set({ [k]: e.target.value })} placeholder={ph} className="lf-input" />
                </label>
              ))}
              {[['lease_term_months', 'Lease term (months)', '12'], ['parking_spaces', 'Parking spaces', '1']].map(([k, text, ph]) => (
                <label className="lf-field" key={k} htmlFor={`lf-${k}`}>
                  {label(`lf-${k}`, text)}
                  <input id={`lf-${k}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="next" value={form[k]} onChange={(e) => set({ [k]: e.target.value.replace(/[^\d]/g, '') })} placeholder={ph} className="lf-input lf-input-short" />
                </label>
              ))}
              <label className="lf-field" htmlFor="lf-locker">
                {label('lf-locker', 'Locker')}
                <input id="lf-locker" type="text" inputMode="text" autoComplete="off" enterKeyHint="next" value={form.locker} onChange={(e) => set({ locker: e.target.value })} placeholder="B12" className="lf-input lf-input-short" />
              </label>
              <label className="lf-field" htmlFor="lf-furnished">
                {label('lf-furnished', 'Furnished')}
                <select id="lf-furnished" value={form.furnished} onChange={(e) => set({ furnished: e.target.value })} className="lf-input">
                  <option value="">Not entered</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              {/* Three states each: an untouched utility stays not set and reads Not entered on the listing page and in Form data. */}
              <div className="lf-group">Utilities</div>
              {[['utilities_heat', 'Heat'], ['utilities_hydro', 'Hydro'], ['utilities_water', 'Water']].map(([k, text]) => (
                <label className="lf-field" key={k} htmlFor={`lf-${k}`}>
                  {label(`lf-${k}`, text)}
                  <select id={`lf-${k}`} value={form[k]} onChange={(e) => set({ [k]: e.target.value })} className="lf-input">
                    <option value="">Not entered</option><option value="yes">Included</option><option value="no">Not included</option>
                  </select>
                </label>
              ))}
              {/* The province's deposits alone (lib/boardDetails.js depositRules), each against the rent typed above. */}
              <div className="lf-group">Deposits</div>
              <p className="lf-help" style={{ marginTop: 0 }}>{rules.line}</p>
              {rules.fields.map((f) => (
                <label className="lf-field" key={f.key} htmlFor={`lf-${f.key}`}>
                  {label(`lf-${f.key}`, `${f.label} (CAD)`)}
                  <input id={`lf-${f.key}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="next" value={form[f.key]} onChange={(e) => set({ [f.key]: e.target.value.replace(/[^\d]/g, '') })}
                    placeholder={f.cap === 'half' && rentNum ? String(Math.floor(rentNum / 2)) : f.cap === 'month' && rentNum ? String(rentNum) : '0'}
                    className="lf-input lf-input-short" aria-invalid={depositError(f.key) ? 'true' : undefined} />
                  <span className={`lf-help${depositError(f.key) ? ' lf-help-err' : ''}`}>{depositError(f.key) || f.note}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const title = creating ? 'New listing' : 'Listing setup';
  const onLast = !stepped || step === STEPS.length - 1;
  const primary = (
    <button type="button" onClick={onLast ? handleSaveClick : next} disabled={onLast ? !canSave : !stepValid[step]} className="lf-btn lf-btn-red" data-lf-primary="">
      {onLast ? <Pending busy={saving} label={creating ? 'Creating your listing' : 'Saving your changes'}>{creating ? 'Create listing' : 'Save changes'}</Pending> : 'Continue'}
    </button>
  );
  const body = done ? <DoneScreen done={done} onClose={onCancel} /> : (
    <div className={`lf${stepped ? ' lf-stepped' : ''}`} ref={rootRef} onKeyDown={onKeyDown} data-step-now={step + 1} data-listing-form="">
      <div className="lf-top" data-sheet-drag={inline ? undefined : ''}>
        {stepped ? <div className="lf-progress" role="progressbar" aria-label="Steps" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}><span style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} /></div> : null}
        <div className="lf-title-row">
          <h3 className="lf-title">{title}</h3>
          {stepped ? <span className="lf-stepof">Step {step + 1} of {STEPS.length}</span> : null}
        </div>
        {stepped ? <div className="lf-step-title" aria-live="polite">{STEPS[step].title}</div> : null}
        {restored ? <p className="lf-restored" data-draft-restored="">Your draft is back. <button type="button" className="lf-link" onClick={startOver}>Start over</button></p> : null}
      </div>
      <div className="lf-cols">
        <div className="lf-col">
          <div className="lf-scroll">
            <div className="lf-sec" data-sec="1"><div className="lf-sec-h">Where is it?</div>{stepWhere}</div>
            <div className="lf-sec" data-sec="2"><div className="lf-sec-h">Rent and basics</div>{stepBasics}</div>
            <div className="lf-sec" data-sec="3"><div className="lf-sec-h">Your landlord client</div>{stepLandlord}{details}</div>
            <div className="lf-preview-under"><ListingPreview form={form} realtor={realtor} /></div>
          </div>
          <div className="lf-foot">
            {stepped && step > 0 ? (
              <button type="button" onClick={back} className="lf-btn lf-btn-line lf-back" data-lf-back=""><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={16} /></span> Back</button>
            ) : (
              <button type="button" onClick={onCancel} className="lf-btn lf-btn-line">Cancel</button>
            )}
            {primary}
          </div>
        </div>
        <aside className="lf-aside"><ListingPreview form={form} realtor={realtor} /></aside>
      </div>
    </div>
  );
  // The edit warning: one more check before the rent changes under live applicants.
  const confirmSheet = (
    <Sheet open={confirming} onClose={() => { if (!saving) setConfirming(false); }} role="alertdialog" busy={saving} maxWidth={440} panelClassName="rl-modal" label="Save these changes?">
      <div style={{ padding: '4px clamp(20px, 4vw, 28px) clamp(20px, 4vw, 28px)' }}>
        <h3 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>Save these changes?</h3>
        <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.5, marginBottom: 16, textWrap: 'balance' }}>{RENT_WARNING}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="lf-btn lf-btn-line">Cancel</button>
          <button type="button" onClick={() => { if (allValid && !saving) onSave(buildPayload()); }} disabled={saving} className="lf-btn lf-btn-red"><Pending busy={saving} label="Saving your changes" tone="red">Save changes</Pending></button>
        </div>
      </div>
    </Sheet>
  );
  const styles = <style jsx global>{LF_CSS}</style>;
  if (inline) {
    return (
      <div style={{ display: 'block' }}>
        <div className="rl-modal lf-inline" style={{ background: C.card, width: '100%', border: `1px solid ${C.rule}` }}>{body}</div>
        {confirmSheet}{styles}
      </div>
    );
  }
  return (
    <>
      <Sheet open={open} onClose={onCancel} label={done ? 'Apply link' : title} busy={saving} maxWidth={done ? 560 : 1120} tall={!done} flush={!done} padSafe={!!done}
        panelClassName={`rl-modal lf-panel${done ? ' lf-panel-done' : ''}`}>
        {body}
      </Sheet>
      {confirmSheet}{styles}
    </>
  );
}

// Global: the sheet renders on the body (components/Sheet.js). Every class is lf-, this form's own.
// Tagged with css.global (styled-jsx/css), which gives the style its own name at build time; a plain
// string has none, and two of them on one page took the same blank name (tests/styleNames.test.mjs).
const LF_CSS = css.global`
  .lf { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .lf-top { flex: none; padding: 0 clamp(20px, 4vw, 28px) var(--s-3); border-bottom: 1px solid ${C.rule}; }
  .lf-progress { height: 3px; border-radius: 2px; background: ${C.rule}; overflow: hidden; margin: 0 0 var(--s-3); }
  .lf-progress span { display: block; height: 100%; background: ${C.ink}; transform-origin: 0 50%; }
  @media (prefers-reduced-motion: no-preference) { .lf-progress span { transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1); } }
  .lf-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-3); }
  .lf-title { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; letter-spacing: -0.015em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; }
  .lf-stepof { font-size: var(--t-body-2); color: ${C.inkMute}; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .lf-step-title { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; margin-top: var(--s-1); }
  .lf-restored { font-size: var(--t-body-2); color: ${C.inkSoft}; margin: var(--s-2) 0 0; }
  .lf-link { background: none; border: none; padding: 0; min-height: 44px; font: inherit; font-weight: 700; color: ${C.ink}; text-decoration: underline; cursor: pointer; }
  .lf-cols { flex: 1 1 auto; min-height: 0; display: flex; }
  .lf-col { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
  .lf-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: none; -webkit-overflow-scrolling: touch; padding: var(--s-4) clamp(20px, 4vw, 28px) var(--s-5); }
  .lf-aside { display: none; }
  .lf-sec + .lf-sec { margin-top: var(--s-6); }
  .lf-sec-h { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: var(--s-3); }
  .lf-field { display: flex; flex-direction: column; gap: var(--s-2); margin-bottom: var(--s-4); }
  .lf-label { display: block; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: 1.3; }
  .lf-opt { font-weight: 500; color: ${C.inkMute}; }
  .lf-input { width: 100%; min-height: 48px; padding: 0 14px; font-size: var(--t-body); font-family: inherit; color: ${C.ink}; background: ${C.card}; border: 1px solid ${C.ruleDark}; border-radius: var(--card-radius); box-sizing: border-box; }
  .lf-input:focus { outline: none; border-color: ${C.ink}; box-shadow: 0 0 0 1px ${C.ink}; }
  .lf-input[aria-invalid='true'] { border-color: ${C.danger}; }
  .lf-input-short { max-width: 240px; }
  .lf-textarea { min-height: 96px; padding: 12px 14px; resize: vertical; line-height: var(--lh-body); }
  select.lf-input { appearance: auto; }
  .lf-rent { position: relative; display: flex; align-items: center; }
  .lf-rent-sign { position: absolute; left: 16px; font-size: 28px; font-weight: 700; color: ${C.ink}; pointer-events: none; }
  .lf-rent-per { position: absolute; right: 16px; font-size: var(--t-body-2); color: ${C.inkMute}; pointer-events: none; }
  .lf-rent-input { min-height: 64px; padding-left: 40px; padding-right: 88px; font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .lf-err { display: block; font-size: var(--t-body-2); color: ${C.danger}; line-height: 1.4; margin: 0; }
  .lf-help { display: block; font-size: 13px; color: ${C.inkMute}; line-height: 1.5; text-wrap: balance; }
  .lf-help-err { color: ${C.danger}; }
  .lf-warn { color: ${C.danger}; }
  .lf-chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: var(--s-2); }
  .lf-chips-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lf-chips-3 { grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 400px) { .lf-chips-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .lf-chips-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .lf-chips-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (min-width: 400px) { .lf-chips-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .lf-chip { min-height: 44px; padding: 0 var(--s-2); border-radius: var(--btn-radius); border: 1px solid ${C.ruleDark}; background: ${C.card}; color: ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .lf-chip[aria-checked='true'] { border-color: ${C.ink}; box-shadow: inset 0 0 0 1px ${C.ink}; background: ${C.paperDeep}; font-weight: 800; }
  .lf-chip:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
  .lf-sub { margin-top: var(--s-2); }
  .lf-details { margin-top: var(--s-2); }
  .lf-more { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 48px; padding: 0; background: transparent; border: none; border-top: 1px solid ${C.rule}; font: inherit; font-size: var(--t-body); font-weight: 700; color: ${C.ink}; cursor: pointer; text-align: left; }
  .lf-hint { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; text-wrap: balance; }
  .lf-more-body { padding-top: var(--s-3); }
  .lf-group { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin: var(--s-5) 0 var(--s-3); }
  .lf-more-body > .lf-group:first-child { margin-top: 0; }
  .lf-group-inline { margin: 0; }
  .lf-notice { margin: var(--s-5) 0 0; padding: 12px 14px; background: ${C.paperDeep}; border-radius: ${R.ctrl}px; border-left: 4px solid ${C.inkSoft}; font-size: 13px; color: ${C.inkSoft}; line-height: 1.55; }
  .lf-checks { display: grid; row-gap: 20px; margin-bottom: var(--s-4); }
  .lf-check { display: flex; align-items: center; gap: 10px; font-size: var(--t-body-2); color: ${C.ink}; cursor: pointer; }
  .lf-check input { width: 18px; height: 18px; margin: 0; accent-color: ${C.ink}; }
  .lf-board-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin-top: var(--s-2); padding: 0; background: transparent; border: none; border-top: 1px solid ${C.rule}; cursor: pointer; font: inherit; color: ${C.ink}; text-align: left; }
  .lf-foot { flex: none; display: flex; gap: var(--s-2); justify-content: flex-end; padding: var(--s-3) clamp(20px, 4vw, 28px) calc(var(--s-3) + env(safe-area-inset-bottom, 0px)); border-top: 1px solid ${C.rule}; background: ${C.paper}; }
  .lf-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: 48px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body); font-weight: 700; cursor: pointer; white-space: nowrap; }
  .lf-btn-red { background: ${C.red}; color: ${C.paper}; border: 1px solid ${C.red}; }
  .lf-btn-red:disabled { background: ${C.ruleDark}; border-color: ${C.ruleDark}; cursor: not-allowed; }
  .lf-btn-line { background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; }
  .lf-btn-quiet { background: transparent; color: ${C.ink}; border: 1px solid transparent; }
  .lf-btn-big { width: 100%; min-height: 56px; font-size: 18px; }
  .lf-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
  .lf-foot .lf-btn { flex: 1 1 0; }
  .lf-eyebrow { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: var(--s-2); }
  .lf-preview-under { margin-top: var(--s-6); }
  .lf-pcard { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); padding: var(--s-5); }
  .lf-pcard-k { font-size: var(--t-body-2); color: ${C.inkMute}; }
  .lf-pcard-h { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; margin-top: var(--s-1); overflow-wrap: anywhere; text-wrap: balance; }
  .lf-pcard-empty { color: ${C.ruleDark}; }
  .lf-pfacts { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); font-size: var(--t-body-2); color: ${C.ink}; line-height: var(--lh-body); }
  .lf-pfacts li { white-space: nowrap; }
  .lf-pcard-by { font-size: var(--t-body-2); color: ${C.inkSoft}; margin-top: var(--s-4); padding-top: var(--s-3); border-top: 1px solid ${C.rule}; text-wrap: balance; }
  /* A phone, a new listing: one step at a time, Continue lifted above the keyboard. */
  @media (max-width: 1023.98px) {
    .lf-stepped[data-step-now='1'] .lf-sec:not([data-sec='1']),
    .lf-stepped[data-step-now='2'] .lf-sec:not([data-sec='2']),
    .lf-stepped[data-step-now='3'] .lf-sec:not([data-sec='3']) { display: none; }
    .lf-stepped .lf-sec-h { display: none; }
    .rl-sh-root .rl-sh-panel.lf-panel:not(.lf-panel-done) { margin-bottom: var(--rl-kb, 0px); height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px)) - var(--rl-kb, 0px)); }
  }
  /* A laptop and wider: no steps, the form in one column of about 520px, what tenants see beside it. */
  @media (min-width: 1024px) {
    .lf-top { padding: 0 var(--s-6) var(--s-4); }
    .lf-cols { display: grid; grid-template-columns: minmax(0, 568px) minmax(0, 1fr); }
    .lf-scroll { padding: var(--s-5) var(--s-6) var(--s-6); }
    .lf-foot { padding: var(--s-3) var(--s-6) var(--s-4); }
    .lf-foot .lf-btn { flex: 0 0 auto; min-width: 160px; }
    .lf-preview-under { display: none; }
    .lf-aside { display: block; padding: var(--s-6); background: ${C.paperDeep}; border-left: 1px solid ${C.rule}; overflow-y: auto; }
    .lf-aside .lf-preview { position: sticky; top: 0; max-width: 460px; }
  }
  /* The apply link, after the save. */
  .lf-done { padding: 4px clamp(20px, 4vw, 28px) clamp(20px, 4vw, 28px); display: flex; flex-direction: column; gap: var(--s-3); }
  .lf-done-h { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
  .lf-done-p { font-size: var(--t-body); color: ${C.inkSoft}; margin: 0; }
  .lf-done-link { font-size: clamp(16px, 5vw, 22px); font-weight: 700; color: ${C.ink}; padding: var(--s-4); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); white-space: nowrap; overflow-x: auto; font-variant-numeric: tabular-nums; user-select: all; -webkit-user-select: all; }
  .lf-done-more { display: flex; justify-content: space-between; gap: var(--s-2); }
`;

