// Two house rules, kept by a scan. No green or amber anywhere in components, pages or lib: no colour
// value in those hue ranges (hex, rgb, rgba, hsl, pdf-lib's 0 to 1 rgb), no named colour, no token
// or class name for them, no emoji tick. The one exception is the macOS window buttons in
// components/DeviceFrame.js, a depiction of a real browser. And "verified" only ever means the
// realtor confirmed something themselves: no surface says documents verified anyone, or that
// anything but the realtor verified. docs/audit*.md are dated records of the repository before
// these rules and are not product surfaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (/node_modules|\.next/.test(rel)) continue; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else out.push(rel); } return out; };
const CODE = ['components/', 'pages/', 'lib/'].flatMap((d) => walk(d)).filter((p) => /\.(js|mjs|cjs|jsx|css)$/.test(p));
// A realtor's own brand colours are theirs: the logo generator's prompt may name any colour, and the rule covers Rentletter's interface.
const COLOUR_CODE = CODE.filter((p) => p !== 'pages/api/branding/generate-logo.js');
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

// The window buttons the depiction of a browser keeps: amber and green, DeviceFrame.js only.
const WINDOW_BUTTONS = { 'components/DeviceFrame.js': ['#febc2e', '#28c840'] };

const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn; let h = 0; if (c) { if (mx === r) h = ((g - b) / c) % 6; else if (mx === g) h = (b - r) / c + 2; else h = (r - g) / c + 4; h *= 60; if (h < 0) h += 360; } return { h, c, s: mx ? c / mx : 0 }; };
const hslToRgb = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [255 * f(0), 255 * f(8), 255 * f(4)]; };
// Green: hue 70 to 170 with any visible chroma. Amber: hue 25 to 60, saturated or a tint with
// chroma of 25 or more. The brand's warm neutrals (paper, rule, ink inverse) sit below both.
export function hueClass(r, g, b) {
  const { h, c, s } = hsv(r, g, b);
  if (c >= 4 && h >= 70 && h <= 170) return 'green';
  if (h >= 25 && h <= 60 && (s >= 0.25 || c >= 25)) return 'amber';
  return null;
}
export function colourValues(line) {
  const out = [];
  for (const m of line.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) { let x = m[1]; if (x.length <= 4) x = x.slice(0, 3).split('').map((ch) => ch + ch).join(''); x = x.slice(0, 6); out.push([m[0], parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]); }
  for (const m of line.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g)) { let [r, g, b] = [m[1], m[2], m[3]].map(Number); if (r <= 1 && g <= 1 && b <= 1 && /\./.test(m[0])) { r *= 255; g *= 255; b *= 255; } out.push([m[0], r, g, b]); }
  for (const m of line.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%/g)) out.push([m[0], ...hslToRgb(+m[1], +m[2], +m[3])]);
  return out;
}

test('the classifier: green and amber are caught, the brand palette is not', () => {
  for (const hex of ['#2d7d4a', '#5fbf85', '#eef5f0', '#f0f7f3', '#28c840', '#b07818', '#e0a84a', '#b08d57', '#fff8e1', '#febc2e', '#7a5d12']) { const [[, r, g, b]] = colourValues(hex); assert.ok(hueClass(r, g, b), hex); }
  for (const hex of ['#faf8f3', '#f2eee3', '#e3ddd0', '#d6cfbe', '#c8c2b3', '#e8e4d9', '#8f8b81', '#0f0f10', '#3a3a3c', '#6b6b70', '#d72027', '#a8161c', '#fdf0ef', '#101012', '#ff5a5f', '#1f3a5f', '#ffffff']) { const [[, r, g, b]] = colourValues(hex); assert.equal(hueClass(r, g, b), null, hex); }
  const [[, r, g, b]] = colourValues('rgb(0.176, 0.490, 0.290)'); assert.equal(hueClass(r, g, b), 'green', 'pdf-lib floats');
  const [[, r2, g2, b2]] = colourValues('hsl(140, 45%, 40%)'); assert.equal(hueClass(r2, g2, b2), 'green');
});

test('no green or amber colour value in components, pages or lib, outside the window buttons', () => {
  const hits = [];
  for (const file of COLOUR_CODE) {
    read(file).split('\n').forEach((line, i) => {
      for (const [raw, r, g, b] of colourValues(line)) {
        if ((WINDOW_BUTTONS[file] || []).includes(raw.toLowerCase())) continue;
        const k = hueClass(r, g, b); if (k) hits.push(`${file}:${i + 1} ${raw} (${k})`);
      }
    });
  }
  assert.deepEqual(hits, []);
  assert.ok(CODE.length > 300, `${CODE.length} files scanned`);
});

test('no green, amber or gold by name: no token, no class, no named colour, no emoji tick', () => {
  const hits = [];
  for (const file of COLOUR_CODE) {
    const code = stripComments(read(file));
    code.split('\n').forEach((line, i) => {
      // An RGB channel read (luminance math: c.red, c.green, c.blue on one line) is not a colour.
      const channels = /\.red\b/.test(line) && /\.green\b/.test(line) && /\.blue\b/.test(line);
      const m = line.match(/\b(green|greenTint|amber|amberTint|gold|instGreen|instAmber|lime|olive|chartreuse|goldenrod|orange|yellow|emerald)\b/i);
      if (m && !channels) hits.push(`${file}:${i + 1} ${m[0]}`);
      const t = line.match(/\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:green|emerald|lime|amber|yellow|orange)-\d{2,3}\b/);
      if (t) hits.push(`${file}:${i + 1} ${t[0]}`);
      if (/C\.verified\b/.test(line)) hits.push(`${file}:${i + 1} C.verified`);
    });
    const tick = read(file).match(/[✅✔☑]|\u{1F7E2}|\u{1F7E1}|\u{1F7E0}|\u{1F7E9}|\u{1F7E8}|\u{1F49A}|\u{1F49B}/u);
    if (tick) hits.push(`${file}: emoji tick ${tick[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('"verified" is the realtor\'s word: no surface says documents or anything else verified a person', () => {
  const surfaces = [...CODE, ...walk('docs/').filter((p) => /\.md$/.test(p) && !/docs\/audit/.test(p)), ...walk('public/').filter((p) => /\.(html|json|txt|webmanifest|svg|md)$/.test(p))];
  const PHRASES = [
    /\bdocuments? (?:were |are |have been )?verified\b/i,
    /\bdocument verification\b/i,
    /\bverified against\b/i,
    /\bemployment verified\b/i,
    /\bverification (?:summary|confirmation)\b/i,
    /\breceived (?:&|and) verified\b/i,
    /\bverified by (?!you\b|\{who\}|\$\{)/i,
    /\bdocuments did not verify\b/i,
    /\bedited (?:their profile )?after verification\b/i,
  ];
  const hits = [];
  for (const file of surfaces) {
    read(file).split('\n').forEach((line, i) => { for (const re of PHRASES) { const m = line.match(re); if (m) hits.push(`${file}:${i + 1} "${m[0]}"`); } });
  }
  assert.deepEqual(hits, []);
  // The label map keeps the one correct use: the realtor's own confirmation.
  assert.match(read('lib/stateLabels.js'), /line: 'Verified by \{who\}'/);
});
