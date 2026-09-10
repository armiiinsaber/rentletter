// pages/onboarding.js
// First run onboarding for a realtor: the display name, then the dashboard. Everything else is
// asked when it is first needed (lib/justInTime.js): the province at the first listing, the
// signing name at the first send, the branding hint at the first send or landlord view. Reads
// the profile server side; a profile that already has a name goes straight to the dashboard.
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C } from '../components/theme';
import { GlobalStyle, Wordmark } from '../components/ui';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { isOnboarded } from '../lib/onboarding';
import { IdentityStep, OnboardingStyles } from '../components/onboarding/OnboardingFlow';

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('Cache-Control', 'no-store');
  if (!isSupabaseConfigured()) return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/onboarding', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const p = profile || { id: user.id, email: user.email };
  if (isOnboarded(p)) return { redirect: { destination: '/dashboard', permanent: false } };
  return { props: { userId: user.id, initialProfile: p } };
}

export default function Onboarding({ initialProfile }) {
  const router = useRouter();
  const [profile] = useState(initialProfile);
  // One write: the display name, and the step marked done so older gates agree.
  const save = async (patch) => {
    try {
      const values = { ...patch, onboarding_step: 'done', onboarding_completed_at: new Date().toISOString() };
      const r = await fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) return { error: j?.error || 'Could not save. Please try again.' };
      router.push('/dashboard');
      return { ok: true };
    } catch (e) { return { error: 'Could not save. Please try again.' }; }
  };
  return (
    <>
      <Head><title>Set up Rentletter</title><meta name="robots" content="noindex, nofollow" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <GlobalStyle />
      <OnboardingStyles />
      <div style={{ minHeight: '100dvh', background: C.paper }}>
        <header style={{ padding: 'max(18px, env(safe-area-inset-top)) clamp(16px, 4vw, 32px) 0', maxWidth: 560, margin: '0 auto' }}><Wordmark /></header>
        <IdentityStep profile={profile} onSave={save} />
      </div>
    </>
  );
}
