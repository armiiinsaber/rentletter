// scripts/walk-lanes.mjs  The browser walks in lanes, and a table of what each walk file did. Run by
// scripts/test-run.mjs for a run of walk files (*Webkit.test.mjs), under its ceiling and in its
// process group, so the ceiling, a signal and the reaping of the run's servers cover every lane:
//   node scripts/walk-lanes.mjs [node --test flags] <walk files or globs>
// The route walks (tests/routes) run in two lanes at once (tests/helpers/lanes.mjs): one node --test
// process a lane, each with RENTLETTER_LANE set, so each lane has its own walk turn
// (tests/helpers/devServer.mjs), its own shared build (tests/helpers/fakeBuild.mjs) and its walks'
// own servers and ports; a walk the lane map sets apart runs alone after the lanes. Other walks (the
// wrapped text walk's parts, which run in order on the same servers) run in one lane, as they
// always did, and WALK_LANES=1 runs every walk in one lane, one at a time (the serial run). Each
// lane's output is printed with the lane's name in front of each line. At the end: each file's lane,
// how long it held its turn, its tests (passed, failed and skipped; a test the name pattern leaves
// out is skipped) and the assertions it made (tests/helpers/walkReport.mjs,
// tests/helpers/countAsserts.mjs), each lane's time and the run's, as a table, and the same as JSON
// in the folder the last line names (.next-walk-stats-<run>). The stats folders of earlier runs go
// at the start of each run, and only this run's stays (tests/helpers/walkStats.mjs). Exits 0 only
// when every lane did.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, globSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneOf } from '../tests/helpers/lanes.mjs';
import { clearEarlierStats } from '../tests/helpers/walkStats.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COUNT = fileURLToPath(new URL('../tests/helpers/countAsserts.mjs', import.meta.url));
const REPORT = fileURLToPath(new URL('../tests/helpers/walkReport.mjs', import.meta.url));
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('-'));
const files = [...new Set(args.filter((a) => !a.startsWith('-'))
  .flatMap((a) => (a.includes('*') ? globSync(a, { cwd: ROOT }) : [a]))
  .map((f) => relative(ROOT, resolve(ROOT, f))))].sort();
const RUN = process.env.RENTLETTER_RUN || `walks-${process.pid}`;
const STATS = process.env.RENTLETTER_STATS || `${ROOT}.next-walk-stats-${RUN}`;
mkdirSync(STATS, { recursive: true });
clearEarlierStats(ROOT, STATS);

// The plan: the lanes that run at once, then what runs alone after them.
const lanesOn = process.env.WALK_LANES !== '1' && files.length > 0 && files.every((f) => f.startsWith('tests/routes/'));
const plan = []; let after = [];
if (lanesOn) {
  const by = {};
  for (const f of files) (by[laneOf(f)] = by[laneOf(f)] || []).push(f);
  for (const lane of Object.keys(by).filter((k) => k !== 'after').sort()) plan.push({ lane, label: lane, files: by[lane] });
  after = by.after || [];
} else if (files.length) plan.push({ lane: '', label: 'one', files });

// One node --test process: the spec reporter to this output, each line with the lane's name in
// front, and the walk report to the stats folder.
function runLane({ lane, label, files: list }) {
  return new Promise((done) => {
    const env = { ...process.env, RENTLETTER_STATS: STATS };
    if (lane) env.RENTLETTER_LANE = lane; else delete env.RENTLETTER_LANE;
    const t0 = Date.now();
    const c = spawn(process.execPath, ['--test', '--import', COUNT, '--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${REPORT}`, `--test-reporter-destination=${STATS}/report-${label}.jsonl`, ...flags, ...list], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const tag = plan.length > 1 || label === 'after' ? `[${label}] ` : '';
    for (const [from, to] of [[c.stdout, process.stdout], [c.stderr, process.stderr]]) {
      let rest = '';
      from.on('data', (d) => { const lines = (rest + d).split('\n'); rest = lines.pop(); for (const l of lines) to.write(`${tag}${l}\n`); });
      from.on('end', () => { if (rest) to.write(`${tag}${rest}\n`); });
    }
    c.on('exit', (code, signal) => done({ label, files: list, code: code ?? (signal ? 1 : 0), ms: Date.now() - t0 }));
  });
}

const read = (name) => (existsSync(`${STATS}/${name}`) ? readFileSync(`${STATS}/${name}`, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : []);
const t0 = Date.now();
const lanes = await Promise.all(plan.map(runLane));
const alone = [];
for (const f of after) alone.push(await runLane({ lane: '', label: 'after', files: [f] }));
const runMs = Date.now() - t0;

// The table.
const turns = read('turns.jsonl'); const asserts = read('asserts.jsonl');
const reports = [...plan.map((l) => l.label), ...(after.length ? ['after'] : [])].flatMap((label) => read(`report-${label}.jsonl`));
const rows = [...plan.flatMap((l) => l.files.map((file) => [file, l.label])), ...after.map((file) => [file, 'after'])].map(([file, lane]) => {
  const held = turns.filter((t) => t.file === file).reduce((n, t) => n + (t.to - t.from), 0);
  const r = reports.find((x) => x.file === file) || { pass: 0, fail: 0, skip: 0 };
  const a = asserts.filter((x) => x.file === file).reduce((n, x) => n + x.asserts, 0);
  return { file, lane, turnMs: held, pass: r.pass, fail: r.fail, skip: r.skip, asserts: a, tests: r.tests || [] };
});
const all = [...lanes, ...alone];
const summary = { run: RUN, flags, runMs, lanes: all.map(({ label, files: list, code, ms }) => ({ lane: label, files: list.length, code, ms, turnMs: rows.filter((r) => list.includes(r.file)).reduce((n, r) => n + r.turnMs, 0) })), files: rows };
writeFileSync(`${STATS}/summary.json`, JSON.stringify(summary, null, 2));
const s = (ms) => `${Math.round(ms / 1000)}s`;
const pad = (v, n) => String(v).padEnd(n);
const out = [`[walks] ${summary.lanes.map((l) => `lane ${l.lane}: ${l.files} files, ${s(l.ms)} (turns ${s(l.turnMs)})`).join('; ')}; the run ${s(runMs)}`,
  `[walks] ${pad('file', 48)}${pad('lane', 7)}${pad('turn', 7)}${pad('tests', 22)}asserts`,
  ...rows.sort((x, y) => (x.lane === y.lane ? y.turnMs - x.turnMs : x.lane < y.lane ? -1 : 1)).map((r) => `[walks] ${pad(r.file, 48)}${pad(r.lane, 7)}${pad(s(r.turnMs), 7)}${pad(`${r.pass} passed${r.fail ? `, ${r.fail} failed` : ''}${r.skip ? `, ${r.skip} skipped` : ''}`, 22)}${r.asserts}`),
  `[walks] the table as JSON: ${relative(ROOT, `${STATS}/summary.json`)}`];
console.log(`\n${out.join('\n')}`);
process.exit(all.every((l) => l.code === 0) ? 0 : 1);
