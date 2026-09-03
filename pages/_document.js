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
        {/* The two latin files used above the fold (Inter variable, Fraunces variable), fetched
            before the stylesheet names them. Same URLs the stylesheet resolves to for Chrome and Safari. */}
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
