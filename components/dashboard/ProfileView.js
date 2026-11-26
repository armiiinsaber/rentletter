// components/dashboard/ProfileView.js
// The profile page: the header, the title with one sentence on how changes save, the editor
// (components/dashboard/ProfileEditorBody.js: You, Brokerage and Brand), Invite a realtor
// (components/dashboard/InviteRealtor.js) and Sign out. pages/profile.js mounts it over the Supabase
// session; /demo/dashboard?profile=1 mounts it over the sandbox adapter.
// From 1024px the page fills the main area of the shell (DashShell ds-fill) in two columns: the
// form on the left, at a width that keeps its fields comfortable, and on the right a preview that
// stays on screen as the page scrolls and grows with the window: how the realtor appears to
// others as they type, drawn by the components that draw it for real. The brand at the top left of
// a landlord report (components/ReportBrand.js, as pages/r/[token].js shows it, the name through
// lib/reportSignature.js as the report signs it) and the card other realtors see in Circle search
// (components/dashboard/RealtorCard.js, with the name, brokerage and initials lib/circle.js gives
// it). Under 1024px it is one column, the back row to the dashboard at its top.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { GlobalStyle, Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { signingName } from '../../lib/reportSignature';
import { linkProps, rememberProfile, rememberScreenView, useTakeOver } from '../nav/routes';
import { C } from '../theme';
import ReportBrand from '../ReportBrand';
import ThemeChoice from '../ThemeChoice';
import DashShell from './DashShell';
import ProfileEditorBody from './ProfileEditorBody';
import RealtorCard, { initialsOf } from './RealtorCard';
import InviteRealtor from './InviteRealtor';

// How changes save, in one place (the code that makes it true is ProfileEditorBody.js: the detail
// fields write when a field is left, the province and the board when one is picked, the colours
// a moment after they change, a logo and a font pairing the moment they are chosen).
export const SAVE_LINE = 'Changes save on their own when you leave a field or make a choice.';

// What others see of the realtor, from the values on the form: the report's brand block
// (lib/reportSnapshot.js realtor: the signing name, the brokerage, the logo) and the Circle card
// (lib/circle.js publicCard: the name, the brokerage, the initials).
export const reportRealtorOf = (profile, live) => ({
  name: signingName({ report_signature: profile?.report_signature, full_name: live.full_name }, 'Your realtor'),
  brokerage: String(live.brokerage || '').slice(0, 120) || null,
  logoUrl: live.logoUrl || null,
});
export const circleCardOf = (live) => {
  const name = String(live.full_name || '').trim();
  return { name: name || 'Name not added yet', brokerage: String(live.brokerage || '').trim() || null, initials: initialsOf(name) };
};

export default function ProfileView({ initialProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  useEffect(() => { rememberProfile(profile); }, [profile]);
  // The page taking over this screen as it was seen (components/nav/RouteFrame.js keeps the screen):
  // the profile the server just sent replaces the one it showed.
  useTakeOver([initialProfile], () => { if (initialProfile) setProfile(initialProfile); });
  const router = useRouter();
  const adapter = useAdapter();
  // This screen as it stands, for a return to it within the session (components/nav/routes.js).
  useEffect(() => { if (adapter.kind === 'real') rememberScreenView('/profile', { initialProfile: profile }); }, [adapter.kind, profile]);
  // Sign out lives here (the header's identity circle opens this page).
  const signOut = async () => { try { await adapter.supabase().auth.signOut(); } catch (e) { /* the redirect still lands on sign in */ } router.replace(adapter.paths.signin); };
  // The form as it is typed, before it saves (ProfileEditorBody onLive); the saved profile until then.
  const [live, setLive] = useState(null);
  const onLive = useCallback((v) => setLive(v), []);
  const shown = live || { full_name: profile?.full_name || '', brokerage: profile?.brokerage || '', phone: profile?.phone || '', logoUrl: profile?.logo_url || '' };

  return (
    <>
      <Head>
        <title>Profile · Rentletter</title>
        <meta name="description" content="Your realtor profile and branding." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', minHeight: '100dvh', background: 'var(--paper)', overflowX: 'hidden' }}>
        <DashShell profile={profile} nav="profile" current="profile">
        {/* One column under 1024px; from there the main area's whole width (DashShell ds-fill). */}
        <div className="pv ds-fill">
          {/* The same row the listing page carries at its top; from 1024px the sidebar does its job. */}
          <a {...linkProps(adapter.paths.home, { back: true })} className="pv-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', minHeight: 44, fontSize: 'var(--t-body-2)', color: C.inkSoft, textDecoration: 'none' }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={15} /></span> Dashboard
          </a>
          <h1 className="t-d1 pv-title" style={{ color: C.ink, margin: 'var(--s-4) 0 var(--gap-line)' }}>Profile</h1>
          <p data-profile-saving="" style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: '0 0 var(--gap-section)', textWrap: 'balance' }}>{SAVE_LINE}</p>
          <div className="pv-cols">
            <div className="pv-form">
              {/* Identity, brokerage, logo, brand colours and fonts: one form in three groups. */}
              <div id="branding" style={{ scrollMarginTop: 16 }}>
                <ProfileEditorBody profile={profile} onSaved={setProfile} onLive={onLive} previewBeside />
              </div>
              {/* Invite a realtor: the realtor's own invite link and who joined through it. */}
              <InviteRealtor />
              {/* Appearance: Automatic, Light or Dark, kept on this device (components/ThemeChoice.js). */}
              <ThemeChoice />
              {/* Sign out: the account's exit, outlined, at the foot of the page that is about the account. */}
              <div style={{ marginTop: 'var(--gap-section)' }}>
                <button type="button" onClick={signOut} className="ds-btn ds-btn-line" data-sign-out="">Sign out</button>
              </div>
            </div>
            {/* From 1024px: how others see the realtor, live, on screen as the page scrolls. */}
            <aside className="pv-aside" aria-labelledby="pv-preview-title" data-profile-preview="" data-stuck="">
              <div className="pv-stage">
                <h2 id="pv-preview-title" className="pv-h">How others see you</h2>
                <div className="pv-shows">
                  <figure className="pv-show" data-preview="report">
                    <figcaption className="pv-cap">On your landlord reports</figcaption>
                    {/* The landlord's report is always light (components/themeMode.js), so its preview is too. */}
                    <div className="rl-card pv-report rl-theme-light">
                      <ReportBrand realtor={reportRealtorOf(profile, shown)} />
                      <div className="pv-hold" aria-hidden="true">The listing’s address</div>
                    </div>
                  </figure>
                  <figure className="pv-show" data-preview="circle">
                    <figcaption className="pv-cap">In Circle search</figcaption>
                    <ul className="pv-list"><RealtorCard who={circleCardOf(shown)} /></ul>
                  </figure>
                </div>
              </div>
            </aside>
          </div>
        </div>
        </DashShell>
      </div>
      <style jsx>{`
        .pv { max-width: 720px; margin: 0 auto; padding: var(--gap-section) var(--s-4) 64px; }
        .pv-aside { display: none; }
        .pv-stage { background: ${C.paperDeep}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); padding: var(--s-4); }
        .pv-h { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0 0 var(--s-4); }
        /* The two previews one under the other, side by side from 2200px where each has about
           420px. Set by the window's width, never by a wrap: WebKit keeps a card's container query
           (components/dashboard/RealtorCard.js) from before a wrap changed the card's width. */
        .pv-shows { display: grid; grid-template-columns: minmax(0, 640px); align-items: start; gap: var(--s-5); }
        .pv-show { min-width: 0; margin: 0; }
        .pv-cap { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; margin: 0 0 var(--s-2); }
        .pv-report { padding: var(--card-pad); }
        .pv-hold { font-family: var(--f-display); font-size: var(--t-d2); font-weight: 600; line-height: var(--lh-display); color: ${C.ruleDark}; }
        .pv-list { list-style: none; margin: 0; padding: 0; }
        /* From 1024px: the form at the left at a width that keeps its fields comfortable (about 560px
           at 1280 to 880px from 2000), the preview beside it taking the rest and never under 340px.
           The preview's top clears the header row (a 44px row with 16px above and below it) by 24px
           and it stays there as the page scrolls, as tall as the window. */
        @media (min-width: 1024px) {
          .pv-back { display: none !important; }
          .pv-title { margin-top: 0 !important; }
          .pv-cols { --pv-top: calc(44px + 2 * var(--s-4) + var(--s-5)); display: grid; grid-template-columns: minmax(0, clamp(560px, 44vw, 880px)) minmax(340px, 1fr); column-gap: var(--ds-pad); align-items: start; }
          .pv-form { min-width: 0; }
          .pv-aside { display: block; min-width: 0; position: sticky; top: var(--pv-top); }
          .pv-stage { min-height: calc(100vh - var(--pv-top) - var(--s-5)); min-height: calc(100dvh - var(--pv-top) - var(--s-5)); }
        }
        @media (min-width: 1280px) { .pv-stage { padding: var(--s-6); } }
        @media (min-width: 2200px) { .pv-shows { grid-template-columns: repeat(2, minmax(0, 640px)); } }
      `}</style>
    </>
  );
}
