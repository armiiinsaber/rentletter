// pages/_app.js
// App wrapper: a single, correct viewport meta for every page so mobile renders at device width
// (no pinch to zoom, no horizontal scroll), and the frame that makes realtor navigation feel
// native (components/nav/RouteFrame.js: the destination at once, the push, the press feedback).
// Every block of text on every page wraps balanced (CLAUDE.md, Layout): its lines about the same
// length, never a last line of one word. text-wrap is inherited, so the root sets it for all; a
// block of more than six lines, which Chrome leaves unbalanced, is evened by components/EvenLines.js.
import Head from 'next/head';
import RouteFrame from '../components/nav/RouteFrame';
import { useEffect } from 'react';
import { useEvenLines } from '../components/EvenLines';
import { rememberFirstTouch } from '../lib/signupSource';

export default function App({ Component, pageProps }) {
  useEvenLines();
  // The first page a browser lands on is remembered as one short word (lib/signupSource.js), so a
  // realtor who signs up later can be counted by where they first came from. Never a URL.
  useEffect(() => { rememberFirstTouch(); }, []);
  return (
    <>
      <style jsx global>{`
        html { text-wrap: balance; }
      `}</style>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* Tint the mobile browser chrome (status bar / toolbar) to the page eggshell site-wide so
            there are no white bands at the top/bottom edges on any page. A page can still override
            this by setting its own theme-color in its <Head> (Next dedupes by meta name). */}
        <meta name="theme-color" content="#faf8f3" />
      </Head>
      <RouteFrame><Component {...pageProps} /></RouteFrame>
    </>
  );
}
