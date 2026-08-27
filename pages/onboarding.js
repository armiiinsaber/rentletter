// pages/onboarding.js
// First run onboarding for a realtor. Owns the data: reads the profile server side, decides the
// step to resume at (lib/onboarding.js), and writes onboarding_step as each step completes so
// leaving and returning never restarts. 'done' profiles are sent to the dashboard. The screens
// themselves live in components/onboarding/OnboardingFlow. No access decisions here.
import { useState } from 'react';
import { reportEvent } from '../lib/clientEvents';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C } from '../components/theme';
import { GlobalStyle, Wordmark } from '../components/ui';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { nextStep } from '../lib/onboarding';
import { IdentityStep, ProvinceStep, BrandingStep, ListingStep, DoneStep, OnboardingStyles } from '../components/onboarding/OnboardingFlow';

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('Cache-Control', 'no-store');
  if (!isSupabaseConfigured()) return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/onboarding', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const p = profile || { id: user.id, email: user.email };
  if (nextStep(p) === 'done') return { redirect: { destination: '/landlord', permanent: false } };
  return { props: { userId: user.id, initialProfile: p } };
}

export default function Onboarding({ userId, initialProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [step, setStep] = useState(() => nextStep(initialProfile));
  const [listingBusy, setListingBusy] = useState(false);
  const [listingErr, setListingErr] = useState('');
  const [done, setDone] = useState(null); // { inviteUrl, listingId }

  // One write path: the profile patch plus the NEXT step, so a return resumes correctly.
  const save = async (patch, next) => {
    try {
      const supabase = getSupabaseBrowserClient();
      const values = { ...patch, onboarding_step: next };
      if (next === 'done') values.onboarding_completed_at = new Date().toISOString();
      const { data, error } = await supabase.from('profiles').update(values).eq('id', userId).select().single();
      if (error) return { error: error.message || 'Could not save. Please try again.' };
      setProfile(data);
      if (next !== 'done') setStep(next);
      return { ok: true };
    } catch (e) { return { error: 'Could not save. Please try again.' }; }
  };
  const finish = async (result) => { const r = await save({}, 'done'); if (r?.error) { setListingErr(r.error); return; } setDone(result || {}); setStep('done'); };

  // The first listing: the same insert the dashboard does, then the invite link the listing page
  // would mint, so the completion screen can hand it over.
  const createListing = async (values) => {
    setListingBusy(true); setListingErr('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.from('listings').insert({ ...values, profile_id: userId }).select().single();
      if (error) { setListingErr(error.message); setListingBusy(false); return; }
      let inviteUrl = null;
      try { const r = await fetch('/api/listings/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: data.id }) }); const j = await r.json().catch(() => ({})); if (r.ok && j.url) inviteUrl = j.url; } catch (e) { /* the listing page can mint it */ }
      setListingBusy(false);
      reportEvent(null, { type: 'listing_created', listingId: data.id });
      await finish({ inviteUrl, listingId: data.id });
    } catch (e) { setListingErr('Could not create the listing. Please try again.'); setListingBusy(false); }
  };

  return (
    <>
      <Head><title>Set up Rentletter</title><meta name="robots" content="noindex, nofollow" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <GlobalStyle />
      <OnboardingStyles />
      <div style={{ minHeight: '100dvh', background: C.paper }}>
        <header style={{ padding: 'max(18px, env(safe-area-inset-top)) clamp(16px, 4vw, 32px) 0', maxWidth: 560, margin: '0 auto' }}><Wordmark /></header>
        {step === 'identity' && <IdentityStep profile={profile} onSave={(patch) => save(patch, 'province')} />}
        {step === 'province' && <ProvinceStep profile={profile} onSave={(patch) => save(patch, 'branding')} />}
        {step === 'branding' && <BrandingStep profile={profile} onProfile={(p) => setProfile((cur) => ({ ...cur, ...p }))} onDone={() => save({}, 'listing')} onSkip={() => save({}, 'listing')} />}
        {step === 'listing' && <ListingStep onCreate={createListing} onSkip={() => finish({})} saving={listingBusy} error={listingErr} />}
        {step === 'done' && <DoneStep inviteUrl={done?.inviteUrl || null} listingHref={done?.listingId ? `/landlord/${done.listingId}` : null} dashboardHref="/landlord" onNewListing={() => router.push('/landlord?new=1')} />}
      </div>
    </>
  );
}
