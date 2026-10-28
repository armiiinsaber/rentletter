// components/brand/DoorMark.js
// The door mark: the bar beside the R is a door seen from the side. It swings on a hinge on the
// bar's edge nearest the R, so the panel widens away from the R and never crosses into it.
// Drawn from the official vector source (lib/brand/logoPaths.js): the R and the letters come from
// the paths, the door from the bar's box (components/brand/doorGeometry.js).
//
// One shape: the door is one SVG path, the projection of one flat rectangle turning about its
// hinge edge, recomputed every frame, with one fill and a knob projected with it. No CSS 3D, no
// second face, no stacked layers, so on every engine it reads as one object turning in space. The
// same SVG serves the page, email and GIF export.
// At rest the path is the static logo's straight bar exactly (the same box, the same rounded
// corners); the taper and the tilt grow in only while it swings (components/brand/doorGeometry.js).
// One clock: a single requestAnimationFrame loop drives every mark on the page; each frame is one
// eased angle on one curve (lib/motion.js DOOR). Under reduced motion the door does not turn: it
// holds still, the knob is hidden, and its opacity breathes between DOOR.breath and 1 (CSS).
// The resting pose is the server rendered markup, so the mark reads without JavaScript.
// still: a moment of the cycle in ms, drawn once with no clock and no style, so the brand kit
// (scripts/brand/motion.mjs) records its frames from this component on the server.
// prehydrate: the server also writes one swing's frames (this component's own doorFrame, 30 a
// second) into data-door-frames, and DOOR_PLAYER, an inline script placed right after the mark,
// steps through them from first paint until React takes over in step (components/brand/
// AppStart.js), so the door turns while the page is still loading its code.
import { useEffect, useId, useRef, useState } from 'react';
import { DOOR, REDUCED_QUERY } from '../../lib/motion';
import { DOOR_GROUNDS, doorGeometry, doorFrame, doorFill, breathCss, travelAt, cycleTime, doorTimeline, bezier, hash, r3 } from './doorGeometry';

// ── the clock ───────────────────────────────────────────────────────────────────────────────────
// One loop for every mark. frozen: a time the tests set (window.__rlDoor.at), at which every mark
// draws that moment of its cycle and the loop stops until released.
const clock = { subs: new Set(), raf: 0, frozen: null };
function tick(now) {
  clock.raf = 0;
  for (const draw of clock.subs) draw(now);
  if (clock.subs.size && clock.frozen === null) clock.raf = requestAnimationFrame(tick);
}
function subscribe(draw) {
  clock.subs.add(draw);
  if (!clock.raf && clock.frozen === null) clock.raf = requestAnimationFrame(tick);
  return () => { clock.subs.delete(draw); if (!clock.subs.size && clock.raf) { cancelAnimationFrame(clock.raf); clock.raf = 0; } };
}
if (typeof window !== 'undefined') {
  window.__rlDoor = {
    at(ms) { clock.frozen = ms; if (clock.raf) { cancelAnimationFrame(clock.raf); clock.raf = 0; } for (const draw of clock.subs) draw(null); },
    release() { clock.frozen = null; if (!clock.raf && clock.subs.size) clock.raf = requestAnimationFrame(tick); },
  };
}

function useReducedMotion(motion) {
  const [system, setSystem] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(REDUCED_QUERY);
    const read = () => setSystem(mq.matches);
    read(); mq.addEventListener?.('change', read);
    return () => mq.removeEventListener?.('change', read);
  }, []);
  return motion === 'reduced' || system;
}

// ── before React ──────────────────────────────────────────────────────────────────────────────
// One swing at 30 frames a second, each [outline, fill, knob or 0], then the cycle's length: what
// DOOR_PLAYER needs to turn the door from first paint. Drawn by doorFrame, the same as the clock.
const PLAYER_STEP = 1000 / 30;
function playerFrames(g, s, bar) {
  const ease = bezier(DOOR.curves[s.easing] || DOOR.curves[DOOR.defaults.easing]); const out = [];
  for (let t = 0; t < s.swingMs; t += PLAYER_STEP) {
    const f = doorFrame(g, s, travelAt(s, t, ease));
    out.push([f.d, doorFill(bar, f.shade), f.knob ? [r3(f.knob.cx), r3(f.knob.cy), r3(f.knob.rx), r3(f.knob.ry)] : 0]);
  }
  return JSON.stringify({ step: r3(PLAYER_STEP), swing: s.swingMs, cycle: doorTimeline(s).cycle, frames: out });
}
// The inline player, placed right after the element that holds a prehydrate mark. It runs only
// while the mark is on screen and motion is allowed, steps through data-door-frames on
// requestAnimationFrame, and stops for good once DoorMark's effect marks the svg live (or the mark
// leaves the page). It records its start on the svg, so the clock continues the same cycle. A
// frame stamped before the player started counts as its start.
export const DOOR_PLAYER = `(function(){var c=document.currentScript,h=c&&c.previousElementSibling,v=h&&h.querySelector('svg[data-door-frames]');if(!v||!window.requestAnimationFrame||!v.getBoundingClientRect().width)return;if(window.matchMedia&&window.matchMedia('${REDUCED_QUERY}').matches)return;var F=JSON.parse(v.getAttribute('data-door-frames')),p=v.querySelector('[data-door-panel]'),k=v.querySelector('[data-door-knob]'),t0=performance.now();v.__rlDoorT0=t0;function f(n){if(v.getAttribute('data-door-live')||!v.isConnected)return;var t=Math.max(0,n-t0)%F.cycle,x=F.frames[t<F.swing?Math.min(F.frames.length-1,Math.floor(t/F.step)):0];p.setAttribute('d',x[0]);p.style.fill=x[1];if(x[2]){k.setAttribute('cx',x[2][0]);k.setAttribute('cy',x[2][1]);k.setAttribute('rx',x[2][2]);k.setAttribute('ry',x[2][3]);k.style.display='';}else{k.style.display='none';}v.setAttribute('data-door-travel',t<F.swing?'1':'0');requestAnimationFrame(f);}requestAnimationFrame(f);})();`;

// kind: wordmark | logo | logoInk | realtor | admin | mark | paper | ink (components/brand/
// doorGeometry.js). size: the cap height (wordmark, logo) or the side (the rest), in px. settings:
// DOOR.defaults' shape. motion: 'auto' or 'reduced'. run: change it to play again. label: the
// accessible name, or null when something around the mark names it (the Loader's status), which
// hides the svg from assistive technology. ground: false leaves the ground out, so the mark sits on
// the surface under it. square: the app icons full bleed. paused: held at rest, no clock. delay:
// the swing (or the breath) starts this many ms after it is unpaused. still: see above.
export default function DoorMark({ kind = 'wordmark', size = 40, settings = DOOR.defaults, motion = 'auto', run = 0, label = 'Rentletter', ground = true, square = false, paused = false, delay = 0, still = null, prehydrate = false }) {
  const cls = `rd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = { ...DOOR.defaults, ...settings };
  const g = doorGeometry(kind, size, s.open, { square });
  const colours = DOOR_GROUNDS[kind] || DOOR_GROUNDS.wordmark;
  const reduced = useReducedMotion(motion);
  const key = [motion, run, paused, delay, s.rest, s.open, s.knob, s.swingMs, s.pauseMs, s.easing, s.play].join('|');
  const name = `${cls}${hash(key)}`;
  const icon = g.radius !== null;
  const isStill = typeof still === 'number';
  const rest = isStill ? doorFrame(g, s, travelAt(s, cycleTime(s, still))) : doorFrame(g, s, 0, { reduced });
  const root = useRef(null); const panel = useRef(null); const knob = useRef(null);
  const live = useRef({ g, s }); live.current = { g, s };

  // Draw one frame into the path and the knob, without a render.
  const paint = (frame) => {
    const el = panel.current; const k = knob.current; if (!el || !k) return;
    el.setAttribute('d', frame.d);
    el.style.fill = doorFill(colours.bar, frame.shade);
    if (frame.knob) { k.setAttribute('cx', r3(frame.knob.cx)); k.setAttribute('cy', r3(frame.knob.cy)); k.setAttribute('rx', r3(frame.knob.rx)); k.setAttribute('ry', r3(frame.knob.ry)); k.style.display = ''; }
    else k.style.display = 'none';
    root.current?.setAttribute('data-door-angle', r3(frame.deg)); root.current?.setAttribute('data-door-travel', r3(frame.travel));
  };

  // The swing, from one shared clock. A new key (new settings, Replay) starts the cycle over; a new
  // size does not, so a mark that settles its size after mounting stays in step with the rest.
  // Before the delay has run (and while paused) the door is at rest; a loop starts its first cycle
  // at the end of the delay.
  const travelFor = (cur, elapsed, ease) => (elapsed < 0 ? 0 : travelAt(cur.s, cycleTime(cur.s, elapsed), ease));
  useEffect(() => {
    if (isStill) return undefined;
    root.current?.setAttribute('data-door-live', '1'); // the inline player (DOOR_PLAYER) stops here
    if (reduced || paused) { paint(doorFrame(live.current.g, live.current.s, 0, { reduced })); return undefined; }
    // A door the inline player started keeps its phase: the clock counts from the player's start.
    const started = root.current && typeof root.current.__rlDoorT0 === 'number' ? root.current.__rlDoorT0 : null;
    const epoch = (started ?? performance.now()) + delay; const ease = bezier(DOOR.curves[s.easing] || DOOR.curves[DOOR.defaults.easing]);
    let unsubscribe = () => {};
    const draw = (now) => {
      const cur = live.current; const elapsed = now === null ? clock.frozen : now - epoch;
      paint(doorFrame(cur.g, cur.s, travelFor(cur, elapsed, ease)));
      if (cur.s.play === 'once' && now !== null && elapsed >= doorTimeline(cur.s).cycle) unsubscribe();
    };
    unsubscribe = subscribe(draw);
    return () => unsubscribe();
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new size while the clock is frozen, or while still: repaint the pose at once.
  useEffect(() => {
    if (isStill) return;
    if (reduced || paused) paint(doorFrame(g, s, 0, { reduced }));
    else if (clock.frozen !== null) paint(doorFrame(g, s, travelAt(s, cycleTime(s, clock.frozen))));
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const named = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' };
  const frames = prehydrate && !isStill && !paused ? playerFrames(g, s, colours.bar) : undefined;
  // The logo kinds take the static Wordmark's own rounding (components/ui.js), so swapping one for
  // the other moves nothing on the page.
  const dim = (v) => (kind === 'logo' || kind === 'logoInk' ? Math.round(v * 10) / 10 : r3(v));
  return (
    <svg ref={root} className={cls} data-door={kind} data-door-angle={r3(rest.deg)} width={dim(g.w * g.k)} height={dim(g.h * g.k)} viewBox={`0 0 ${g.w} ${g.h}`}
      {...named} data-door-frames={frames} focusable="false" style={{ display: 'block', flexShrink: 0, overflow: 'visible', background: icon || !ground || kind !== 'wordmark' ? undefined : colours.ground }}>
      {isStill || paused ? null : <style dangerouslySetInnerHTML={{ __html: breathCss(cls, name, s, motion, delay) }} />}
      {icon && ground ? <rect width={g.w} height={g.h} rx={g.radius || undefined} fill={colours.ground} /> : null}
      <g transform={g.letters || undefined}>
        <path data-door-r="" d={g.rPath} fill={colours.letter} />
        {g.restPath ? <path d={g.restPath} fill={colours.letter} /> : null}
      </g>
      <g data-door-leaf="">
        <path ref={panel} data-door-panel="" d={rest.d} style={{ fill: doorFill(colours.bar, rest.shade) }} />
        <ellipse ref={knob} data-door-knob="" fill={colours.knob} cx={rest.knob ? r3(rest.knob.cx) : 0} cy={rest.knob ? r3(rest.knob.cy) : 0}
          rx={rest.knob ? r3(rest.knob.rx) : 0} ry={rest.knob ? r3(rest.knob.ry) : 0} style={{ display: rest.knob ? undefined : 'none' }} />
      </g>
    </svg>
  );
}
