// components/ThemeChoice.js
// Appearance: Automatic, Light or Dark (components/themeMode.js). Automatic, the default, follows
// the device. The choice applies at once and is kept on this device only, never in the profile.
// Shown on the realtor's Profile (components/dashboard/ProfileView.js, a card between Invite a
// realtor and Sign out) and on the tenant's profile (pages/my-application.js, in Contact, after
// the sign in email), in each page's own card. One row of three buttons, the chosen one filled ink,
// 44px tall; on the server and the first render nothing is marked until the device's choice is read.
import { useEffect, useState } from 'react';
import { C } from './theme';
import { useTheme } from './themeMode';

export const THEME_LINE = 'Automatic follows your device. The choice is kept on this device only.';
const OPTIONS = [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']];

export default function ThemeChoice({ variant = 'realtor' }) {
  const { pref, setPref } = useTheme();
  // Marked once mounted, so the server's markup never claims a choice the device has not made.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const tenant = variant === 'tenant';
  return (
    <section className={tenant ? 'rl-card mp-card tc' : 'rl-card tc tc-realtor'} aria-labelledby={`tc-h-${variant}`} data-theme-choice={variant}>
      <h2 id={`tc-h-${variant}`} className={tenant ? 'mp-h2' : 'tc-h'}>Appearance</h2>
      <p className={tenant ? 'mp-p tc-line' : 'tc-line'}>{THEME_LINE}</p>
      <div className="tc-seg" role="group" aria-label="Appearance">
        {OPTIONS.map(([key, label]) => (
          <button key={key} type="button" data-theme-pick={key} aria-pressed={ready ? pref === key : undefined} onClick={() => setPref(key)}>{label}</button>
        ))}
      </div>
      <style jsx>{`
        .tc-realtor { margin-top: var(--gap-card); padding: var(--card-pad); }
        .tc-h { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0 0 var(--gap-line); }
        .tc-line { margin: var(--gap-line) 0 0; font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; text-wrap: balance; }
        .tc-realtor .tc-line { margin-top: 0; }
        .tc-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; max-width: 360px; margin-top: var(--gap-card); padding: 2px; border-radius: var(--btn-radius); border: 1px solid ${C.ruleDark}; background: ${C.card}; }
        .tc-seg button { min-width: 0; min-height: 44px; padding: 0 var(--s-2); border-radius: var(--btn-radius); font-family: inherit; font-size: var(--t-body-2); font-weight: 600; color: ${C.inkSoft}; background: transparent; border: none; cursor: pointer; white-space: nowrap; }
        .tc-seg button[aria-pressed='true'] { background: ${C.inkFill}; color: ${C.onInk}; font-weight: 700; }
        .tc-seg button:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.ink}; }
      `}</style>
    </section>
  );
}
