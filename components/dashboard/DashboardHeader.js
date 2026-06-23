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

export default function DashboardHeader({ profile, onEditProfile }) {
  const router = useRouter();
  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/signin');
  };
  const name = profile?.full_name || profile?.email || 'Your account';
  const shortName = name.length > 22 ? name.slice(0, 22) + '…' : name;
  const logo = profile?.logo_url;
  return (
    <ScrollHeader maxWidth={1100}>
      <a href="/landlord" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <StatusBadge profile={profile} />
        {/* Obvious profile entry point — avatar (logo or initials) + name → /profile hub. */}
        <a href="/profile" className="rl-btn" title="Your profile, branding & listings"
          aria-label="Open your profile hub"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, padding: '4px 12px 4px 4px', borderRadius: R.pill, background: C.card, border: `1px solid ${C.ruleDark}`, cursor: 'pointer' }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: logo ? '#fff' : C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, border: logo ? `1px solid ${C.rule}` : 'none' }}>
            {logo
              ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : initialsOf(profile)}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, textAlign: 'left' }}>
            <span style={{ fontSize: 9, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Realtor</span>
            <span style={{ fontSize: 12.5, color: C.ink, fontWeight: 700 }}>{shortName}</span>
          </span>
        </a>
        <button onClick={signOut} style={{ background: 'transparent', color: C.inkMute, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Sign out
        </button>
      </div>
    </ScrollHeader>
  );
}
