// lib/standalone.js  CLIENT. Is the page running as the installed app (Home Screen), where there is
// no address bar and no browser back button? iOS sets navigator.standalone; every other browser
// matches the display-mode media query from the manifest (public/manifest.webmanifest).
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.navigator && window.navigator.standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}
