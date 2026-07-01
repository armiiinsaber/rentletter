// components/dashboard/DashboardHeader.js
// Shared realtor dashboard header: wordmark, founder/trial badge, notification bell,
// initials account avatar, and sign-out. Used on the listings index and detail pages.
// The realtor's uploaded logo is deliberately NOT shown here — an arbitrary logo never
// looks seamless jammed into a circle; its home is the landlord PDF letterhead. The header
// uses a clean native initials avatar instead.
import { useRouter } from 'next/router';
import { ScrollHeader, Wordmark } from '../ui';
import { C, R } from '../theme';
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
  // Bell and avatar share this 34px circle so the cluster reads as one matched set.
  const circle = { width: 34, height: 34, boxSizing: 'border-box', flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  return (
    <ScrollHeader maxWidth={1100}>
      {/* Wordmark → homepage (keeps the session). */}
      <a href="/" aria-label="Rentletter home" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}><Wordmark /></a>
      {/* Account cluster — evenly spaced, right-aligned; matched 34px controls read as a tidy
          group with clear separation. Stays balanced whether or not the founder tag is shown. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, rowGap: 8, flexWrap: 'wrap', minWidth: 0, marginLeft: 'auto' }}>
        <StatusBadge profile={profile} />
        {/* Bell — on-load notifications for this realtor's listings. */}
        <NotificationBell />
        {/* Account avatar — native initials (never the uploaded logo); opens profile/branding. */}
        <a href="/profile" title="You & your brand" aria-label="Open your profile and branding"
          style={{ ...circle, background: C.ink, color: C.paper, fontSize: 12, fontWeight: 800, letterSpacing: '0.02em', textDecoration: 'none', cursor: 'pointer' }}>
          {initialsOf(profile)}
        </a>
        <button onClick={signOut} title="Sign out"
          style={{ height: 34, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', flexShrink: 0, borderRadius: R.pill, padding: '0 16px', background: 'transparent', border: `1px solid ${C.ruleDark}`, color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </ScrollHeader>
  );
}
