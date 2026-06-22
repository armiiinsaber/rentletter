// components/dashboard/DashboardHeader.js
// Shared realtor dashboard header: wordmark, founder/trial badge, profile name,
// edit-profile + sign-out actions. Used on the listings index and detail pages.
import { useRouter } from 'next/router';
import { ScrollHeader, Wordmark, Icon } from '../ui';
import { C, R } from '../theme';
import StatusBadge from './StatusBadge';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function DashboardHeader({ profile, onEditProfile }) {
  const router = useRouter();
  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/signin');
  };
  const name = profile?.full_name || profile?.email || 'Your account';
  return (
    <ScrollHeader maxWidth={1100}>
      <a href="/landlord" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <StatusBadge profile={profile} />
        <button onClick={onEditProfile} className="rl-btn" title="Edit your realtor profile"
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: R.pill, background: C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 9, opacity: 0.65, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Realtor</span>
          {name.length > 24 ? name.slice(0, 24) + '…' : name}
        </button>
        <button onClick={signOut} style={{ background: 'transparent', color: C.inkMute, fontSize: 12.5, textDecoration: 'underline', textUnderlineOffset: 2 }}>
          Sign out
        </button>
      </div>
    </ScrollHeader>
  );
}
