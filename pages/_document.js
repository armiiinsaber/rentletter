// pages/_document.js
// Custom Document: preloads the two self hosted webfont files (public/fonts, defined in
// components/ui.js GlobalStyle) so the first paint has them. No third party font host.
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
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
