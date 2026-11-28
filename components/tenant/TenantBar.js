// components/tenant/TenantBar.js
// The tenant's top bar, the same on every tenant page that has one (the profile and its sign in,
// an application, the email confirmation, the apply flow, the co applicant and guarantor form,
// the document upload, the referral consent and the short link page): the logo at the left and,
// at the right, Sign out or the page's own short label. It stays at the top while the page
// scrolls: solid at the very top, as it always was, and glass once the page scrolls under it
// (components/ui.js .rl-glass, usePageScrolled). It is exactly as tall as before (69px under the
// safe area), and --rl-tbar-h carries that height to what sticks below it (the phone's strength
// bar and chips, the desktop's section menu and strength panel, components/tenant/ProfileLayout.js),
// so nothing is ever covered. While a sheet pins the page it is held in place (data-stuck,
// components/Sheet.js). Its label is inkSoft: on glass, text is ink or inkSoft only, and a bar
// with a label holds the inkSoft floor of the glass (components/ui.js, GLASS).
import { Wordmark, usePageScrolled } from '../ui';
import { C } from '../theme';

export const TBAR_HEIGHT = 69; // px: 12 above, the 44px row, 12 below, the 1px rule

export default function TenantBar({ children = null, label = null }) {
  usePageScrolled();
  return (
    <header className="rl-tbar rl-glass rl-glass-auto" data-tenant-bar="" data-stuck="">
      <a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark /></a>
      {label ? <span className="rl-tbar-label">{label}</span> : children}
      <style jsx global>{`
        :root { --rl-tbar-h: calc(${TBAR_HEIGHT}px + var(--safe-top)); }
        /* A sticky box never sticks inside a box that is overflow-x hidden (components/ui.js sets
           it on body and the Next root, which makes each a scroll box that never scrolls); where
           the bar is, those two clip instead: the same sideways edge, no scroll box, on every
           tenant page with the bar (the profile's own shell does the same, ProfileLayout.js). */
        :root:has([data-tenant-bar]) body, #__next:has([data-tenant-bar]) { overflow-x: clip !important; }
        /* Whatever is scrolled to (a section from the menu, a focused field) stops under the bar. */
        :root:has([data-tenant-bar]) { scroll-padding-top: calc(var(--rl-tbar-h) + var(--s-2)); }
        .rl-tbar { position: sticky; top: 0; z-index: 40; isolation: isolate; box-sizing: border-box; height: var(--rl-tbar-h);
          display: flex; justify-content: space-between; align-items: center; gap: var(--s-4);
          padding: calc(var(--s-3) + var(--safe-top)) var(--tbar-pad, var(--s-4)) var(--s-3);
          border-bottom: 1px solid var(--rule); }
        /* Its edge is the rule it always had, so the glass's own hairline ring is left off. */
        .rl-tbar.rl-glass { box-shadow: inset 0 1px 0 var(--glass-hi); }
        .rl-tbar-label { font-size: var(--t-body-2); line-height: var(--lh-body); color: ${C.inkSoft}; white-space: nowrap; }
      `}</style>
    </header>
  );
}
