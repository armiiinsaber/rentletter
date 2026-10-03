// components/mockups/DocsFirst.js
// "Documents first": a tappable prototype of applying by photographing documents first, for
// /admin/mockups only. Nothing here is imported by the live apply flow (pages/apply/[token].js).
// Fake data, no network, no AI: reading is a 1.2 second state. Tapping walks the six screens:
//   1 the invite, 2 the documents, 3 the facts filled from them, 4 the review, 5 done, and 6 the
//   applicant card as the realtor sees it the moment it lands.
// The documents are kinds the product already reads (lib/documentAuthority.js AUTHORITY): a
// government ID, a pay stub, an employment letter. Facts read from a document carry its source;
// facts typed carry "from you" here and read "stated" to the realtor, as everywhere in the product.
// The AI reads, it never judges: no copy here weighs the tenant, and "verified" never appears
// (only a realtor's own confirmation is verification, lib/applicantSynthesis.js).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { C } from '../theme';
import { TickMeter, Wordmark } from '../ui';
import { noWidow } from '../../lib/typeset';
import { CURVE, DURATION, prefersReducedMotion } from '../../lib/motion';
import { TENANT_LINES } from '../../lib/applicantState';
import { APPLICATION_STATE } from '../../lib/application-state';
import { synthesisLine } from '../../lib/applicantSynthesis';
import { stateLabel } from '../../lib/stateLabels';

export const READ_MS = 1200;
const ARRIVE_MS = 260;
// The two flows side by side. Today: the eight steps of pages/apply/[token].js STEPS, with 29 fields
// to type. Documents first: three steps (documents, confirm, review), three photos and five facts
// the documents cannot give. Time at about ten seconds a field and a photo.
export const FLOWS = Object.freeze({
  today: { label: 'Today', steps: 8, minutes: 5 },
  docs: { label: 'Documents first', steps: 3, minutes: 2 },
});

const LISTING = { name: '88 Harbour St, Unit 2104', rent: '$2,600 per month', beds: '2 bed', realtor: 'Sarah Chen', brokerage: 'Royal LePage', rentNum: 2600 };
const DOCS = [
  { id: 'id', name: 'Photo ID' },
  { id: 'pay', name: 'Pay stub' },
  { id: 'letter', name: 'Employment letter' },
];
const SOURCE = { id: 'from ID', pay: 'from pay stub', letter: 'from letter', you: 'from you' };
// The form, grouped as the real one groups it, and what each document fills.
const GROUPS = [
  { title: 'Identity', fields: [
    { key: 'name', label: 'Full name', read: { doc: 'id', value: 'Priya Nair' } },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
  ] },
  { title: 'Employment and income', fields: [
    { key: 'employer', label: 'Employer', read: { doc: 'letter', value: 'CIBC' } },
    { key: 'title', label: 'Job title', read: { doc: 'letter', value: 'Senior UX Designer' } },
    { key: 'years', label: 'Years at this job', read: { doc: 'letter', value: '5' } },
    { key: 'income', label: 'Income before tax', read: { doc: 'pay', value: '$115,000 a year' } },
  ] },
  { title: 'Current home', fields: [
    { key: 'address', label: 'Address', read: { doc: 'id', value: '41 Wellesley St E, Toronto' } },
    { key: 'rent', label: 'Rent now', type: 'text' },
    { key: 'landlord', label: 'Landlord' },
  ] },
  { title: 'References', fields: [
    { key: 'ref1', label: 'Reference 1', read: { doc: 'letter', value: 'Dana Whitfield, manager' } },
    { key: 'ref2', label: 'Reference 2' },
  ] },
];
const FIELDS = GROUPS.flatMap((g) => g.fields);
const SUBMITTED_LINE = TENANT_LINES[APPLICATION_STATE.SUBMITTED];

const blank = () => ({ screen: 'landing', docs: { id: 'idle', pay: 'idle', letter: 'idle' }, typed: {}, editing: null, draft: '' });

// The facts as they stand: a value and where it came from, or nothing.
const factOf = (s, f) => {
  if (s.typed[f.key] != null && s.typed[f.key] !== '') return { value: s.typed[f.key], from: 'you' };
  if (f.read && s.docs[f.read.doc] === 'read') return { value: f.read.value, from: f.read.doc };
  return { value: '', from: null };
};

const Pill = ({ children, outline = false }) => (
  <ul className="rl-pills" style={{ flexShrink: 0 }}>
    <li className="rl-pill" style={outline ? { background: 'transparent', borderColor: C.ink } : undefined}>{children}</li>
  </ul>
);
const btn = { display: 'block', width: '100%', minHeight: 48, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' };
const RedButton = ({ children, onClick, name }) => <button type="button" data-proto={name} onClick={onClick} style={{ ...btn, background: 'var(--action)', color: C.paper, border: 'none' }}>{children}</button>;
const QuietButton = ({ children, onClick, name }) => <button type="button" data-proto={name} onClick={onClick} style={{ ...btn, minHeight: 44, fontSize: 'var(--t-body-2)', fontWeight: 600, background: 'transparent', color: C.inkSoft, border: 'none', textDecoration: 'underline', textUnderlineOffset: 3 }}>{children}</button>;
const Lead = ({ children }) => <p style={{ margin: 0, fontSize: 'var(--t-d3)', lineHeight: 1.4, color: C.inkSoft, textWrap: 'pretty' }}>{noWidow(children)}</p>;
const Title = ({ children }) => <h1 className="t-d2" style={{ margin: 0, color: C.ink, textWrap: 'balance' }}>{noWidow(children)}</h1>;
const Card = ({ children, style }) => <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 'var(--card-radius)', padding: 'var(--card-pad)', ...style }}>{children}</section>;
const CardTitle = ({ children }) => <h2 className="t-d3" style={{ margin: '0 0 var(--gap-line)', color: C.ink }}>{children}</h2>;

export const DocsFirstScene = forwardRef(function DocsFirstScene({ onScreen }, ref) {
  const [s, setS] = useState(blank);
  const timers = useRef([]);
  const scroller = useRef(null);
  const still = useRef(false);
  useEffect(() => { still.current = prefersReducedMotion(); }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { onScreen?.(s.screen); if (scroller.current) scroller.current.scrollTop = 0; }, [s.screen, onScreen]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  const go = (screen) => setS((x) => ({ ...x, screen, editing: null, draft: '' }));
  useImperativeHandle(ref, () => ({
    reset: () => { timers.current.forEach(clearTimeout); timers.current = []; setS(blank()); },
    realtor: () => setS((x) => (x.screen === 'done' ? { ...x, screen: 'realtor' } : x)),
  }), []);

  const take = (id) => {
    if (s.docs[id] !== 'idle') return;
    const set = (state) => setS((x) => ({ ...x, docs: { ...x.docs, [id]: state } }));
    set('arriving');
    later(() => set('reading'), ARRIVE_MS);
    later(() => set('read'), ARRIVE_MS + READ_MS);
  };
  const anyRead = Object.values(s.docs).includes('read');
  const edit = (f) => setS((x) => ({ ...x, editing: f.key, draft: factOf(x, f).value }));
  const save = () => setS((x) => ({ ...x, typed: { ...x.typed, [x.editing]: x.draft.trim() || x.typed[x.editing] || '' }, editing: null, draft: '' }));

  const step = { capture: 'Step 1 of 3: Documents', confirm: 'Step 2 of 3: Confirm', review: 'Step 3 of 3: Review' }[s.screen];
  const header = (
    <header style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', minHeight: 52, padding: '0 var(--s-4)', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
      <Wordmark size={18} />
      <span style={{ fontSize: 'var(--t-body-2)', color: C.inkMute }}>{s.screen === 'realtor' ? 'Realtor view' : step || 'Rental application'}</span>
    </header>
  );

  let body = null; let foot = null;
  if (s.screen === 'landing') {
    body = (<>
      <section style={{ background: C.inst, color: C.paper, borderRadius: 'var(--card-radius)', padding: 'var(--card-pad)', display: 'grid', gap: 'var(--gap-line)' }}>
        <span className="t-eyebrow" style={{ color: C.instMute }}>You’re applying to</span>
        <h1 className="t-d2" style={{ margin: 0, color: C.paper }}>{noWidow(LISTING.name)}</h1>
        <ul className="rl-pills rl-pills-ink"><li className="rl-pill">{LISTING.rent}</li><li className="rl-pill">{LISTING.beds}</li></ul>
        <p style={{ margin: 0, fontSize: 'var(--t-body-2)', color: C.instText }}>{noWidow(`Goes to ${LISTING.realtor}, ${LISTING.brokerage}`)}</p>
      </section>
      <Lead>Apply in about two minutes. Start with your documents.</Lead>
    </>);
    foot = (<>
      <RedButton name="start" onClick={() => go('capture')}>Start</RedButton>
      <QuietButton name="type-instead" onClick={() => go('confirm')}>No documents handy? Type instead.</QuietButton>
    </>);
  } else if (s.screen === 'capture') {
    body = (<>
      <div style={{ display: 'grid', gap: 'var(--gap-line)' }}>
        <Title>Photograph your documents.</Title>
        <Lead>We read them and fill your application.</Lead>
      </div>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        {DOCS.map((d) => <DocCard key={d.id} doc={d} state={s.docs[d.id]} still={still.current} onTake={() => take(d.id)} />)}
        <div aria-disabled="true" data-proto="bank" style={{ display: 'flex', alignItems: 'center', minHeight: 64, padding: '0 var(--card-pad)', borderRadius: 'var(--card-radius)', border: `1px dashed ${C.rule}`, background: C.paperDeep, color: C.inkMute, fontSize: 'var(--t-body)', cursor: 'default' }}>Bank connection, coming later</div>
      </div>
      <p style={{ margin: 0, fontSize: 'var(--t-body-2)', lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'pretty' }}>{noWidow('Held 14\u00a0days. Seen only by this realtor. Every open is logged.')}</p>
    </>);
    foot = (<>
      {anyRead && <RedButton name="continue" onClick={() => go('confirm')}>Continue</RedButton>}
      <QuietButton name="skip" onClick={() => go('confirm')}>Skip for now</QuietButton>
    </>);
  } else if (s.screen === 'confirm') {
    body = (<>
      <div style={{ display: 'grid', gap: 'var(--gap-line)' }}>
        <Title>Check the facts.</Title>
        <Lead>{anyRead ? 'We read your documents. You confirm the facts.' : 'Nothing read yet. Type the facts below.'}</Lead>
      </div>
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardTitle>{g.title}</CardTitle>
          <div style={{ display: 'grid' }}>
            {g.fields.map((f, i) => (s.editing === f.key
              ? <FieldEdit key={f.key} field={f} draft={s.draft} first={i === 0} onDraft={(v) => setS((x) => ({ ...x, draft: v }))} onSave={save} onCancel={() => setS((x) => ({ ...x, editing: null, draft: '' }))} />
              : <FieldRow key={f.key} field={f} fact={factOf(s, f)} first={i === 0} onEdit={() => edit(f)} />))}
          </div>
        </Card>
      ))}
    </>);
    foot = <RedButton name="looks-right" onClick={() => go('review')}>Looks right</RedButton>;
  } else if (s.screen === 'review') {
    body = (<>
      <div style={{ display: 'grid', gap: 'var(--gap-line)' }}>
        <Title>Ready to send.</Title>
        <Lead>{`This is what ${LISTING.realtor} will see.`}</Lead>
      </div>
      <Card>
        <CardTitle>Your application</CardTitle>
        <div style={{ display: 'grid' }}>
          {FIELDS.map((f, i) => {
            const fact = factOf(s, f);
            return (
              <div key={f.key} data-proto-row={f.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2) var(--s-3)', minHeight: 44, padding: 'var(--s-2) 0', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
                <span data-label="" style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>{f.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginLeft: 'auto', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--t-body)', color: fact.value ? C.ink : C.inkMute, textAlign: 'right' }}>{fact.value ? noWidow(fact.value) : 'Not given'}</span>
                  {fact.value && <Pill>{fact.from === 'you' ? 'stated' : 'docs match'}</Pill>}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <p style={{ margin: 0, fontSize: 'var(--t-body-2)', lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'pretty' }}>{noWidow('This creates one application for this unit. Later changes go through your profile page.')}</p>
    </>);
    foot = <RedButton name="submit" onClick={() => go('done')}>Submit</RedButton>;
  } else if (s.screen === 'done') {
    body = (<>
      <div style={{ display: 'grid', gap: 'var(--gap-line)' }}>
        <Title>You’re all set.</Title>
        <p style={{ margin: 0, fontSize: 'var(--t-d3)', lineHeight: 1.4, color: C.inkSoft }}>
          <span style={{ display: 'block' }}>{noWidow(`${LISTING.realtor} has your application.`)}</span>
          <span style={{ display: 'block' }}>{noWidow(anyRead ? 'Your documents are held 14\u00a0days, then deleted.' : 'Add documents any time from your email.')}</span>
        </p>
      </div>
      <Card style={{ display: 'grid', gap: 'var(--s-2)' }}>
        <span className="t-eyebrow" style={{ color: C.inkMute }}>Where it stands</span>
        <p data-proto="standing" style={{ margin: 0, fontSize: 'var(--t-body)', lineHeight: 'var(--lh-body)', color: C.ink }}>{noWidow(SUBMITTED_LINE)}</p>
      </Card>
    </>);
  } else if (s.screen === 'realtor') {
    body = <RealtorCard s={s} anyRead={anyRead} />;
  }

  return (
    <div data-docs-first={s.screen} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.paper, color: C.ink, fontFamily: 'var(--f-body)', overflow: 'hidden' }}>
      <style>{SCENE_CSS}</style>
      {header}
      <div ref={scroller} data-proto-scroll="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: 'var(--s-5) var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        {body}
      </div>
      {foot && <div style={{ flexShrink: 0, padding: 'var(--s-3) var(--s-4) var(--s-4)', borderTop: `1px solid ${C.rule}`, background: C.paper, display: 'grid', gap: 'var(--s-1)' }}>{foot}</div>}
    </div>
  );
});

// A document to photograph: the outline until a photo arrives, then the photo, the reading rule,
// and the Read pill.
function DocCard({ doc, state, still, onTake }) {
  const idle = state === 'idle';
  return (
    <button type="button" data-proto={`doc-${doc.id}`} data-state={state} onClick={onTake} aria-label={idle ? `${doc.name}. Take a photo or choose a file` : `${doc.name}, ${state === 'read' ? 'read' : 'reading'}`}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%', minHeight: 72, padding: 'var(--s-3) var(--card-pad)', textAlign: 'left', fontFamily: 'inherit', cursor: idle ? 'pointer' : 'default',
        borderRadius: 'var(--card-radius)', background: C.card, border: idle ? `1.5px dashed ${C.ruleDark}` : `1.5px solid ${C.rule}` }}>
      {!idle && (
        <span aria-hidden="true" className={still ? undefined : 'dfp-arrive'} style={{ width: 40, height: 48, flexShrink: 0, borderRadius: 6, background: C.paperDeep, border: `1px solid ${C.rule}`, display: 'grid', alignContent: 'center', gap: 4, padding: '0 7px' }}>
          <span style={{ height: 3, borderRadius: 2, background: C.ruleDark }} /><span style={{ height: 3, borderRadius: 2, background: C.ruleDark, width: '70%' }} /><span style={{ height: 3, borderRadius: 2, background: C.ruleDark }} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 'var(--s-1)' }}>
        <span style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: C.ink }}>{doc.name}</span>
        {idle && <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>Take a photo or choose a file</span>}
        {(state === 'arriving' || state === 'reading') && (
          <span style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>Reading</span>
            <span className="dfp-rule" aria-hidden="true" style={{ display: 'block', height: 2, borderRadius: 1, background: C.rule, overflow: 'hidden' }}>
              {state === 'reading' && <span className={still ? undefined : 'dfp-run'} style={{ display: 'block', height: '100%', background: C.ink, transformOrigin: 'left center', transform: still ? 'none' : undefined }} />}
            </span>
          </span>
        )}
      </span>
      {state === 'read' && <Pill>Read</Pill>}
    </button>
  );
}

// A fact on the confirm screen: the label and the value on one row with where it came from, or the
// "needs you" pill. A tap opens it to edit.
function FieldRow({ field, fact, first, onEdit }) {
  return (
    <button type="button" data-proto={`field-${field.key}`} onClick={onEdit}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2) var(--s-3)', width: '100%', minHeight: 52, padding: 'var(--s-2) 0', background: 'transparent', border: 'none', borderRadius: 0, borderTop: first ? 'none' : `1px solid ${C.rule}`, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
      <span data-label="" style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>{field.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginLeft: 'auto', minWidth: 0 }}>
        {fact.value && <span style={{ fontSize: 'var(--t-body)', color: C.ink, textAlign: 'right' }}>{noWidow(fact.value)}</span>}
        {fact.value ? <Pill>{SOURCE[fact.from]}</Pill> : <Pill outline>needs you</Pill>}
      </span>
    </button>
  );
}
// The same fact, open: a 16px field, Save and Cancel side by side, the same width.
function FieldEdit({ field, draft, first, onDraft, onSave, onCancel }) {
  const input = useRef(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  return (
    <div data-proto-edit={field.key} style={{ display: 'grid', gap: 'var(--s-2)', padding: 'var(--s-2) 0 var(--s-3)', borderTop: first ? 'none' : `1px solid ${C.rule}` }}>
      <label style={{ display: 'grid', gap: 'var(--s-1)' }}>
        <span style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft }}>{field.label}</span>
        <input ref={input} value={draft} onChange={(e) => onDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }} type={field.type || 'text'}
          style={{ width: '100%', minHeight: 48, padding: '0 var(--s-3)', fontSize: 16, fontFamily: 'inherit', color: C.ink, background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--card-radius)' }} />
      </label>
      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <button type="button" data-proto="save" onClick={onSave} style={{ ...btn, flex: '1 1 0', minWidth: 0, minHeight: 44, fontSize: 'var(--t-body-2)', background: C.ink, color: C.paper, border: `1.5px solid ${C.ink}` }}>Save</button>
        <button type="button" data-proto="cancel" onClick={onCancel} style={{ ...btn, flex: '1 1 0', minWidth: 0, minHeight: 44, fontSize: 'var(--t-body-2)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}` }}>Cancel</button>
      </div>
    </div>
  );
}

// The applicant card on the realtor's listing page the moment the application lands, as
// components/dashboard/ListingView.js draws it: the name, the meter with the Fit and its label, then by
// state (lib/applicantState.js): the pay stub matched the income, the line and Verify; documents but
// no income read, the line and Review documents; no documents, "No documents yet" and Request
// documents. The label is lib/fitScore.js's: docs match only once the income matched.
function RealtorCard({ s, anyRead }) {
  const fact = (k) => factOf(s, FIELDS.find((f) => f.key === k)).value;
  const name = fact('name') || 'Priya Nair';
  const income = 115000;
  const applicant = {
    application: { annual_income: income, rent_to_income_ratio: Math.round((LISTING.rentNum / (income / 12)) * 1000) / 10, references: [fact('ref1'), fact('ref2')].filter(Boolean), years_at_job: 5, prev_landlord_name: fact('landlord') || null },
    docVerifications: anyRead ? { active: { nameMatch: 'match', documents: DOCS.filter((d) => s.docs[d.id] === 'read').map((d) => ({ documentType: d.id })), comparisons: s.docs.pay === 'read' ? [{ field: 'Income', status: 'match' }] : [] }, archived: [] } : null,
  };
  const matched = s.docs.pay === 'read';
  const label = matched ? 'docs match' : 'stated';
  return (<>
    <div style={{ display: 'grid', gap: 'var(--gap-line)' }}>
      <span className="t-eyebrow" style={{ color: C.inkMute }}>{LISTING.name}</span>
      <h2 className="t-d3" style={{ margin: 0, color: C.ink }}>Applicants</h2>
    </div>
    <section data-proto="applicant" style={{ background: C.card, border: '1px solid var(--action)', borderLeft: '4px solid var(--action)', borderRadius: 'var(--card-radius)', padding: 'var(--card-pad)', display: 'grid', gap: 'var(--s-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 26 }}>
        <span aria-label="Not yet reviewed" style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-body)', fontWeight: 500, letterSpacing: '-0.01em' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--s-2)', minHeight: 26, paddingLeft: 18 }}>
        <TickMeter value={4.4} size={11} showValue={false} muted={!matched} />
        <span className="t-d3 num" style={{ lineHeight: 1 }}>4.4</span>
        <span data-proto="fit-label" style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      {anyRead ? (<>
        <p data-proto="fit-line" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-body-2)', lineHeight: 1.35, color: C.inkSoft, textWrap: 'balance' }}>{noWidow(synthesisLine(applicant))}</p>
        <div style={{ paddingTop: 'var(--s-1)' }}>{matched ? <RedButton name="verify">Verify</RedButton> : <RedButton name="review-documents">Review documents</RedButton>}</div>
      </>) : (<>
        <ul className="rl-pills" style={{ paddingLeft: 18 }}><li className="rl-pill">{stateLabel('new', 'line')}</li></ul>
        <div style={{ paddingTop: 'var(--s-1)' }}><RedButton name="request-documents">Request documents</RedButton></div>
      </>)}
    </section>
  </>);
}

// A photo arriving and the reading rule. Transform and opacity only, and only when motion is welcome
// (the classes are left off under reduced motion, lib/motion.js prefersReducedMotion).
const SCENE_CSS = `
  @media (prefers-reduced-motion: no-preference) {
    .dfp-arrive { animation: dfp-arrive ${DURATION.short}ms ${CURVE.settle} both; }
    .dfp-run { animation: dfp-run ${READ_MS}ms linear both; }
  }
  @keyframes dfp-arrive { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes dfp-run { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;
