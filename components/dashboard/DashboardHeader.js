// components/dashboard/DashboardHeader.js
// Shared realtor dashboard header: wordmark, founder/trial badge, notification bell,
// initials account avatar, and sign-out. Used on the listings index and detail pages.
// The realtor's uploaded logo is deliberately NOT shown here — an arbitrary logo never
// looks seamless jammed into a circle; its home is the landlord PDF letterhead. The header
// uses a clean native initials avatar instead.
//
// Presentation only. Behaviour (bell notifications, avatar → /profile, sign-out) is
// unchanged — this file governs how the header LOOKS and how it animates:
//   • a staggered page-load reveal (wordmark first, then the control cluster left→right)
//   • hover / press / focus micro-interactions on the avatar, sign-out, and bell
//   • all motion is transform/opacity only and gated behind prefers-reduced-motion.
import { ScrollHeader, Wordmark, Icon } from '../ui';
import { C, R, EASE } from '../theme';
import StatusBadge from './StatusBadge';
import AssistantBell from './AssistantBell';
import { useAdapter } from '../../lib/dashboardAdapter';

function initialsOf(profile) {
  const n = (profile?.full_name || '').trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

export default function DashboardHeader({ profile, signals = null, onAssistantAction }) {
  const adapter = useAdapter();
  return (
    <>
      <ScrollHeader maxWidth={1100}>
        {/* LEFT — wordmark → homepage (keeps the session). First beat of the reveal. */}
        <a href="/" aria-label="Rentletter home" className="rl-hdr-mark rl-hdr-reveal" style={{ '--d': '40ms' }}>
          <Wordmark />
        </a>
        {/* CENTER — account status (trial countdown / lapsed / subscribed). Founders get no badge
            at all: the wrapper is empty and hidden, and the bar becomes the clean two-part
            wordmark + actions row. When a badge IS shown it collapses below 560px. */}
        <span className="rl-hdr-reveal rl-hdr-status" style={{ '--d': '160ms', display: 'inline-flex' }}>
          <StatusBadge profile={profile} />
        </span>
        {/* RIGHT — account actions grouped with an even rhythm (matched 34px controls, 12px gaps).
            Reveals left→right after the wordmark and badge. */}
        <div className="rl-hdr-cluster">
          {/* Bell: the assistant. Badge = what needs the realtor; the panel adds what happened. */}
          <span className="rl-hdr-reveal rl-hdr-bellwrap" style={{ '--d': '220ms', display: 'inline-flex' }}>
            <AssistantBell profile={profile} signals={signals} onAction={onAssistantAction} />
          </span>
          {/* The realtor's identity: a 44px circle with their initials (never the uploaded logo) at the
              right edge. Tapping it opens the profile page, where sign out lives. */}
          <a href={adapter.paths.profile} title="Your profile" aria-label="Your profile" className="rl-hdr-reveal rl-hdr-avatar" style={{ '--d': '280ms' }}>
            {initialsOf(profile)}
          </a>
        </div>
      </ScrollHeader>

      <style jsx>{`
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
        .rl-hdr-avatar:hover { box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px rgba(215, 32, 39, 0.32); }
        .rl-hdr-avatar:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        /* Bell: halo + focus ring drawn on its own button via box-shadow only — no transform, so
           the dropdown's measured position is never affected. */
        .rl-hdr-bellwrap :global(button) { border-radius: 50%; }
        .rl-hdr-bellwrap :global(button):hover { box-shadow: 0 0 0 4px rgba(15, 15, 16, 0.05); }
        .rl-hdr-bellwrap :global(button):focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }

        /* ── Motion: staggered reveal + hover/press transforms — only when motion is welcome ── */
        @media (prefers-reduced-motion: no-preference) {
          .rl-hdr-reveal {
            opacity: 0;
            animation: rlHdrIn 460ms ${EASE} both;
            animation-delay: var(--d, 0ms);
            will-change: transform, opacity;
          }
          .rl-hdr-mark { transition: transform 220ms ${EASE}; }
          .rl-hdr-mark:hover { transform: translateY(-1px); }
          .rl-hdr-avatar { transition: transform 200ms ${EASE}, box-shadow 200ms ${EASE}; }
          .rl-hdr-avatar:hover { transform: translateY(-1px) scale(1.05); }
          .rl-hdr-avatar:active { transform: scale(0.95); }
          .rl-hdr-bellwrap :global(button) { transition: box-shadow 200ms ease; }
        }
        @keyframes rlHdrIn {
          from { opacity: 0; transform: translateY(9px); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </>
  );
}
