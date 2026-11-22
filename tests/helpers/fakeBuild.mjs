// tests/helpers/fakeBuild.mjs  One production build of the fake stack for a whole run.
// Nine walk files serve the fake stack from a production build in a folder of their own
// (.next-fake-<port>, tests/helpers/fakeNextServer.mjs). Each ran `next build` inside its walk
// turn, about 16 seconds, and it was the same build every time: the same code and the same
// environment. Under a run (scripts/test-run.mjs sets RENTLETTER_RUN) the first of them builds once
// into .next-fake-shared-<run>-<env>, and every walk then gets its own copy of that build in
// .next-fake-<port>, without the build cache, so each server still reads and writes its own folder
// alone. The copy is a clone on APFS (copy on write), a plain copy elsewhere. A walk file run on its
// own, outside a run, builds into its own folder as before. A shared build left by a run that has
// ended is removed. fakeBuild(port, env) builds with env over the run's environment (the wrapped
// text walks, tests/helpers/typesetWalk.mjs, build once with billing on as well): a setting of its
// own is a shared build of its own.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../..', import.meta.url).pathname;
const NEXT = `${ROOT}node_modules/next/dist/bin/next`;
const DONE = '.walk-build-done';

const build = (dist, env = {}) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [NEXT, 'build'], { cwd: ROOT, env: { ...process.env, ...env, NEXT_DIST_DIR: dist, FAKE_STACK_BUILD: '1' }, stdio: 'ignore' });
  p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`next build into ${dist} exited ${code}`))));
});
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return false; } };
// What a build takes from the environment besides the code: BILLING_OFF (next.config.js env) and
// every NEXT_PUBLIC_ variable. Two runs or two settings never share a build. Only a short digest is
// kept, in the folder's name; no value is written or printed.
const inlined = (env) => createHash('sha256')
  .update(JSON.stringify(Object.keys(env).filter((k) => k === 'BILLING_OFF' || k.startsWith('NEXT_PUBLIC_')).sort().map((k) => [k, env[k]])))
  .digest('hex').slice(0, 12);

export const sharedBuildDir = (run = process.env.RENTLETTER_RUN, env = {}) => (run ? `.next-fake-shared-${run}-${inlined({ ...process.env, ...env })}` : null);

export async function fakeBuild(port, env = {}) {
  const own = `.next-fake-${port}`;
  const shared = sharedBuildDir(undefined, env);
  if (!shared) { await build(own, env); return { shared: false }; }
  // Shared builds of runs that have ended (a run is named run-<pid>, scripts/test-run.mjs).
  for (const d of readdirSync(ROOT)) {
    const m = d.match(/^\.next-fake-shared-run-(\d+)-/);
    if (m && d !== shared && !running(Number(m[1]))) rmSync(`${ROOT}${d}`, { recursive: true, force: true });
  }
  // The walks take turns (tests/helpers/devServer.mjs), so one builds while the others wait. A build
  // cut short never wrote DONE, and the next walk builds again.
  let built = false;
  if (!existsSync(`${ROOT}${shared}/${DONE}`)) {
    rmSync(`${ROOT}${shared}`, { recursive: true, force: true });
    await build(shared, env);
    writeFileSync(`${ROOT}${shared}/${DONE}`, String(Date.now()));
    built = true;
  }
  rmSync(`${ROOT}${own}`, { recursive: true, force: true });
  const skip = new Set([`${ROOT}${shared}/cache`, `${ROOT}${shared}/${DONE}`]);
  cpSync(`${ROOT}${shared}`, `${ROOT}${own}`, { recursive: true, mode: constants.COPYFILE_FICLONE, filter: (src) => !skip.has(src) });
  return { shared: true, built };
}
