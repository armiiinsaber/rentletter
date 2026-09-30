// components/AppHead.js
// The installed realtor app: the manifest (public/manifest.webmanifest, start /dashboard, scope /),
// the iOS home screen tags, the touch icon and the launch images, all from the small mark and the
// logo (scripts/brand/build-brand.mjs). Rendered on every page a realtor can add to the Home
// Screen: the marketing home (pages/index.js), the FAQ, compliance and founder join pages, the sign
// in shell (components/auth/AuthShell.js: sign in, sign up, forgot, reset), onboarding and the
// dashboard header (components/dashboard/DashboardHeader.js). Tenant and landlord pages (apply,
// upload, my application, keep, r, ref, refer, a) never carry it. The admin keeps its own install
// (components/admin/AdminShell.js). The status bar is "default": dark text that reads on paper.
// The app is portrait only: the manifest says so, and UprightOverlay covers a landscape phone in
// standalone (components/UprightOverlay.js).
import Head from 'next/head';
import { C } from './theme';
import { SPLASH, splashFile, splashMedia } from '../lib/brand/splash';
import UprightOverlay from './UprightOverlay';

export default function AppHead() {
  return (
    <>
    <Head>
      <link key="rl-manifest" rel="manifest" href="/manifest.webmanifest" />
      <meta key="rl-theme" name="theme-color" content={C.paper} />
      <meta key="rl-apple-capable" name="apple-mobile-web-app-capable" content="yes" />
      <meta key="rl-capable" name="mobile-web-app-capable" content="yes" />
      <meta key="rl-apple-status" name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta key="rl-apple-title" name="apple-mobile-web-app-title" content="Rentletter" />
      <link key="rl-touch-icon" rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      {SPLASH.map((s) => <link key={`rl-splash-${s.w}-${s.h}-${s.dpr}`} rel="apple-touch-startup-image" href={splashFile(s)} media={splashMedia(s)} />)}
    </Head>
    <UprightOverlay />
    </>
  );
}
