// pages/_document.js
// Custom Document: preloads the two self hosted webfont files (public/fonts, defined in
// components/ui.js GlobalStyle) so the first paint has them. No third party font host. Runs the app
// start check before anything paints (components/brand/AppStart.js APP_START_HEAD): in the
// installed app it switches on the opening screen; anywhere else it does nothing. Sets the theme
// before the first paint too (components/themeHead.js THEME_HEAD): the choice kept on this device,
// or the device's own; a page that is always light (the landlord's report, the founder office)
// comes from the server marked light, so it never paints dark.
import { Html, Head, Main, NextScript } from 'next/document';
import { APP_START_HEAD } from '../components/brand/AppStart';
import { THEME_HEAD, alwaysLight } from '../components/themeHead';

export default function Document({ __NEXT_DATA__ }) {
  const light = alwaysLight(__NEXT_DATA__?.page);
  return (
    <Html lang="en" data-theme={light ? 'light' : undefined} data-theme-lock={light ? '' : undefined}>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: THEME_HEAD }} />
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
