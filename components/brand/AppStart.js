// components/brand/AppStart.js
// App start in the installed app. After iOS's still launch image (paper with the logo centred at
// half the screen's width, lib/brand/splash.js), the page's first paint shows the same logo in the
// same place on the same ground, and its door turns, looping, while the page finishes loading:
// from first paint by DOOR_PLAYER, then by DoorMark's clock in the same cycle. The moment the first
// screen is ready (nothing on the page marked busy: no skeleton, no aria-busy, no Loader) it fades
// out over DOOR.appStart.fadeMs; ready before the first swing completes, it goes at once with no
// fade, so it never adds time. It never takes a tap (pointer-events none) and shows once a session.
//   realtor app (components/AppHead.js): paper, the logo in its own colours.
//   admin app (components/admin/AdminShell.js): ink, the logo in the admin colours. It has no
//   launch image, so the logo sits in the middle of the window.
// Only in the installed app: APP_START_HEAD, run in the document head before anything paints
// (pages/_document.js), switches it on when the page runs standalone and the session has not
// started the app yet; anywhere else the overlay is never displayed. Without its script it lifts
// by itself after DOOR.appStart.fallbackMs. Under reduced motion the door breathes (DoorMark) and
// the overlay goes without a fade.
import { useEffect, useState } from 'react';
import DoorMark, { DOOR_PLAYER } from './DoorMark';
import { C } from '../theme';
import { DOOR, CURVE, REDUCED_QUERY } from '../../lib/motion';
import { LOGO } from '../../lib/brand/logoPaths';

export const APP_START_KEY = 'rl-app-started';
export const APP_START_ON = 'rl-appstart-on';
// What marks a screen as still loading: the skeletons, anything aria-busy, a Loader.
export const APP_START_BUSY = '[aria-busy="true"], [data-skeleton-route], [data-skeleton], [data-loader]';
const LOOP = Object.freeze({ ...DOOR.defaults, play: 'loop' });

// The head script. Standalone (iOS sets navigator.standalone; elsewhere the display mode) and not
// yet started this session: the class goes on the root, and --rl-appstart-y places the logo where
// the launch image had it (the screen's middle, seen from a window that starts under the status
// bar), or in the window's middle when the window is not the whole screen.
export const APP_START_HEAD = `(function(){try{var n=window.navigator,s=n.standalone===true||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);if(!s||window.sessionStorage.getItem('${APP_START_KEY}')==='1')return;var d=document.documentElement,h=window.innerHeight,S=window.screen&&window.screen.height;d.classList.add('${APP_START_ON}');if(S&&S>=h&&S-h<120)d.style.setProperty('--rl-appstart-y',(h-S/2)+'px');}catch(e){}})();`;

const css = (ground) => `
.rl-appstart { display: none; }
html.${APP_START_ON} .rl-appstart { display: block; position: fixed; inset: 0; z-index: 2147483000; background: ${ground}; pointer-events: none;
  animation: rl-appstart-lift ${DOOR.appStart.fadeMs}ms ${CURVE.settle} ${DOOR.appStart.fallbackMs}ms both; }
html.${APP_START_ON} .rl-appstart[data-phase="out"] { opacity: 0; transition: opacity ${DOOR.appStart.fadeMs}ms ${CURVE.settle}; }
.rl-appstart-mark { position: absolute; left: 25%; width: 50%; top: calc(var(--rl-appstart-y, 50%) - 25vw * ${(LOGO.h / LOGO.w).toFixed(5)}); }
.rl-appstart-mark svg { width: 100% !important; height: auto !important; }
@keyframes rl-appstart-lift { from { opacity: 1; } to { opacity: 0; } }
@media ${REDUCED_QUERY} { html.${APP_START_ON} .rl-appstart { animation-duration: 1ms; } html.${APP_START_ON} .rl-appstart[data-phase="out"] { transition: none; } }
`;

export default function AppStart({ tone = 'paper' }) {
  const [phase, setPhase] = useState('on'); // on | out | gone
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains(APP_START_ON)) { setPhase('gone'); return undefined; }
    const svg = document.querySelector('[data-app-start] svg');
    const t0 = svg && typeof svg.__rlDoorT0 === 'number' ? svg.__rlDoorT0 : performance.now();
    let watch = null; let timer = 0;
    const lift = () => { root.classList.remove(APP_START_ON); setPhase('gone'); };
    const finish = () => {
      try { window.sessionStorage.setItem(APP_START_KEY, '1'); } catch (e) { /* it shows again on the next load */ }
      const quick = performance.now() - t0 < DOOR.defaults.swingMs;
      if (quick || window.matchMedia(REDUCED_QUERY).matches) { lift(); return; }
      setPhase('out'); timer = window.setTimeout(lift, DOOR.appStart.fadeMs);
    };
    const ready = () => ![...document.querySelectorAll(APP_START_BUSY)].some((el) => !el.closest('[data-app-start]'));
    if (ready()) finish();
    else {
      watch = new MutationObserver(() => { if (ready()) { watch.disconnect(); watch = null; finish(); } });
      watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'data-skeleton-route', 'data-skeleton', 'data-loader'] });
    }
    return () => { watch?.disconnect(); window.clearTimeout(timer); };
  }, []);
  if (phase === 'gone') return null;
  return (
    <div className="rl-appstart" data-app-start={tone} data-phase={phase} role="status" aria-label="Opening Rentletter">
      <style dangerouslySetInnerHTML={{ __html: css(tone === 'ink' ? C.inst : C.paper) }} />
      <div className="rl-appstart-mark"><DoorMark kind={tone === 'ink' ? 'logoInk' : 'logo'} size={100} settings={LOOP} label={null} prehydrate /></div>
      <script dangerouslySetInnerHTML={{ __html: DOOR_PLAYER }} />
    </div>
  );
}
