// The walks stop every server they start, whichever way a walk ends (tests/helpers/reap.mjs):
// a stand in walk starts a server the way the walks do (detached, in a group of its own, with a
// child of its own, as Next runs its server) and then ends by process.exit (the walk limit), an
// uncaught error, an unhandled rejection, SIGTERM, SIGINT or SIGHUP: the server and its child are
// gone. Killed outright (SIGKILL, the run's ceiling) the walk runs no hook, and the run's end
// (reapRun, scripts/test-run.mjs) takes the server down. A process that only took a written down
// number later is never touched. And every walk server is written down, and the runner reaps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { reapRun, runFolder } from './helpers/reap.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const REAP = new URL('./helpers/reap.mjs', import.meta.url).href;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
const group = (pgid) => { try { return execSync(`pgrep -g ${Number(pgid)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
const until = async (ok, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (ok()) return true; await new Promise((r) => setTimeout(r, 50)); } return ok(); };

const WALK = `
import { spawn } from 'node:child_process';
import { reap } from ${JSON.stringify(REAP)};
const inner = "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)";
const server = spawn(process.execPath, ['-e', inner], { stdio: 'ignore', detached: true }); reap(server, 'a stand in server');
process.stdout.write(server.pid + '\\n');
const how = process.argv[1];
setTimeout(() => {
  if (how === 'exit') process.exit(1);
  if (how === 'throw') throw new Error('the walk failed');
  if (how === 'reject') Promise.reject(new Error('the walk failed'));
}, 400);
setInterval(() => {}, 1000);
`;
// Starts the stand in walk under its own run; resolves once its server and the server's child are up.
async function standIn(how, run) {
  const walk = spawn(process.execPath, ['--input-type=module', '-e', WALK, how], { cwd: ROOT, env: { ...process.env, RENTLETTER_RUN: run }, stdio: ['ignore', 'pipe', 'ignore'] });
  const pid = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('the stand in did not start')), 10000); walk.stdout.once('data', (d) => { clearTimeout(t); res(Number(String(d).trim())); }); });
  assert.ok(await until(() => group(pid).length >= 2), `${how}: the server and its child are up`);
  return { walk, pid };
}

for (const how of ['exit', 'throw', 'reject', 'SIGTERM', 'SIGINT', 'SIGHUP']) {
  test(`a walk that ends by ${how} takes its server down with it`, async () => {
    const run = `test-reap-${process.pid}-${how}`;
    const { walk, pid } = await standIn(how, run);
    if (how.startsWith('SIG')) walk.kill(how);
    await new Promise((res) => walk.once('exit', res));
    assert.ok(await until(() => group(pid).length === 0), `${how}: no process of the server's group is left (${group(pid)})`);
    assert.deepEqual(existsSync(runFolder(run)) ? readdirSync(runFolder(run)) : [], [], `${how}: nothing is left written down`);
    reapRun(run);
  });
}

test('a walk killed outright leaves its server to the end of the run, which takes it down', async () => {
  const run = `test-reap-${process.pid}-kill`;
  const { walk, pid } = await standIn('SIGKILL', run);
  walk.kill('SIGKILL');
  await new Promise((res) => walk.once('exit', res));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(alive(pid), 'no hook ran: the server is still up');
  assert.deepEqual(reapRun(run), [pid], 'the end of the run takes it down');
  assert.ok(await until(() => group(pid).length === 0), 'and its child with it');
  assert.equal(existsSync(runFolder(run)), false, 'the run folder goes');
});

test('a process that only took a written down number later is never touched', async () => {
  const run = `test-reap-${process.pid}-reused`;
  const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await until(() => alive(other.pid));
  mkdirSync(runFolder(run), { recursive: true });
  writeFileSync(`${runFolder(run)}/${other.pid}`, JSON.stringify({ pid: other.pid, started: 'Mon Jan  1 00:00:00 2001', what: 'a server long gone' }));
  assert.deepEqual(reapRun(run), []);
  assert.ok(alive(other.pid), 'the other process runs on');
  other.kill('SIGKILL');
});

test('every server a walk starts is written down, and the runner reaps its run however it ends', () => {
  const files = [...readdirSync(`${ROOT}tests/routes`).filter((f) => /Webkit\.test\.mjs$/.test(f)).map((f) => `tests/routes/${f}`), 'tests/helpers/devServer.mjs', 'tests/helpers/adminServer.mjs'];
  const missing = [];
  for (const f of files) {
    const src = readFileSync(`${ROOT}${f}`, 'utf8');
    for (const line of src.split('\n')) {
      const m = line.match(/^\s*([\w.]+) = spawn\(.*detached: true/);
      if (m && !line.includes(`reap(${m[1]},`)) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
  const runner = readFileSync(`${ROOT}scripts/test-run.mjs`, 'utf8');
  assert.match(runner, /RENTLETTER_RUN: RUN/, 'the run names itself to its walks');
  assert.match(runner, /const end = \(code\) => \{[^\n]*reapRun\(RUN\);/, 'the ceiling and a signal reap the run');
  assert.match(runner, /child\.on\('exit', \(code, signal\) => \{[^\n]*reapRun\(RUN\);/, 'and so does a run that ends by itself');
});
