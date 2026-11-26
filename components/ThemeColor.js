// components/ThemeColor.js
import Head from 'next/head';
import { useRouter } from 'next/router';
import { LIGHT, DARK } from './theme';
import { useTheme, alwaysLight, deepGround } from './themeMode';

// The browser's own colour for its bars: the page's ground in the theme in force. Two metas, one
// for each device setting, so the first paint is right before any script; once a choice is read
// both carry its colour. tone: the token of the page's ground (paper, or paperDeep on the tenant
// pages, which pages/_app.js gives the tenant's routes); color: a fixed colour of a page's own, in both.
export default function ThemeColor({ tone: given = null, color = null }) {
  const { pref } = useTheme();
  const { pathname } = useRouter();
  const tone = given || (deepGround(pathname) ? 'paperDeep' : 'paper');
  const choice = alwaysLight(pathname) ? 'light' : pref;
  const light = color || LIGHT[tone] || LIGHT.paper; const dark = color || DARK[tone] || DARK.paper;
  return (
    <Head>
      <meta key="rl-theme-color-light" name="theme-color" media="(prefers-color-scheme: light)" content={choice === 'dark' ? dark : light} />
      <meta key="rl-theme-color-dark" name="theme-color" media="(prefers-color-scheme: dark)" content={choice === 'light' ? light : dark} />
    </Head>
  );
}
