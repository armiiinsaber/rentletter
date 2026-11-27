// components/brand/launchImages.js  PURE. The iOS launch images of the installed realtor app, in both
// themes, one per iPhone screen in lib/brand/splash.js SPLASH (portrait):
//   light  paper with the logo centred at half the screen's width (lib/brand/splash.js splashFile)
//   dark   the dark ground with the logo in its dark colours, the same size and place
//          (splashFileDark), so the app opens from a dark launch image into the dark app
// scripts/brand/build-brand.mjs draws both sets into public/splash; components/AppHead.js links
// each with the media query iOS matches, the device's own light or dark setting first, so the
// order of the links never decides. iOS picks the launch image when the app is added to the Home
// Screen and keeps it: a phone that was light then shows the light one until the app is added
// again. Only the device's setting can choose it; the app's own Light and Dark choice
// (components/themeMode.js) lives in the page and loads after the launch image.
import { SPLASH, splashFile, splashMedia } from '../../lib/brand/splash.js';

export const splashFileDark = (s) => `/splash/splash-dark-${s.w * s.dpr}x${s.h * s.dpr}.png`;
// The dark set's colours: the dark theme's ground, word and bar (components/theme.js DARK), the
// colours of the opening screen in dark (components/brand/AppStart.js, the logo door kind).
export const LAUNCH = Object.freeze(SPLASH.flatMap((s) => [
  Object.freeze({ s, theme: 'light', href: splashFile(s), media: `(prefers-color-scheme: light) and ${splashMedia(s)}` }),
  Object.freeze({ s, theme: 'dark', href: splashFileDark(s), media: `(prefers-color-scheme: dark) and ${splashMedia(s)}` }),
]));
