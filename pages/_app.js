// pages/_app.js
// App wrapper: a single, correct viewport meta for every page so mobile renders at device width
// (no pinch to zoom, no horizontal scroll), and the frame that makes realtor navigation feel
// native (components/nav/RouteFrame.js: the destination at once, the push, the press feedback).
// Every block of text on every page wraps balanced (CLAUDE.md, Layout): its lines about the same
// length, never a last line of one word. text-wrap is inherited, so the root sets it for all; a
// block of more than six lines, which Chrome leaves unbalanced, is evened by components/EvenLines.js.
// The theme (components/themeMode.js): the tokens for the theme in force, set on the root for every
// page, the always light mark kept with the route, and the browser's theme-color with it.
import Head from 'next/head';
import RouteFrame from '../components/nav/RouteFrame';
import { useEffect } from 'react';
import { useEvenLines } from '../components/EvenLines';
import { rememberFirstTouch } from '../lib/signupSource';
import { THEME_CSS, useThemeRoute } from '../components/themeMode';
import ThemeColor from '../components/ThemeColor';

export default function App({ Component, pageProps, router }) {
  useEvenLines();
  useThemeRoute(router?.pathname);
  // The first page a browser lands on is remembered as one short word (lib/signupSource.js), so a
  // realtor who signs up later can be counted by where they first came from. Never a URL.
  useEffect(() => { rememberFirstTouch(); }, []);
  return (
    <>
      <style jsx global>{`
        ${THEME_CSS}
        html { text-wrap: balance; }
        /* THE SAFE AREAS: the screen's own edges in the installed app (viewport-fit=cover), the
           status bar and the Dynamic Island at the top and the home indicator at the bottom. One
           name each, so every surface that clears them reads the same value, and a walk can stand
           a phone's insets in for them (a browser under test reports none). */
        :root { --safe-top: env(safe-area-inset-top, 0px); --safe-bottom: env(safe-area-inset-bottom, 0px); }
      `}</style>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      {/* Tint the mobile browser chrome (status bar / toolbar) to the page's ground site-wide so
          there are no bands at the top/bottom edges on any page, in the theme in force. A page with
          another ground sets its own ThemeColor (the same two metas, by key). */}
      <ThemeColor />
      <RouteFrame><Component {...pageProps} /></RouteFrame>
    </>
  );
}
