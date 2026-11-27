// The realtor's dashboard on a phone, dark and light (fix/phone-standalone):
//   the progress strip   a stage not reached yet is grey that holds 3 to 1 against the card in
//                        both themes (ruleDark; the pair is in tests/themeContrast.test.mjs); a stage
//                        passed over (not done, a later one done) is outlined in ink, read as
//                        skipped, never a gap; done stays ink, the current stage red
//                        (components/dashboard/ListingCard.js segOf, Strip).
//   the status board     under 1024, with nothing to send and nothing to check, one compact row:
//                        Nothing waiting, and the Applicants and Active listings counts as two small
//                        figures, each its tile's button; a tile at zero always has one quiet line
//                        (components/dashboard/StatusBoard.js).
//   the controls         Active and Archived, Sort and Select on one row under 1024, never
//                        wrapping; Sort says Sort and names the order, Select is an icon with its
//                        words for a name (components/dashboard/HomeView.js).
//   the launch images    a dark set beside the light one, each picked by the device's setting
//                        (components/brand/launchImages.js, components/AppHead.js), drawn by
//                        scripts/brand/build-brand.mjs as the light ones are.
// The walk (tests/routes/phoneBarWebkit.test.mjs) and the wrapped text walk's part 7 see them on
// screen at 390 and 320 in both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { Strip, segOf } = await import('../components/dashboard/ListingCard.js');
const { default: StatusBoard } = await import('../components/dashboard/StatusBoard.js');
const { LAUNCH, splashFileDark } = await import('../components/brand/launchImages.js');
const { SPLASH, splashFile, splashMedia } = await import('../lib/brand/splash.js');
const { DARK, LIGHT } = await import('../components/theme.js');

const segs = (stage) => [0, 1, 2, 3, 4, 5].map((i) => segOf(stage, i));
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

test('the strip: done, current, skipped and not yet, each drawn and read apart', () => {
  // The fixture's 210 Carlaw: documents read, the employer called, the report next.
  assert.deepEqual(segs({ done: [true, true, true, true, false, false], current: 4 }), ['done', 'done', 'done', 'done', 'current', 'todo']);
  // The employer called before the documents were read: Documents skipped.
  assert.deepEqual(segs({ done: [true, true, false, true, false, false], current: 4 }), ['done', 'done', 'skipped', 'done', 'current', 'todo']);
  // A report sent before anyone called the employer (components/dashboard/board.js): Employer called skipped.
  assert.deepEqual(segs({ done: [true, true, true, false, true, false], current: 5 }), ['done', 'done', 'done', 'skipped', 'done', 'current']);
  // Withdrawn from the market: what was done, what was passed over, no current stage.
  assert.deepEqual(segs({ done: [true, true, false, true, false, false], current: null, closed: true }), ['done', 'done', 'skipped', 'done', 'todo', 'todo']);
  assert.deepEqual(segs({ done: [true, true, true, true, true, true], current: null, rented: true }), Array(6).fill('done'));
  assert.deepEqual(segs({ done: [true, false, false, false, false, false], current: 1 }), ['done', 'current', 'todo', 'todo', 'todo', 'todo']);
  assert.deepEqual(segs(null), Array(6).fill('todo'));
  // Rendered: each stage's state on its segment and in its words.
  const html = renderToStaticMarkup(React.createElement(Strip, { stage: { done: [true, true, false, true, false, false], current: 4 } }));
  assert.deepEqual([...html.matchAll(/data-seg="(\w+)"/g)].map((m) => m[1]), ['done', 'done', 'skipped', 'done', 'current', 'todo']);
  assert.match(html, /<li class="lc-seg lc-skip" data-seg="skipped">/);
  assert.equal(text(html), '|Invited|, done|Applied|, done|Documents|, skipped|Employer called|, done|Report|, current|Rented|, not yet|');
  // Drawn: grey at 3 to 1 for not yet, ink for done, red for the current one, an ink outline for skipped.
  const card = read('components/dashboard/ListingCard.js');
  assert.match(card, /\.lc-bar \{ display: block; align-self: stretch; height: 6px; border-radius: 999px; background: \$\{C\.ruleDark\}; \}/);
  assert.match(card, /\.lc-done \.lc-bar \{ background: \$\{C\.ink\}; \}/);
  assert.match(card, /\.lc-cur \.lc-bar \{ background: \$\{C\.red\}; \}/);
  assert.match(card, /\.lc-skip \.lc-bar \{ background: transparent; box-shadow: inset 0 0 0 1\.5px \$\{C\.ink\}; \}/);
  assert.doesNotMatch(card, /\.lc-bar \{[^}]*paperDeep/, 'never the deep paper, which is 1.16 to 1 on the card');
});

const TILES = { toSend: 0, toCheck: 0, applicants: 6, newThisWeek: 0, active: 2, withoutApplicants: 0, oldestSend: null, oldestCheck: null };
const board = (tiles, now = Date.UTC(2026, 10, 27, 15)) => renderToStaticMarkup(React.createElement(StatusBoard, { tiles, now, filter: 'all', onFilter() {}, paths: { listing: (id) => `/listing/${id}` }, onJump() {} }));

test('the board with nothing waiting: one compact row under 1024, the four tiles as ever from 1024', () => {
  const calm = board(TILES);
  assert.match(calm, /<section class="sb sb-calm-on" aria-label="Where your rentals stand" data-status-board="" data-calm="">/);
  const row = calm.slice(calm.indexOf('data-board-calm'), calm.indexOf('<div class="sb-tiles"'));
  assert.equal(text(row.replace(/^[^>]*>/, '')), '|Nothing waiting|6|Applicants|2|Active listings|');
  assert.deepEqual([...row.matchAll(/data-fig="(\w+)" aria-label="([^"]+)"/g)].map((m) => [m[1], m[2]]), [['applicants', '6 applicants'], ['all', '2 active listings']]);
  assert.match(row, /<button type="button" aria-pressed="false" class="sb-fig" data-fig="applicants"/, 'each figure is its tile\'s button');
  assert.deepEqual([...board({ ...TILES, applicants: 1, active: 1 }).matchAll(/data-fig="\w+" aria-label="([^"]+)"/g)].map((m) => m[1]), ['1 applicant', '1 active listing']);
  // The tiles stay in the markup: the width picks.
  assert.equal((calm.match(/data-tile="/g) || []).length, 4);
  const sb = read('components/dashboard/StatusBoard.js');
  assert.match(sb, /\.sb-calm \{ display: none; \}\s*@media \(max-width: 1023\.98px\) \{\s*\.sb-calm-on \.sb-tiles \{ display: none; \}\s*\.sb-calm \{ display: flex;/);
  assert.match(sb, /\.sb :global\(\.sb-fig\) \{[^\n]*min-width: 44px; min-height: 44px;/, 'each figure a 44px tap target');
  assert.match(sb, /\.sb-calm-line \{[^\n]*white-space: nowrap; \}/, 'the line on one line');
  // Anything waiting: the four tiles, no compact row.
  for (const busy of [{ toSend: 1 }, { toCheck: 2 }, { toSend: 1, toCheck: 1 }]) {
    const html = board({ ...TILES, ...busy, oldestSend: { kind: 'ready', listingId: 'L1' }, oldestCheck: { kind: 'docs', listingId: 'L1', linkId: 'J1' } });
    assert.doesNotMatch(html.replace(/<style[\s\S]*?<\/style>/g, ''), /data-board-calm|sb-calm-on|data-calm/, JSON.stringify(busy));
  }
});

test('a tile at zero has one quiet line under its number, never an empty space', () => {
  const lineOf = (html, key) => { const at = html.indexOf(`data-tile="${key}"`); const tile = html.slice(at, html.indexOf('</button>', at) + 9); const m = tile.match(/<span class="sb-line"( aria-hidden="true")?>([^<]*)<\/span>/); return m ? (m[1] ? '(empty)' : m[2]) : '(none)'; };
  const zero = board({ ...TILES, toSend: 0, toCheck: 0, applicants: 0, active: 0 });
  assert.deepEqual(['toSend', 'toCheck', 'applicants', 'all'].map((k) => lineOf(zero, k)), ['None waiting', 'None waiting', 'None new this week', 'None taking applications']);
  // Before the date is known (the server's HTML), the zero tiles still say so.
  const early = board({ ...TILES, applicants: 0 }, null);
  assert.deepEqual(['toSend', 'toCheck', 'applicants'].map((k) => lineOf(early, k)), ['None waiting', 'None waiting', 'None new this week']);
  // A live tile keeps its action line.
  const live = board({ ...TILES, toSend: 1, oldestSend: { kind: 'ready', listingId: 'L1' } });
  assert.match(live.slice(live.indexOf('data-tile="toSend"')), /^[^]*?<span class="sb-act">Send report/);
});

test('the controls under 1024: one row, never wrapping; Sort says Sort and names the order; Select an icon with its words', () => {
  const h = read('components/dashboard/HomeView.js');
  assert.match(h, /aria-haspopup="dialog" aria-label=\{`Sort, \$\{sortLabel\}`\} data-sort-open="" onClick=\{\(\) => setSortOpen\(true\)\}>\s*<Icon name="sort" size=\{16\} \/><span>Sort<\/span>/);
  assert.match(h, /<span className="hv-select-i" aria-hidden="true"><Icon name="select" size=\{18\}[^>]*\/><\/span><span className="hv-select-t">\{selecting \? 'Done' : 'Select'\}<\/span>/);
  const phone = h.slice(h.indexOf('@media (max-width: 1023.98px) {\n          .hv :global(.hv-only-desk)'));
  assert.match(phone, /\.hv-tools \{ margin-left: 0; justify-content: flex-start; width: 100%; flex-wrap: nowrap; \}/);
  assert.match(phone, /\.hv-tools :global\(\.hv-select\) \{ flex-shrink: 0; width: 44px; padding: 0; \}/);
  assert.match(phone, /\.hv-tools :global\(\.hv-select-t\) \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\); white-space: nowrap; \}/, 'its words stay its name');
  assert.match(h, /:global\(\.hv-select-i\) \{ display: none; \}/, 'from 1024 the words, not the icon');
  assert.match(read('components/ui.js'), /select: {3}<><rect x="4" y="4" width="16" height="16" rx="4\.5" \/><path d="M8\.5 12\.3l2\.4 2\.4 4\.6-5" \/><\/>,/);
});

test('the launch images: a dark set for every light one, each picked by the device\'s setting', async () => {
  assert.equal(LAUNCH.length, SPLASH.length * 2);
  for (const s of SPLASH) {
    const light = LAUNCH.find((x) => x.s === s && x.theme === 'light'); const dark = LAUNCH.find((x) => x.s === s && x.theme === 'dark');
    assert.equal(light.href, splashFile(s)); assert.equal(light.media, `(prefers-color-scheme: light) and ${splashMedia(s)}`);
    assert.equal(dark.href, splashFileDark(s)); assert.equal(dark.media, `(prefers-color-scheme: dark) and ${splashMedia(s)}`);
    assert.equal(dark.href, `/splash/splash-dark-${s.w * s.dpr}x${s.h * s.dpr}.png`);
  }
  assert.match(read('components/AppHead.js'), /\{LAUNCH\.map\(\(\{ s, theme, href, media \}\) => <link key=\{`rl-splash-\$\{theme\}-\$\{s\.w\}-\$\{s\.h\}-\$\{s\.dpr\}`\} rel="apple-touch-startup-image" href=\{href\} media=\{media\} \/>\)\}/);
  // Drawn as the light ones are: the screen's size, the theme's ground at the corners, the word and
  // the bar in the theme's colours at the middle.
  const sharp = (await import('sharp')).default;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const near = (a, b, d = 6) => a.every((v, i) => Math.abs(v - b[i]) <= d);
  for (const [theme, file, T] of SPLASH.flatMap((s) => [['light', splashFile(s), LIGHT], ['dark', splashFileDark(s), DARK]]).map(([t, f, T]) => [t, f, T])) {
    const path = join(ROOT, 'public', file); assert.ok(existsSync(path), file);
    const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const s = SPLASH.find((x) => file.endsWith(`${x.w * x.dpr}x${x.h * x.dpr}.png`));
    assert.deepEqual([info.width, info.height], [s.w * s.dpr, s.h * s.dpr], file);
    const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
    for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) assert.ok(near(px(x, y), rgb(T.paper)), `${file}: the ${theme} ground at a corner (${px(x, y)})`);
    // Along the middle row: the word's colour and the bar's colour are both there.
    const row = Array.from({ length: info.width }, (_, x) => px(x, Math.round(info.height / 2)));
    assert.ok(row.some((p) => near(p, rgb(T.ink), 24)), `${file}: the word in the ${theme} ink`);
    assert.ok(row.some((p) => near(p, rgb(T.red), 24)), `${file}: the bar in the ${theme} red`);
  }
});
