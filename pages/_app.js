// pages/_app.js
// App wrapper — sets a single, correct viewport meta for every page so mobile
// renders at device width (no pinch-to-zoom, no horizontal scroll). Presentation
// only; no data or routing changes.
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
