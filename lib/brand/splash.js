// lib/brand/splash.js  PURE. The iOS launch images for the installed realtor app, one per current
// iPhone screen, portrait. Each is paper with the logo centred (scripts/brand/build-brand.mjs draws
// them into public/splash; components/AppHead.js links them with the media query iOS matches).
//   w, h: the screen in CSS pixels; dpr: its device pixel ratio.
export const SPLASH = Object.freeze([
  { w: 440, h: 956, dpr: 3 }, // iPhone 16 Pro Max, 17 Pro Max
  { w: 430, h: 932, dpr: 3 }, // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { w: 428, h: 926, dpr: 3 }, // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
  { w: 420, h: 912, dpr: 3 }, // iPhone Air
  { w: 414, h: 896, dpr: 3 }, // iPhone XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // iPhone XR, 11
  { w: 402, h: 874, dpr: 3 }, // iPhone 16 Pro, 17, 17 Pro
  { w: 393, h: 852, dpr: 3 }, // iPhone 14 Pro, 15, 15 Pro, 16
  { w: 390, h: 844, dpr: 3 }, // iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e
  { w: 375, h: 812, dpr: 3 }, // iPhone X, XS, 11 Pro, 12 mini, 13 mini
  { w: 375, h: 667, dpr: 2 }, // iPhone SE (2nd and 3rd), 8
]);
export const splashFile = (s) => `/splash/splash-${s.w * s.dpr}x${s.h * s.dpr}.png`;
export const splashMedia = (s) => `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`;
