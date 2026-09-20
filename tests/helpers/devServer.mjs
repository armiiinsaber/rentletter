// One dev server shared by the browser walk files. node --test runs files in parallel and two
// `next dev` processes on the same .next directory fight each other, so the first file to take the
// lock starts the server and every other file just uses it. The owner stops the server in its
// after hook once no other file is still using it. A server already answering on the port is
// reused and left alone.
//
// The walk files take turns: one walks while the others wait in their before hook. Five walks at
// once make the dev server drop and recompile routes under each other, the pages reload mid walk,
// and a tap or a timing check is lost. One at a time is how they pass when run alone.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync, readdirSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs';

export const PORT = 3123;
export const BASE = `http://localhost:${PORT}`;
const LOCK = `/tmp/rentletter-dev-${PORT}.lock`;
const USERS = `/tmp/rentletter-dev-${PORT}.users`;
const TURN = `/tmp/rentletter-dev-${PORT}.turn`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = () => { try { return execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };

// The turn: a directory (mkdir is atomic) holding the walker's pid. A turn whose holder is no
// longer running (a run that was killed) is cleared and taken.
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
export async function takeTurn(turn = TURN) {
  for (;;) {
    try { mkdirSync(turn); writeFileSync(`${turn}/pid`, String(process.pid)); return; } catch (e) { /* someone else is walking */ }
    let holder = 0; let age = 0;
    try { holder = Number(readFileSync(`${turn}/pid`, 'utf8')) || 0; } catch (e) { holder = 0; }
    try { age = Date.now() - statSync(turn).mtimeMs; } catch (e) { age = 0; }
    if ((holder && !running(holder)) || (!holder && age > 5000)) { try { rmSync(turn, { recursive: true, force: true }); } catch (e) { /* taken by another waiter */ } continue; }
    await sleep(500);
  }
}
export function giveTurn(turn = TURN) {
  try { if (Number(readFileSync(`${turn}/pid`, 'utf8')) === process.pid) rmSync(turn, { recursive: true, force: true }); } catch (e) { /* not ours, or already gone */ }
}

export function devServer(probeUrl) {
  const up = () => fetch(probeUrl).then((r) => r.ok).catch(() => false);
  let child = null, owner = false;
  const me = `${USERS}/${process.pid}`;
  return {
    async start() {
      await takeTurn();
      // Register before looking: a file that finds the server already answering still counts as
      // a user, or the owner could take the server down in the middle of that file's walk.
      mkdirSync(USERS, { recursive: true });
      writeFileSync(me, String(Date.now()));
      if (await up()) return;
      try { closeSync(openSync(LOCK, 'wx')); owner = true; } catch (e) { owner = false; }
      if (owner) child = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true });
      const t0 = Date.now();
      while (Date.now() - t0 < 150000 && !(await up())) await sleep(1000);
    },
    async stop() {
      giveTurn();
      try { unlinkSync(me); } catch (e) { /* never written */ }
      if (!owner) return;
      // Wait for the other files to finish with the server, then take it down: the process group
      // first, then whatever still listens on the port (Next runs its server in a child of its own).
      const t0 = Date.now();
      while (Date.now() - t0 < 240000 && existsSync(USERS) && readdirSync(USERS).length) await sleep(500);
      if (child) { try { process.kill(-child.pid); } catch (e) { /* already gone */ } }
      for (const pid of listeners()) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* already gone */ } }
      try { unlinkSync(LOCK); } catch (e) { /* already gone */ }
      try { rmSync(USERS, { recursive: true, force: true }); } catch (e) { /* already gone */ }
    },
  };
}
