// scripts/test-run.mjs  npm test, under a ceiling: node --test with the given arguments, in a process
// group of its own. Past the ceiling (20 minutes; TEST_CEILING_MS overrides) the whole run is killed,
// the test files still running are named, the walks' servers and the walk turn are cleared
// (tests/helpers/devServer.mjs), and the run fails. A run that ends in time exits with its own code.
// TEST_RUN_CLEAR=none leaves the walks' servers and turn alone (a test of this script, inside a run).
// --no-walks leaves out the browser walks (tests/routes/*Webkit.test.mjs): npm test is the unit and
// route tests; the walks run as npm run test:webkit and npm run test:chrome, each under its own ceiling.
//   node scripts/test-run.mjs --no-walks "tests/**/*.test.mjs"           (npm test)
//   node scripts/test-run.mjs --test-name-pattern=WebKit "tests/routes/*Webkit.test.mjs"   (npm run test:webkit)
import { spawn, execSync } from 'node:child_process';
import { rmSync, globSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CEILING = Number(process.env.TEST_CEILING_MS || 20 * 60 * 1000);
// The ports the walks' servers listen on (devServer, adminServer, the fake stack servers).
const WALK_PORTS = [3123, 3125, 3152, 3153, 3157, 3159, 3161, 3162, 3163, 3164, 3165, 3166];
const WALK_FILES = ['/tmp/rentletter-dev-3123.turn', '/tmp/rentletter-dev-3123.lock', '/tmp/rentletter-dev-3123.users'];
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
const child = spawn(process.execPath, ['--test', ...args], { stdio: 'inherit', detached: true, env: { ...process.env, TEST_CEILING_MS: String(CEILING) } });
const end = (code) => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* gone */ } if (process.env.TEST_RUN_CLEAR !== 'none') clear(); process.exit(code); };
const span = CEILING >= 60000 ? `${Math.round(CEILING / 60000)} minute` : `${Math.round(CEILING / 1000)} second`;
const timer = setTimeout(() => {
  const files = filesUnder(child.pid);
  console.error(`\n[test-run] the run passed its ${span} ceiling and was stopped. Still running: ${files.length ? files.join(', ') : 'no test file (the runner itself)'}. The walk servers and the walk turn were cleared.`);
  end(1);
}, CEILING);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearTimeout(timer); end(130); });
child.on('exit', (code, signal) => { clearTimeout(timer); process.exit(code ?? (signal ? 1 : 0)); });
