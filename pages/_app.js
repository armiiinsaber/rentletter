// pages/_app.js
// App wrapper: a single, correct viewport meta for every page so mobile renders at device width
// (no pinch to zoom, no horizontal scroll), and the frame that makes realtor navigation feel
// native (components/nav/RouteFrame.js: the destination at once, the push, the press feedback).
import Head from 'next/head';
import RouteFrame from '../components/nav/RouteFrame';

export default function App({ Component, pageProps }) {
  return (
    <>
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
