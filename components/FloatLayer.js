// components/FloatLayer.js
// What floats fixed to the screen (the phone's tab bar and the fade behind it, components/dashboard/
// MainNav.js; the phone's top bar, components/dashboard/DashboardHeader.js; the toasts on a listing
// and on the tenant's pages) is drawn on the body, outside the Next root.
// The Next root is the page itself, and it moves: behind a sheet it scales back
// (components/Sheet.js SHEET_PAGE_CSS), going into a listing and back it slides
// (lib/motion.js slideIn), and under a swipe from the left edge it follows the finger
// (components/nav/EdgeBack.js). A transform, a scale, a filter, will-change, contain or a view
// transition name on any box around a fixed element makes that box its containing block in place
// of the screen. The element then sits at the bottom of the page, not of the screen. The
// installed app on an iPhone did not recover when that box let go: the tab bar then scrolled with
// the page and sat in the middle of the screen. On the body, the only boxes around it are body and
// html, and nothing ever sets one of those on either (tests/floatingSurfaces.test.mjs).
// Where on the body: on the body itself, after the page (the default: the toasts); for the phone's
// top bar, in a box of its own at the start of the body, before the Next root (where: 'start'), so
// it comes first in the reading order, before the page, as it did in place; for the tab bar and its
// fade, in a box of its own at the end of the body (where: 'end').
// Each box carries one style, overflow-y auto, and is never a containing block. It has no size
// and scrolls nothing: what it holds is fixed to the screen, so the box neither places it nor clips
// it. The overflow makes it a scroller of its own for the 44px hit areas (lib/motion.js
// applyHitAreas plans each scroller's targets apart): a bar fixed over the page is then never
// weighed against the page's own targets, which pass under it as the page scrolls. The page itself
// has no scroll box (components/dashboard/DashShell.js), so without it a field under the tab bar at
// the moment of planning lost its room.
// A surface that floats only at some widths names them (media): at other widths it stays in place.
// The server's HTML and the first render keep the surface where the component is, so hydration
// finds what the server drew and the first paint is unchanged. The move to the body happens
// before the browser paints (a layout effect), and every later mount goes to the body at once.
// Inside the screen drawn beneath an edge swipe (components/nav/RouteFrame.js) a surface stays in
// place (FloatInPlace), so it slides and dims with that screen's picture, under the page.
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const FloatInPlace = createContext(false);
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
// Set once the first page has hydrated: from then on a surface mounts on the body at once.
let hydrated = false;

// The boxes at the start and at the end of the body, each made once and kept.
export const FLOAT_HOST = 'data-float-host';
const boxes = {};
function hostOf(where) {
  if (where !== 'start' && where !== 'end') return document.body;
  let box = boxes[where];
  if (!box || !box.isConnected) {
    box = document.querySelector(`[${FLOAT_HOST}="${where}"]`) || document.createElement('div');
    box.setAttribute(FLOAT_HOST, where);
    box.style.overflowY = 'auto';
    const root = document.getElementById('__next');
    if (where === 'start') { if (root && root.parentNode === document.body) document.body.insertBefore(box, root); else if (box.parentNode !== document.body) document.body.prepend(box); }
    else if (box.parentNode !== document.body) document.body.appendChild(box);
    boxes[where] = box;
  }
  return box;
}
const fits = (media) => !media || (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(media).matches);

// Where the surface is drawn: its host on the body, or null while it is in place.
export function useFloating({ media = null, where = 'body' } = {}) {
  const inPlace = useContext(FloatInPlace);
  const [host, setHost] = useState(() => (!inPlace && hydrated && typeof document !== 'undefined' && fits(media) ? hostOf(where) : null));
  useIsoLayoutEffect(() => {
    hydrated = true;
    if (inPlace) { setHost(null); return undefined; }
    if (!media || typeof window.matchMedia !== 'function') { setHost(hostOf(where)); return undefined; }
    const mq = window.matchMedia(media);
    const pick = () => setHost(mq.matches ? hostOf(where) : null);
    pick();
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, [inPlace, media, where]);
  return host;
}

export default function FloatLayer({ children }) {
  const host = useFloating();
  return host ? createPortal(children, host) : children;
}
