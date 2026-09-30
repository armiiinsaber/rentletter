// components/UprightOverlay.js
// The installed realtor app is portrait only. Android honours "orientation" in the manifest
// (public/manifest.webmanifest); iOS does not, so when a phone running the app from the Home Screen
// turns landscape (a landscape viewport no taller than 500px), this paper cover sits over the page:
// the small mark and one line, centred, no motion, no buttons. It is CSS alone, so it shows and goes
// the moment the phone turns, and the page underneath is never unmounted, reloaded or scrolled.
// Standalone is the display-mode media query, or the rl-standalone class set from navigator.standalone
// (lib/standalone.js) for an iOS that does not match the query. Rendered by components/AppHead.js, so
// it is on every page a realtor can add and never on a tenant, landlord or admin page. In Safari (not
// standalone) it never shows, on any page.
import { useEffect } from 'react';
import { C, FONT } from './theme';
import { isStandalone } from '../lib/standalone';

export const UPRIGHT_MEDIA = '(orientation: landscape) and (max-height: 500px)';

export default function UprightOverlay() {
  useEffect(() => { document.documentElement.classList.toggle('rl-standalone', isStandalone()); }, []);
  return (
    <div className="rl-upright" data-upright="">
      <img className="rl-upright-mark" src="/icons/mark.svg" width="48" height="48" alt="" />
      <p className="rl-upright-line">Turn your phone upright.</p>
      <style jsx global>{`
        .rl-upright {
          display: none; position: fixed; inset: 0; z-index: 2147483000;
          flex-direction: column; align-items: center; justify-content: center; gap: 16px;
          padding: 16px; background: ${C.paper}; color: ${C.ink}; text-align: center;
          touch-action: none; overscroll-behavior: contain; transition: none; animation: none;
        }
        .rl-upright-mark { display: block; width: 48px; height: 48px; border-radius: 11px; }
        .rl-upright-line { margin: 0; font-family: ${FONT.sans}; font-size: 17px; font-weight: 600; line-height: 1.3; color: ${C.ink}; }
        @media (display-mode: standalone) and ${UPRIGHT_MEDIA} { .rl-upright { display: flex; } }
        @media ${UPRIGHT_MEDIA} { html.rl-standalone .rl-upright { display: flex; } }
      `}</style>
    </div>
  );
}
