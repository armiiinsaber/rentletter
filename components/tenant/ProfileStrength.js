// components/tenant/ProfileStrength.js
// Profile strength on the tenant's own page (pages/my-application.js): the percent, a bar of one
// tick a step, the line that says only the tenant sees it, the next best step with one button, and
// the checklist, each step with its done state. Every number and every rule is lib/profileStrength.js
// as /api/tenant/personal answers it, unchanged; nothing here counts. Only the tenant ever sees it.
//   StrengthPanel   in the right column from 1280px, at the head of the middle column from 1024px,
//                   and in the sheet on a phone
//   StrengthBar     the phone's slim bar under the header: the percent and the next step; a tap
//                   opens the checklist as a sheet (StrengthSheet)
// onStep(key) takes the tenant to the step's section and opens it for editing or upload. The
// percent moves a little when it changes (transform and opacity, not under reduced motion).
import { useEffect, useRef, useState } from 'react';
import { noWidow } from '../../lib/typeset';
import { C } from '../theme';
import Sheet from '../Sheet';
import { Icon } from '../ui';

export const PRIVATE_LINE = 'Only you see this. It is never shown to a realtor or a landlord, and never used to score you.';
// The next best step: the first counted step not done, else the optional one.
export const nextStep = (s) => (s && s.steps ? s.steps.find((x) => !x.done && !x.optional) || s.steps.find((x) => !x.done) || null : null);

function usePercentBump(percent) {
  const before = useRef(percent); const [bump, setBump] = useState(0);
  useEffect(() => { if (before.current !== percent && before.current != null) setBump((b) => b + 1); before.current = percent; }, [percent]);
  return bump;
}

const Ticks = ({ s }) => {
  const counted = s.steps.filter((x) => !x.optional);
  return (
    <div className="tp-ticks" role="img" aria-label={`${s.done} of ${s.total} steps done`} data-strength-ticks="">
      {counted.map((x) => <span key={x.key} data-done={x.done ? 'yes' : 'no'} />)}
    </div>
  );
};

export function StrengthPanel({ strength: s, onStep, inSheet = false }) {
  const bump = usePercentBump(s ? s.percent : null);
  if (!s) return null;
  const next = nextStep(s);
  return (
    <section className={`rl-card mp-card tp-strength${inSheet ? ' tp-strength-sheet' : ''}`} data-strength="" aria-labelledby={inSheet ? 'tp-strength-sheet-h' : 'pp-strength-h'}>
      <div className="tp-strength-sum">
        <div className="tp-strength-head">
          <h2 id={inSheet ? 'tp-strength-sheet-h' : 'pp-strength-h'} className="mp-h2">Profile strength</h2>
          <div className="pp-percent" data-strength-percent="" aria-live="polite"><span key={bump} className={bump ? 'tp-num tp-bump' : 'tp-num'}>{s.percent}%</span></div>
        </div>
        <Ticks s={s} />
        <p className="tp-private" data-strength-private="">{noWidow(PRIVATE_LINE)}</p>
        <div className="tp-next" data-strength-next={next ? next.key : 'none'}>
          {next ? (
            <>
              <span className="tp-sr">Next best step: </span>
              <p className="tp-next-line">{noWidow(next.adds)}</p>
              <button type="button" className="mp-btn" data-strength-go={next.key} onClick={() => onStep && onStep(next.key)}>{next.title}</button>
            </>
          ) : <p className="tp-next-line">{noWidow('Every step is done.')}</p>}
        </div>
      </div>
      <ul className="pp-steps" data-strength-steps="">
        {s.steps.map((step) => (
          <li key={step.key} data-strength-step={step.key} data-done={step.done ? 'yes' : 'no'}>
            <button type="button" className="pp-step tp-step" onClick={() => onStep && onStep(step.key)}>
              <span className="pp-mark tp-mark" data-state={step.done ? 'done' : 'empty'} data-done={step.done ? 'yes' : 'no'} aria-hidden="true">
                {step.done && <svg width="18" height="18" viewBox="0 0 16 16"><path d="M4.5 8.4l2.3 2.3 4.7-5" fill="none" stroke={C.card} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span className="tp-step-text">
                <span className="pp-step-title">{noWidow(step.done ? `${step.title}: done` : step.title)}{step.optional && !step.done ? <span className="pp-optional"> (optional)</span> : null}</span>
                <span className="mp-source">{noWidow(step.adds)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <StrengthStyles />
    </section>
  );
}

export function StrengthBar({ strength: s, onOpen }) {
  const bump = usePercentBump(s ? s.percent : null);
  if (!s) return null;
  const next = nextStep(s);
  return (
    <button type="button" className="tp-bar" data-strength-bar="" aria-haspopup="dialog" onClick={onOpen}
      aria-label={`Profile strength ${s.percent}%. ${next ? `Next: ${next.title}.` : 'Every step is done.'} Only you see this. Open the checklist`}>
      <span className="tp-bar-num" data-strength-percent=""><span key={bump} className={bump ? 'tp-num tp-bump' : 'tp-num'}>{s.percent}%</span></span>
      <span className="tp-bar-text">
        <span className="tp-bar-label">{next ? 'Next step' : 'Profile strength'}</span>
        <span className="tp-bar-next">{next ? next.title : 'Every step is done'}</span>
      </span>
      <span className="tp-bar-chev" aria-hidden="true"><Icon name="chevronD" size={16} /></span>
    </button>
  );
}

export function StrengthSheet({ open, onClose, strength, onStep }) {
  return (
    <Sheet open={open} onClose={onClose} label="Profile strength" maxWidth={560}>
      <div className="tp-sheet-body" data-strength-sheet="">
        <StrengthPanel strength={strength} onStep={onStep} inSheet />
      </div>
    </Sheet>
  );
}

const StrengthStyles = () => (
  <style jsx global>{`
    .pp-percent { font-family: var(--f-display); font-size: var(--t-d1); font-weight: 600; line-height: var(--lh-display); color: ${C.ink}; font-variant-numeric: tabular-nums; }
    .pp-steps { list-style: none; padding: 0; display: grid; text-align: left; }
    .pp-step { display: flex; align-items: flex-start; justify-content: flex-start; gap: var(--s-3); min-width: 0; text-align: left; }
    .pp-step-title { font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: var(--lh-body); text-wrap: balance; }
    li[data-done='yes'] .pp-step-title { color: ${C.inkMute}; }
    .pp-optional { font-weight: 500; color: ${C.inkMute}; }
    .tp-strength { container-type: inline-size; display: grid; gap: 6px; }
    .tp-strength-sum { display: grid; gap: 6px; align-content: start; min-width: 0; }
    .tp-strength-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
    .tp-strength .pp-percent { margin-top: 0; }
    .tp-num { display: inline-block; }
    .tp-ticks { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
    .tp-ticks > span { height: 8px; border-radius: 2px; background: var(--rule); }
    .tp-ticks > span[data-done='yes'] { background: ${C.done}; }
    .tp-private { margin: 0; font-size: 13px; line-height: 1.4; color: ${C.inkSoft}; text-wrap: balance; overflow-wrap: anywhere; }
    .tp-next { display: grid; gap: var(--s-2); margin-top: 2px; padding: var(--s-3); border-radius: 10px; background: ${C.paperDeep}; }
    .tp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .tp-next-line { margin: 0; font-size: var(--t-body-2); line-height: 1.4; color: ${C.ink}; text-wrap: balance; overflow-wrap: anywhere; }
    .tp-next .mp-btn { background: ${C.card}; width: auto; justify-self: start; padding: 0 var(--s-5); }
    .tp-strength .pp-steps { margin: 0; gap: 0; }
    .tp-step { min-height: 44px; padding: 4px var(--s-2); margin: 0 calc(-1 * var(--s-2)); width: calc(100% + 2 * var(--s-2)); background: transparent; border: none; border-radius: 10px; font: inherit; color: inherit; cursor: pointer; }
    .tp-step-text { display: grid; gap: 1px; min-width: 0; flex: 1 1 auto; text-align: left; }
    .tp-step-text > .pp-step-title { line-height: 1.3; }
    .tp-step-text > .mp-source { display: block; font-size: 13px; line-height: 1.3; }
    /* With a mouse the rows sit closer; a finger keeps its 44px. */
    @media (pointer: fine) { .tp-step { min-height: 40px; padding-top: 2px; padding-bottom: 2px; } }
    .tp-step:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.card}, 0 0 0 4px ${C.ink}; }
    @media (hover: hover) { .tp-step:hover { background: ${C.paperDeep}; } }
    .tp-strength .pp-mark { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-top: 1px; border: 1.5px dashed ${C.inkMute}; background: transparent; }
    .tp-strength .pp-mark[data-done='yes'] { background: ${C.done}; border: none; }
    /* A wide panel (the right column at 2560, the head of the middle column from 1024 to 1279):
       the percent, the line and the next step on the left, the checklist on the right. */
    @container (min-width: 720px) {
      .tp-strength { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); column-gap: var(--s-6); align-items: start; }
    }
    .tp-bar { display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: 52px; padding: var(--s-2) var(--s-4); background: transparent; border: none; font: inherit; color: ${C.ink}; text-align: left; cursor: pointer; }
    .tp-bar-num { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .tp-bar-text { display: grid; gap: 2px; min-width: 0; flex: 1 1 auto; }
    .tp-bar-label { font-size: var(--t-eyebrow); line-height: var(--lh-eyebrow); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; }
    .tp-bar-next { font-size: var(--t-body-2); font-weight: 700; line-height: 1.3; min-width: 0; overflow-wrap: anywhere; text-wrap: balance; }
    .tp-bar-chev { color: ${C.inkMute}; display: inline-flex; flex-shrink: 0; }
    .tp-bar:focus-visible { outline: none; box-shadow: inset 0 0 0 2px ${C.ink}; }
    .tp-sheet-body { padding: 0 var(--s-4) var(--s-4); }
    .tp-sheet-body .tp-strength { box-shadow: none; border: none; padding: 0; background: transparent; }
  `}</style>
);
