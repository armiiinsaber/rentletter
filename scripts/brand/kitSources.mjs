// scripts/brand/kitSources.mjs
// What the brand kit is drawn from, as hashes. The kit build (scripts/brand/kit.mjs) writes them
// into public/brand/kit/manifest.json; the build check (scripts/brand/check-kit.mjs) and the test
// (tests/brandKit.test.mjs) compute them again, and a difference means the kit is older than its
// source. Code files are hashed without their comments and spacing, so a comment edit does not
// make the kit stale; the type scale is read from the one line that sets it in components/ui.js.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');
export const codeOnly = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\s+/g, ' ').trim();

// The type scale line in components/ui.js: --t-d1 28px through --t-eyebrow 11px.
export function typeScale(root) {
  const ui = readFileSync(join(root, 'components/ui.js'), 'utf8');
  const line = ui.match(/--t-d1:[^\n]*--t-eyebrow:\s*\d+px;/);
  if (!line) throw new Error('The type scale line (--t-d1 to --t-eyebrow) is missing from components/ui.js.');
  return Object.fromEntries([...line[0].matchAll(/--t-([a-z0-9-]+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]));
}

export const SOURCE_FILES = Object.freeze([
  ['lib/brand/logoPaths.js', 'code'],
  ['components/theme.js', 'code'],
  ['public/fonts/fraunces-latin.woff2', 'bytes'],
  ['public/fonts/inter-latin.woff2', 'bytes'],
  ['public/fonts/licenses/Fraunces-OFL.txt', 'bytes'],
  ['public/fonts/licenses/Inter-OFL.txt', 'bytes'],
]);

export function kitSources(root) {
  const out = {};
  for (const [p, kind] of SOURCE_FILES) { const b = readFileSync(join(root, p)); out[p] = sha(kind === 'code' ? codeOnly(b.toString('utf8')) : b); }
  out['components/ui.js type scale'] = sha(JSON.stringify(typeScale(root)));
  return out;
}
