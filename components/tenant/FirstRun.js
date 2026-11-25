// components/tenant/FirstRun.js
// The guided first run of the tenant's own profile (pages/my-application.js): a tenant whose
// profile holds no facts lands here instead of on an empty page. One question a screen, in the
// order of the page's sections (the name and the move, the household, the work and the income,
// the phone, the landlord), a thin line for how far along, Back and Continue, and Skip for
// anything optional (all but the name: no save goes through without one). Every answer is saved
// as the tenant goes, through the route the page always used (POST /api/tenant/profile
// update-facts, the whole draft, as the edit forms send it), so leaving loses nothing: Leave
// setup saves what is typed on the screen, then opens the full page. It ends on their card,
// filled in, with the next step offered. It opens again from the card (Fill in step by step).
// Continue is the screen's one red button. The line moves by transform alone, and not at all
// under reduced motion.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { noWidow } from '../../lib/typeset';
import { estimateNetIncome } from '../../lib/taxEstimate';
import { MOTION_QUERY, DURATION, CURVE } from '../../lib/motion';
import { Pending } from '../brand/Loader';
import { Field } from '../apply/fields';
import { formatPhone, guessProvince } from './ProfileFacts';

const has = (v) => v != null && String(v).trim() !== '';
// The screens: what each asks, the fields it fills, and whether it can be skipped.
export const RUN_STEPS = Object.freeze([
  { key: 'name', q: 'What is your full name?', line: 'Write it the way it appears on your ID.', fields: ['fullName'], need: true },
  { key: 'move', q: 'When would you like to move in?', line: 'A date you can change at any time.', fields: ['moveInDate'] },
  { key: 'household', q: 'How many people will live in the home?', line: 'Count yourself too. It is used only to check a unit’s occupancy limit, and it is never scored.', fields: ['numberOfOccupants'] },
  { key: 'work', q: 'What do you do for work?', line: 'Add your job title and who you work for.', fields: ['jobTitle', 'employer'] },
  { key: 'income', q: 'What is your income before tax?', line: 'Enter the yearly amount, before deductions.', fields: ['annualIncome'] },
  { key: 'phone', q: 'What is your phone number?', line: 'A realtor uses it to reach you about your applications.', fields: ['phone'] },
  { key: 'landlord', q: 'Who is your landlord now?', line: 'Add their name and how to reach them, so a realtor can ask for a reference.', fields: ['previousLandlordName', 'prevLandlordEmail', 'prevLandlordPhone'] },
]);

export default function FirstRun({ profile, save, onLeave, card, next, onNext }) {
  const [at, setAt] = useState(0);            // the screen, RUN_STEPS.length: the card at the end
  const [draft, setDraft] = useState(() => ({ ...(profile.facts || {}), email: profile.email }));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const head = useRef(null);
  const done = at >= RUN_STEPS.length;
  const step = RUN_STEPS[Math.min(at, RUN_STEPS.length - 1)];
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setError(''); };
  // Each screen brings its question to the top and its first field into focus.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const el = done ? head.current : document.querySelector('[data-run-screen] input');
    if (el) el.focus({ preventScroll: true });
  }, [at, done]);

  const keep = async () => {
    const j = await save(draft);
    setDraft({ ...(j.facts || {}), email: profile.email, prevLandlordEmail: draft.prevLandlordEmail, prevLandlordPhone: draft.prevLandlordPhone });
    setDirty(false);
  };
  const go = async (to) => {
    if (busy) return;
    if (step.need && !has(draft.fullName)) { setError('Add your name to continue.'); return; }
    if (to > at && dirty) {
      setBusy('save'); setError('');
      try { await keep(); } catch (e) { setError(e.message); setBusy(''); return; }
      setBusy('');
    }
    setError(''); setAt(to);
  };
  const leave = async () => {
    if (busy) return;
    if (dirty && has(draft.fullName)) {
      setBusy('leave');
      try { await keep(); } catch (e) { setError(e.message); setBusy(''); return; }
      setBusy('');
    }
    onLeave();
  };
  const province = guessProvince(draft);
  const gross = (v) => set({ annualIncome: v, ...(draft.netIncomeSource !== 'stated' ? { netIncome: v ? String(estimateNetIncome(v, province).net || '') : '' } : {}) });
  const landlord = (patch) => {
    const n = { ...draft, ...patch };
    set({ ...patch, previousLandlordContact: [String(n.prevLandlordEmail || '').trim(), String(n.prevLandlordPhone || '').trim()].filter(Boolean).join(' · '), ...(has(n.previousLandlordName) && (!n.rentalStatus || n.rentalStatus === 'none') ? { rentalStatus: 'current' } : {}) });
  };

  const inputs = {
    name: <Field label="Full name" field="fullName" value={draft.fullName || ''} onChange={(v) => set({ fullName: v })} type="text" autoComplete="name" enterKeyHint="next" />,
    move: <Field label="Move in date" field="moveInDate" value={draft.moveInDate || ''} onChange={(v) => set({ moveInDate: v })} type="date" autoComplete="off" />,
    household: <Field label="People, you included" field="numberOfOccupants" value={draft.numberOfOccupants || ''} onChange={(v) => set({ numberOfOccupants: v })} type="number" inputMode="numeric" autoComplete="off" />,
    work: <>
      <Field label="Job title" field="jobTitle" value={draft.jobTitle || ''} onChange={(v) => set({ jobTitle: v })} autoComplete="organization-title" enterKeyHint="next" />
      <Field label="Employer" field="employer" value={draft.employer || ''} onChange={(v) => set({ employer: v, ...(draft.employmentType === 'self-employed' ? { businessName: v } : {}) })} autoComplete="organization" />
    </>,
    income: <Field label="Annual income before tax (CAD)" field="annualIncome" value={draft.annualIncome || ''} onChange={gross} type="number" inputMode="numeric" autoComplete="off" placeholder="85,000" />,
    phone: <Field label="Phone" field="phone" value={draft.phone || ''} onChange={(v) => set({ phone: formatPhone(v) })} type="tel" inputMode="tel" autoComplete="tel" />,
    landlord: <>
      <Field label="Landlord’s name" field="previousLandlordName" value={draft.previousLandlordName || ''} onChange={(v) => landlord({ previousLandlordName: v })} autoComplete="off" enterKeyHint="next" />
      <Field label="Their email" field="prevLandlordEmail" value={draft.prevLandlordEmail || ''} onChange={(v) => landlord({ prevLandlordEmail: v })} type="email" inputMode="email" autoComplete="off" />
      <Field label="Their phone" field="prevLandlordPhone" value={draft.prevLandlordPhone || ''} onChange={(v) => landlord({ prevLandlordPhone: formatPhone(v) })} type="tel" inputMode="tel" autoComplete="off" />
    </>,
  };

  return (
    <div className="fr" data-first-run={done ? 'card' : step.key}>
      <div className="fr-top">
        <span className="mp-label">Set up your profile</span>
        {!done && <button type="button" className="mp-link fr-leave" data-run-leave="" onClick={leave} disabled={!!busy}><Pending busy={busy === 'leave'} label="Saving">Leave setup</Pending></button>}
      </div>
      <div className="fr-line" role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={RUN_STEPS.length} aria-valuenow={Math.min(at + 1, RUN_STEPS.length)}><span style={{ transform: `scaleX(${done ? 1 : (at + 1) / RUN_STEPS.length})` }} /></div>
      {done ? (
        <div className="fr-end" data-run-end="">
          <h1 className="mp-h1 fr-q" ref={head} tabIndex={-1}>{noWidow('Here is your profile.')}</h1>
          <p className="fr-help">{noWidow('Everything you answered is saved. You can change any of it on your profile.')}</p>
          {card}
          {next && (
            <div className="fr-next" data-run-next={next.key}>
              <span className="mp-label">Next step</span>
              <p className="fr-next-line">{noWidow(next.benefit)}</p>
              <button type="button" className="mp-btn mp-btn-red fr-go" data-run-next-go={next.key} onClick={() => onNext(next.key)}>{next.title}</button>
            </div>
          )}
          <button type="button" className="mp-link" data-run-finish="" onClick={onLeave}>See my full profile</button>
        </div>
      ) : (
        <form className="fr-screen" data-run-screen={step.key} noValidate onSubmit={(e) => { e.preventDefault(); go(at + 1); }}>
          <h1 className="mp-h1 fr-q" ref={head}>{noWidow(step.q)}</h1>
          <p className="fr-help">{noWidow(step.line)}</p>
          <div className="fr-fields">{inputs[step.key]}</div>
          {error && <p role="alert" className="mp-alert" data-run-error="">{noWidow(error)}</p>}
          <div className="fr-actions">
            <button type="submit" className="mp-btn mp-btn-red fr-go" data-run-continue="" disabled={!!busy}><Pending busy={busy === 'save'} label="Saving" tone="red">Continue</Pending></button>
            {at > 0 && <button type="button" className="mp-link" data-run-back="" disabled={!!busy} onClick={() => { setError(''); setAt(at - 1); }}>Back</button>}
            {!step.need && <button type="button" className="mp-link" data-run-skip="" disabled={!!busy} onClick={() => { setError(''); setAt(at + 1); }}>Skip</button>}
          </div>
        </form>
      )}
      <style jsx global>{`
        .fr { max-width: 600px; margin: 0 auto; padding: var(--s-5) var(--s-4) var(--s-7); display: grid; gap: var(--gap-card); }
        .fr-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 44px; }
        .fr-leave { font-size: var(--t-body-2); }
        .fr-line { height: 3px; border-radius: 2px; background: var(--rule); overflow: hidden; }
        .fr-line > span { display: block; height: 100%; background: ${C.ink}; transform-origin: left center; }
        @media ${MOTION_QUERY} { .fr-line > span { transition: transform ${DURATION.base}ms ${CURVE.settle}; } }
        .fr-screen, .fr-end { display: grid; gap: var(--gap-card); margin-top: var(--s-4); }
        .fr-q { font-size: 30px; line-height: 1.12; outline: none; }
        .fr-help { margin: calc(-1 * var(--s-2)) 0 0; font-size: var(--t-body); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: balance; max-width: 52ch; }
        .fr-fields { display: grid; gap: var(--gap-card); }
        .fr-fields .mp-input { background: ${C.card}; font-size: 18px; min-height: 52px; }
        .fr-actions { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--s-5); row-gap: var(--s-2); margin-top: var(--s-2); }
        .fr-go { width: auto; min-width: 160px; min-height: 48px; padding: 0 var(--s-6); font-size: var(--t-body); }
        .fr-next { display: grid; gap: var(--s-2); justify-items: start; padding: var(--s-4); border-radius: var(--card-radius); background: ${C.card}; border: 1px solid var(--rule); }
        .fr-next-line { margin: 0; font-size: var(--t-body); line-height: 1.4; font-weight: 600; color: ${C.ink}; text-wrap: balance; }
        @media (min-width: 1024px) { .fr { padding-top: var(--s-7); } .fr-q { font-size: 40px; } }
        @media (max-width: 344.98px) { .fr { padding-left: 12px; padding-right: 12px; } .fr-q { font-size: 26px; } }
      `}</style>
    </div>
  );
}
