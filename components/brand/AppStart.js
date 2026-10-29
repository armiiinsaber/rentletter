// components/brand/AppStart.js
// App start in the installed app. After iOS's still launch image (paper with the logo centred at
// half the screen's width, lib/brand/splash.js), the page's first paint shows the same logo in the
// same place on the same ground, and its door turns, looping, while the page finishes loading:
// from first paint by DOOR_PLAYER, then by DoorMark's clock in the same cycle. The moment the first
// screen is ready (nothing on the page waiting: no route or screen Loader, nothing aria-busy) it fades
// out over DOOR.appStart.fadeMs; ready before the first swing completes, it goes at once with no
// fade, so it never adds time. It never takes a tap (pointer-events none) and shows once a session.
// It lives in components/nav/RouteFrame.js, above every page but the tenant and landlord ones, so
// it outlives a navigation:
//   realtor app: paper, the logo in its own colours.
//   admin app (/admin): ink, the logo in the admin colours. It has no launch image, so the logo
//   sits in the middle of the window.
// The door counts from the moment the first door on view began (components/brand/Loader.js
// doorEpoch): a pending button's door carries on into it, and it into the next screen's.
// Only in the installed app: APP_START_HEAD, run in the document head before anything paints
// (pages/_document.js), switches it on when the page runs standalone and the session has not
// started the app yet; anywhere else the overlay is never displayed. Without its script it lifts
// by itself after DOOR.appStart.fallbackMs. Under reduced motion the door breathes (DoorMark) and
// the overlay goes without a fade.
import { useEffect, useState } from 'react';
import Router from 'next/router';
import DoorMark, { DOOR_PLAYER } from './DoorMark';
import { doorEpoch, seedDoorEpoch, useDoorChain } from './Loader';
import { C } from '../theme';
import { DOOR, CURVE, REDUCED_QUERY } from '../../lib/motion';
import { LOGO } from '../../lib/brand/logoPaths';

export const APP_START_KEY = 'rl-app-started';
export const APP_START_ON = 'rl-appstart-on';
// What marks a screen as still waiting: a route or screen Loader, anything aria-busy, a Loader
// (but one on its way out).
export const APP_START_BUSY = '[aria-busy="true"], [data-route-loading], [data-screen-loading], [data-loader]:not([data-leaving])';
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
.rl-appstart-mark { position: absolute; left: 0; right: 0; margin: 0 auto; width: min(50%, 320px); top: calc(var(--rl-appstart-y, 50%) - min(25vw, 160px) * ${(LOGO.h / LOGO.w).toFixed(5)}); }
.rl-appstart-mark svg { width: 100% !important; height: auto !important; }
@keyframes rl-appstart-lift { from { opacity: 1; } to { opacity: 0; } }
@media ${REDUCED_QUERY} { html.${APP_START_ON} .rl-appstart { animation-duration: 1ms; } html.${APP_START_ON} .rl-appstart[data-phase="out"] { transition: none; } }
`;

// After sign in (pages/signin.js): the opening screen comes up over the page and stays, the same
// door turning, until the screen the realtor is going to is ready (its route has landed and nothing
// on it waits), then lifts as at app start. RouteFrame keeps it mounted across the navigation, so
// there is one door from the tap to the finished dashboard.
const HOLD = 'rl:opening';
export const holdOpening = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(HOLD)); };

export default function AppStart({ tone = 'paper' }) {
  const [phase, setPhase] = useState('on'); // on | out | gone
  useDoorChain(phase !== 'gone');
  useEffect(() => {
    const root = document.documentElement;
    let watch = null; let timer = 0; let frame = 0; let t0 = 0; let routed = null;
    const lift = () => { root.classList.remove(APP_START_ON); setPhase('gone'); };
    const finish = () => {
      try { window.sessionStorage.setItem(APP_START_KEY, '1'); } catch (e) { /* it shows again on the next load */ }
      const quick = performance.now() - t0 < DOOR.defaults.swingMs;
      if (quick || window.matchMedia(REDUCED_QUERY).matches) { lift(); return; }
      setPhase('out'); timer = window.setTimeout(lift, DOOR.appStart.fadeMs);
    };
    const ready = () => ![...document.querySelectorAll(APP_START_BUSY)].some((el) => !el.closest('[data-app-start]'));
    const watchReady = () => {
      watch?.disconnect(); watch = null;
      if (ready()) { finish(); return; }
      watch = new MutationObserver(() => { if (ready()) { watch.disconnect(); watch = null; finish(); } });
      watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'data-route-loading', 'data-screen-loading', 'data-loader'] });
    };
    // Held after sign in: up at once, the door carrying on the button's swing, until the next
    // screen's route has landed and it has nothing left to wait on.
    const hold = () => {
      window.clearTimeout(timer); watch?.disconnect(); watch = null;
      root.classList.add(APP_START_ON); setPhase('on'); t0 = performance.now();
      const landed = () => { Router.events.off('routeChangeComplete', landed); Router.events.off('routeChangeError', landed); routed = null; frame = requestAnimationFrame(watchReady); };
      routed = landed;
      Router.events.on('routeChangeComplete', landed); Router.events.on('routeChangeError', landed);
    };
    window.addEventListener(HOLD, hold);
    if (!root.classList.contains(APP_START_ON)) setPhase('gone');
    else {
      const svg = document.querySelector('[data-app-start] svg');
      t0 = svg && typeof svg.__rlDoorT0 === 'number' ? svg.__rlDoorT0 : performance.now();
      seedDoorEpoch(t0);
      watchReady();
    }
    return () => {
      window.removeEventListener(HOLD, hold); watch?.disconnect(); window.clearTimeout(timer); cancelAnimationFrame(frame);
      if (routed) { Router.events.off('routeChangeComplete', routed); Router.events.off('routeChangeError', routed); }
    };
  }, []);
  if (phase === 'gone') return null;
  return (
    <div className="rl-appstart" data-app-start={tone} data-phase={phase} role="status" aria-label="Opening Rentletter">
      <style dangerouslySetInnerHTML={{ __html: css(tone === 'ink' ? C.inst : C.paper) }} />
      <div className="rl-appstart-mark"><DoorMark kind={tone === 'ink' ? 'logoInk' : 'logo'} size={100} settings={LOOP} label={null} prehydrate epoch={doorEpoch} /></div>
      <script dangerouslySetInnerHTML={{ __html: DOOR_PLAYER }} />
    </div>
  );
}
