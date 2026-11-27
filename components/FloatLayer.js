// components/FloatLayer.js
// What floats fixed to the screen (the phone's tab bar, components/dashboard/MainNav.js; the
// toasts on a listing and on the tenant's pages) is drawn on the body, outside the Next root.
// The Next root is the page itself, and it moves: behind a sheet it scales back
// (components/Sheet.js SHEET_PAGE_CSS), going into a listing and back it slides
// (lib/motion.js slideIn), and under a swipe from the left edge it follows the finger
// (components/nav/EdgeBack.js). A transform, a scale, a filter, will-change, contain or a view
// transition name on any box around a fixed element makes that box its containing block in place
// of the screen. The element then sits at the bottom of the page, not of the screen. The
// installed app on an iPhone did not recover when that box let go: the tab bar then scrolled with
// the page and sat in the middle of the screen. On the body, the only boxes around it are body and
// html, and nothing ever sets one of those on either (tests/floatingSurfaces.test.mjs).
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

// Whether the surface is on the body (true) or still in place (false).
export function useFloating() {
  const inPlace = useContext(FloatInPlace);
  const [host, setHost] = useState(() => (!inPlace && hydrated && typeof document !== 'undefined' ? document.body : null));
  useIsoLayoutEffect(() => {
    hydrated = true;
    setHost(inPlace ? null : document.body);
  }, [inPlace]);
  return host;
}

export default function FloatLayer({ children }) {
  const host = useFloating();
  return host ? createPortal(children, host) : children;
}
