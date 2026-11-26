// scripts/test-run.mjs  npm test, under a ceiling: node --test with the given arguments, in a process
// group of its own. Past the ceiling (20 minutes; TEST_CEILING_MS overrides) the whole run is killed,
// the test files still running are named, the walks' servers and the walk turn are cleared
// (tests/helpers/devServer.mjs), and the run fails. A run that ends in time exits with its own code.
// However the run ends, every server one of its walks started and that is still up is taken down.
// TEST_RUN_CLEAR=none leaves the walks' servers and turn alone (a test of this script, inside a run).
// --no-walks leaves out the browser walks (every *Webkit.test.mjs): npm test is the unit and route
// tests; the walks run as npm run test:webkit and npm run test:chrome, each under its own ceiling, and
// the sitewide wrapped text walk (tests/typeset) as npm run test:typeset:webkit and test:typeset:chrome.
// A run of walks goes through scripts/walk-lanes.mjs: the route walks in two lanes at once, and at
// the end a table of each walk file's turn, tests and assertions.
//   node scripts/test-run.mjs --no-walks "tests/**/*.test.mjs"           (npm test)
//   node scripts/test-run.mjs --test-name-pattern=WebKit "tests/routes/*Webkit.test.mjs"   (npm run test:webkit)
//   node scripts/test-run.mjs --test-name-pattern=WebKit "tests/typeset/*Webkit.test.mjs"  (npm run test:typeset:webkit)
import { spawn, execSync } from 'node:child_process';
import { rmSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reapRun } from '../tests/helpers/reap.mjs';

export const CEILING = Number(process.env.TEST_CEILING_MS || 20 * 60 * 1000);
// The ports the walks' servers listen on (devServer, adminServer, the fake stack servers; 3180 to
// 3190 are the walks that once shared the dev server, each on its own production server now; 3175
// to 3178 the wrapped text walk's, two for each engine; 3191 the Profile and Circle walk; 3192 the
// one place and glass walk; 3193 the width and pop up walk; 3194 the Listings walk).
const WALK_PORTS = [3123, 3125, 3152, 3153, 3157, 3159, 3161, 3162, 3163, 3164, 3165, 3166, 3167, 3168, 3169, 3174, 3175, 3176, 3177, 3178, 3179, 3180, 3181, 3182, 3183, 3184, 3185, 3186, 3187, 3188, 3189, 3190, 3191, 3192, 3193, 3194];
const WALK_FILES = ['/tmp/rentletter-dev-3123.turn', '/tmp/rentletter-dev-3123.lane-a.turn', '/tmp/rentletter-dev-3123.lane-b.turn', '/tmp/rentletter-dev-3123.lock', '/tmp/rentletter-dev-3123.users'];
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const sh = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } };
// The test files under the run, by name, from the process tree.
function filesUnder(root) {
  const rows = sh('ps -Ao pid=,ppid=,command=').split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
  const mine = new Set([root]); let grew = true;
  while (grew) { grew = false; for (const r of rows) if (!mine.has(r.pid) && mine.has(r.ppid)) { mine.add(r.pid); grew = true; } }
  const named = rows.filter((r) => mine.has(r.pid) && r.pid !== root).map((r) => (r.cmd.match(/\S+\.test\.mjs/) || [])[0]).filter(Boolean);
  return [...new Set(named.map((f) => (f.startsWith(ROOT) ? relative(ROOT, f) : f)))];
}
function clear() {
  for (const port of WALK_PORTS) for (const pid of sh(`lsof -tiTCP:${port} -sTCP:LISTEN`).split(/\s+/).filter(Boolean)) { try { process.kill(Number(pid), 'SIGKILL'); } catch (e) { /* gone */ } }
  for (const f of WALK_FILES) { try { rmSync(f, { recursive: true, force: true }); } catch (e) { /* gone */ } }
}

export const isWalk = (file) => /Webkit\.test\.mjs$/.test(file);
let args = process.argv.slice(2);
if (args.includes('--no-walks')) {
  args = args.filter((a) => a !== '--no-walks').flatMap((a) => (a.startsWith('-') ? [a] : (a.includes('*') ? globSync(a) : [a]).filter((f) => !isWalk(f)).sort()));
}
// Every server a walk of this run starts is written down under the run's name (tests/helpers/reap.mjs),
// and whatever is still written there when the run ends, however it ends, is taken down: a walk
// killed outright never runs its own after hook. Another run's servers are never touched.
const RUN = `run-${process.pid}`;
// A run of browser walks (every file a *Webkit.test.mjs) goes through scripts/walk-lanes.mjs, which
// runs the route walks in two lanes at once and prints the table of each file's turn, tests and
// assertions; it runs in this run's process group, under the same ceiling. Any other run is
// node --test, as always.
const named = args.filter((a) => !a.startsWith('-'));
const walkRun = named.length > 0 && named.every(isWalk);
const child = spawn(process.execPath, walkRun ? [fileURLToPath(new URL('./walk-lanes.mjs', import.meta.url)), ...args] : ['--test', ...args], { stdio: 'inherit', detached: true, env: { ...process.env, TEST_CEILING_MS: String(CEILING), RENTLETTER_RUN: RUN } });
const end = (code) => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* gone */ } reapRun(RUN); if (process.env.TEST_RUN_CLEAR !== 'none') clear(); process.exit(code); };
const span = CEILING >= 60000 ? `${Math.round(CEILING / 60000)} minute` : `${Math.round(CEILING / 1000)} second`;
const timer = setTimeout(() => {
  const files = filesUnder(child.pid);
  console.error(`\n[test-run] the run passed its ${span} ceiling and was stopped. Still running: ${files.length ? files.join(', ') : 'no test file (the runner itself)'}. The walk servers and the walk turn were cleared.`);
  end(1);
}, CEILING);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearTimeout(timer); end(130); });
child.on('exit', (code, signal) => { clearTimeout(timer); reapRun(RUN); process.exit(code ?? (signal ? 1 : 0)); });
