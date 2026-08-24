// components/mockups/HeroDemo.js
// The landing-page hero scene — a looping, code-built product demo (no screenshot). Lives here
// so the mockup showcase (/admin/mockups) can reuse it inside a DeviceFrame. Moved verbatim
// from pages/index.js; exported as the "Ranked applicants" scene.
import { useState, useEffect } from 'react';
import { C, R, SH } from '../theme';
import { Icon } from '../ui';

// ─── HERO DEMO — looping, auto-advancing animated product demo ──────────────
// Built entirely in code (no screenshot). Two crossfading scenes:
//   1. REVIEW   — applicant cards, already ranked by score; the highlight walks the list
//                 top-down (top scorer first), revealing income / employment / fit.
//   2. SHORTLIST — the same applicants re-sorted by score, a "Top pick" rises,
//                 and a "Send to landlord" bar appears.
// transform/opacity only; respects prefers-reduced-motion (static shortlist).
const HERO_APPLICANTS = [
  { id: 'mei', initials: 'MT', color: '#1f7a8c', name: 'Mei Tanaka',  role: 'Marketing Mgr · Loblaw',  income: '$87,000/yr', score: 3.9, fit: [['Income 30% of rent', true], ['Non-smoker', true]] },
  { id: 'james', initials: 'JO', color: '#3a6ea5', name: 'James Okafor', role: 'Software Eng · Shopify',    income: '$95,000/yr', score: 4.2, fit: [['Income comfortably clears', true], ['Tenure under 2 yrs', false]] },
  { id: 'priya', initials: 'PN', color: '#2d7d4a', name: 'Priya Nair',  role: 'Senior UX · CIBC',         income: '$115,000/yr', score: 4.6, fit: [['Income comfortably clears', true], ['5 yrs at employer', true]] },
  { id: 'david', initials: 'DT', color: '#8a5a2b', name: 'David Tremblay', role: 'Registered Nurse · Sunnybrook', income: '$78,000/yr', score: 3.6, fit: [['Income clears 30%', true], ['4 yr tenure', true]] },
  { id: 'amara', initials: 'AO', color: '#6b4a8a', name: 'Amara Okonkwo', role: 'Teacher · TDSB',          income: '$71,000/yr', score: 3.3, fit: [['Income meets minimum', true], ['New to the city', false]] },
];
// Both scenes are ordered by score, desc — the mockup must show what the product does: the
// emphasized applicant is the highest scorer. (Sorted from HERO_APPLICANTS, never hand-typed.)
const HERO_RANKED  = [...HERO_APPLICANTS].sort((a, b) => b.score - a.score).map((a) => a.id);
const HERO_ARRIVAL = HERO_RANKED; // review scene walks the ranked list top-down
const HERO_BY_ID = Object.fromEntries(HERO_APPLICANTS.map(a => [a.id, a]));

function HeroAvatar({ a, size = 30 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: '50%',
      background: a.color, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, letterSpacing: '0.01em',
    }}>{a.initials}</span>
  );
}

// Timeline — exported so the mockup exporter can reproduce one exact loop frame by frame.
// Steps 0..2 review-highlight the TOP THREE ranked cards; step 3 is the shortlist hold. The
// longest CSS transition in the scene is 600ms (scene crossfade).
export const HERO_STEP_DURATIONS = [1500, 1400, 1600, 3800];
export const HERO_TRANSITION_MS = 600;
export const HERO_LOOP_MS = HERO_STEP_DURATIONS.reduce((a, b) => a + b, 0);

// `step` (number) puts the demo under external control: the internal timer is off and the
// scene shows exactly that step (transitions still run, so an exporter can scrub them).
export default function HeroDemo({ step: controlledStep = null }) {
  const REVIEW_STEPS = 3;
  const [autoStep, setAutoStep] = useState(0);
  const [still, setStill] = useState(false);
  const controlled = controlledStep !== null && controlledStep !== undefined;
  const step = controlled ? controlledStep : autoStep;

  useEffect(() => {
    if (typeof window === 'undefined' || controlled) return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      setStill(true);
      return;
    }
    const durations = HERO_STEP_DURATIONS;
    let t;
    const tick = (s) => { t = setTimeout(() => { const n = (s + 1) % durations.length; setAutoStep(n); tick(n); }, durations[s]); };
    tick(autoStep);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  const stillNow = still && !controlled; // an exporter drives the scene even under reduced motion
  const reviewVisible = !stillNow && step < REVIEW_STEPS;
  const shortlistVisible = stillNow || step === REVIEW_STEPS;

  const sceneBase = {
    position: 'absolute', inset: 0, padding: 'clamp(14px, 4.5%, 22px)',
    display: 'flex', flexDirection: 'column', gap: 'clamp(7px, 1.6%, 10px)',
    transition: 'opacity 600ms ease, transform 600ms cubic-bezier(0.22,1,0.36,1)',
  };
  const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
  const eyebrow = { fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' };
  const cardBase = {
    background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl,
    padding: 'clamp(7px, 2%, 11px) clamp(9px, 2.4%, 13px)', boxShadow: SH.rest,
    transition: 'transform 480ms cubic-bezier(0.22,1,0.36,1), box-shadow 480ms ease, border-color 480ms ease, opacity 480ms ease',
  };
  const nameStyle = { fontSize: 'clamp(11px, 3vw, 13px)', fontWeight: 700, color: C.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const roleStyle = { fontSize: 'clamp(9px, 2.4vw, 11px)', color: C.inkMute, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const scorePill = (active) => ({ fontSize: 'clamp(10px, 2.6vw, 12px)', fontWeight: 700, color: active ? C.paper : C.ink, background: active ? C.red : C.paperDeep, borderRadius: R.pill, padding: '2px 9px', flexShrink: 0 });

  return (
    <>
      {/* ── REVIEW SCENE ── */}
      <div style={{
        ...sceneBase,
        opacity: reviewVisible ? 1 : 0,
        transform: reviewVisible ? 'none' : 'translateY(-6px)',
        pointerEvents: 'none',
      }} aria-hidden={!reviewVisible}>
        <div style={head}>
          <span style={eyebrow}>Maple &amp; Birch · 2BR</span>
          <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.inkMute, fontWeight: 600 }}>8 applicants</span>
        </div>
        <div style={{ height: 1, background: C.rule }} />
        {HERO_ARRIVAL.map((id, i) => {
          const a = HERO_BY_ID[id];
          const active = !stillNow && step === i;
          return (
            <div key={id} style={{
              ...cardBase,
              borderLeft: active ? `3px solid ${C.red}` : `1px solid ${C.rule}`,
              transform: active ? 'translateY(-1px) scale(1.015)' : 'none',
              boxShadow: active ? SH.raised : SH.rest,
              opacity: (!stillNow && step > i && step < REVIEW_STEPS) ? 0.55 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <HeroAvatar a={a} size={28} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={nameStyle}>{a.name}</div>
                  <div style={roleStyle}>{a.role}</div>
                </div>
                <span style={scorePill(active)}>{a.score.toFixed(1)}</span>
              </div>
              {/* Reveal: income + fit, only on the active card (opacity/height) */}
              <div style={{
                overflow: 'hidden',
                maxHeight: active ? 60 : 0,
                opacity: active ? 1 : 0,
                transition: 'max-height 480ms cubic-bezier(0.22,1,0.36,1), opacity 360ms ease',
                marginTop: active ? 8 : 0,
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', fontWeight: 600, color: C.ink, background: C.paperDeep, borderRadius: R.pill, padding: '2px 8px' }}>{a.income}</span>
                  {a.fit.map(([label, ok], k) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'clamp(9px, 2.4vw, 11px)', color: ok ? C.green : C.inkMute }}>
                      <Icon name={ok ? 'check' : 'question'} size={12} color={ok ? C.green : C.inkMute} strokeWidth={2} />{label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── SHORTLIST SCENE ── (tighter gap so all 5 rows + the send bar fit cleanly) */}
      <div style={{
        ...sceneBase,
        gap: 'clamp(6px, 1.3%, 9px)',
        opacity: shortlistVisible ? 1 : 0,
        transform: shortlistVisible ? 'none' : 'translateY(6px)',
        pointerEvents: 'none',
      }} aria-hidden={!shortlistVisible}>
        <div style={head}>
          <span style={eyebrow}>Ranked · top 5</span>
          <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', color: C.green, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: `1px solid ${C.green}`, borderRadius: R.pill, padding: '1px 7px' }}>Ranked</span>
        </div>
        <div style={{ height: 1, background: C.rule }} />
        {HERO_RANKED.map((id, i) => {
          const a = HERO_BY_ID[id];
          const top = i === 0;
          return (
            <div key={id} style={{
              ...cardBase,
              borderLeft: top ? `3px solid ${C.red}` : `1px solid ${C.rule}`,
              display: 'flex', alignItems: 'center', gap: 9,
              // staggered rise as the shortlist scene appears
              transform: shortlistVisible ? 'none' : 'translateY(8px)',
              opacity: shortlistVisible ? 1 : 0,
              transitionDelay: shortlistVisible ? `${i * 90}ms` : '0ms',
            }}>
              <span className="rl-serif" style={{ fontSize: 'clamp(11px, 3vw, 14px)', color: C.inkMute, width: 14, flexShrink: 0 }}>{i + 1}</span>
              <HeroAvatar a={a} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={nameStyle}>
                  {a.name}
                  {top && <span style={{ color: C.red, fontWeight: 600 }}> · Top pick</span>}
                </div>
                <div style={roleStyle}>{a.role} · {a.income}</div>
              </div>
              <span style={scorePill(top)}>{a.score.toFixed(1)}</span>
            </div>
          );
        })}
        {/* Send-to-landlord bar — sits directly under the 5 ranked rows (no dead gap above). */}
        <div style={{
          background: C.ink, color: C.paper, borderRadius: R.ctrl,
          padding: 'clamp(7px, 2%, 10px) clamp(10px, 2.6%, 14px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 'clamp(9px, 2.4vw, 11px)', color: C.inkInverse, fontWeight: 500 }}>Co-branded report</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'clamp(10px, 2.6vw, 12px)', fontWeight: 700, color: C.paper }}>
            Send to landlord <Icon name="arrow" size={14} color={C.paper} />
          </span>
        </div>
      </div>
    </>
  );
}
