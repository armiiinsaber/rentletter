// The brand kit (public/brand/kit, built by npm run brand:kit from scripts/brand/kit.mjs):
//   Every file the kit promises is there, matches its manifest entry, and is in the zip.
//   The kit is not older than what it is drawn from: the logo paths, the tokens, the type scale
//   and the fonts (scripts/brand/kitSources.mjs). The build stops on a stale kit too.
//   No PNG drifts from the tokens: solid colours are exactly the token values, edges stay within
//   two levels, and the palette sheet's swatches are the token colours.
//   Every mark pair reads at 3 to 1 or better, or the mark is left out.
//   The copy carries no dash as punctuation and nothing personal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { readPng, interiorColours } from './helpers/png.mjs';
register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const KIT = join(ROOT, 'public/brand/kit');
const manifest = JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8'));
const DIR = join(KIT, manifest.folder);
const file = (p) => readFileSync(join(DIR, p));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const { C } = await import('../components/theme.js');

// WCAG contrast, computed here rather than trusted from the build.
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// What each file is drawn in, from the tokens. ground: the solid ground, or null when transparent.
const LOGOS = {
  primary: { ground: null, colours: [C.ink, C.red] }, reversed: { ground: null, colours: [C.paper, C.red] },
  'mono-ink': { ground: null, colours: [C.ink] }, 'mono-white': { ground: null, colours: [C.card] },
  'on-paper': { ground: C.paper, colours: [C.paper, C.ink, C.red] }, 'on-ink': { ground: C.inst, colours: [C.inst, C.paper, C.red] },
};
const MARKS = {
  realtor: [C.red, C.inst, C.card], admin: [C.inst, C.red, C.instText],
  'realtor-inverted': [C.inst, C.red, C.card], 'admin-inverted': [C.red, C.inst, C.instText],
};
const BARE = { 'bare-ink': [C.ink, C.paper], 'bare-paper': [C.paper, C.inst] };
const SIZES = [1024, 512, 180, 64, 32, 16];

function expectedFiles() {
  const out = ['README.txt'];
  for (const k of Object.keys(LOGOS)) out.push(...['.svg', '.pdf', '-1x.png', '-2x.png', '-4x.png'].map((s) => `logo/rentletter-logo-${k}${s}`));
  for (const [k, [ground, stripe, letter]] of Object.entries(MARKS)) {
    if (contrast(letter, ground) < 3 || contrast(stripe, ground) < 3) continue;
    for (const set of ['square', 'rounded']) out.push(`mark/${set}/rentletter-mark-${k}-${set}.svg`, ...SIZES.map((px) => `mark/${set}/rentletter-mark-${k}-${set}-${px}.png`));
  }
  for (const [k, [colour, ground]] of Object.entries(BARE)) if (contrast(colour, ground) >= 3) out.push(`mark/bare/rentletter-mark-${k}.svg`, ...SIZES.map((px) => `mark/bare/rentletter-mark-${k}-${px}.png`));
  out.push('social/rentletter-profile-realtor-400.png', 'social/rentletter-profile-admin-400.png', 'social/rentletter-og-1200x630.png', 'social/rentletter-email-signature-264x52.png');
  out.push('colour/rentletter-palette.png', 'colour/rentletter-palette.pdf', 'colour/tokens.json', 'colour/tokens.css');
  for (const fam of ['Fraunces', 'Inter']) out.push(`type/${fam}/${fam}-Variable.ttf`, `type/${fam}/${fam}-Variable.woff2`, `type/${fam}/OFL.txt`);
  out.push('type/rentletter-type-specimen.png', 'type/rentletter-type-specimen.pdf', 'guidelines/rentletter-brand-guidelines.pdf');
  return out.sort();
}

test('every kit file is there, matches the manifest and is in the zip', () => {
  const want = expectedFiles();
  assert.deepEqual(manifest.files.map((f) => f.path).sort(), want, 'the manifest lists exactly the kit');
  for (const f of manifest.files) {
    assert.ok(existsSync(join(DIR, f.path)), `${f.path} is missing`);
    const b = file(f.path); assert.equal(b.length, f.size, `${f.path} size`); assert.equal(sha(b), f.sha256, `${f.path} bytes`);
  }
  // The zip: its central directory names every file under the kit folder, each with the right CRC,
  // and each entry inflates to the file's bytes.
  const zip = readFileSync(join(KIT, manifest.zip.path));
  assert.equal(zip.length, manifest.zip.size); assert.equal(sha(zip), manifest.zip.sha256);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10); let off = zip.readUInt32LE(end + 16); const seen = [];
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(off + 10), crc = zip.readUInt32LE(off + 16), csize = zip.readUInt32LE(off + 20), nlen = zip.readUInt16LE(off + 28), local = zip.readUInt32LE(off + 42);
    const name = zip.toString('utf8', off + 46, off + 46 + nlen); seen.push(name);
    const rel = name.slice(manifest.folder.length + 1); const bytes = file(rel);
    assert.equal(crc, crc32(bytes) >>> 0, `${name} CRC`);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28); const body = zip.subarray(start, start + csize);
    assert.ok((method === 8 ? inflateRawSync(body) : body).equals(bytes), `${name} inflates to the file`);
    off += 46 + nlen + zip.readUInt16LE(off + 30) + zip.readUInt16LE(off + 32);
  }
  assert.deepEqual(seen.sort(), want.map((p) => `${manifest.folder}/${p}`));
});

test('the kit is not older than the logo paths, the tokens, the type scale or the fonts', async () => {
  const { kitSources } = await import('../scripts/brand/kitSources.mjs');
  const now = kitSources(ROOT);
  for (const [source, hash] of Object.entries(now)) assert.equal(manifest.sources[source], hash, `${source} changed after the kit was built: run npm run brand:kit`);
  // The build check says the same, and stops the build when it is not so.
  const r = spawnSync(process.execPath, ['scripts/brand/check-kit.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(ROOT, 'package.json'), 'utf8'), /"build": "node scripts\/brand\/check-kit\.mjs && next build"/);
  // The builder's own colour constants are the tokens.
  const draw = await import('../scripts/brand/draw.mjs');
  assert.deepEqual([draw.INK, draw.RED, draw.PAPER, draw.INST, draw.INST_TEXT, draw.WHITE], [C.ink, C.red, C.paper, C.inst, C.instText, C.card]);
});

// Transparent files: every fully opaque pixel is exactly a token colour and every half opaque one
// is within two levels of one. Solid ground files: the solid interior is only token colours, and
// at 64px and up every expected colour is there.
function checkPng(path, { colours, ground, width, height, rounded = false }) {
  const img = readPng(file(path));
  if (width) assert.deepEqual([img.width, img.height], [width, height], `${path} size`);
  const want = colours.map((c) => c.toLowerCase());
  if (!ground) {
    const C3 = want.map(hex);
    for (let i = 0; i < img.rgba.length; i += 4) {
      const a = img.rgba[i + 3]; if (a < 128) continue;
      const d = Math.min(...C3.map((c) => Math.max(Math.abs(c[0] - img.rgba[i]), Math.abs(c[1] - img.rgba[i + 1]), Math.abs(c[2] - img.rgba[i + 2]))));
      assert.ok(a === 255 ? d === 0 : d <= 2, `${path}: pixel ${i / 4} is ${img.rgba.slice(i, i + 3).join(',')} at alpha ${a}`);
    }
    return;
  }
  const found = interiorColours(img);
  for (const c of found) assert.ok(want.includes(c), `${path}: ${c} is not a token in this file`);
  if (img.width >= 64) for (const c of want) assert.ok(found.has(c), `${path}: ${c} is missing`);
  const corner = [...img.rgba.slice(0, 4)];
  if (rounded) assert.equal(corner[3], 0, `${path}: the corner outside the iOS radius is transparent`);
  else assert.equal(`#${corner.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`, ground, `${path}: the ground reaches the corner`);
}

test('no PNG drifts from the tokens', () => {
  for (const [k, L] of Object.entries(LOGOS)) for (const x of [1, 2, 4]) {
    const p = `logo/rentletter-logo-${k}-${x}x.png`; const { width } = readPng(file(p));
    assert.equal(width, 600 * x, `${p} is ${600 * x} wide`);
    checkPng(p, L);
  }
  for (const [k, [ground, stripe, letter]] of Object.entries(MARKS)) for (const set of ['square', 'rounded']) for (const px of SIZES) {
    checkPng(`mark/${set}/rentletter-mark-${k}-${set}-${px}.png`, { colours: [ground, stripe, letter], ground, width: px, height: px, rounded: set === 'rounded' });
  }
  for (const [k, [colour]] of Object.entries(BARE)) for (const px of SIZES) checkPng(`mark/bare/rentletter-mark-${k}-${px}.png`, { colours: [colour], ground: null, width: px, height: px });
  checkPng('social/rentletter-profile-realtor-400.png', { colours: MARKS.realtor, ground: C.red, width: 400, height: 400 });
  checkPng('social/rentletter-profile-admin-400.png', { colours: MARKS.admin, ground: C.inst, width: 400, height: 400 });
  checkPng('social/rentletter-og-1200x630.png', { colours: [C.paper, C.ink, C.red], ground: C.paper, width: 1200, height: 630 });
  checkPng('social/rentletter-email-signature-264x52.png', { colours: [C.ink, C.red], ground: null, width: 264, height: 52 });
  // The kit's realtor mark is the installed icon, byte for byte.
  assert.ok(file('mark/square/rentletter-mark-realtor-square-180.png').equals(readFileSync(join(ROOT, 'public/icons/apple-touch-icon.png'))), 'the 180 is the touch icon');
  assert.ok(file('mark/square/rentletter-mark-realtor-square-32.png').equals(readFileSync(join(ROOT, 'public/icons/favicon-32.png'))), 'the 32 is the favicon');
  assert.ok(file('mark/square/rentletter-mark-realtor-square-16.png').equals(readFileSync(join(ROOT, 'public/icons/favicon-16.png'))), 'the 16 is the favicon');
  // The palette sheet: each swatch, sampled in its middle, is its token; the sheet's ground is paper.
  const sheet = readPng(file(manifest.palette.png)); const k = manifest.palette.scale;
  const at = (x, y) => { const i = (Math.round(y) * sheet.width + Math.round(x)) * 4; return `#${[0, 1, 2].map((j) => sheet.rgba[i + j].toString(16).padStart(2, '0')).join('')}`; };
  assert.equal(at(5, 5), C.paper);
  assert.ok(manifest.palette.swatches.length >= 16);
  for (const s of manifest.palette.swatches) {
    assert.equal(s.hex, C[s.token], `${s.token} on the sheet is the token`);
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.7]]) assert.equal(at((s.x + s.w * fx) * k, (s.y + s.h * fy) * k), C[s.token].toLowerCase(), `${s.token} swatch pixel`);
  }
  const tokens = JSON.parse(file('colour/tokens.json'));
  for (const [t, v] of Object.entries(tokens.colour)) assert.equal(v.hex, C[t], `tokens.json ${t}`);
  const css = file('colour/tokens.css').toString();
  for (const t of Object.keys(tokens.colour)) assert.ok(css.includes(`: ${C[t]};`), `tokens.css ${t}`);
  assert.doesNotMatch(JSON.stringify(tokens), /green|amber|gold/i, 'no status colours in the brand tokens');
});

test('every mark pair reads at 3 to 1 or better, or the mark is left out', () => {
  const name = (h) => Object.keys(C).find((k) => C[k] === h);
  for (const [k, [ground, stripe, letter]] of Object.entries(MARKS)) {
    for (const [pair, fg] of [['R on ground', letter], ['Stripe on ground', stripe]]) {
      const row = manifest.marks.pairs.find((p) => p.mark === k && p.pair === pair);
      assert.ok(row, `${k} ${pair} is reported`);
      assert.equal(row.ratio, Math.round(contrast(fg, ground) * 100) / 100, `${k} ${pair}`);
      assert.equal(row.fg, name(fg)); assert.equal(row.bg, name(ground));
    }
    const kept = contrast(letter, ground) >= 3 && contrast(stripe, ground) >= 3;
    assert.equal(manifest.marks.dropped.includes(k), !kept, `${k} kept only at 3 to 1 or better`);
  }
});

test('the copy carries no dash as punctuation and nothing personal', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const texts = { 'README.txt': file('README.txt').toString() };
  for (const p of ['guidelines/rentletter-brand-guidelines.pdf', 'colour/rentletter-palette.pdf', 'type/rentletter-type-specimen.pdf']) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(file(p)), verbosity: 0 }).promise; let all = '';
    for (let i = 1; i <= doc.numPages; i++) all += `${(await (await doc.getPage(i)).getTextContent()).items.map((t) => t.str).join(' ')}\n`;
    texts[p] = all;
  }
  assert.match(texts['guidelines/rentletter-brand-guidelines.pdf'], /Keep clear space the height of the R/);
  assert.match(texts['guidelines/rentletter-brand-guidelines.pdf'], /Do not stretch it\./);
  for (const [p, t] of Object.entries(texts)) {
    assert.doesNotMatch(t, /[\u2013\u2014]|\s-\s|\s--\s/, `${p}: no dash as punctuation`);
    assert.doesNotMatch(t, /@|\b\d{3}[ .]\d{3}[ .]\d{4}\b/, `${p}: no email address or phone number`);
  }
  for (const g of manifest.groups) for (const it of g.items) for (const s of [it.title, it.note, ...it.rows.map((r) => r.label || '')]) assert.doesNotMatch(s, /[\u2013\u2014]|\s-\s/, `${it.key}: ${s}`);
});

// The licenses are exempt from the copy rules above: each is its project's own file, unedited.
test('each font folder carries its project license, byte for byte as published upstream', () => {
  const UPSTREAM = {
    // undercasetype/Fraunces, OFL.txt at master (commit 284bc5ea73b1)
    Fraunces: { sha256: 'bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b', first: 'Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)' },
    // rsms/inter, LICENSE.txt at master (commit 3ac1bd32a473)
    Inter: { sha256: '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a', first: 'Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)' },
  };
  for (const [fam, up] of Object.entries(UPSTREAM)) {
    const vendored = readFileSync(join(ROOT, `public/fonts/licenses/${fam}-OFL.txt`));
    assert.equal(sha(vendored), up.sha256, `public/fonts/licenses/${fam}-OFL.txt is the upstream file, unedited`);
    const inKit = file(`type/${fam}/OFL.txt`);
    assert.ok(inKit.equals(vendored), `type/${fam}/OFL.txt is copied byte for byte`);
    assert.equal(inKit.toString('utf8').split('\n')[0], up.first, `${fam}: the upstream copyright line`);
  }
});
