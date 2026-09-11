// One dev server shared by the browser walk files. node --test runs files in parallel and two
// `next dev` processes on the same .next directory fight each other, so the first file to take the
// lock starts the server and every other file just uses it. The owner stops the server in its
// after hook once no other file is still using it. A server already answering on the port is
// reused and left alone.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync, readdirSync, existsSync, rmSync } from 'node:fs';

export const PORT = 3123;
export const BASE = `http://localhost:${PORT}`;
const LOCK = `/tmp/rentletter-dev-${PORT}.lock`;
const USERS = `/tmp/rentletter-dev-${PORT}.users`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = () => { try { return execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };

export function devServer(probeUrl) {
  const up = () => fetch(probeUrl).then((r) => r.ok).catch(() => false);
  let child = null, owner = false;
  const me = `${USERS}/${process.pid}`;
  return {
    async start() {
      if (await up()) return;
      mkdirSync(USERS, { recursive: true });
      writeFileSync(me, String(Date.now()));
      try { closeSync(openSync(LOCK, 'wx')); owner = true; } catch (e) { owner = false; }
      if (owner) child = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore', detached: true });
      const t0 = Date.now();
      while (Date.now() - t0 < 150000 && !(await up())) await sleep(1000);
    },
    async stop() {
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
