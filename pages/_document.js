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
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
