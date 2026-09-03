// pages/profile.js
// Realtor profile — dedicated to YOU and YOUR BRAND only: identity (name, brokerage,
// phone, license — and a display name/username next stage), branding (the brand card,
// upload / Regenerate-with-AI / Remove, the AI logo studio), and brand colours. Listings
// are managed on the dashboard; account/founder status shows in the header. Gated behind
// a Supabase session (RLS). Reachable from the top-bar avatar.
import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { GlobalStyle, useReveal } from '../components/ui';
import { useAdapter } from '../lib/dashboardAdapter';
import { C, R } from '../components/theme';
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
  const [dirty, setDirty] = useState(false);         // set by ProfileEditorBody when detail fields change
  const [leaveOpen, setLeaveOpen] = useState(false); // unsaved-changes confirm dialog
  const [leaving, setLeaving] = useState(false);
  const saveRef = useRef(null);                      // ProfileEditorBody populates this with its save()
  const router = useRouter();
  const adapter = useAdapter();
  useReveal('profile');
  // Sign out lives here now (the header's identity circle opens this page).
  const signOut = async () => { try { await adapter.supabase().auth.signOut(); } catch (e) { /* the redirect still lands on sign in */ } router.replace(adapter.paths.signin); };

  // "Back to dashboard" leave guard — only prompts when there are unsaved DETAIL changes.
  const goToDashboard = () => router.push('/landlord');
  const leaveWithoutSaving = () => { setLeaveOpen(false); goToDashboard(); };
  const saveAndLeave = async () => {
    const doSave = saveRef.current;
    if (!doSave) { setLeaveOpen(false); goToDashboard(); return; }
    setLeaving(true);
    const ok = await doSave();
    setLeaving(false);
    setLeaveOpen(false);
    if (ok) goToDashboard(); // on failure, stay, the editor surfaces the error inline
  };

  return (
    <>
      <Head>
        <title>You &amp; your brand · Rentletter</title>
        <meta name="description" content="Your realtor profile and branding." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper, overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} />

        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px) clamp(16px, 4vw, 32px) 64px' }}>
          <header className="rl-in" style={{ marginBottom: 'var(--s-5)' }}>
            <a href="/landlord" className="rl-btn"
              onClick={(e) => { if (dirty) { e.preventDefault(); setLeaveOpen(true); } }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-4)', padding: 'var(--s-2) var(--s-3)', borderRadius: R.pill, border: `1px solid ${C.ruleDark}`, background: C.card, color: C.inkSoft, fontSize: 'var(--t-body-2)', fontWeight: 600, textDecoration: 'none' }}>
              <span aria-hidden="true" style={{ fontSize: 'var(--t-body-2)', lineHeight: 1 }}>←</span> Back to dashboard
            </a>
            <div style={{ fontSize: 'var(--t-eyebrow)', color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'var(--s-2)' }}>Your account</div>
            <h1 className="t-d1" style={{ color: C.ink, marginBottom: 'var(--s-2)' }}>You &amp; your brand</h1>
            <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, maxWidth: 520 }}>
              Manage who you are and how you’re branded, your details, logo, and brand colours. Manage your listings from the dashboard.
            </p>
          </header>

          {/* Identity + branding + AI studio + colours. (A display name / username field
              joins the identity section next stage.) */}
          <section id="branding" className="rl-card rl-in" style={{ padding: 'var(--s-4)', '--rl-d': '90ms', scrollMarginTop: 16 }}>
            <ProfileEditorBody profile={profile} onSaved={setProfile} onDirtyChange={setDirty} saveRef={saveRef} />
          </section>

          {/* Sign out: the account's exit, at the foot of the page that is about the account. */}
          <div style={{ marginTop: 'var(--gap-section)', display: 'flex', justifyContent: 'flex-start' }}>
            <button type="button" onClick={signOut} style={{ minHeight: 44, padding: '0 var(--s-4)', borderRadius: R.pill, border: `1px solid ${C.ruleDark}`, background: C.card, color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </div>

      {/* Unsaved-changes leave guard, shown when "Back to dashboard" is clicked with dirty details. */}
      {leaveOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="leave-title"
          onClick={(e) => { if (e.target === e.currentTarget && !leaving) setLeaveOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--s-4)', zIndex: 300 }}>
          <div style={{ maxWidth: 420, width: '100%', background: C.paper, borderRadius: R.card, boxShadow: '0 24px 64px rgba(15,15,16,0.28)', padding: 'var(--s-4)' }}>
            <h2 id="leave-title" style={{ fontSize: 'var(--t-d3)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', marginBottom: 'var(--s-2)' }}>Unsaved changes</h2>
            <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.55, marginBottom: 'var(--s-4)' }}>
              You have unsaved changes to your details. Do you want to save before leaving?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <button onClick={saveAndLeave} disabled={leaving}
                style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-3) var(--s-4)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: leaving ? 'wait' : 'pointer', opacity: leaving ? 0.7 : 1 }}>
                {leaving ? 'Saving…' : 'Save & leave'}
              </button>
              <button onClick={leaveWithoutSaving} disabled={leaving}
                style={{ background: C.card, color: C.ink, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, padding: 'var(--s-3) var(--s-4)', fontSize: 'var(--t-body-2)', fontWeight: 600, cursor: leaving ? 'default' : 'pointer', opacity: leaving ? 0.6 : 1 }}>
                Leave without saving
              </button>
              <button onClick={() => setLeaveOpen(false)} disabled={leaving}
                style={{ background: 'transparent', color: C.inkSoft, border: 'none', borderRadius: R.ctrl, padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--t-body-2)', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
