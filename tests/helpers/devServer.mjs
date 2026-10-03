// One dev server shared by the browser walk files. node --test runs files in parallel and two
// `next dev` processes on the same .next directory fight each other, so the first file to take the
// lock starts the server and every other file just uses it. The owner stops the server in its
// after hook once no other file is still using it. A server already answering on the port is
// reused and left alone.
//
// The walk files take turns: one walks while the others wait in their before hook. Five walks at
// once make the dev server drop and recompile routes under each other, the pages reload mid walk,
// and a tap or a timing check is lost. One at a time is how they pass when run alone.
//
// A walk never waits silently. A file that holds the turn longer than WALK_LIMIT is stuck: the
// helper prints the file and the step it was in, takes down the dev server it started, gives the
// turn back and ends the file, which fails. Waiting in line for the turn is not counted; the whole
// run has its own ceiling (scripts/test-run.mjs). And a file whose after hook has run (its before
// hook timed out while it waited in line) never takes the turn afterwards: before this, such a file
// took the turn later, started the server, and held both forever, so every walk behind it waited.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync, readdirSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { beforeEach, afterEach } from 'node:test';

export const PORT = 3123;
export const BASE = `http://localhost:${PORT}`;
// A file's own walk: from taking the turn to giving it back. Five minutes (WALK_LIMIT_MS overrides).
export const WALK_LIMIT = Number(process.env.WALK_LIMIT_MS || 5 * 60 * 1000);
// The whole run's ceiling (scripts/test-run.mjs, TEST_CEILING_MS overrides). A file waits in its
// before hook for its turn behind every other walk, so its hook allows the whole run; the owner
// waits as long for the other files before it takes the server down.
export const RUN_CEILING = Number(process.env.TEST_CEILING_MS || 20 * 60 * 1000);
export const STOP_WAIT = RUN_CEILING;
export const STOP_TIMEOUT = STOP_WAIT + 60000;
export const START_TIMEOUT = RUN_CEILING + 60000;
const LOCK = `/tmp/rentletter-dev-${PORT}.lock`;
const USERS = `/tmp/rentletter-dev-${PORT}.users`;
const TURN = `/tmp/rentletter-dev-${PORT}.turn`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = () => { try { return execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };

// What the file is doing, for the line printed when it is stuck: the helper's own steps, and the
// test running (node:test hooks on the file's root, in a test file only).
let step = 'waiting for the walk turn';
export const walkStep = (text) => { step = text; };
if (process.env.NODE_TEST_CONTEXT) {
  beforeEach((t) => { step = `the test "${t.name}"`; });
  afterEach((t) => { step = `the end of the test "${t.name}"`; });
}
// What a stuck file takes down with it: the dev server it started, and so on (devServer, adminServer).
const cleanups = new Set();
export const onStuck = (fn) => { cleanups.add(fn); return () => cleanups.delete(fn); };
// Set when the file's after hook has run: from then on it never takes the turn.
let leaving = false;
export const leaveTurn = () => { leaving = true; };

// The turn: a directory (mkdir is atomic) holding the walker's pid. A turn whose holder is no
// longer running (a run that was killed) is cleared and taken. Returns false, without the turn,
// once the file is leaving. Holding it arms the watch: past WALK_LIMIT the file is stuck.
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
let watch = null;
function arm(turn) {
  clearTimeout(watch);
  if (!(WALK_LIMIT > 0)) return;
  const since = Date.now();
  watch = setTimeout(() => {
    const file = relative(new URL('../..', import.meta.url).pathname, process.argv[1] || '') || 'a walk file';
    console.error(`\n[walk] ${file} held the walk turn for ${Math.round((Date.now() - since) / 1000)}s, past the ${Math.round(WALK_LIMIT / 1000)}s limit, stuck in ${step}. Its dev server is taken down, the turn is given back, and the file ends.`);
    for (const fn of cleanups) { try { fn(); } catch (e) { /* best effort */ } }
    giveTurn(turn);
    process.exit(1);
  }, WALK_LIMIT);
}
export async function takeTurn(turn = TURN) {
  for (;;) {
    if (leaving) return false;
    try { mkdirSync(turn); writeFileSync(`${turn}/pid`, String(process.pid)); arm(turn); step = 'the before hook, with the turn'; return true; } catch (e) { /* someone else is walking */ }
    let holder = 0; let age = 0;
    try { holder = Number(readFileSync(`${turn}/pid`, 'utf8')) || 0; } catch (e) { holder = 0; }
    try { age = Date.now() - statSync(turn).mtimeMs; } catch (e) { age = 0; }
    if ((holder && !running(holder)) || (!holder && age > 5000)) { try { rmSync(turn, { recursive: true, force: true }); } catch (e) { /* taken by another waiter */ } continue; }
    await sleep(500);
  }
}
export function giveTurn(turn = TURN) {
  try { if (Number(readFileSync(`${turn}/pid`, 'utf8')) === process.pid) { rmSync(turn, { recursive: true, force: true }); clearTimeout(watch); watch = null; } } catch (e) { /* not ours, or already gone */ }
}

export function devServer(probeUrl) {
  // A request the server accepts and never answers counts as down, never as a wait.
  const up = () => fetch(probeUrl, { signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false);
  let child = null, owner = false;
  const me = `${USERS}/${process.pid}`;
  return {
    async start() {
      // Register first, before waiting for a turn and before looking for the server: a file that
      // is still waiting, or that finds the server already answering, counts as a user, or the
      // owner could take the server down before that file's walk has run.
      mkdirSync(USERS, { recursive: true });
      writeFileSync(me, String(Date.now()));
      if (!(await takeTurn())) return; // the file is leaving: its hook already gave up
      walkStep('starting the dev server');
      if (await up()) return;
      try { closeSync(openSync(LOCK, 'wx')); owner = true; } catch (e) { owner = false; }
      if (owner) {
        child = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true });
        onStuck(() => { try { process.kill(-child.pid); } catch (e) { /* gone */ } for (const pid of listeners()) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } } try { unlinkSync(LOCK); } catch (e) { /* gone */ } });
      }
      onStuck(() => { try { unlinkSync(me); } catch (e) { /* gone */ } });
      const t0 = Date.now();
      while (Date.now() - t0 < 150000 && !(await up())) await sleep(1000);
    },
    async stop() {
      leaveTurn();
      giveTurn();
      try { unlinkSync(me); } catch (e) { /* never written */ }
      if (!owner) return;
      // Wait for the other files to finish with the server, then take it down: the process group
      // first, then whatever still listens on the port (Next runs its server in a child of its own).
      // A user whose process is gone (a run that was killed) is dropped, so only live walks are waited
      // for. The cap covers every walk file in turn (tests/routes/zoomWebkit.test.mjs alone walks about
      // five minutes); each file's after hook allows the same (STOP_TIMEOUT).
      const t0 = Date.now();
      const live = () => { if (!existsSync(USERS)) return 0; let n = 0; for (const f of readdirSync(USERS)) { if (running(Number(f))) n++; else { try { unlinkSync(`${USERS}/${f}`); } catch (e) { /* gone */ } } } return n; };
      while (Date.now() - t0 < STOP_WAIT && live()) await sleep(500);
      if (child) { try { process.kill(-child.pid); } catch (e) { /* already gone */ } }
      for (const pid of listeners()) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already gone */ } }
      try { unlinkSync(LOCK); } catch (e) { /* already gone */ }
      try { rmSync(USERS, { recursive: true, force: true }); } catch (e) { /* already gone */ }
    },
  };
}
