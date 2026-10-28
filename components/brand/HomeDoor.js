// components/brand/HomeDoor.js
// The homepage header's wordmark (pages/index.js): the static logo's own box, size and colours
// (components/ui.js Wordmark), drawn by components/brand/DoorMark.js. Its door swings once, open
// and shut, DOOR.homeDelayMs after the page has loaded, then rests. Once a visit: the swing marks
// the tab's session, so a reload or a return to the homepage keeps it still. It never listens to
// scroll. Under reduced motion it breathes once instead. Before JavaScript, and before and after
// the swing, it is the logo at rest, the door pixel for pixel the static bar.
import { useEffect, useState } from 'react';
import DoorMark from './DoorMark';
import { DOOR } from '../../lib/motion';

export const HOME_DOOR_KEY = 'rl-home-door';
export const HOME_DOOR_CAP = 16; // components/ui.js WORDMARK_CAP.header
const ONCE = Object.freeze({ ...DOOR.defaults, play: 'once' });

export default function HomeDoor() {
  const [swing, setSwing] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = window.sessionStorage.getItem(HOME_DOOR_KEY) === '1'; } catch (e) { seen = false; }
    if (seen) return undefined;
    let timer = 0;
    // Counted from the page's load event (the navigation timing), so a page that comes alive late
    // swings no later than it must; one that is alive before the load waits for it.
    const start = () => {
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      const loadedAt = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : performance.now();
      timer = window.setTimeout(() => {
        try { window.sessionStorage.setItem(HOME_DOOR_KEY, '1'); } catch (e) { /* without storage it still swings once on this load */ }
        setSwing(true);
      }, Math.max(0, DOOR.homeDelayMs - (performance.now() - loadedAt)));
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
    return () => { window.removeEventListener('load', start); window.clearTimeout(timer); };
  }, []);
  return <DoorMark kind="logo" size={HOME_DOOR_CAP} settings={ONCE} paused={!swing} />;
}
