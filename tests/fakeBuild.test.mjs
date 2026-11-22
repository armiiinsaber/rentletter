// tests/helpers/fakeBuild.mjs: under a run the walks share one production build, named for the run
// and for what the build takes from the environment; outside a run each walk builds its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, globSync } from 'node:fs';

const { sharedBuildDir } = await import('./helpers/fakeBuild.mjs');

test('one shared build a run, a different one for a different setting, none outside a run', () => {
  const saved = process.env.BILLING_OFF;
  try {
    assert.equal(sharedBuildDir(''), null, 'outside a run: the walk builds its own folder');
    const a = sharedBuildDir('run-123');
    assert.match(a, /^\.next-fake-shared-run-123-[0-9a-f]{12}$/, 'under .next-fake-*, so the run can clear it');
    assert.equal(sharedBuildDir('run-123'), a, 'the same run and setting: the same build');
    assert.notEqual(sharedBuildDir('run-124'), a, 'another run never takes it');
    process.env.BILLING_OFF = saved === 'false' ? 'true' : 'false';
    assert.notEqual(sharedBuildDir('run-123'), a, 'a build with billing set another way is another build');
  } finally { if (saved === undefined) delete process.env.BILLING_OFF; else process.env.BILLING_OFF = saved; }
});

test('every walk that serves a production fake stack builds through it, and none on its own', () => {
  const walks = globSync('tests/routes/*Webkit.test.mjs').filter((f) => /fakeNextServer\.mjs', String\(PORT\), 'prod'/.test(readFileSync(f, 'utf8')));
  assert.ok(walks.length >= 9, `the production walks (${walks.length})`);
  for (const f of walks) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /await fakeBuild\(PORT\);/, `${f} builds through the shared build`);
    assert.doesNotMatch(src, /'build'\]/, `${f} runs no next build of its own`);
  }
});

test('no production walk lets a request reach a supabase.co host, and the walks moved to the build check it', () => {
  // The build inlines the Supabase address, so a browser call (the reset page's verifyOtp) would
  // leave the machine for a real supabase.co host with a dummy key (tests/helpers/noSupabase.mjs).
  const walks = globSync('tests/routes/*Webkit.test.mjs').filter((f) => /fakeNextServer\.mjs', String\(PORT\), 'prod'/.test(readFileSync(f, 'utf8')));
  for (const f of walks) assert.match(readFileSync(f, 'utf8'), /blockSupabase\(|\.route\(\/(?:fake\\\.supabase\\\.co\|)?supabase\\\.co\\\/\/, \(r\) => r\.abort\(\)\)/, `${f} stops supabase.co in the browser`);
  // The thirteen walks chore/faster-walks moved to the build: each context is guarded and checked.
  const moved = ['dashboard', 'apply', 'home', 'wordmark', 'reset', 'shell', 'reconsider', 'logo', 'app', 'native', 'taps', 'zoom', 'pills'];
  for (const w of moved) assert.ok(walks.includes(`tests/routes/${w}Webkit.test.mjs`), `${w} serves the production build`);
  for (const w of moved.filter((x) => x !== 'native' && x !== 'taps')) {
    const src = readFileSync(`tests/routes/${w}Webkit.test.mjs`, 'utf8');
    const opened = (src.match(/browser\.newContext\(/g) || []).length;
    assert.ok(opened >= 1 && (src.match(/await blockSupabase\(/g) || []).length >= opened, `${w}: every context it opens stops supabase.co`);
    assert.ok((src.match(/noSupabaseLeft\(/g) || []).length >= 1, `${w}: and checks that no request left for it`);
  }
});
