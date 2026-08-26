// pages/billing.js — "the plans": where a trialing realtor upgrades early, and where a
// subscriber reaches the billing portal. Realtor-facing, paper treatment. Reachable while
// locked (it IS how you unlock). Access itself is decided only by lib/entitlements.js.
import Head from 'next/head';
import { C } from '../components/theme';
import { GlobalStyle } from '../components/ui';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import { PlanPicker } from '../components/dashboard/Paywall';
import PromoEntry from '../components/dashboard/PromoEntry';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabase/server';
import { getEntitlement } from '../lib/entitlements';
import { PLANS, money } from '../lib/billingConfig';

export async function getServerSideProps(ctx) {
  if (!isSupabaseConfigured()) return { redirect: { destination: '/signin?error=Sign-in%20is%20temporarily%20unavailable.', permanent: false } };
  const supabase = getSupabaseServerClient(ctx.req, ctx.res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: { destination: '/signin?next=/billing', permanent: false } };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const p = profile || { id: user.id, email: user.email };
  return { props: { profile: p, entitlement: getEntitlement(p) } };
}

export default function Billing({ profile, entitlement: e }) {
  const subscribed = e.status === 'paid' || e.status === 'past_due';
  const plan = profile.billing_interval === 'year' ? PLANS.year : PLANS.month;
  const renews = profile.current_period_end ? new Date(profile.current_period_end).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  return (
    <>
      <Head><title>Plans — Rentletter</title><meta name="robots" content="noindex, nofollow" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <DashboardHeader profile={profile} />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} /><span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Plans</span></div>
          {e.status === 'founding' ? (
            <>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>You’re a founding member.</h1>
              <p style={{ fontSize: 15.5, color: C.inkSoft, lineHeight: 1.55, textWrap: 'balance' }}>Rentletter is free for you, for life. Nothing to manage here.</p>
            </>
          ) : subscribed ? (
            <>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>{plan.label} plan, {money(plan.amount)} a {plan.per}.</h1>
              <p style={{ fontSize: 15.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18, textWrap: 'balance' }}>{e.status === 'past_due' ? e.reason + '.' : renews ? `Renews ${renews}.` : 'Active.'} Cards, invoices and cancelling live in the billing portal.</p>
              <PlanPickerPortalOnly />
            </>
          ) : (
            <>
              <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>{e.status === 'trialing' ? `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left on your trial.` : 'Pick a plan.'}</h1>
              <p style={{ fontSize: 15.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18, textWrap: 'balance' }}>{e.status === 'trialing' ? 'Subscribe now and nothing changes on the day the trial ends.' : 'Monthly or annual, cancel any time from the billing portal.'}</p>
              <PlanPicker hasCustomer={!!profile.stripe_customer_id} />
              <div style={{ marginTop: 22 }}><PromoEntry /></div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function PlanPickerPortalOnly() {
  const open = async () => { const r = await fetch('/api/billing/portal', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (r.ok && j.url) window.location.href = j.url; else alert(j.error || 'Could not open the billing portal.'); };
  return <button type="button" onClick={open} style={{ minHeight: 48, padding: '0 22px', border: 'none', borderRadius: 8, background: C.ink, color: C.paper, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Open the billing portal</button>;
}
