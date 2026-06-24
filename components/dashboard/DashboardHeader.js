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
  const pill = { height: 36, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', borderRadius: R.pill, flexShrink: 0 };
  return (
    <ScrollHeader maxWidth={1100}>
      <a href="/landlord" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}><Wordmark /></a>
      {/* Account cluster — consistent-height, right-aligned pills; wraps cleanly on mobile. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(7px, 2vw, 12px)', flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
        <StatusBadge profile={profile} />
        {/* Avatar (saved logo or initials) + name → /profile. */}
        <a href="/profile" className="rl-btn" title="You & your brand" aria-label="Open your profile"
          style={{ ...pill, textDecoration: 'none', gap: 8, padding: '0 13px 0 4px', background: C.card, border: `1px solid ${C.ruleDark}`, cursor: 'pointer', maxWidth: 'min(52vw, 220px)' }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 7, overflow: 'hidden', background: logo ? '#fff' : C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, border: logo ? `1px solid ${C.rule}` : 'none' }}>
            {logo
              ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : initialsOf(profile)}
          </span>
          <span style={{ fontSize: 13, color: C.ink, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{name}</span>
        </a>
        <button onClick={signOut} title="Sign out"
          style={{ ...pill, padding: '0 14px', background: 'transparent', border: `1px solid ${C.rule}`, color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </ScrollHeader>
  );
}
