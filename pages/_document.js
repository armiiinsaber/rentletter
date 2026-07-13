// pages/_document.js
// Custom Document — loads the product font stack (Inter + Fraunces, same families
// and weights the landing page established) ONCE for every screen via real <link>
// tags with preconnect. This replaces the render-blocking CSS @import that lived
// inside GlobalStyle, so all pages share one cached stylesheet with no double-load.
// Presentation only; no data or routing changes.
import { Html, Head, Main, NextScript } from 'next/document';

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
