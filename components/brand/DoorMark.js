// components/brand/DoorMark.js
// The door mark: the bar beside the R is a door seen from the side. It swings on a hinge on the
// bar's edge nearest the R, so the panel widens away from the R and never crosses into it.
// Drawn from the official vector source (lib/brand/logoPaths.js): the R and the letters come from
// the paths, the door from the bar's box (components/brand/doorGeometry.js).
//
// One shape: the door is one SVG polygon, the projection of one flat rectangle turning about its
// hinge edge, recomputed every frame, with one fill and a knob projected with it. No CSS 3D, no
// second face, no stacked layers, so on every engine it reads as one object turning in space. The
// same SVG serves the page, email and GIF export.
// One clock: a single requestAnimationFrame loop drives every mark on the page; each frame is one
// eased angle on one curve (lib/motion.js DOOR). Under reduced motion the door does not turn: it
// holds still, the knob is hidden, and its opacity breathes between DOOR.breath and 1 (CSS).
// The resting pose is the server rendered markup, so the mark reads without JavaScript.
import { useEffect, useId, useRef, useState } from 'react';
import { DOOR, REDUCED_QUERY } from '../../lib/motion';
import { DOOR_GROUNDS, doorGeometry, doorFrame, quadPoints, doorFill, breathCss, travelAt, cycleTime, doorTimeline, bezier, hash, r3 } from './doorGeometry';

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

// kind: wordmark | realtor | admin | paper | ink. size: the cap height (wordmark) or the side (the
// rest), in px. settings: DOOR.defaults' shape. motion: 'auto' or 'reduced'. run: change it to play
// again.
export default function DoorMark({ kind = 'wordmark', size = 40, settings = DOOR.defaults, motion = 'auto', run = 0 }) {
  const cls = `rd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = { ...DOOR.defaults, ...settings };
  const g = doorGeometry(kind, size, s.open);
  const colours = DOOR_GROUNDS[kind] || DOOR_GROUNDS.wordmark;
  const reduced = useReducedMotion(motion);
  const key = [motion, run, s.rest, s.open, s.knob, s.swingMs, s.pauseMs, s.easing, s.play].join('|');
  const name = `${cls}${hash(key)}`;
  const icon = g.radius !== null;
  const rest = doorFrame(g, s, 0, { reduced });
  const root = useRef(null); const panel = useRef(null); const knob = useRef(null);
  const live = useRef({ g, s }); live.current = { g, s };

  // Draw one frame into the polygon and the knob, without a render.
  const paint = (frame) => {
    const el = panel.current; const k = knob.current; if (!el || !k) return;
    el.setAttribute('points', quadPoints(frame.quad));
    el.style.fill = doorFill(colours.bar, frame.shade);
    if (frame.knob) { k.setAttribute('cx', r3(frame.knob.cx)); k.setAttribute('cy', r3(frame.knob.cy)); k.setAttribute('rx', r3(frame.knob.rx)); k.setAttribute('ry', r3(frame.knob.ry)); k.style.display = ''; }
    else k.style.display = 'none';
    root.current?.setAttribute('data-door-angle', r3(frame.deg)); root.current?.setAttribute('data-door-travel', r3(frame.travel));
  };

  // The swing, from one shared clock. A new key (new settings, Replay) starts the cycle over; a new
  // size does not, so a mark that settles its size after mounting stays in step with the rest.
  useEffect(() => {
    if (reduced) { paint(doorFrame(live.current.g, live.current.s, 0, { reduced: true })); return undefined; }
    const epoch = performance.now(); const ease = bezier(DOOR.curves[s.easing] || DOOR.curves[DOOR.defaults.easing]);
    let unsubscribe = () => {};
    const draw = (now) => {
      const cur = live.current; const elapsed = now === null ? clock.frozen : now - epoch;
      paint(doorFrame(cur.g, cur.s, travelAt(cur.s, cycleTime(cur.s, elapsed), ease)));
      if (cur.s.play === 'once' && now !== null && elapsed >= doorTimeline(cur.s).cycle) unsubscribe();
    };
    unsubscribe = subscribe(draw);
    return () => unsubscribe();
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new size while the clock is frozen, or while still: repaint the pose at once.
  useEffect(() => {
    if (reduced) paint(doorFrame(g, s, 0, { reduced: true }));
    else if (clock.frozen !== null) paint(doorFrame(g, s, travelAt(s, cycleTime(s, clock.frozen))));
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg ref={root} className={cls} data-door={kind} data-door-angle={r3(rest.deg)} width={r3(g.w * g.k)} height={r3(g.h * g.k)} viewBox={`0 0 ${g.w} ${g.h}`}
      role="img" aria-label="Rentletter" focusable="false" style={{ display: 'block', flexShrink: 0, overflow: 'visible', background: icon ? undefined : colours.ground }}>
      <style dangerouslySetInnerHTML={{ __html: breathCss(cls, name, s, motion) }} />
      {icon ? <rect width={g.w} height={g.h} rx={g.radius || undefined} fill={colours.ground} /> : null}
      <g transform={g.letters || undefined}>
        <path data-door-r="" d={g.rPath} fill={colours.letter} />
        {g.restPath ? <path d={g.restPath} fill={colours.letter} /> : null}
      </g>
      <g data-door-leaf="">
        <polygon ref={panel} data-door-panel="" points={quadPoints(rest.quad)} style={{ fill: colours.bar }} />
        <ellipse ref={knob} data-door-knob="" fill={colours.knob} cx={rest.knob ? r3(rest.knob.cx) : 0} cy={rest.knob ? r3(rest.knob.cy) : 0}
          rx={rest.knob ? r3(rest.knob.rx) : 0} ry={rest.knob ? r3(rest.knob.ry) : 0} style={{ display: rest.knob ? undefined : 'none' }} />
      </g>
    </svg>
  );
}
