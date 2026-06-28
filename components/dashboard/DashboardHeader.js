// components/dashboard/DashboardHeader.js
// Shared realtor dashboard header: wordmark, founder/trial badge, profile name,
// edit-profile + sign-out actions. Used on the listings index and detail pages.
import { useRouter } from 'next/router';
import { ScrollHeader, Wordmark, Icon } from '../ui';
import { C, R } from '../theme';
import StatusBadge from './StatusBadge';
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
  const name = profile?.full_name || profile?.email || 'Your account';
  const logo = profile?.logo_url;
  // Every control in the account cluster shares this height so they line up exactly.
  const pill = { height: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', borderRadius: R.pill, flexShrink: 0 };
  return (
    <>
      <ScrollHeader maxWidth={1100}>
        {/* Wordmark → homepage (keeps the session). */}
        <a href="/" aria-label="Rentletter home" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}><Wordmark /></a>
        {/* Account cluster — uniform-height pills, evenly spaced, right-aligned; wraps as a
            tidy right-aligned row on small screens (no overflow). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, rowGap: 8, flexWrap: 'wrap', minWidth: 0, marginLeft: 'auto' }}>
          <StatusBadge profile={profile} />
          {/* Avatar (saved logo or initials) + name → /profile. */}
          <a href="/profile" className="rl-btn" title="You & your brand" aria-label="Open your profile"
            style={{ ...pill, textDecoration: 'none', gap: 8, padding: '0 12px 0 4px', background: C.card, border: `1px solid ${C.ruleDark}`, cursor: 'pointer', maxWidth: 'min(46vw, 210px)' }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, overflow: 'hidden', background: logo ? '#fff' : C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, border: logo ? `1px solid ${C.rule}` : 'none' }}>
              {logo
                ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : initialsOf(profile)}
            </span>
            <span className="rl-acct-name" style={{ fontSize: 13, color: C.ink, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{name}</span>
          </a>
          <button onClick={signOut} title="Sign out"
            style={{ ...pill, padding: '0 14px', background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </ScrollHeader>
      {/* On very narrow screens drop the name (avatar still links to the profile) so the
          cluster stays on one clean row instead of crowding/wrapping awkwardly. */}
      <style jsx>{`
        @media (max-width: 460px) { .rl-acct-name { display: none; } }
      `}</style>
    </>
  );
}
