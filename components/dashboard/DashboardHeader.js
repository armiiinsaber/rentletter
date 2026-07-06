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
import { useRouter } from 'next/router';
import { ScrollHeader, Wordmark } from '../ui';
import { C, R, EASE } from '../theme';
import StatusBadge from './StatusBadge';
import NotificationBell from './NotificationBell';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

function initialsOf(profile) {
  const n = (profile?.full_name || '').trim();
  if (n) {
    const parts = n.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || n[0].toUpperCase();
  }
  return (profile?.email || '?')[0].toUpperCase();
}

export default function DashboardHeader({ profile }) {
  const router = useRouter();
  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/signin');
  };
  return (
    <>
      <ScrollHeader maxWidth={1100}>
        {/* Wordmark → homepage (keeps the session). First beat of the reveal. */}
        <a href="/" aria-label="Rentletter home" className="rl-hdr-mark rl-hdr-reveal" style={{ '--d': '40ms' }}>
          <Wordmark />
        </a>
        {/* Account cluster — right-aligned, matched 34px controls with an intentional spacing
            rhythm. Reveals left→right after the wordmark; stays balanced with or without the
            founder tag (which is removed in the real product). */}
        <div className="rl-hdr-cluster">
          <span className="rl-hdr-reveal" style={{ '--d': '160ms', display: 'inline-flex' }}>
            <StatusBadge profile={profile} />
          </span>
          {/* Bell — on-load notifications for this realtor's listings (logic untouched). */}
          <span className="rl-hdr-reveal rl-hdr-bellwrap" style={{ '--d': '220ms', display: 'inline-flex' }}>
            <NotificationBell />
          </span>
          {/* Account avatar — native initials (never the uploaded logo); opens profile/branding. */}
          <a href="/profile" title="You & your brand" aria-label="Open your profile and branding"
            className="rl-hdr-reveal rl-hdr-avatar" style={{ '--d': '280ms' }}>
            {initialsOf(profile)}
          </a>
          <button onClick={signOut} title="Sign out"
            className="rl-hdr-reveal rl-hdr-signout" style={{ '--d': '340ms' }}>
            Sign out
          </button>
        </div>
      </ScrollHeader>

      <style jsx>{`
        .rl-hdr-mark {
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          min-width: 0;
        }
        .rl-hdr-cluster {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          row-gap: 8px;
          flex-wrap: wrap;
          min-width: 0;
          margin-left: auto;
        }
        .rl-hdr-avatar {
          width: 34px;
          height: 34px;
          box-sizing: border-box;
          flex-shrink: 0;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: ${C.ink};
          color: ${C.paper};
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-decoration: none;
          cursor: pointer;
        }
        .rl-hdr-signout {
          height: 34px;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
          border-radius: ${R.pill}px;
          padding: 0 16px;
          background: transparent;
          border: 1px solid ${C.ruleDark};
          color: ${C.inkSoft};
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
        }

        /* ── Instant (motion-independent) states: colour + focus ring, safe for reduced-motion ── */
        .rl-hdr-avatar:hover { box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px rgba(215, 32, 39, 0.32); }
        .rl-hdr-avatar:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        .rl-hdr-signout:hover { background: ${C.paperDeep}; border-color: ${C.ink}; color: ${C.ink}; }
        .rl-hdr-signout:focus-visible { outline: none; border-color: ${C.ink}; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
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
          .rl-hdr-signout { transition: transform 200ms ${EASE}, background 200ms ease, border-color 200ms ease, color 200ms ease; }
          .rl-hdr-signout:hover { transform: translateY(-1px); }
          .rl-hdr-signout:active { transform: translateY(0) scale(0.98); }
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
