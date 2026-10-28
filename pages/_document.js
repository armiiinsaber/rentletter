// pages/_document.js
// Custom Document: preloads the two self hosted webfont files (public/fonts, defined in
// components/ui.js GlobalStyle) so the first paint has them. No third party font host. Runs the app
// start check before anything paints (components/brand/AppStart.js APP_START_HEAD): in the
// installed app it switches on the opening screen; anywhere else it does nothing.
import { Html, Head, Main, NextScript } from 'next/document';
import { APP_START_HEAD } from '../components/brand/AppStart';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: APP_START_HEAD }} />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/inter-latin.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/fraunces-latin.woff2" />
        {/* The favicon: the small mark (scripts/brand/build-brand.mjs), at 32 and 16. */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
