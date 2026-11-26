// pages/admin/commitment.js
// The commitment poster: one US Letter page, portrait, inside the founder office and behind its
// one gate (lib/adminAuth.js isAdmin; an unauthenticated visit goes to the /admin sign in and
// back). Static: no number on it is live. The sheet is 816 by 1056 CSS px (Letter at 96 per inch)
// with 72px of padding on every side; on screen it sits centred on a light grey ground and is
// scaled down as one piece on a narrower screen, never reflowed. Print: @page letter with no
// margin, so the browser's Save as PDF gives exactly one page, nothing cut, no browser headers.
// Archivo (variable width and weight) and Newsreader (400, 500) are loaded for this page only.
// Every block of text wraps balanced.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { isAdmin } from '../../lib/adminAuth';
import { LOGO } from '../../lib/brand/logoPaths';
import { Wordmark } from '../../components/ui';
import ThemeColor from '../../components/ThemeColor';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin?next=/admin/commitment', permanent: false } };
  return { props: {} };
}

const SHEET = { width: 816, height: 1056, padding: 72 };
const GUTTER = 16; // the grey ground left on each side of the sheet on a narrow screen
// The top row: the drawn wordmark (components/ui.js Wordmark, the one logo everywhere) as tall as
// the row's 13px type, its letters on the row's baseline, beside the date. Its size is the cap
// height, so a mark 13px tall has a cap of 13 / 107.43 of 100; the letters' baseline is
// LOGO.baseline of LOGO.h down the mark, so it is lowered by the rest. It rises 12.8px above the
// baseline, more than the 13px line's own ascent (11px in Chrome): a negative top margin keeps it
// from making the line taller, so the row stays as tall as the date and nothing under it moves.
const MARK_CAP = (13 * 100) / LOGO.h;
const MARK_STYLE = { display: 'inline-block', verticalAlign: `${-((LOGO.h - LOGO.baseline) * MARK_CAP) / 100}px`, marginTop: -4 };
const CELLS = [
  ['30', 'realtors use it every month'],
  ['50', 'rentals close through it every month'],
  ['100', 'tenants have reused their profile'],
  ['1/3', 'of new realtors arrive by referral'],
];

export default function CommitmentPoster() {
  // The whole sheet, smaller, when the screen is narrower than it. With no JavaScript it stays at
  // full size and the page scrolls sideways; nothing reflows either way.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (document.documentElement.clientWidth - 2 * GUTTER) / SHEET.width));
    fit();
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit);
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); };
  }, []);
  return (
    <>
      <ThemeColor color="#e6e6e4" />
      <Head>
        <title>Commitment poster — Rentletter admin</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Newsreader:wght@400;500&display=swap" />
      </Head>
      <main className="po-stage">
        <div className="po-bar" style={{ width: SHEET.width * scale }}>
          <button type="button" className="po-btn po-btn-ink" onClick={() => window.print()}>Save as PDF</button>
          <a className="po-btn" href="/admin">Back to office</a>
        </div>
        <div className="po-fit" style={{ width: SHEET.width * scale, height: SHEET.height * scale }}>
          <article className="po-sheet" data-poster="" style={{ transform: scale === 1 ? 'none' : `scale(${scale})` }}>
            <header className="po-top">
              <a href="/" className="rl-mark po-mark" aria-label="Rentletter home"><Wordmark size={MARK_CAP} style={MARK_STYLE} /></a>
              <span className="po-caps po-caps-quiet">Toronto, November 17, 2026</span>
            </header>
            <div className="po-rule-2" />
            <p className="po-when">When for three months in a row</p>
            <div className="po-grid">
              {CELLS.map(([n, label]) => (
                <div className="po-cell" key={n}>
                  <div className="po-n">{n}</div>
                  <div className="po-label">{label}</div>
                </div>
              ))}
            </div>
            <p className="po-then">I go full time and raise.</p>
            <p className="po-with">With 12 months of runway saved or a pre-seed round committed.</p>
            <div className="po-space" />
            <footer>
              <div className="po-rule-1" />
              <div className="po-foot">
                <p className="po-ifnot">If not by November 17, 2027, I decide again on purpose.</p>
                <div className="po-sign">
                  <div className="po-rule-1" />
                  <div className="po-caps po-name">Armin Saber</div>
                </div>
              </div>
            </footer>
          </article>
        </div>
      </main>
      <style jsx global>{`
        @page { size: letter; margin: 0; }
        html, body { margin: 0; padding: 0; background: #e6e6e4; }
        .po-stage, .po-stage * { box-sizing: border-box; }
        .po-stage { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: 24px ${GUTTER}px 48px; font-family: 'Archivo', Helvetica, Arial, sans-serif; color: #111111; }
        .po-bar { display: flex; gap: 8px; margin-bottom: 16px; max-width: 100%; }
        .po-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 10px 16px; border-radius: 8px; border: 1px solid #111111; background: transparent; color: #111111; font: inherit; font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer; white-space: nowrap; }
        .po-btn-ink { background: #111111; color: #ffffff; }
        .po-fit { flex-shrink: 0; }
        .po-sheet { position: relative; width: ${SHEET.width}px; height: ${SHEET.height}px; padding: ${SHEET.padding}px; background: #ffffff; color: #111111; display: flex; flex-direction: column; transform-origin: top left; box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.12); overflow: hidden; }
        .po-when, .po-then, .po-with, .po-ifnot { margin: 0; }
        .po-sheet p, .po-sheet span, .po-n, .po-label, .po-name { text-wrap: balance; }
        .po-top { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; }
        .po-caps { font-family: 'Archivo', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; font-stretch: 110%; line-height: 1.2; white-space: nowrap; }
        .po-caps-quiet { color: #555555; }
        /* The wordmark's link: one line of the row's own 13px type, so it is exactly as tall as the
           date and shares its baseline. Its 44px target reaches above and below the row without
           moving it. The letters in the poster's ink; the bar stays the brand red. */
        .po-top .po-mark { position: relative; display: block; min-height: 0; flex-shrink: 0; font-family: 'Archivo', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; font-stretch: 110%; line-height: 1.2; white-space: nowrap; color: #111111; text-decoration: none; }
        .po-top .po-mark::before { content: ''; position: absolute; left: 0; right: 0; top: calc(50% - 22px); height: 44px; }
        .po-top .po-mark .rl-wordmark path { fill: #111111; }
        .po-rule-2 { height: 0; border-top: 2px solid #111111; margin-top: 20px; }
        .po-rule-1 { height: 0; border-top: 1px solid #111111; }
        .po-when { font-family: 'Newsreader', Georgia, serif; font-weight: 400; font-size: 30px; line-height: 1.25; color: #333333; margin-top: 56px; }
        .po-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 48px; row-gap: 44px; margin-top: 36px; }
        .po-n { font-size: 132px; font-weight: 800; font-stretch: 75%; line-height: 0.9; color: #c8321e; }
        .po-label { font-size: 20px; font-weight: 500; line-height: 1.3; margin-top: 6px; }
        .po-then { font-size: 54px; font-weight: 800; font-stretch: 85%; line-height: 1.05; margin-top: 64px; }
        .po-with { font-size: 18px; line-height: 1.5; color: #333333; max-width: 560px; margin-top: 20px; }
        .po-space { flex: 1 1 auto; min-height: 0; }
        .po-foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; margin-top: 24px; }
        .po-ifnot { font-family: 'Newsreader', Georgia, serif; font-weight: 400; font-size: 22px; line-height: 1.35; max-width: 380px; }
        .po-sign { width: 220px; flex-shrink: 0; }
        .po-name { margin-top: 10px; }
        @media print {
          html, body { background: #ffffff; }
          .po-stage { display: block; min-height: 0; padding: 0; }
          .po-bar { display: none !important; }
          .po-fit { width: ${SHEET.width}px !important; height: ${SHEET.height}px !important; }
          .po-sheet { transform: none !important; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </>
  );
}
