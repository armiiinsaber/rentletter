// components/dashboard/InstallHint.js
// The one hint that the realtor app installs: on the dashboard only (components/dashboard/
// HomeView.js), in iOS Safari only, never in the installed app, never on a tenant or landlord page,
// until it is dismissed once on this device (localStorage). It renders nothing on the server and
// decides after mount, so no page ships it to a browser that should not see it. No motion.
import { useEffect, useState } from 'react';
import { C } from '../theme';

import { INSTALL_HINT_KEY, INSTALL_HINT_COPY, showInstallHint } from '../../lib/installHint';

export default function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(INSTALL_HINT_KEY) === '1'; } catch (e) { dismissed = false; }
    const displayStandalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
    setShow(showInstallHint({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0, standalone: navigator.standalone === true, displayStandalone, dismissed }));
  }, []);
  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(INSTALL_HINT_KEY, '1'); } catch (e) { /* private mode: hidden for this visit */ } setShow(false); };
  return (
    <section className="rl-card" aria-labelledby="rl-install-h" data-install-hint style={{ marginTop: 'var(--s-3)', padding: 'var(--card-pad)' }}>
      {/* The mark and the title share a row; the instruction and Dismiss run the card's full width. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <img src="/icons/apple-touch-icon.png" alt="" width={44} height={44} style={{ flexShrink: 0, borderRadius: 10, display: 'block' }} />
        <h2 id="rl-install-h" style={{ margin: 0, minWidth: 0, fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, lineHeight: 'var(--lh-body)', textWrap: 'balance' }}>{INSTALL_HINT_COPY.title}</h2>
      </div>
      <p style={{ margin: 'var(--gap-line) 0 0', fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', textWrap: 'balance' }}>{INSTALL_HINT_COPY.body}</p>
      <button type="button" onClick={dismiss} style={{ marginTop: 'var(--s-3)', minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer' }}>{INSTALL_HINT_COPY.dismiss}</button>
    </section>
  );
}
