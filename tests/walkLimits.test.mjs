// A walk never waits silently (tests/helpers/devServer.mjs, scripts/test-run.mjs). Proved with real
// processes on locks of their own:
//   1. A file whose before hook timed out while it waited in line runs its after hook and never takes
//      the turn afterwards. (Before, it took the turn later, started the dev server and held both
//      forever: npm test hung behind it.)
//   2. A file that holds the turn past the walk limit is stopped: it prints the step it was stuck in,
//      gives the turn back, takes its server down and fails.
//   3. A run past its ceiling is stopped, names the file still running, and fails.
//   4. npm test is the unit and route tests; the browser walks run on their own, one engine a run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const helper = fileURLToPath(new URL('./helpers/devServer.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A child process: its exit code, its output, and how long it took.
const run = (args, env = {}, cwd = ROOT) => new Promise((resolve) => {
  const t0 = Date.now(); let out = '';
  // A run of its own: without this run's NODE_TEST_CONTEXT, which would make it report to us.
  const childEnv = { ...process.env, ...env }; delete childEnv.NODE_TEST_CONTEXT;
  const c = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  const killer = setTimeout(() => c.kill('SIGKILL'), 30000);
  c.on('exit', (code, signal) => { clearTimeout(killer); resolve({ code, signal, out, ms: Date.now() - t0 }); });
});

test('a file whose hook gave up while it waited in line never takes the turn afterwards', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl-walk-')); const turn = join(dir, 'turn'); const taken = join(dir, 'taken');
  mkdirSync(turn); writeFileSync(join(turn, 'pid'), String(process.pid)); // another walk holds the turn
  const file = join(dir, 'late.test.mjs');
  writeFileSync(file, `
    import { test, before, after } from 'node:test';
    import { writeFileSync } from 'node:fs';
    import { takeTurn, leaveTurn } from ${JSON.stringify(helper)};
    before(async () => { if (await takeTurn(${JSON.stringify(turn)})) writeFileSync(${JSON.stringify(taken)}, 'taken'); }, { timeout: 400 });
    after(() => leaveTurn());
    test('a walk', () => {});
  `);
  const child = run(['--test', file]);
  await sleep(1500);
  rmSync(turn, { recursive: true, force: true }); // the walk ahead finishes
  const r = await child;
  assert.notEqual(r.code, 0, 'its hook timed out: the file fails');
  assert.ok(r.ms < 10000, `it ends instead of waiting (${r.ms}ms)`);
  await sleep(1200);
  assert.equal(existsSync(taken), false, 'it never took the turn');
  assert.equal(existsSync(turn), false, 'nobody holds the turn');
  rmSync(dir, { recursive: true, force: true });
});

test('a file that holds the turn past the walk limit is stopped, says where, and gives the turn back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl-walk-')); const turn = join(dir, 'turn'); const cleaned = join(dir, 'cleaned');
  const r = await run(['--input-type=module', '-e', `
    import { writeFileSync } from 'node:fs';
    import { takeTurn, walkStep, onStuck } from ${JSON.stringify(helper)};
    await takeTurn(${JSON.stringify(turn)});
    onStuck(() => writeFileSync(${JSON.stringify(cleaned)}, 'down'));
    walkStep('tapping the listing card');
    setInterval(() => {}, 1000); // stuck
  `], { WALK_LIMIT_MS: '1000' });
  assert.equal(r.code, 1, 'the file fails');
  assert.ok(r.ms < 8000, `within the limit and a little (${r.ms}ms)`);
  assert.match(r.out, /\[walk\] .* held the walk turn for 1s, past the 1s limit, stuck in tapping the listing card\./, r.out);
  assert.equal(existsSync(turn), false, 'the turn is given back');
  assert.equal(existsSync(cleaned), true, 'its server is taken down');
  rmSync(dir, { recursive: true, force: true });
});

test('a run past its ceiling is stopped and names the file still running', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl-walk-')); const file = join(dir, 'forever.test.mjs');
  writeFileSync(file, "import { test } from 'node:test';\ntest('never ends', () => new Promise(() => { setInterval(() => {}, 1000); }));\n");
  const r = await run([join(ROOT, 'scripts/test-run.mjs'), file], { TEST_CEILING_MS: '2500', TEST_RUN_CLEAR: 'none' });
  assert.equal(r.code, 1, 'the run fails');
  assert.ok(r.ms < 12000, `at the ceiling (${r.ms}ms)`);
  assert.match(r.out, /\[test-run\] the run passed its 3 second ceiling and was stopped\. Still running: .*forever\.test\.mjs/, r.out);
  rmSync(dir, { recursive: true, force: true });
});

test('npm test leaves the browser walks to their own runs, each under the ceiling', () => {
  const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(scripts.test, 'node scripts/test-run.mjs --no-walks "tests/**/*.test.mjs"');
  assert.equal(scripts['test:webkit'], 'node scripts/test-run.mjs --test-name-pattern=WebKit "tests/routes/*Webkit.test.mjs"');
  assert.equal(scripts['test:chrome'], 'node scripts/test-run.mjs --test-name-pattern=Chrome "tests/routes/*Webkit.test.mjs"');
  // The split holds only while every browser walk is a *Webkit.test.mjs file and nothing else drives a browser.
  const files = readdirSync(join(ROOT, 'tests/routes')).filter((f) => f.endsWith('.test.mjs'));
  for (const f of files) {
    const browser = /playwright|helpers\/browsers\.mjs/.test(readFileSync(join(ROOT, 'tests/routes', f), 'utf8'));
    assert.equal(browser, /Webkit\.test\.mjs$/.test(f), `${f}: a browser walk exactly when named *Webkit.test.mjs`);
  }
});
