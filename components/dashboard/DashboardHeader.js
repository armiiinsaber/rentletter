// components/dashboard/DashboardHeader.js
// Shared realtor dashboard header: wordmark, founder/trial badge, the search (it opens the command
// menu, components/dashboard/CommandMenu.js), notification bell and, where the screen has no tab
// bar, the initials account avatar. Used on every realtor screen through the shell
// (components/dashboard/DashShell.js). Under 1024px the search and the bell are round glass
// buttons at the right of the wordmark; at 1024 and wider the search is a glass pill about 520px
// wide at the left of the main area, with its Command K hint, and the bell a round glass button at
// the right; the avatar is in the sidebar.
// The realtor's uploaded logo is deliberately NOT shown here — an arbitrary logo never
// looks seamless jammed into a circle; its home is the landlord PDF letterhead. The header
// uses a clean native initials avatar instead.
//
// Presentation only. Behaviour (bell notifications, avatar → /profile, sign-out) is
// unchanged — this file governs how the header LOOKS and how it animates:
//   • a staggered page-load reveal (wordmark first, then the control cluster left→right)
//   • hover / press / focus micro-interactions on the avatar, sign-out, and bell
//   • all motion is transform/opacity only and gated behind prefers-reduced-motion.
import { useEffect, useState } from 'react';
import { ScrollHeader, Wordmark, Icon } from '../ui';
import AppHead from '../AppHead';
import { registerServiceWorker } from '../../lib/serviceWorker';
import { C, R } from '../theme';
import StatusBadge from './StatusBadge';
import AssistantBell from './AssistantBell';
import { useAdapter } from '../../lib/dashboardAdapter';
import { linkProps } from '../nav/routes';
import { logoProps } from './logoNav';

export function initialsOf(profile) {
  const n = (profile?.full_name || '').trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

// onSearch: opens the command menu (none on the paywall). avatar: the initials avatar under 1024px,
// on a screen with no tab bar (a listing); the tab bar's Profile is the way there elsewhere.
// lead: what the desktop shell sets at the left of this row (components/dashboard/DashShell.js), in
// line with the bell; never shown under 1024px.
export default function DashboardHeader({ profile, signals = null, onAssistantAction, lead = null, onSearch = null, avatar = true }) {
  const adapter = useAdapter();
  // The service worker (public/sw.js) registers from the realtor side only, in production.
  useEffect(() => { registerServiceWorker(); }, []);
  // The hint names the key the platform uses: Command on a Mac, Control elsewhere. Known after mount.
  const [mac, setMac] = useState(null);
  useEffect(() => { try { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')); } catch (e) { setMac(false); } }, []);
  return (
    <>
      <AppHead />
      <ScrollHeader maxWidth={1100}>
        {/* LEFT, wordmark: Listings from any other view; on Listings, the top of the page, or nothing
            when already there (components/dashboard/logoNav.js). */}
        <a {...logoProps(adapter.paths.home)} aria-label="Rentletter dashboard" className="rl-hdr-mark rl-mark">
          <Wordmark />
        </a>
        {lead ? <div className="rl-hdr-lead">{lead}</div> : null}
        {/* The search: a glass pill at 1024 and wider, at the main area's left. */}
        {onSearch ? (
          <span className="rl-hdr-searchwrap rl-hdr-glass rl-glass">
            <button type="button" className="rl-hdr-search" onClick={onSearch} aria-haspopup="dialog" aria-label="Search listings, tenants or actions" data-command-open="desk">
              <Icon name="search" size={18} />
              <span className="rl-hdr-search-t">Search listings, tenants or actions</span>
              <kbd className="rl-hdr-kbd" aria-hidden="true" style={{ visibility: mac == null ? 'hidden' : 'visible' }}>{mac === false ? 'Ctrl K' : '⌘K'}</kbd>
            </button>
          </span>
        ) : null}
        {/* CENTER, account status (trial countdown / lapsed / subscribed). Founders get no badge
            at all: the wrapper is empty and hidden, and the bar becomes the clean two-part
            wordmark + actions row. When a badge IS shown it collapses below 560px. */}
        <span className="rl-hdr-status" style={{ display: 'inline-flex' }}>
          <StatusBadge profile={profile} />
        </span>
        {/* RIGHT, account actions grouped with an even rhythm (matched 34px controls, 12px gaps).
            Reveals left→right after the wordmark and badge. */}
        <div className="rl-hdr-cluster">
          {/* The search under 1024px: a round glass button. */}
          {onSearch ? (
            <span className="rl-hdr-round rl-hdr-findwrap rl-hdr-glass rl-glass">
              <button type="button" className="rl-hdr-find" onClick={onSearch} aria-haspopup="dialog" aria-label="Search listings, tenants or actions" data-command-open="phone">
                <Icon name="search" size={19} />
              </button>
            </span>
          ) : null}
          {/* Bell: the assistant. Badge = what needs the realtor; the panel adds what happened. */}
          <span className="rl-hdr-bellwrap rl-hdr-glass rl-glass" style={{ display: 'inline-flex' }}>
            <AssistantBell profile={profile} signals={signals} onAction={onAssistantAction} />
          </span>
          {/* The realtor's identity: a 44px circle with their initials (never the uploaded logo) at the
              right edge, on a screen with no tab bar. Tapping it opens the profile page, where sign
              out lives. At 1024 and wider it is in the sidebar. */}
          {avatar ? (
            <a {...linkProps(adapter.paths.profile)} title="Your profile" aria-label="Your profile" className="rl-hdr-avatar">
              {initialsOf(profile)}
            </a>
          ) : null}
        </div>
      </ScrollHeader>

      <style jsx>{`
        /* The lead shows only in the desktop shell (components/dashboard/DashShell.js). */
        .rl-hdr-lead { display: none; }
        /* The search pill: at 1024 and wider only. The glass is the round or pill frame around each
           control, which floats; the control inside it is clear. */
        .rl-hdr-searchwrap { display: none; }
        /* Round glass controls: the search under 1024px and the bell. Text on them is ink. */
        .rl-hdr-round, .rl-hdr-bellwrap { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; }
        .rl-hdr-round { display: inline-flex; }
        .rl-hdr-find { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; color: ${C.ink}; background: transparent; border: none; padding: 0; cursor: pointer; }
        .rl-hdr-find:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        .rl-hdr-bellwrap { align-items: center; justify-content: center; }
        .rl-hdr-bellwrap :global(button) { width: 44px !important; height: 44px !important; border-radius: 50% !important; background: transparent !important; border: none !important; color: ${C.ink} !important; }
        .rl-hdr-bellwrap :global(button svg) { color: ${C.ink}; stroke: ${C.ink}; }
        @media (min-width: 1024px) {
          .rl-hdr-findwrap { display: none; }
          .rl-hdr-searchwrap { display: inline-flex; width: min(520px, 100%); margin-right: auto; border-radius: 999px; box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 6px 20px rgba(15, 15, 16, 0.06); }
          .rl-hdr-search { display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: 48px; padding: 0 var(--s-2) 0 var(--s-5); border-radius: 999px; border: none; background: transparent; color: ${C.inkSoft}; font-family: inherit; font-size: var(--t-body-2); font-weight: 500; text-align: left; cursor: text; }
          .rl-hdr-search-t { flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; }
          .rl-hdr-kbd { flex-shrink: 0; font-family: inherit; font-size: 12px; font-weight: 700; color: ${C.inkSoft}; background: rgba(250, 248, 243, 0.7); border: 1px solid ${C.ruleDark}; border-radius: 999px; padding: 4px 10px; }
          .rl-hdr-search:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
          .rl-hdr-bellwrap { width: 48px; height: 48px; box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px var(--glass-edge), 0 6px 20px rgba(15, 15, 16, 0.06); }
          .rl-hdr-bellwrap :global(button) { width: 48px !important; height: 48px !important; }
          .rl-hdr-avatar { display: none !important; }
        }
        .rl-hdr-mark {
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          min-width: 0;
        }
        /* Right zone: account actions. No margin-left:auto — the shared header's space-between
           distributes the three zones (wordmark · status · actions) across the full width. */
        .rl-hdr-cluster {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--s-3);
          flex-wrap: nowrap;
          min-width: 0;
        }
        /* No badge (founders) → no centre zone at all. A shown badge (trial/lapsed) is the widest
           control and would wrap the bar on small screens, so it collapses below 560px. */
        .rl-hdr-status:empty { display: none !important; }
        @media (max-width: 559px) {
          .rl-hdr-status { display: none !important; }
        }
        .rl-hdr-avatar {
          border: none;
          width: 44px;
          height: 44px;
          box-sizing: border-box;
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: ${C.ink};
          color: ${C.paper};
          font-size: var(--t-body-2);
          font-weight: 800;
          letter-spacing: 0.02em;
          text-decoration: none;
          cursor: pointer;
        }

        /* ── Instant (motion-independent) states: colour + focus ring, safe for reduced-motion ── */
        .rl-hdr-avatar:hover { box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px rgba(15, 15, 16, 0.18); }
        .rl-hdr-avatar:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        /* Bell: halo + focus ring drawn on its own button via box-shadow only — no transform, so
           the dropdown's measured position is never affected. */
        .rl-hdr-bellwrap :global(button):focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
        @media (hover: hover) { .rl-hdr-round:hover, .rl-hdr-bellwrap:hover, .rl-hdr-searchwrap:hover { box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 1px rgba(15, 15, 16, 0.18); } .rl-hdr-search:hover { color: ${C.ink}; } }

        /* No movement of its own: the press is the shared one (lib/motion.js installPress). */
        }
      `}</style>
    </>
  );
}
