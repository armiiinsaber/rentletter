// components/AppHead.js
// The installed realtor app: the manifest (public/manifest.webmanifest, start /dashboard, scope /),
// the iOS home screen tags, the touch icon and the launch images, all from the small mark and the
// logo (scripts/brand/build-brand.mjs). Rendered on every page a realtor can add to the Home
// Screen: the marketing home (pages/index.js), the FAQ, compliance and founder join pages, the sign
// in shell (components/auth/AuthShell.js: sign in, sign up, forgot, reset), onboarding and the
// dashboard header (components/dashboard/DashboardHeader.js). Tenant and landlord pages (apply,
// upload, my application, keep, r, ref, refer, a) never carry it. The admin keeps its own install
// (components/admin/AdminShell.js). The status bar is "default": dark text that reads on paper. The
// browser's theme-color is set for every page in pages/_app.js (components/ThemeColor.js), in the
// theme in force.
// The app is portrait only: the manifest says so, and UprightOverlay covers a landscape phone in
// standalone (components/UprightOverlay.js). Opened from the Home Screen, the first paint continues
// the launch image with the door turning until the first screen is ready (components/brand/
// AppStart.js, hosted by components/nav/RouteFrame.js). The launch images come in two sets, light
// and dark, each chosen by the device's own setting (components/brand/launchImages.js).
import Head from 'next/head';
import { LAUNCH } from './brand/launchImages';
import UprightOverlay from './UprightOverlay';

export default function AppHead() {
  return (
    <>
    <Head>
      <link key="rl-manifest" rel="manifest" href="/manifest.webmanifest" />
      <meta key="rl-apple-capable" name="apple-mobile-web-app-capable" content="yes" />
      <meta key="rl-capable" name="mobile-web-app-capable" content="yes" />
      <meta key="rl-apple-status" name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta key="rl-apple-title" name="apple-mobile-web-app-title" content="Rentletter" />
      <link key="rl-touch-icon" rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      {LAUNCH.map(({ s, theme, href, media }) => <link key={`rl-splash-${theme}-${s.w}-${s.h}-${s.dpr}`} rel="apple-touch-startup-image" href={href} media={media} />)}
    </Head>
    <UprightOverlay />
    </>
  );
}
