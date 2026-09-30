// lib/serviceWorker.js  CLIENT. Registers public/sw.js, from the realtor side only
// (components/dashboard/DashboardHeader.js), and only in a production build: in development the
// build's files change on every save and a cache would serve stale code. Never throws.
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}
