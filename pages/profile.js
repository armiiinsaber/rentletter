// pages/profile.js
// Realtor profile — dedicated to YOU and YOUR BRAND only: identity (name, brokerage,
// phone, license — and a display name/username next stage), branding (the brand card,
// upload / Regenerate-with-AI / Remove, the AI logo studio), and brand colours. Listings
// are managed on the dashboard; account/founder status shows in the header. Gated behind
// a Supabase session (RLS). Reachable from the top-bar avatar.
import { useState } from 'react';
import Head from 'next/head';
import { GlobalStyle } from '../components/ui';
import { C } from '../components/theme';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import ProfileEditorBody from '../components/dashboard/ProfileEditorBody';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) {
    return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  }
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/profile', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { props: { initialProfile: profile || { id: user.id, email: user.email } } };
}

export default function ProfileHub({ initialProfile }) {
  const [profile, setProfile] = useState(initialProfile);

  return (
    <>
      <Head>
        <title>You &amp; your brand — Rentletter</title>
        <meta name="description" content="Your realtor profile and branding." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 32px) 64px' }}>
          <header style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Your account</div>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 8 }}>You &amp; your brand</h1>
            <p style={{ fontSize: 'clamp(14px, 2.4vw, 15px)', color: C.inkSoft, lineHeight: 1.55, maxWidth: 520 }}>
              Manage who you are and how you’re branded — your details, logo, and brand colours. Manage your listings from the dashboard.
            </p>
          </header>

          {/* Identity + branding + AI studio + colours. (A display name / username field
              joins the identity section next stage.) */}
          <section className="rl-card" style={{ padding: 'clamp(20px, 4vw, 32px)' }}>
            <ProfileEditorBody profile={profile} onSaved={setProfile} />
          </section>
        </div>
      </div>
    </>
  );
}
