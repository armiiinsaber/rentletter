// The public homepage on large screens (pages/index.js): below 1440 every section keeps the width and
// the type it had; from 1440, 1920 and 2560 the grid widens and the type steps up; Pricing sits beside
// its question and the tenant's card beside its field from 1100; reading text keeps near 70
// characters a line. The walk at 1440, 1920 and 2560 is the wrapped text walk (tests/typeset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const s = readFileSync(new URL('../pages/index.js', import.meta.url), 'utf8');

test('below 1440 the widths and sizes are the ones the sections had', () => {
  assert.match(s, /\.lp-w \{ max-width: 1100px; margin-left: auto; margin-right: auto; \}/);
  assert.match(s, /\.lp-w-wide \{ max-width: 1200px;/);
  assert.match(s, /\.lp-w-fit \{ max-width: 880px;/);
  assert.match(s, /\.lp-hero-grid \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 420px\), 1fr\)\); gap: clamp\(28px, 4vw, 64px\); align-items: center; \}/);
  assert.match(s, /\.lp-sub \{ font-size: clamp\(17px, 1\.8vw, 20px\); max-width: 520px; \}/);
  assert.match(s, /\.lp-h2-a \{ font-size: clamp\(28px, 4vw, 44px\); \}/);
  assert.match(s, /\.lp-steps \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(230px, 1fr\)\); gap: clamp\(20px, 3vw, 36px\); \}/);
  assert.doesNotMatch(s, /maxWidth: 1100, margin: '0 auto'/, 'no section width left inline, where a class could not widen it');
});

test('from 1440, 1920 and 2560 the grid widens and the type steps up', () => {
  for (const [w, max] of [[1440, 1240], [1920, 1560], [2560, 1960]]) assert.match(s, new RegExp(`@media \\(min-width: ${w}px\\) \\{\\s*\\.lp-w \\{ max-width: ${max}px; \\}`), `${w}`);
  assert.match(s, /@media \(min-width: 1920px\) \{ \.lp-h1 \{ font-size: clamp\(24px, 9\.2cqi, 96px\); \} \}/);
  assert.match(s, /\.lp-body \{ font-size: var\(--t-body\); max-width: 70ch; \}/, 'reading text near 70 characters');
  assert.match(s, /@media \(min-width: 1100px\) \{\s*\.lp-pricing \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/, 'Pricing beside its question');
  assert.match(s, /grid-template-areas: 'head ctrl' 'head note';/, 'the tenant card side by side');
});
