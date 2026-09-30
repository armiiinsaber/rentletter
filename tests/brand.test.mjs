// One wordmark everywhere, and the installable realtor app.
//   The old wordmark (the red bar beside "Rentletter" set in the sans at weight 800, drawn in markup
//   or in an email table) appears nowhere in pages, components, lib, the emails or public/.
//   The official logo is one component drawn from one set of vector paths; the four emails that
//   carried a wordmark carry the hosted PNG with its alt text and a fixed width; the PDF draws the
//   logo as vector on every page.
//   The manifest, the icons, the favicon and the launch images are what the task set, built from
//   the small mark, and only the realtor surfaces carry the app head.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p, out); } else out.push(p); } return out; };
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const SOURCES = [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'public'))].filter((p) => /\.(js|mjs|html|svg)$/.test(p));

// The old wordmark, every way it was written.
export const OLD_WORDMARK = [
  [/width:\s*['"]?(3|3\.5|4|5)(px)?['"]?[,;]\s*height:\s*['"]?(14|20|21|24|30)(px)?['"]?[,;][^\n]{0,80}background:\s*(C\.red|#d72027)/, 'the red bar drawn beside the word'],
  [/font-?[wW]eight:\s*['"]?800['"]?[^\n<>]{0,160}>\s*Rentletter\s*</, 'the word at weight 800'],
  [/fontWeight:\s*800[^\n]{0,160}>\s*Rentletter\s*</, 'the word at weight 800'],
  [/fontWeight: isLg \? /, 'the old component'],
];

test('the old wordmark appears nowhere', () => {
  const hits = [];
  for (const p of SOURCES) {
    const rel = relative(ROOT, p); if (rel === 'lib/brand/logoPaths.js') continue;
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => { for (const [re, what] of OLD_WORDMARK) if (re.test(line)) hits.push(`${rel}:${i + 1} ${what}: ${line.trim().slice(0, 100)}`); });
    // "Rentletter" as the whole text of an element is a wordmark, unless it is the page title.
    const text = readFileSync(p, 'utf8').replace(/<title>[^<]*<\/title>/g, '');
    for (const m of text.matchAll(/>\s*Rentletter\s*</g)) hits.push(`${rel}:${text.slice(0, m.index).split('\n').length} the word alone as a wordmark`);
  }
  assert.deepEqual(hits, []);
});

test('the scan catches the old wordmark in each form it took', () => {
  const old = [
    `<span style={{ width: 3.5, height: 21, background: C.red, borderRadius: 1 }} /><span style={{ fontSize: 18, fontWeight: 800 }}>Rentletter</span>`,
    `<td style="width:3px;height:20px;background:#d72027;"></td><td style="font-weight:800;color:#0f0f10;">Rentletter</td>`,
    `<div style="width: 4px; height: 24px; background: #d72027;"></div>`,
  ];
  for (const o of old) assert.ok(OLD_WORDMARK.some(([re]) => re.test(o)) || />\s*Rentletter\s*</.test(o), o);
});

test('one Wordmark, drawn from the vector paths; every page uses it', () => {
  const ui = src('components/ui.js');
  assert.match(ui, /import \{ LOGO \} from '\.\.\/lib\/brand\/logoPaths';/);
  assert.match(ui, /export const WORDMARK_CAP = Object\.freeze\(\{ header: 16, footer: 13, auth: 22, hero: 32, mock: 9 \}\);/);
  assert.match(ui, /<path d=\{LOGO\.text\} fill=\{onDark \? C\.paper : C\.ink\} \/>/);
  assert.match(ui, /fill=\{C\.red\}/, 'the red bar, the tick motif');
  const { LOGO, MARK } = await_import_sync();
  assert.ok(LOGO.text.length > 1000 && /^M/.test(LOGO.text), 'the word as paths');
  assert.equal(LOGO.bar.h, 102); assert.equal(LOGO.bar.w, 17);
  assert.ok(MARK.any.r.length > 100 && MARK.maskable.r.length > 100);
  // every header wordmark is inside a 44px link
  for (const p of SOURCES.filter((f) => /\.js$/.test(f) && !/components\/ui\.js$/.test(f))) {
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/<Wordmark[^>]*\/>/g)) {
      const before = text.slice(Math.max(0, m.index - 260), m.index);
      if (/film|mockups/.test(p)) continue; // the film's frames and the mock screens are pictures of the app
      assert.match(before, /className="[^"]*(rl-mark|ad-brand)[^"]*"[^>]*>\s*$/, `${relative(ROOT, p)}: the wordmark sits in its 44px link`);
    }
  }
});
// logoPaths.js is plain data; read it without the ESM loader dance.
function await_import_sync() { const t = src('lib/brand/logoPaths.js'); return { LOGO: JSON.parse(/export const LOGO = (\{.*\});/.exec(t)[1]), MARK: JSON.parse(/export const MARK = (\{.*\});/.exec(t)[1]) }; }

test('the emails carry the hosted logo, alt "Rentletter", a fixed width', async () => {
  for (const f of ['pages/api/send.js', 'lib/tenantEmails.js', 'lib/referralEmails.js', 'pages/api/applicants/request-documents.js']) assert.match(src(f), /\$\{emailLogoHtml\(\)\}/, f);
  const { emailLogoHtml } = await import('../lib/brand/emailLogo.js');
  const img = emailLogoHtml('https://rentletter.ca');
  assert.equal(img, '<img src="https://rentletter.ca/brand/rentletter-logo-email.png" width="132" height="26" alt="Rentletter" style="display:block;width:132px;height:26px;border:0;outline:none;text-decoration:none;">');
  const { magicLinkEmail } = await import('../lib/tenantEmails.js');
  const mail = magicLinkEmail('https://rentletter.ca/my-application/confirm?t=x');
  const html = typeof mail === 'string' ? mail : mail.html;
  assert.ok(html.includes('alt="Rentletter"') && html.includes('width="132"'), 'the magic link email');
  const { consentEmail } = await import('../lib/referralEmails.js');
  const c = consentEmail({ url: 'https://rentletter.ca/ref/x', fromName: 'Sarah Chen', toName: 'Priya Patel', applicantFirst: 'Nadia' });
  assert.ok((typeof c === 'string' ? c : c.html).includes('alt="Rentletter"'), 'the referral email');
  const sharp = (await import('sharp')).default;
  const m = await sharp(join(ROOT, 'public/brand/rentletter-logo-email.png')).metadata();
  assert.deepEqual([m.width, m.height], [528, 104], 'drawn at four times the 132 by 26 it shows at');
});

test('the PDF draws the logo as vector at the foot of every page', async () => {
  const drawn = [];
  const { drawPdfLogo } = await import('../lib/brand/pdfLogo.js');
  const page = { drawSvgPath: (d, o) => drawn.push({ d, ...o }) };
  const w = drawPdfLogo(page, { x: 54, y: 36, height: 9, ink: 'INK', red: 'RED' });
  assert.equal(drawn.length, 2); assert.equal(drawn[0].color, 'RED'); assert.equal(drawn[1].color, 'INK');
  assert.ok(Math.abs(w - 9 * 591.21 / 107.43) < 0.01);
  const pdf = src('lib/landlordReportPdf.js');
  assert.match(pdf, /pages\.forEach\(\(pg\) => drawPdfLogo\(pg, /, 'every page of the landlord report');
  assert.match(pdf, /drawPdfLogo\(page, \{ x: x0 \+ tw \+ 4/, 'the verification PDF');
  const { demoSnapshot } = await import('../lib/demoReport.js');
  const { buildLandlordReportPdf } = await import('../lib/landlordReportPdf.js');
  const bytes = await buildLandlordReportPdf({ payload: demoSnapshot('demo-carlaw') });
  assert.ok(bytes.length > 1000);
});

test('the manifest, the icons, the favicon and the launch images', async () => {
  const man = JSON.parse(src('public/manifest.webmanifest'));
  assert.equal(man.name, 'Rentletter'); assert.equal(man.short_name, 'Rentletter'); assert.doesNotMatch(JSON.stringify(man), /CEO/);
  assert.equal(man.start_url, '/dashboard'); assert.equal(man.scope, '/'); assert.equal(man.display, 'standalone');
  assert.equal(man.background_color, '#faf8f3');
  assert.match(src('components/theme.js'), new RegExp(`paper: '${man.theme_color}'`), 'theme_color is the paper token');
  assert.deepEqual(man.icons.map((i) => `${i.src} ${i.sizes} ${i.purpose}`), ['/icons/icon-192.png 192x192 any', '/icons/icon-512.png 512x512 any', '/icons/icon-maskable-192.png 192x192 maskable', '/icons/icon-maskable-512.png 512x512 maskable']);
  const sharp = (await import('sharp')).default;
  for (const [f, px] of [['icon-192', 192], ['icon-512', 512], ['icon-maskable-192', 192], ['icon-maskable-512', 512], ['apple-touch-icon', 180], ['favicon-32', 32], ['favicon-16', 16]]) {
    const m = await sharp(join(ROOT, `public/icons/${f}.png`)).metadata(); assert.deepEqual([m.width, m.height], [px, px], f);
  }
  // the small mark: the admin icon's own pixels (public/admin-icon-512.png), within edge antialiasing
  const a = await sharp(join(ROOT, 'public/admin-icon-512.png')).removeAlpha().raw().toBuffer(); const b = await sharp(join(ROOT, 'public/icons/icon-512.png')).removeAlpha().raw().toBuffer();
  let diff = 0; for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]); assert.ok(diff / a.length < 1, `the same mark as the admin install (${(diff / a.length).toFixed(2)})`);
  const ico = readFileSync(join(ROOT, 'public/favicon.ico')); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 2); assert.deepEqual([ico[6], ico[22]], [16, 32]);
  const { SPLASH, splashFile } = await import('../lib/brand/splash.js');
  assert.ok(SPLASH.length >= 10);
  for (const s of SPLASH) { const m = await sharp(join(ROOT, `public${splashFile(s)}`)).metadata(); assert.deepEqual([m.width, m.height], [s.w * s.dpr, s.h * s.dpr], splashFile(s)); }
  assert.ok(existsSync(join(ROOT, 'public/admin.webmanifest')) && /"start_url": "\/admin\/crm"/.test(src('public/admin.webmanifest')), 'the admin install is left as it is');
});

test('only the realtor surfaces carry the app head; sign in autofills', () => {
  const carriers = SOURCES.filter((p) => /\.js$/.test(p) && /<AppHead \/>/.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p)).sort();
  assert.deepEqual(carriers, ['components/auth/AuthShell.js', 'components/dashboard/DashboardHeader.js', 'pages/onboarding.js']);
  const app = src('components/AppHead.js');
  for (const s of ['rel="manifest" href="/manifest.webmanifest"', 'name="apple-mobile-web-app-capable" content="yes"', 'name="apple-mobile-web-app-status-bar-style" content="default"', 'name="apple-mobile-web-app-title" content="Rentletter"', 'rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png"', 'rel="apple-touch-startup-image"']) assert.ok(app.includes(s), s);
  const doc = src('pages/_document.js'); assert.ok(doc.includes('href="/favicon.ico"') && doc.includes('/icons/favicon-32.png') && doc.includes('/icons/favicon-16.png'));
  const signin = src('pages/signin.js');
  assert.match(signin, /id="email" name="username" type="email" inputMode="email" autoComplete="username"/);
  assert.match(signin, /id="password" name="password" type="password" autoComplete="current-password"/);
});

test('the hint: iOS Safari only, never installed, until dismissed', async () => {
  const { showInstallHint, isIosSafari, INSTALL_HINT_COPY } = await import('../lib/installHint.js');
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
  assert.equal(isIosSafari(IPHONE), true); assert.equal(isIosSafari(IPAD, 5), true); assert.equal(isIosSafari(IPAD, 0), false, 'a Mac');
  for (const ua of [CHROME_IOS, INSTAGRAM, ANDROID]) assert.equal(isIosSafari(ua, 5), false, ua.slice(0, 60));
  assert.equal(showInstallHint({ ua: IPHONE }), true);
  assert.equal(showInstallHint({ ua: IPHONE, standalone: true }), false); assert.equal(showInstallHint({ ua: IPHONE, displayStandalone: true }), false); assert.equal(showInstallHint({ ua: IPHONE, dismissed: true }), false);
  assert.equal(`${INSTALL_HINT_COPY.title} ${INSTALL_HINT_COPY.body}`, 'Add Rentletter to your Home Screen. Tap Share, then Add to Home Screen.');
  assert.equal(SOURCES.filter((p) => /\.js$/.test(p) && /<InstallHint \/>/.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p)).join(), 'components/dashboard/HomeView.js', 'on the dashboard only');
});
