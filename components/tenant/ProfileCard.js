// components/tenant/ProfileCard.js
// The top of the tenant's own profile (pages/my-application.js): their card, the thing they carry
// from listing to listing. The photo (or a clear invitation to add one), the name in large type,
// the job title and the employer, four key facts set large with small labels (income before tax,
// move in, household, time in role; an income read from a document, with none typed, says so),
// and a row of marks that fill in as the tenant adds things,
// one for each step of lib/profileStrength.js the card can show (components/tenant/profileSteps.js
// MARK_STEPS). A filled mark is a solid disc with a tick and says what happened ("ID added",
// "Income read from your document"); an empty one is a dashed ring and names the step. Each mark
// and each fact opens what fills it. How edits reach applications, and the date the details were
// last updated, sit behind About this profile. Only facts the page already holds are shown.
// When a step is added its mark fills with a short motion (transform and opacity, under
// prefers-reduced-motion: no-preference only; components/tenant/ProfileLayout.js .tp-fresh).
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { NBSP, noWidow, dateLong, money, count } from '../../lib/typeset';
import { sourceLine, SOURCE } from '../../lib/profileFacts';
import { MARK_STEPS, doneLabel } from './profileSteps';
import { Chevron } from './ProfileFacts';

const has = (v) => v != null && String(v).trim() !== '';
// "Dec 1, 2026": a date typed as 2026-12-01 is that calendar day.
const dayOf = (v) => { if (!has(v)) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00` : v); return Number.isNaN(d.getTime()) ? null : d; };
const yearsLabel = (v) => { if (!has(v)) return null; const n = Number(v); return Number.isFinite(n) ? `${n}${NBSP}${n === 1 ? 'yr' : 'yrs'}` : String(v); };

// The income read from the tenant's own document, in dollars a year (the newest read when there is
// more than one), from the vault the page already holds; null when none was read.
export function readIncome(vault) {
  const reads = ((vault && vault.checks) || []).filter((c) => c && c.kind === 'income_annual_gross' && Number(c.value && c.value.cents) > 0);
  if (!reads.length) return null;
  const c = reads.reduce((best, x) => (String(x.readAt || '') > String(best.readAt || '') ? x : best));
  return Math.round(Number(c.value.cents) / 100);
}

// The four key facts: the field that edits each, its section, its label and how it reads. The
// income is the one the tenant typed; with none typed, the one read from their document, with the
// page's own line for that source (lib/profileFacts.js sourceLine: "Read from a document").
export function keyFacts(f, vault = null) {
  const x = f || {};
  const selfEmp = x.employmentType === 'self-employed';
  const typed = money(x.annualIncome);
  const read = typed ? null : money(readIncome(vault));
  return [
    { field: 'annualIncome', section: 'employment', label: 'Income before tax', value: typed || read, unit: typed || read ? 'a year' : null, source: read ? sourceLine(SOURCE.DOCUMENT) : null },
    // The day large ("Dec 1"), its year under it.
    { field: 'moveInDate', section: 'household', label: 'Move in', value: dayOf(x.moveInDate) ? dayOf(x.moveInDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : (has(x.moveInDate) ? String(x.moveInDate) : null), unit: dayOf(x.moveInDate) ? String(dayOf(x.moveInDate).getFullYear()) : null },
    { field: 'numberOfOccupants', section: 'household', label: 'Household', value: Number(x.numberOfOccupants) ? count(Number(x.numberOfOccupants), 'person', 'people') : null },
    { field: 'yearsAtJob', section: 'employment', label: selfEmp ? 'Years in business' : 'Time in role', value: yearsLabel(x.yearsAtJob) },
  ];
}

// The steps that just became done since the last answer of the strength: their marks fill.
function useFresh(strength) {
  const before = useRef(null); const [fresh, setFresh] = useState([]);
  useEffect(() => {
    if (!strength) return undefined;
    const now = Object.fromEntries(strength.steps.map((s) => [s.key, s.done]));
    const was = before.current; before.current = now;
    if (!was) return undefined;
    const added = Object.keys(now).filter((k) => now[k] && was[k] === false);
    if (!added.length) return undefined;
    setFresh(added);
    const t = setTimeout(() => setFresh([]), 900);
    return () => clearTimeout(t);
  }, [strength]);
  return fresh;
}

const Tick = () => <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.8 8.4l2.7 2.7 5.7-6" fill="none" stroke={C.card} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// need: what the page asks for on the card, in its own words (pages/my-application.js: a profile
// with no name says so here, with the one button that opens the field).
// empty: none of the facts the page asks for is answered yet; the card offers the guided first run.
export default function ProfileCard({ profile, facts: f, strength, vault, photo, canEdit, onEdit, onStep, onSetup, empty = false, need = null, noticeEl }) {
  const [about, setAbout] = useState(false);
  const fresh = useFresh(strength);
  const apps = (profile.applications || []).length;
  const name = (f && f.fullName) || 'Your profile';
  const job = f && (f.jobTitle || f.employer) ? [f.jobTitle, f.employer].filter(Boolean).join(' at ') : null;
  const marks = strength ? MARK_STEPS.map((k) => strength.steps.find((s) => s.key === k)).filter(Boolean) : [];
  return (
    <section className="rl-card mp-card tp-card" data-profile-card="" aria-labelledby="tp-card-name">
      <div className="tp-card-in">
        <div className="tp-card-top">
          {photo
            ? <button type="button" className="tp-card-photo" data-card-photo="yes" onClick={() => onStep('photo')} aria-label="Your photo. Change it"><img src={photo} alt="" width={88} height={88} /></button>
            : <button type="button" className="tp-card-photo tp-card-photo-none" data-card-photo="no" aria-label="Add a photo" onClick={() => onStep('photo')}><Icon name="user" size={26} /><span className="tp-photo-word" aria-hidden="true">Add a photo</span><span className="tp-photo-plus" aria-hidden="true"><Icon name="plus" size={12} strokeWidth={2.5} /></span></button>}
          <div className="tp-card-id">
            {/* The name on one line: a long one steps down in size to fit, never a word alone. Sized
              from the card's own width (the card is the one size container here: a container
              inside it would leave WebKit reading stale positions while a sheet pins the page). */}
            <h1 id="tp-card-name" className="mp-h1 tp-card-name" data-profile-name="" style={{ whiteSpace: 'nowrap', overflowWrap: 'normal', fontSize: `min(var(--tp-name), calc((100cqi - 2 * var(--card-pad) - var(--tp-name-room)) / ${(Math.max(8, name.length) * 0.56).toFixed(2)}))` }}>{name}</h1>
          </div>
          {job ? <p className="tp-card-job" data-card-job="">{noWidow(job)}</p>
            : f && canEdit && !empty ? <button type="button" className="mp-link tp-card-add" onClick={() => onEdit('employment', 'jobTitle')}>Add your job</button> : null}
        </div>
        {noticeEl}
        {need}
        {empty && (
          <div className="tp-need" data-card-empty="">
            <p className="mp-p">{noWidow('Your profile is empty. A few short questions fill it in.')}</p>
            <button type="button" className="mp-btn mp-btn-auto" data-setup-open="" onClick={onSetup}>Set up my profile</button>
          </div>
        )}
        <div className="tp-keys" data-key-facts="">
          {keyFacts(f, vault).map((k) => {
            const inner = (
              <>
                <span className="tp-key-l">{k.label}</span>
                {k.value ? <span className="tp-key-n">{k.value}</span> : <span className="tp-key-none">Not added</span>}
                {k.unit ? <span className="tp-key-u">{k.unit}</span> : null}
                {k.source ? <span className="tp-key-src" data-key-source="document">{k.source}</span> : null}
              </>
            );
            const cls = `tp-key${k.source ? ' tp-key-read' : ''}`;
            return canEdit
              ? <button key={k.field} type="button" className={`${cls} tp-key-tap`} data-key-fact={k.field} onClick={() => onEdit(k.section, k.field)}>{inner}</button>
              : <div key={k.field} className={cls} data-key-fact={k.field}>{inner}</div>;
          })}
        </div>
        {marks.length > 0 && (
          <ul className="tp-marks" data-marks="" aria-label="What your profile holds">
            {marks.map((s) => (
              <li key={s.key}>
                <button type="button" className="tp-markbtn" data-mark={s.key} data-done={s.done ? 'yes' : 'no'} onClick={() => onStep(s.key)}>
                  <span className={`tp-mark${fresh.includes(s.key) ? ' tp-fresh' : ''}`} data-state={s.done ? 'done' : 'empty'} aria-hidden="true">{s.done ? <Tick /> : null}</span>
                  <span className="tp-mark-text">{noWidow(s.done ? doneLabel(s.key, vault) : s.title)}</span>
                  <span className="tp-sr">{s.done ? '' : ', not added yet'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="tp-card-foot">
          {f && <button type="button" className="mp-link tp-card-link" aria-expanded={about} onClick={() => setAbout((v) => !v)} data-card-about="">About this profile<Chevron open={about} /></button>}
          {apps > 0 && <a href="#applications" className="mp-link tp-card-link" data-to-applications="">Your applications</a>}
          {f && !empty && onSetup && <button type="button" className="mp-link tp-card-link" data-setup-reopen="" onClick={onSetup}>Fill in step by step</button>}
        </div>
        {about && f && (
          <div className="tp-card-about" data-card-about-body="">
            <p className="mp-p" data-details-note="">{noWidow('Edits here reach the applications you send from now on. Anything you already sent keeps what you sent; open it below to change that one.')}</p>
            {profile.factsUpdatedAt && <p className="tp-source" data-details-updated="">{noWidow(`Details updated ${dateLong(profile.factsUpdatedAt)}`)}</p>}
          </div>
        )}
      </div>
      <style jsx global>{`
        .tp-card { container-type: inline-size; padding: 0; }
        .tp-card-in { --tp-name: 32px; --tp-photo: 64px; --tp-gap: var(--s-3); --tp-name-room: 0px; display: grid; gap: var(--s-3); padding: var(--s-4) var(--card-pad) var(--s-1); }
        /* A narrow card: the name across the whole card, the photo and the job under it. A wide one:
           the photo at the left, the name and the job beside it. */
        .tp-card-top { display: grid; grid-template-columns: var(--tp-photo) minmax(0, 1fr); grid-template-areas: 'name name' 'photo job'; gap: var(--s-3) var(--tp-gap); align-items: center; }
        .tp-card-top > .tp-card-id { grid-area: name; }
        .tp-card-top > .tp-card-photo { grid-area: photo; }
        .tp-card-top > .tp-card-job, .tp-card-top > .tp-card-add { grid-area: job; }
        .tp-card-id { min-width: 0; display: grid; gap: 6px; }
        .tp-card-name { line-height: 1.08; letter-spacing: -0.025em; }
        .tp-card-job { margin: 0; font-size: var(--t-body-2); line-height: 1.4; color: ${C.inkSoft}; font-weight: 500; text-wrap: balance; overflow-wrap: anywhere; }
        .tp-card-add { min-height: 32px; justify-self: start; }
        .tp-card-photo { width: var(--tp-photo); height: var(--tp-photo); padding: 0; border-radius: 50%; overflow: hidden; border: 1px solid var(--rule); background: ${C.paperDeep}; cursor: pointer; flex-shrink: 0; display: block; }
        .tp-card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tp-card-photo-none { position: relative; overflow: visible; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 1.5px dashed ${C.inkMute}; background: transparent; color: ${C.inkSoft}; font: inherit; font-size: 11px; font-weight: 700; line-height: 1.1; text-align: center; }
        /* On a narrow card the circle carries a plus; the words fit it once the card is wide. */
        .tp-photo-word { display: none; white-space: nowrap; }
        .tp-photo-plus { position: absolute; right: -2px; bottom: -2px; width: 22px; height: 22px; border-radius: 50%; background: ${C.ink}; color: ${C.paper}; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px ${C.card}; }
        .tp-card-photo:focus-visible, .tp-key-tap:focus-visible, .tp-markbtn:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.card}, 0 0 0 4px ${C.ink}; }
        .tp-card .tp-need { margin-top: 0; }
        /* The key facts: the value in the display face, the largest thing on the card after the name.
           Two by two, four across once the card is wide; below 345px one a row. */
        .tp-keys { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
        .tp-key { min-width: 0; display: grid; align-content: start; justify-items: start; gap: 2px; padding: 10px var(--s-3); border-radius: var(--card-radius); background: ${C.paper}; border: 1px solid var(--rule); font: inherit; color: inherit; text-align: left; }
        .tp-key-tap { cursor: pointer; width: 100%; }
        @media (hover: hover) { .tp-key-tap:hover { border-color: ${C.ruleDark}; background: ${C.card}; } }
        .tp-key-l { font-size: 12.5px; line-height: 1.3; font-weight: 600; color: ${C.inkSoft}; white-space: nowrap; }
        .tp-key-n { margin-top: 2px; font-family: var(--f-display); font-size: 24px; font-weight: 600; line-height: 1.1; letter-spacing: -0.015em; color: ${C.ink}; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tp-key-u { font-size: 12.5px; line-height: 1.3; color: ${C.inkSoft}; white-space: nowrap; }
        .tp-key-none { margin-top: 2px; font-size: var(--t-body-2); line-height: 1.6; font-weight: 600; color: ${C.inkMute}; }
        /* An income read from the tenant's document, with none typed: the line that says so, small. */
        .tp-key-src { margin-top: 2px; font-size: 12px; line-height: 1.3; font-weight: 600; color: ${C.inkMute}; text-wrap: balance; }
        @media (max-width: 344.98px) {
          /* A 320 screen: the photo, then the name, then the job, each across the card. */
          .tp-card-in { --tp-photo: 56px; }
          .tp-card-top { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'photo' 'name' 'job'; row-gap: var(--s-2); }
          .tp-keys { grid-template-columns: minmax(0, 1fr); }
          .tp-key { grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; column-gap: var(--s-2); padding: var(--s-2) var(--s-3); }
          .tp-key-l { grid-row: 1 / span 2; align-self: center; }
          .tp-key-read .tp-key-l { grid-row: 1 / span 3; }
          .tp-key-n, .tp-key-none, .tp-key-u, .tp-key-src { justify-self: end; }
          .tp-key-src { text-align: right; }
          .tp-key-n { font-size: 20px; }
        }
        /* The marks: one a step, a solid disc with a tick once it is added, a dashed ring before.
           One a row on a phone, so every label sits whole on its line; two, then three, as the card widens. */
        .tp-marks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 var(--s-4); }
        .tp-markbtn { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 2px 0; background: transparent; border: none; border-radius: 10px; font: inherit; text-align: left; cursor: pointer; color: ${C.ink}; }
        .tp-markbtn .tp-mark { width: 20px; height: 20px; }
        .tp-mark-text { min-width: 0; font-size: var(--t-body-2); line-height: 1.3; font-weight: 600; color: ${C.inkSoft}; text-wrap: balance; }
        .tp-markbtn[data-done='yes'] .tp-mark-text { color: ${C.ink}; font-weight: 700; }
        @media (hover: hover) { .tp-markbtn:hover .tp-mark-text { text-decoration: underline; } }
        .tp-card-foot { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--s-5); border-top: 1px solid var(--rule); padding-top: 2px; }
        .tp-card-link { font-size: 13px; gap: 4px; }
        .tp-card-about { display: grid; gap: var(--s-1); padding-bottom: var(--s-3); }
        @container (min-width: 560px) {
          .tp-marks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @container (min-width: 880px) {
          .tp-marks { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @container (min-width: 520px) {
          .tp-card-in { --tp-name: 40px; --tp-photo: 88px; --tp-gap: var(--s-5); --tp-name-room: calc(var(--tp-photo) + var(--tp-gap)); gap: var(--gap-card); padding-top: var(--s-5); padding-bottom: var(--s-2); }
          .tp-markbtn { min-height: 36px; }
          .tp-card-top { row-gap: 6px; grid-template-areas: 'photo name' 'photo job'; }
          .tp-card-top > .tp-card-job, .tp-card-top > .tp-card-add { align-self: start; }
          .tp-card-top > .tp-card-id { align-self: end; }
          .tp-photo-word { display: block; }
          .tp-photo-plus { display: none; }
          .tp-card-job { font-size: var(--t-body); }
        }
        @container (min-width: 700px) {
          .tp-keys { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .tp-key-n { font-size: 28px; }
        }
      `}</style>
    </section>
  );
}
