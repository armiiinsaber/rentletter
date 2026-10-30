// tests/helpers/reap.mjs
// Every server a walk starts goes when the walk goes, whichever way the walk ends:
//   its after hook, as before (each walk file), or a walk stuck past its limit (devServer.mjs);
//   any end its own process sees: a failed walk, process.exit, an uncaught error, SIGINT, SIGTERM
//   or SIGHUP (the exit hook below takes down every server it started);
//   a walk killed outright, where no hook runs (the run's ceiling kills the run with SIGKILL):
//   each server is written down under its run's folder, and scripts/test-run.mjs takes down every
//   server still written there when the run ends, however it ends (reapRun).
// Only servers a walk started are written down: a server already running that a walk reuses is
// never touched. A server is taken down only while it is the process that was written down (its
// start time matches), never another process that took its number later.
import { mkdirSync, writeFileSync, unlinkSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const REAP_ROOT = '/tmp/rentletter-walk-servers';
// The run a walk belongs to: scripts/test-run.mjs names it; a walk run by node --test alone is loose.
export const runFolder = (run = process.env.RENTLETTER_RUN || 'loose') => `${REAP_ROOT}/${run}`;
const startedAt = (pid) => { try { return execSync(`ps -o lstart= -p ${Number(pid)}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
// The whole group first (a server runs its own children, Next its server), then the process.
const takeDown = (pid) => { try { process.kill(-pid, 'SIGKILL'); } catch (e) { /* not a group, or gone */ } try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } };

const mine = new Map(); // pid -> { file, started }
// Every end this process sees takes down every server it started. Signals end it with the usual
// code, after the exit hook has run. Installed with the first server, never on import: the runner
// (scripts/test-run.mjs) imports reapRun and keeps its own signal handling.
let hooked = false;
const hook = () => {
  if (hooked) return; hooked = true;
  process.once('exit', () => { for (const [pid, { file, started }] of mine) { if (started && startedAt(pid) === started) takeDown(pid); try { unlinkSync(file); } catch (e) { /* gone */ } } mine.clear(); });
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.once(sig, () => process.exit(code));
};
export function reap(child, what = '') {
  if (!child || !child.pid) return () => {};
  hook();
  const dir = runFolder(); mkdirSync(dir, { recursive: true });
  const file = `${dir}/${child.pid}`; const started = startedAt(child.pid);
  writeFileSync(file, JSON.stringify({ pid: child.pid, started, what, by: process.pid }));
  mine.set(child.pid, { file, started });
  const forget = () => { mine.delete(child.pid); try { unlinkSync(file); } catch (e) { /* gone */ } };
  child.once('exit', forget);
  return () => { takeDown(child.pid); forget(); };
}


// The run is over: every server still written down for it is taken down, and the folder goes.
// Returns the pids taken down.
export function reapRun(run) {
  const dir = runFolder(String(run)); const gone = [];
  if (!existsSync(dir)) return gone;
  for (const name of readdirSync(dir)) {
    let rec = null; try { rec = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')); } catch (e) { rec = null; }
    if (rec && rec.pid && rec.started && startedAt(rec.pid) === rec.started) { takeDown(rec.pid); gone.push(rec.pid); }
  }
  try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* gone */ }
  return gone;
}
