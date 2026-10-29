// components/brand/Loader.js
// The loading icon: the door mark alone (the bar and the R, no wordmark), looping on the
// production values (lib/motion.js DOOR), drawn by components/brand/DoorMark.js. It stands
// wherever the product waits: a pending control, an area waiting on data, a whole screen. Never
// smaller than LOADER_MIN. Under reduced motion it holds still and breathes, with no knob (DoorMark).
//   Loader   role status, named for what is loading (label), with the same words inside for screen
//            readers that read a live region's text. tone: 'paper' on paper and white (the
//            wordmark's colours: red door, ink R, ink knob); 'ink' on ink surfaces (the admin
//            colours: red door, paper R, ink knob); 'red' on a red pill (the realtor icon's
//            colours: ink door, white R, red knob). The ground is the surface it sits on.
//   Pending  a pending button's content: the resting label stays in place, unseen, so the button
//            keeps exactly its resting size and screen readers still have its name; the door sits
//            in the middle of the pill at LOADER_MIN while busy.
//   ScreenLoader  a screen, or an area, waiting on its data: paper, the door in the middle of the
//            window below what sits above it (the header stays where it is) and above the bottom
//            safe area. It shows only when the wait has run DOOR.loaderDelayMs since the navigation
//            began (navStartedAt below); before that the area is plain paper.
//   Reveal   one screen, shown in one step: until ready, the ScreenLoader (or what failed shows in
//            its place); once ready, the whole screen at once, its content fading in over
//            DOOR.revealMs if the Loader was on view, a crossfade with it under reduced motion. A
//            screen ready before the Loader showed appears directly. Nothing in it appears on its
//            own: the screen's parts wait for the same ready.
// Every door on view counts its cycle from one moment (doorEpoch), so a door that takes over from
// another, in the same place or the next screen, carries on the same swing.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DoorMark from './DoorMark';
import { DOOR, CURVE, REDUCED_QUERY } from '../../lib/motion';

export const LOADER_MIN = 28;
export const SCREEN_LOADER = 44;
const KIND = { paper: 'paper', ink: 'ink', red: 'red' };
const LOOP = Object.freeze({ ...DOOR.defaults, play: 'loop' });
const UNSEEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 };
const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// When the current navigation began (performance.now), 0 for the document's own load. The frame
// marks each realtor navigation (components/nav/RouteFrame.js); a screen waiting on its data shows
// the Loader only once the wait has run DOOR.loaderDelayMs from here.
let navAt = 0;
export const markNavStart = () => { navAt = typeof performance !== 'undefined' ? performance.now() : 0; };
export const navStartedAt = () => navAt;

// ── One swing for every door on view ─────────────────────────────────────────────────────────
// The chain: the moment the doors on view count from. A door that starts while another is on view,
// or within CHAIN_GAP of the last one leaving, carries on that swing; otherwise a new one begins.
const CHAIN_GAP = 400;
const chain = { epoch: null, live: 0, endedAt: -Infinity };
export function doorEpoch() {
  const now = performance.now();
  if (chain.epoch === null || (chain.live === 0 && now - chain.endedAt > CHAIN_GAP)) chain.epoch = now;
  return chain.epoch;
}
// A door that is already turning (the opening screen's, components/brand/AppStart.js) sets the swing.
export const seedDoorEpoch = (t) => { if (chain.live === 0) { chain.epoch = t; chain.endedAt = performance.now(); } };
export function useDoorChain(on = true) {
  useEffect(() => {
    if (!on) return undefined;
    chain.live += 1;
    return () => { chain.live -= 1; chain.endedAt = performance.now(); };
  }, [on]);
}

export default function Loader({ label, tone = 'paper', size = LOADER_MIN, style, leaving = false }) {
  const px = Math.max(LOADER_MIN, size);
  useDoorChain();
  const named = leaving ? { 'aria-hidden': 'true', 'data-leaving': '' } : { role: 'status', 'aria-label': label };
  return (
    <span {...named} data-loader={tone} style={{ position: 'relative', display: 'inline-flex', width: px, height: px, flexShrink: 0, ...style }}>
      <DoorMark kind={KIND[tone] || 'paper'} size={px} ground={false} label={null} settings={LOOP} epoch={doorEpoch} />
      {leaving ? null : <span style={UNSEEN}>{label}</span>}
    </span>
  );
}

export function Pending({ busy, label, tone = 'paper', children }) {
  return (
    <span data-pending={busy ? 'busy' : 'rest'} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'inherit', maxWidth: '100%' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'inherit', minWidth: 0, opacity: busy ? 0 : 1 }}>{children}</span>
      {busy ? <Loader label={label} tone={tone} style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -LOADER_MIN / 2, marginTop: -LOADER_MIN / 2 }} /> : null}
    </span>
  );
}

// ── A screen waiting on its data ─────────────────────────────────────────────────────────────
const waited = (since) => since === 0 || (typeof performance !== 'undefined' && performance.now() - since >= DOOR.loaderDelayMs);
export function ScreenLoader({ label, since = navStartedAt(), onShow, tone = 'paper', fill = true }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => waited(since));
  const [top, setTop] = useState(null);
  useIso(() => { if (fill && ref.current) setTop(ref.current.getBoundingClientRect().top + window.scrollY); }, [fill]);
  useEffect(() => {
    if (shown) { onShow?.(ref.current); return undefined; }
    const t = setTimeout(() => setShown(true), Math.max(0, DOOR.loaderDelayMs - (performance.now() - since)));
    return () => clearTimeout(t);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const height = !fill ? undefined : top === null ? '70vh' : `calc(100dvh - ${Math.round(top)}px - env(safe-area-inset-bottom, 0px))`;
  return (
    <div ref={ref} data-screen-loading={label} style={{ minHeight: height, padding: fill ? undefined : 'var(--s-6) 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {shown ? <Loader label={label} tone={tone} size={SCREEN_LOADER} /> : null}
    </div>
  );
}

// ── One reveal per screen ───────────────────────────────────────────────────────────────────
export function Reveal({ ready, failed = null, label, tone = 'paper', fill = true, children }) {
  const was = useRef(null); // the Loader's place on screen, once it showed
  const content = useRef(null);
  const [leaving, setLeaving] = useState(null);
  useIso(() => {
    if (!ready || !was.current || !content.current) return undefined;
    const rect = was.current; was.current = null;
    content.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DOOR.revealMs, easing: CURVE.settle });
    if (!window.matchMedia(REDUCED_QUERY).matches) return undefined;
    setLeaving(rect);
    const t = setTimeout(() => setLeaving(null), DOOR.revealMs);
    return () => clearTimeout(t);
  }, [ready]);
  if (!ready) return failed || <ScreenLoader label={label} tone={tone} fill={fill} onShow={(el) => { if (el) { const r = el.getBoundingClientRect(); was.current = { left: r.left, top: r.top, width: r.width, height: r.height }; } }} />;
  return (
    <>
      {leaving ? <Leaving rect={leaving} tone={tone} /> : null}
      <div data-screen-content="" ref={content}>{children}</div>
    </>
  );
}
// Under reduced motion the Loader fades out where it was while the screen fades in.
function Leaving({ rect, tone }) {
  const ref = useRef(null);
  useIso(() => { ref.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DOOR.revealMs, easing: CURVE.settle, fill: 'forwards' }); }, []);
  return (
    <div ref={ref} aria-hidden="true" style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: Math.min(rect.height, window.innerHeight - rect.top), display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
      <Loader label="" tone={tone} size={SCREEN_LOADER} leaving />
    </div>
  );
}
