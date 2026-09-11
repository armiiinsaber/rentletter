// components/dashboard/ProfileView.js
// The profile page: the header, the title, the editor card (components/dashboard/ProfileEditorBody.js)
// and Sign out. pages/profile.js mounts it over the Supabase session; /demo/dashboard?profile=1
// mounts it over the sandbox adapter. Every field saves on its own and says Saved beside its label.
import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { GlobalStyle } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { C, R } from '../theme';
import DashboardHeader from './DashboardHeader';
import ProfileEditorBody from './ProfileEditorBody';

export default function ProfileView({ initialProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const router = useRouter();
  const adapter = useAdapter();
  // Sign out lives here (the header's identity circle opens this page).
  const signOut = async () => { try { await adapter.supabase().auth.signOut(); } catch (e) { /* the redirect still lands on sign in */ } router.replace(adapter.paths.signin); };

  return (
    <>
      <Head>
        <title>Profile · Rentletter</title>
        <meta name="description" content="Your realtor profile and branding." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paperDeep, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--gap-section) var(--s-4) 64px' }}>
          <h1 className="t-d1" style={{ color: C.ink, margin: '0 0 var(--gap-section)' }}>Profile</h1>
          {/* Identity, logo, brand colours and fonts: one card, one form. */}
          <section id="branding" className="rl-card" style={{ padding: 'var(--card-pad)', scrollMarginTop: 16 }}>
            <ProfileEditorBody profile={profile} onSaved={setProfile} />
          </section>
          {/* Sign out: the account's exit, outlined, at the foot of the page that is about the account. */}
          <div style={{ marginTop: 'var(--gap-section)' }}>
            <button type="button" onClick={signOut} style={{ minHeight: 44, padding: '0 var(--s-4)', borderRadius: R.ctrl, border: `1.5px solid ${C.ink}`, background: 'transparent', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  );
}
