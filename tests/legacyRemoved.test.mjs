// The legacy landlord share system is gone: nothing imports from or calls pages/api/landlord,
// the two live invite routes live under pages/api/invite and are what the apply page and the
// homepage call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => { for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; if (n === 'node_modules' || n === '.next') continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(n)) files.push(p); } };
for (const d of ['pages', 'components', 'lib', 'tests']) walk(`${root}${d}`);

test('nothing references pages/api/landlord, the shortlist page or the download route', () => {
  assert.equal(existsSync(`${root}pages/api/landlord`), false, 'the folder is gone');
  assert.equal(existsSync(`${root}pages/shortlist`), false);
  assert.equal(existsSync(`${root}pages/api/download.js`), false);
  const hits = [];
  for (const f of files) {
    if (f.endsWith('tests/legacyRemoved.test.mjs')) continue;
    const src = readFileSync(f, 'utf8');
    if (/api\/landlord\b|\/shortlist\/\[token\]|api\/download\b|lib\/account['"]/.test(src)) hits.push(f.replace(root, ''));
  }
  assert.deepEqual(hits, []);
});

test('the two live invite routes moved and are what the tenant pages call', () => {
  assert.equal(existsSync(`${root}pages/api/invite/resolve.js`), true);
  assert.equal(existsSync(`${root}pages/api/invite/tag.js`), true);
  const apply = readFileSync(`${root}pages/apply/[token].js`, 'utf8');
  const home = readFileSync(`${root}pages/index.js`, 'utf8');
  for (const src of [apply, home]) { assert.match(src, /\/api\/invite\/resolve\?token=/); assert.match(src, /'\/api\/invite\/tag'/); }
  const resolve = readFileSync(`${root}pages/api/invite/resolve.js`, 'utf8');
  assert.match(resolve, /inviteAnswer\(invite, listing\)/, 'the rented answer from 833ceef is intact');
  assert.match(resolve, /rented: true/);
});
