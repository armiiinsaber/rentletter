// components/tenant/ProfileFacts.js
// The tenant's facts on the realtor's card. Shared read and edit rendering over the flat apply form
// shape (lib/tenantProfile EMPTY_FORM), used by /my-application (the profile: edits reach future
// applications) and /my-application/[rl] (one snapshot: edits reach that realtor). Everything is on
// the realtor tokens (components/ui.js GlobalStyle): the card, the eyebrow, the text button, the
// line and card gaps. A value made of several facts puts each on its own line (components/ui.js
// StackedLines), with no dots between them; every prose line runs through noWidow (lib/typeset.js).
import { createContext, useContext } from 'react';
import { C, R } from '../theme';
import { Icon, StackedLines } from '../ui';
import { Field, SelectField, ToggleField } from '../apply/fields';
import { serializePets } from '../../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../../lib/taxEstimate';
import { NBSP, noWidow, dateLong, money, moneyYr, moneyMo, count } from '../../lib/typeset';
import { DURATION, CURVE, MOTION_QUERY } from '../../lib/motion';
import { Pending } from '../brand/Loader';
import { StateTag, factState } from './ProfileLayout';

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
// Several facts in one value: one fact per line, no separators (components/ui.js StackedLines).
export const Lines = ({ items }) => <StackedLines parts={items} />;
// A stored "a · b" string, one part per line.
export const LinesText = ({ text }) => <StackedLines text={text} />;

export const Eyebrow = ({ children, style }) => (
  <div className="mp-eyebrow" style={style}><span className="mp-dash" aria-hidden="true" />{children}</div>
);
// An email address is set whole, like a link (.mp-addr): one line, a size down below 345px.
const isAddress = (v) => typeof v === 'string' && /^\S+@\S+\.\S+$/.test(v.trim());
// Where the facts on this page came from. On the tenant's profile (pages/my-application.js) it is
// "Typed by you on DATE", said once under each section's heading, and the page is laid out for
// filling in (ProfileSection below). Null: the snapshot page (/my-application/[rl]), where the
// application itself is the source, laid out as it always was.
export const FactSourceContext = createContext(null);
// On the profile, a field whose source or date differs from its section's ("Read from a document
// on DATE"), as one small label on that field: { [field]: line }.
export const FieldStatusContext = createContext(null);
const SectionContext = createContext(null);
// One fact: the label over the value, on the line gap. Pairs sit in the two column .mp-facts grid.
// field: the name of the input that edits it, so a tap on the value opens its section there.
// span: on the profile, the full width of the grid (a name with an email under it).
export function Row({ label, value, multiline, field, span = false }) {
  const empty = value === null || value === undefined || value === '';
  // A long single value (an email, an address) takes the full row rather than breaking mid word.
  const wide = typeof value === 'string' && value.length > 16;
  const source = useContext(FactSourceContext);
  const sec = useContext(SectionContext);
  const statuses = useContext(FieldStatusContext);
  const shown = <div className={`mp-value${empty ? ' mp-empty' : ''}${isAddress(value) ? ' mp-addr' : ''}`} style={multiline ? { whiteSpace: 'pre-wrap' } : undefined}>{empty ? 'Not provided' : typeof value === 'string' ? noWidow(value) : value}</div>;
  if (source !== null) {
    // The profile: the label, the value directly under it, and a status label only where this field
    // came from somewhere else than its section. A tap on it opens the section, at this field.
    const status = field && statuses && !empty ? statuses[field] : null;
    const tap = sec && sec.canEdit && field ? () => sec.onEditField(field) : null;
    return (
      <div className={`tp-field${tap ? ' tp-field-tap' : ''}`} data-field-row={field || ''} onClick={tap || undefined} style={span || isAddress(value) ? { gridColumn: '1 / -1' } : undefined}>
        <div className="mp-label">{noWidow(label)}</div>
        {shown}
        {status && <div className="tp-status" data-field-status="">{noWidow(status)}</div>}
      </div>
    );
  }
  return (
    <div className="mp-fact" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div className="mp-label">{noWidow(label)}</div>
      {shown}
    </div>
  );
}
export function Empty({ children }) {
  return <p className="mp-p" style={{ marginTop: 'var(--gap-card)' }}>{typeof children === 'string' ? noWidow(children) : children}</p>;
}
export function Section({ id, title, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved, saveLabel = 'Save', footer, single = false, state, invite, error, onEditField }) {
  const source = useContext(FactSourceContext);
  if (source !== null) return <ProfileSection {...{ id, title, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved, saveLabel, footer, state, invite, error, onEditField, source }} />;
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
            <button type="button" onClick={onSave} disabled={saving} className="mp-btn"><Pending busy={saving} label="Saving">{saveLabel}</Pending></button>
            <button type="button" onClick={onCancel} disabled={saving} className="mp-link">Cancel</button>
          </div>
        </div>
      ) : <div className={`mp-facts${single ? ' mp-facts-1' : ''}`}>{rows}</div>}
    </section>
  );
}
// A section on the tenant's profile: its heading with its state (done, started, empty) and Edit;
// the source line once, under the heading; the facts in a grid of two columns (one on a phone);
// editing in place as a form (Enter saves, Escape cancels, the error beside the fields); and an
// empty section as an invitation: one line, one button.
function ProfileSection({ id, title, rows, editing, onEdit, onCancel, onSave, saving, canEdit, children, justSaved, saveLabel, footer, state = 'started', invite, error, onEditField, source }) {
  const empty = state === 'empty' && !!invite;
  return (
    <section id={id} className="rl-card mp-card tp-sec" data-section={id} data-state={state} aria-labelledby={`${id}-h`}>
      <div className="mp-head tp-head">
        <h2 id={`${id}-h`} className="mp-h2" style={{ minWidth: 0 }}>{title}{!editing && justSaved && <span className="mp-saved"> Saved</span>}</h2>
        <div className="tp-head-side">
          <StateTag state={state} />
          {!editing && canEdit && !empty && <button type="button" onClick={onEdit} className="mp-link" data-section-edit={id} aria-label={`Edit ${title}`}>Edit</button>}
        </div>
      </div>
      {!editing && !empty && source && <p className="tp-source" data-fact-source="">{noWidow(source)}</p>}
      {editing ? (
        <form className="tp-edit" data-section-form={id} noValidate aria-describedby={error ? `${id}-err` : undefined}
          onSubmit={(e) => { e.preventDefault(); if (!saving) onSave(); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && !saving) { e.preventDefault(); e.stopPropagation(); onCancel(); } }}>
          <div className="tp-edit-grid">{children}</div>
          {footer}
          {error && <p id={`${id}-err`} role="alert" className="mp-alert" data-section-error={id} style={{ marginTop: 'var(--gap-card)' }}>{noWidow(error)}</p>}
          <div className="mp-actions">
            <button type="submit" disabled={saving} className="mp-btn" data-section-save={id}><Pending busy={saving} label="Saving">{saveLabel}</Pending></button>
            <button type="button" onClick={onCancel} disabled={saving} className="mp-link">Cancel</button>
          </div>
        </form>
      ) : empty ? (
        <div className="tp-invite" data-section-invite={id}>
          <p className="mp-p">{noWidow(invite.line)}</p>
          <button type="button" className="mp-btn mp-btn-auto" data-section-add={id} onClick={invite.onClick}>{invite.button}</button>
        </div>
      ) : (
        <SectionContext.Provider value={{ canEdit, onEditField }}><div className="tp-fields">{rows}</div></SectionContext.Provider>
      )}
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
    /* An email address in a sentence stays whole on its line and the owner key on its own: below
       345px each steps down one size so it fits a 320 screen (a code or a link may; the words may not). */
    .mp-addr { white-space: nowrap; }
    @media (max-width: 344.98px) { .mp-addr, .mp-value.mp-addr { font-size: 13px; } .mp-value.mp-key { font-size: 12px; } }
    /* The apply banner's "Goes to {realtor}, {brokerage}" (pages/apply/[token].js): below 345px a size
       down, and the brokerage on a line of its own under the name. */
    @media (max-width: 344.98px) { .mp-p.mp-goes { font-size: 13px; } .mp-goes-brok { display: block; } }
    .mp-h1 { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; letter-spacing: -0.02em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
    .mp-h2 { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; text-wrap: balance; }
    .mp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 44px; }
    .mp-saved { font-family: var(--f-body); font-size: var(--t-body-2); font-weight: 600; color: ${C.inkMute}; letter-spacing: 0; }
    .mp-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap-card) var(--s-4); align-items: start; margin-top: var(--gap-line); } /* the line gap under the title row (R4) */
    .mp-facts-1 { grid-template-columns: minmax(0, 1fr); }
    /* On a phone one fact a row: half a 390 screen leaves a long employer or an email a word a line. */
    @media (max-width: 480px) { .mp-facts { grid-template-columns: minmax(0, 1fr); } }
    /* The label and its value on one row, the value at the right; the value wraps to its own line
       only when it does not fit beside the label (R3). */
    .mp-fact { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gap-line) var(--gap-card); }
    .mp-fact > .mp-label { flex: 0 1 auto; }
    .mp-fact > .mp-value { flex: 0 1 auto; margin-top: 0; text-align: right; }
    .mp-fact > .mp-value:only-child { text-align: left; }
    .mp-label { font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; text-wrap: balance; }
    .mp-value { margin-top: var(--gap-line); font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.ink}; font-weight: 600; min-width: 0; overflow-wrap: anywhere; text-wrap: balance; }
    .mp-empty { color: ${C.inkMute}; font-weight: 500; }
    /* Where a fact came from and when, under it: a full row of its own, at the left. */
    .mp-source { flex: 1 1 100%; min-width: 0; font-size: 13px; line-height: 1.4; color: ${C.inkMute}; font-weight: 400; text-align: left; text-wrap: balance; }
    .mp-p { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: balance; overflow-wrap: anywhere; margin: 0; }
    .mp-note { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: balance; overflow-wrap: anywhere; }
    .mp-alert { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.danger}; font-weight: 600; text-wrap: balance; overflow-wrap: anywhere; }
    .mp-link { background: transparent; border: none; padding: 0; min-height: 44px; display: inline-flex; align-items: center; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 700; text-decoration: underline; cursor: pointer; font-family: inherit; text-align: left; }
    .mp-link:disabled { opacity: 0.5; cursor: default; }
    .mp-btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 0 var(--gap-card); background: transparent; color: ${C.ink}; border: 1.5px solid ${C.ink}; border-radius: var(--btn-radius); font-size: var(--t-body-2); font-weight: 700; cursor: pointer; font-family: inherit; text-decoration: none; }
    .mp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .mp-btn-red { background: var(--action); color: ${C.paper}; border-color: var(--action); }
    .mp-btn-auto { width: auto; }
    .mp-input { display: block; width: 100%; min-height: 44px; padding: 0 var(--s-3); font-size: var(--t-body); border: 1px solid ${C.rule}; border-radius: var(--card-radius); background: ${C.paper}; color: ${C.ink}; font-family: inherit; }
    .mp-input:focus { border-color: ${C.ink}; }
    .mp-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); margin-top: var(--gap-card); }
    .mp-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--gap-card); }
    .mp-actions { display: flex; align-items: center; gap: var(--s-4); flex-wrap: wrap; margin-top: var(--gap-card); }
    .mp-actions .mp-btn { width: auto; flex: 1 1 200px; }
    .mp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); margin-top: var(--gap-card); align-items: start; }
    .mp-stats > * { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gap-line) var(--gap-card); }
    .mp-stats .mp-stat-v { margin-top: 0; }
    /* Below 345px the three counts stack, each label beside its value: a third of a 320 screen cannot hold "Last viewed". */
    @media (max-width: 344.98px) { .mp-stats { grid-template-columns: minmax(0, 1fr); } }
    .mp-stat-v { margin-top: var(--gap-line); font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-wrap: balance; }
    .mp-fold { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); margin-top: var(--gap-card); background: transparent; border: none; border-top: 1px solid var(--rule); border-radius: 0; padding: 0; font: inherit; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; cursor: pointer; text-align: left; }
    .mp-list { list-style: none; margin: 0; padding: 0; }
    .mp-list li { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); min-height: 44px; padding: var(--s-2) 0; border-top: 1px solid var(--rule); font-size: var(--t-body-2); line-height: var(--lh-body); }
    .mp-list li:first-child { border-top: none; }
    .mp-step { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: var(--lh-body); }
    .mp-progress { height: 2px; background: var(--rule); border-radius: 1px; margin-top: var(--gap-line); overflow: hidden; }
    .mp-progress > span { display: block; height: 100%; background: ${C.ink}; }
    .mp-toast { position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 300; color: ${C.paper}; padding: var(--s-3) var(--s-4); border-radius: ${R.ctrl}px; font-size: var(--t-body-2); font-weight: 600; max-width: calc(100vw - 32px); text-align: center; cursor: pointer; }
    /* A toast floats over the page: the ink glass (components/ui.js), with its own lift. */
    .mp-toast.rl-glass { box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 8px 24px rgba(15,15,16,0.22); }
    .mp-sub { padding-left: var(--s-4); border-left: 2px solid var(--rule); display: grid; gap: var(--gap-card); }
    /* The tenant's profile (FactSourceContext set, pages/my-application.js): each field its label with
       the value directly under it, two columns once the card is 460px wide, one below; the source
       line once under the heading; the edit form in place, two columns from 560px. */
    .tp-sec { container-type: inline-size; }
    .tp-head { flex-wrap: wrap; row-gap: var(--s-1); }
    .tp-head-side { display: flex; align-items: center; gap: var(--s-3); margin-left: auto; }
    .tp-source { margin: var(--s-1) 0 0; font-size: 13px; line-height: 1.4; color: ${C.inkMute}; text-wrap: balance; overflow-wrap: anywhere; }
    .tp-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card) var(--s-6); margin-top: var(--gap-card); align-items: start; }
    @container (min-width: 460px) { .tp-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .tp-field { display: grid; gap: 6px; align-content: start; justify-items: start; min-width: 0; text-align: left; }
    .tp-field > .mp-value { margin-top: 0; max-width: 100%; }
    .tp-field-tap { cursor: pointer; border-radius: 10px; margin: -6px -8px; padding: 6px 8px; }
    @media (hover: hover) { .tp-field-tap:hover { background: ${C.paperDeep}; } }
    .tp-status { display: inline-block; max-width: 100%; padding: 3px 8px; border-radius: 999px; background: ${C.paperDeep}; color: ${C.inkSoft}; font-size: 12px; font-weight: 600; line-height: 1.35; text-wrap: balance; overflow-wrap: anywhere; }
    .tp-edit .mp-actions .mp-btn { flex: 0 0 auto; width: auto; padding: 0 var(--s-5); }
    .tp-invite { display: grid; gap: var(--gap-card); justify-items: start; margin-top: var(--gap-line); }
    .tp-edit-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap-card); margin-top: var(--gap-card); align-items: start; }
    @container (min-width: 560px) {
      .tp-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--s-5); }
      .tp-edit-grid > .mp-sub, .tp-edit-grid > .mp-grid2, .tp-edit-grid > [data-tap-card], .tp-edit-grid > .tp-span { grid-column: 1 / -1; }
      .tp-edit-grid > .mp-sub.tp-pair { grid-column: auto; }
    }
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
//        canEdit, saving, justSaved, onEdit(id, field), onCancel(), onSave(), editFooter (node shown
//        inside every edit form, e.g. the coherence checkbox), contactEditable (bool), contactName
//        (bool: Contact holds the full name and the phone, edited in place, and shows the email
//        as it is; the tenant's profile, where the email changes through its own confirmation)
// On the tenant's profile (FactSourceContext set) also: only (the sections to render, in order),
//        saveError (shown beside the fields of the open section), onInvite (the button of an empty
//        section when the facts cannot be edited yet) and invite (its words then).
export const FACT_ORDER = Object.freeze(['employment', 'contact', 'rental', 'move', 'household', 'references']);
// What an empty section asks for, and why it helps: one line and one button.
const INVITES = {
  employment: { line: 'Add your job and income once. Every application you send starts with them.', button: 'Add your employment' },
  rental: { line: 'Add where you rent now and your landlord, so a realtor can ask them for a reference.', button: 'Add your rental history' },
  move: { line: 'Add the date you want to move in. A realtor checks it against the date a unit is free.', button: 'Add a move in date' },
  references: { line: 'Add someone who can speak for you, such as a manager. Realtors often ask for one.', button: 'Add a reference' },
};
export function FactSections({ facts: f0, draft, editing, setDraft, canEdit, saving, justSaved, onEdit, onCancel, onSave, editFooter, contactEditable = true, contactName = false, saveLabel, only, saveError, onInvite, invite }) {
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
  const sec = (id) => {
    // With no facts yet (invite given), every section but Contact (the sign in email) is empty.
    const state = invite && id !== 'contact' ? 'empty' : factState(id, f);
    const words = invite || INVITES[id];
    return {
      id, editing: editing === id, canEdit, saving, justSaved: justSaved === id, onEdit: () => onEdit(id), onCancel, onSave, footer: editFooter, saveLabel,
      state, error: editing === id ? saveError : '', onEditField: (field) => onEdit(id, field),
      invite: words && (canEdit || onInvite) ? { ...words, onClick: () => (canEdit ? onEdit(id) : onInvite(id)) } : null,
    };
  };
  const d = draft || {};
  const contactParts = String(f.previousLandlordContact || '').split(' · ').filter(Boolean);
  const occupants = Number(f.numberOfOccupants) || 0;

  const cards = {
    employment: (
      <Section key="employment" {...sec('employment')} title="Employment and income"
        rows={<>
          <Row label="Job title" field="jobTitle" value={f.jobTitle} />
          <Row label={selfEmp ? 'Business' : 'Employer'} field="employer" value={f.employer ? <Lines items={[f.employer, EMP_LABEL[f.employmentType]]} /> : null} />
          <Row label={selfEmp ? 'Years in business' : 'Time in role'} field="yearsAtJob" value={f.yearsAtJob ? `${f.yearsAtJob}${NBSP}yr${String(f.yearsAtJob) === '1' ? '' : 's'}` : null} />
          <Row label="Income before tax" field="annualIncome" value={moneyYr(f.annualIncome)} />
          <Row label="After tax" field="netIncome" value={moneyYr(f.netIncome) ? <Lines items={[moneyYr(f.netIncome), f.netIncomeSource === 'stated' ? 'you entered' : 'estimate']} /> : null} />
        </>}>
        {draft && <>
          <SelectField label="Employment type" field="employmentType" value={d.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[{ value: '', label: 'Select' }, { value: 'full-time', label: 'Full time' }, { value: 'part-time', label: 'Part time' }, { value: 'contract', label: 'Contract' }, { value: 'self-employed', label: 'Self employed (own or family business)' }]} />
          <Field label="Job title" field="jobTitle" required value={d.jobTitle} onChange={(v) => set('jobTitle', v)} autoComplete="organization-title" />
          <Field label={d.employmentType === 'self-employed' ? 'Registered business name' : 'Employer'} field="employer" required value={d.employer} onChange={(v) => updateEmployment({ employer: v })} autoComplete="organization" hint={d.employmentType === 'self-employed' ? 'The business as it is registered: your own, or a family business you work for.' : undefined} />
          <Field label={d.employmentType === 'self-employed' ? 'Years in business' : 'Years at this job'} field="yearsAtJob" value={d.yearsAtJob} onChange={(v) => set('yearsAtJob', v)} placeholder="3" inputMode="decimal" autoComplete="off" />
          <Field label="Annual income before tax (CAD)" field="annualIncome" required value={d.annualIncome} onChange={updateGross} placeholder="85,000" type="number" inputMode="numeric" autoComplete="off" hint="Gross, before deductions." />
          <div>
            <Field label="Estimated after tax income (CAD per year)" field="netIncome" value={d.netIncome} onChange={updateNet} type="number" inputMode="numeric" autoComplete="off" hint={d.netIncomeSource === 'stated' ? 'You entered this yourself.' : `Estimate for ${PROV_NAME[province]} at ${TAX_YEAR} rates. Correct it if yours is different.`} />
            {d.netIncomeSource === 'stated' && <button type="button" onClick={resetNet} className="mp-link">Use the {PROV_NAME[province]} estimate instead</button>}
          </div>
        </>}
      </Section>
    ),
    contact: contactName ? (
      <Section key="contact" {...sec('contact')} title="Contact" canEdit={canEdit && contactEditable}
        rows={<><Row label="Full name" field="fullName" value={f.fullName} /><Row label="Phone" field="phone" value={f.phone} /><Row label="Email" value={f.email} /></>}>
        {draft && <>
          <Field label="Full name" field="fullName" required value={d.fullName} onChange={(v) => set('fullName', v)} type="text" autoComplete="name" enterKeyHint="next" />
          <Field label="Phone" field="phone" required value={d.phone} onChange={(v) => set('phone', formatPhone(v))} type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="done" />
        </>}
      </Section>
    ) : (
      <Section key="contact" {...sec('contact')} title="Contact" canEdit={canEdit && contactEditable}
        rows={<><Row label="Email" field="email" value={f.email} /><Row label="Phone" field="phone" value={f.phone} /></>}>
        {draft && <>
          <Field label="Email" field="email" required value={d.email} onChange={(v) => set('email', v)} type="email" inputMode="email" autoComplete="email" />
          <Field label="Phone" field="phone" required value={d.phone} onChange={(v) => set('phone', formatPhone(v))} type="tel" inputMode="tel" autoComplete="tel" />
        </>}
      </Section>
    ),
    rental: (
      <Section key="rental" {...sec('rental')} title="Rental history" single={!hasRental}
        rows={hasRental ? <>
          <Row label="Address" field="previousAddress" value={f.previousAddress} />
          <Row label="Time there" field="tenureYears" value={tenureLabel(f.yearsAtPrevious)} />
          <Row label="Rent" field="currentRent" value={moneyMo(f.currentRent)} />
          <Row label="Landlord reference" field="previousLandlordName" span value={f.previousLandlordName ? <Lines items={[f.previousLandlordName, ...contactParts]} /> : null} />
        </> : <Row label="Previous rental" field="rentalStatus" value="None listed" />}>
        {draft && <>
          <div className="tp-span"><SelectField label="Your rental situation" field="rentalStatus" value={d.rentalStatus} onChange={updateRentalStatus} options={[{ value: 'current', label: 'I am renting now' }, { value: 'previous', label: 'I have rented before, but not right now' }, { value: 'none', label: 'No previous rental to list' }]} /></div>
          {d.rentalStatus !== 'none' && <>
            <div className="tp-span"><Field label="Rental address" field="previousAddress" value={d.previousAddress} onChange={(v) => set('previousAddress', v)} autoComplete="street-address" /></div>
            <div className="mp-grid2">
              <SelectField label="Time there, years" field="tenureYears" value={d.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[{ value: '', label: 'Select' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })), { value: '10', label: '10 or more' }]} />
              <SelectField label="Plus months" field="tenureMonths" value={d.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[{ value: '', label: '0' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
              <Field label="Rent (CAD per month)" field="currentRent" value={d.currentRent} onChange={(v) => set('currentRent', v)} type="number" inputMode="numeric" autoComplete="off" />
            </div>
            <div className="tp-span"><Field label="Landlord's name" field="previousLandlordName" value={d.previousLandlordName} onChange={(v) => set('previousLandlordName', v)} autoComplete="off" /></div>
            <div className="mp-grid2">
              <Field label="Their email" field="prevLandlordEmail" value={d.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} type="email" inputMode="email" autoComplete="off" />
              <Field label="Their phone" field="prevLandlordPhone" value={d.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} type="tel" inputMode="tel" autoComplete="off" />
            </div>
          </>}
        </>}
      </Section>
    ),
    move: (
      <Section key="move" {...sec('move')} title="Your move" single
        rows={<Row label="Move in date" field="moveInDate" value={dateLong(f.moveInDate)} />}>
        {draft && <Field label="Desired move in date" field="moveInDate" value={d.moveInDate} onChange={(v) => set('moveInDate', v)} type="date" autoComplete="off" />}
      </Section>
    ),
    household: (
      <Section key="household" {...sec('household')} title="Household and pets"
        rows={<>
          <Row label="Occupants" field="numberOfOccupants" value={occupants ? count(occupants, 'person', 'people') : null} />
          <Row label="Smoking or vaping" field="smoker" value={{ no: 'No', yes: 'Yes', outdoor: 'Outdoor only' }[f.smoker] || 'No'} />
          <Row label="Pets" field="pets" value={f.pets || 'None'} />
          <Row label="Co tenant" field="coTenant" value={f.hasCoApplicant ? <Lines items={[f.coApplicantName || 'Yes', [f.coApplicantJobTitle, f.coApplicantEmployer].filter(Boolean).join(' at '), moneyYr(f.coApplicantIncome)]} /> : 'Applying alone'} />
        </>}>
        {draft && <>
          <div className="mp-grid2">
            <Field label="Total occupants" field="numberOfOccupants" value={d.numberOfOccupants} onChange={(v) => set('numberOfOccupants', v)} type="number" inputMode="numeric" autoComplete="off" hint="Used only to check the unit's occupancy limit. Not scored." />
            <SelectField label="Smoking or vaping" field="smoker" value={d.smoker} onChange={(v) => set('smoker', v)} options={[{ value: 'no', label: 'No' }, { value: 'outdoor', label: 'Outdoor only' }, { value: 'yes', label: 'Yes' }]} />
          </div>
          <ToggleField label="Do you have pets?" value={d.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
          {d.hasPets && (
            <div className="mp-sub">
              <div className="mp-grid2">
                <SelectField label="Type" field="petType" value={d.petType} onChange={(v) => updatePets({ petType: v })} options={[{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }, { value: 'catdog', label: 'Cats and dogs' }, { value: 'other', label: 'Other' }]} />
                <SelectField label="How many" field="petCount" value={d.petCount} onChange={(v) => updatePets({ petCount: v })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3+', label: '3 or more' }]} />
                <SelectField label="Size of largest (optional)" field="petSize" value={d.petSize} onChange={(v) => updatePets({ petSize: v })} options={[{ value: '', label: 'Select' }, { value: 'small', label: 'Small (under 25 lb)' }, { value: 'medium', label: 'Medium (25 to 60 lb)' }, { value: 'large', label: 'Large (over 60 lb)' }]} />
              </div>
              <ToggleField label="Spayed or neutered" value={d.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
              <ToggleField label="House trained" value={d.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
              <Field label="Anything else about your pets (optional)" field="petNotes" value={d.petNotes} onChange={(v) => updatePets({ petNotes: v })} autoComplete="off" />
            </div>
          )}
          <ToggleField label="Applying with a co tenant, another adult on the lease?" value={d.hasCoApplicant} onChange={(v) => set('hasCoApplicant', v)} />
          {d.hasCoApplicant && (
            <div className="mp-sub">
              <Field label="Full name" field="coApplicantName" value={d.coApplicantName} onChange={(v) => set('coApplicantName', v)} autoComplete="off" />
              <Field label="Job title" field="coApplicantJobTitle" value={d.coApplicantJobTitle} onChange={(v) => set('coApplicantJobTitle', v)} autoComplete="off" />
              <Field label="Employer" field="coApplicantEmployer" value={d.coApplicantEmployer} onChange={(v) => set('coApplicantEmployer', v)} autoComplete="off" />
              <Field label="Annual income before tax (CAD)" field="coApplicantIncome" value={d.coApplicantIncome} onChange={(v) => set('coApplicantIncome', v)} type="number" inputMode="numeric" autoComplete="off" />
            </div>
          )}
        </>}
      </Section>
    ),
    references: (
      <Section key="references" {...sec('references')} title="References" single={refs.length === 0}
        rows={refs.length ? refs.map((n) => <Row key={n} label={`Reference ${n}`} field={`reference${n}Name`} span value={<Lines items={[f[`reference${n}Name`], f[`reference${n}Relationship`], f[`reference${n}Contact`]]} />} />)
          : <Row label="References" field="reference1Name" value={count(0, 'provided', 'provided')} />}>
        {draft && [1, 2].map((n) => (
          <div key={n} className="mp-sub tp-pair">
            <div className="mp-label">Reference {n}</div>
            <Field label="Full name" field={`reference${n}Name`} value={d[`reference${n}Name`]} onChange={(v) => set(`reference${n}Name`, v)} autoComplete="off" />
            <div className="mp-grid2">
              <Field label="Relationship" field={`reference${n}Relationship`} value={d[`reference${n}Relationship`]} onChange={(v) => set(`reference${n}Relationship`, v)} autoComplete="off" />
              <Field label="Phone or email" field={`reference${n}Contact`} value={d[`reference${n}Contact`]} onChange={(v) => set(`reference${n}Contact`, v)} autoComplete="off" />
            </div>
          </div>
        ))}
      </Section>
    ),
  };
  return <>{(only || FACT_ORDER).map((k) => cards[k])}</>;
}
export const Chevron = ({ open }) => <span aria-hidden="true" style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', color: C.inkMute, flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>;
