// components/themeMode.js
// The theme in force: light, dark, or the device's own (prefers-color-scheme), which is the default.
//   · The tokens (components/theme.js LIGHT, DARK) are set as CSS variables on the root, the light
//     ones always and the dark ones over them when the device is dark and no choice says light, or
//     when the choice is dark (THEME_CSS). Every page reads C, the variables, so a switch applies
//     at once, with no reload. Only on a screen: printing is always light.
//   · The choice (Automatic, Light, Dark: components/ThemeChoice.js) is kept on this device only,
//     in localStorage under STORAGE_KEY, every read and write in try and catch; anything else reads
//     as Automatic.
//   · No flash: THEME_HEAD runs in the document head (pages/_document.js) before the first paint
//     and sets html[data-theme] from the stored choice.
//   · Always light, whatever the choice: the landlord's report (/r/...) and the founder office
//     (/admin, its own ink design, the brand kit inside it). The server marks them on <html>
//     (data-theme="light" and data-theme-lock) and the app keeps the mark as the route changes
//     (useThemeRoute, in pages/_app.js). The PDFs and the emails are drawn on the server from fixed
//     light colours and never see the theme. A subtree is held light with .rl-theme-light.
//   · The browser's theme-color (components/ThemeColor.js) and color-scheme (on the root, below) follow it, so a
//     phone's bars and the form controls match.
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { STORAGE_KEY, PREFS, alwaysLight } from './themeHead';

export { STORAGE_KEY, PREFS, ALWAYS_LIGHT, alwaysLight, DEEP_GROUND, deepGround, THEME_CSS, THEME_HEAD, inDark, DARK_ROOT } from './themeHead';

// ── the choice, on this device ─────────────────────────────────────────────────────────────────
export function readThemePref() {
  try { const v = window.localStorage.getItem(STORAGE_KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
}
let current = null;
const prefNow = () => { if (current === null) current = readThemePref(); return current; };
const subs = new Set();
const notify = () => { for (const f of subs) f(); };
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
const locked = () => document.documentElement.hasAttribute('data-theme-lock');
// The theme in force: 'light' or 'dark'.
export function resolvedTheme(pref = prefNow()) {
  if (typeof document === 'undefined') return 'light';
  if (locked()) return 'light';
  if (pref === 'light' || pref === 'dark') return pref;
  return media()?.matches ? 'dark' : 'light';
}
function applyTheme(pref) {
  const d = document.documentElement;
  if (locked()) { d.setAttribute('data-theme', 'light'); return; }
  if (pref === 'light' || pref === 'dark') d.setAttribute('data-theme', pref); else d.removeAttribute('data-theme');
}
// The new colours land with every element's own transition off for two frames.
function land(apply) {
  const d = document.documentElement;
  d.setAttribute('data-theme-switch', '');
  apply();
  void d.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => d.removeAttribute('data-theme-switch')));
}
// A choice applies at once, with no reload and no transition, whatever the motion setting: the
// page is simply in the new theme on the next frame. Only transform and opacity ever animate, so
// the colours do not; and no element plays a colour transition of its own while they land.
export function setThemePref(pref) {
  const next = PREFS.includes(pref) ? pref : 'auto';
  try { if (next === 'auto') window.localStorage.removeItem(STORAGE_KEY); else window.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* kept for this page only */ }
  current = next;
  land(() => { applyTheme(next); notify(); });
}
// The device's own setting changing while Automatic is chosen lands the same way.
let watching = false;
function watchDevice() {
  if (watching) return; const mq = media(); if (!mq?.addEventListener) return;
  watching = true;
  mq.addEventListener('change', () => { if (prefNow() === 'auto' && !locked()) land(notify); else notify(); });
}
function subscribe(f) { subs.add(f); watchDevice(); return () => { subs.delete(f); }; }
// The choice and the theme in force, for a component: 'auto' and 'light' on the server and in the
// first render, then the device's.
export function useTheme() {
  const snap = useSyncExternalStore(subscribe, () => `${prefNow()}|${resolvedTheme(prefNow())}`, () => 'auto|light');
  const [pref, theme] = snap.split('|');
  return { pref, theme, setPref: setThemePref };
}

// Keeps the always light mark in step with the route (pages/_app.js): on, the page is light; off,
// the stored choice again. Before the new page paints.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export function useThemeRoute(pathname) {
  useIsoLayoutEffect(() => {
    const d = document.documentElement;
    if (alwaysLight(pathname)) d.setAttribute('data-theme-lock', ''); else d.removeAttribute('data-theme-lock');
    applyTheme(prefNow());
    notify();
  }, [pathname]);
}
