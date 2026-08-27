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
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
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
  const router = useRouter();
  // Avatar menu: profile, branding, sign out. Closes on outside tap and Escape.
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [menu]);
  const brandingHref = `${adapter.paths.profile}${adapter.paths.profile.includes('#') ? '' : '#branding'}`;
  const signOut = async () => {
    const supabase = adapter.supabase();
    await supabase.auth.signOut();
    router.replace(adapter.paths.signin);
  };
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
          {/* Account avatar: native initials (never the uploaded logo). Opens the account menu. */}
          <span ref={menuRef} className="rl-hdr-menuwrap">
            <button type="button" title="Account" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu}
              className="rl-hdr-reveal rl-hdr-avatar" style={{ '--d': '280ms' }} onClick={() => setMenu((m) => !m)}>
              {initialsOf(profile)}
            </button>
            {menu && (
              <div className="rl-hdr-menu" role="menu">
                <a role="menuitem" href={adapter.paths.profile} className="rl-hdr-mi"><Icon name="user" size={15} /> Profile</a>
                <a role="menuitem" href={brandingHref} className="rl-hdr-mi"><Icon name="edit" size={15} /> Branding</a>
                <button type="button" role="menuitem" onClick={signOut} className="rl-hdr-mi"><Icon name="arrow" size={15} /> Sign out</button>
              </div>
            )}
          </span>
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
        /* Right zone: account actions. No margin-left:auto — the shared header's space-between
           distributes the three zones (wordmark · status · actions) across the full width. */
        .rl-hdr-cluster {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: nowrap;
          min-width: 0;
        }
        /* No badge (founders) → no centre zone at all. A shown badge (trial/lapsed) is the widest
           control and would wrap the bar on small screens, so it collapses below 560px. */
        .rl-hdr-status:empty { display: none !important; }
        @media (max-width: 559px) {
          .rl-hdr-status { display: none !important; }
        }
        .rl-hdr-menuwrap { position: relative; display: inline-flex; }
        .rl-hdr-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 90; min-width: 200px; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: 12px; box-shadow: 0 4px 8px rgba(15,15,16,0.06), 0 22px 48px rgba(15,15,16,0.14); padding: 6px; display: grid; gap: 2px; }
        .rl-hdr-mi { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: none; border-radius: 8px; padding: 0 12px; min-height: 44px; font: inherit; font-size: 14px; font-weight: 600; color: ${C.ink}; text-decoration: none; cursor: pointer; }
        .rl-hdr-mi:hover { background: ${C.paperDeep}; }
        .rl-hdr-avatar {
          border: none;
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
