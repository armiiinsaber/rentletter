// The walk runs' stats folders (tests/helpers/walkStats.mjs, scripts/walk-lanes.mjs): at the start
// of each walk run the .next-walk-stats-<run> folders of earlier runs go and the current one stays.
// Only folders of exactly that pattern go: a run still going keeps its folder, and nothing else in
// the root is touched (the screenshots, the other walk and build folders, a file or a link of that
// name and what the link points to). Run in a folder of its own under the system's temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearEarlierStats, STATS_FOLDER } from './helpers/walkStats.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OTHERS = ['.next-walk-stats', '.next-walk-statsx', 'next-walk-stats-run-1', '.next-walk-screenshots', '.next-walk-shots', '.next-walk-3123', '.next-fake-shared-run-1-lane-a-0123456789ab', '.next'];

test('a walk run clears the stats folders of earlier runs and keeps its own', async () => {
  const base = mkdtempSync(join(tmpdir(), 'rl-walk-stats-'));
  const root = join(base, 'repo'); const outside = join(base, 'outside');
  mkdirSync(root); mkdirSync(outside); writeFileSync(join(outside, 'keep.json'), '{}');
  // A run that has ended (its process gone) and a run still going (a process that waits).
  const ended = spawnSync(process.execPath, ['-e', '']).pid;
  const going = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const live = `.next-walk-stats-run-${going.pid}`;
  try {
    const dir = (name) => { mkdirSync(join(root, name), { recursive: true }); writeFileSync(join(root, name, 'summary.json'), '{}'); };
    const current = '.next-walk-stats-walks-current';
    const earlier = [`.next-walk-stats-run-${ended}`, `.next-walk-stats-walks-${ended}`, `.next-walk-stats-run-${ended}-old`, '.next-walk-stats-named'];
    for (const name of [current, live, ...earlier, ...OTHERS]) dir(name);
    writeFileSync(join(root, '.next-walk-stats-file'), 'a file of that name');
    symlinkSync(outside, join(root, '.next-walk-stats-link'));
    const after = [current, live, ...OTHERS, '.next-walk-stats-file', '.next-walk-stats-link'].sort();

    assert.deepEqual(clearEarlierStats(root, join(root, current)).sort(), [...earlier].sort(), 'the folders of earlier runs, and only those');
    assert.deepEqual(readdirSync(root).sort(), after, 'the current run, a run still going and everything not of the pattern stay');
    assert.ok(existsSync(join(root, current, 'summary.json')), 'the current run keeps its table');
    assert.ok(existsSync(join(outside, 'keep.json')), 'a link of that name is not followed');
    assert.deepEqual(clearEarlierStats(root, join(root, current)), [], 'a second clear in the same run removes nothing');

    // The next run: the run that was current is an earlier one now, and goes; the run still going stays.
    const next = '.next-walk-stats-walks-next';
    dir(next);
    assert.deepEqual(clearEarlierStats(root, join(root, next)), [current], 'the run before goes, a run still going stays');
    going.kill('SIGKILL'); await new Promise((r) => going.once('exit', r));
    assert.deepEqual(clearEarlierStats(root, join(root, next)), [live], 'once that run has ended, its folder goes too');
    // The current folder elsewhere (RENTLETTER_STATS): every stats folder in the root is an earlier one.
    assert.deepEqual(clearEarlierStats(root, join(outside, '.next-walk-stats-elsewhere')), [next], 'with the current folder outside the root, the root keeps none');
    assert.deepEqual(readdirSync(root).sort(), [...OTHERS, '.next-walk-stats-file', '.next-walk-stats-link'].sort(), 'and nothing else went');
  } finally {
    try { going.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(base, { recursive: true, force: true });
  }
});

test('the pattern, the lanes script clearing at the start of a run, and the ignore rule', () => {
  for (const name of ['.next-walk-stats-run-123', '.next-walk-stats-walks-9', '.next-walk-stats-x']) assert.ok(STATS_FOLDER.test(name), name);
  for (const name of ['.next-walk-stats', '.next-walk-stats-', '.next-walk-statsx', 'next-walk-stats-run-1', '.next-walk-screenshots', 'a/.next-walk-stats-run-1']) assert.ok(!STATS_FOLDER.test(name), name);
  const lanes = readFileSync(`${ROOT}scripts/walk-lanes.mjs`, 'utf8');
  assert.match(lanes, /mkdirSync\(STATS, \{ recursive: true \}\);\nclearEarlierStats\(ROOT, STATS\);\n/, 'the lanes script clears the earlier runs as soon as its own folder is made');
  assert.ok(lanes.indexOf('clearEarlierStats(ROOT, STATS)') < lanes.indexOf('await Promise.all(plan.map(runLane))'), 'before any lane starts');
  assert.ok(readFileSync(`${ROOT}.gitignore`, 'utf8').split('\n').includes('/.next-walk-stats-*/'), 'the stats folders are named in .gitignore');
  const ignored = spawnSync('git', ['check-ignore', '-q', '.next-walk-stats-run-1/summary.json'], { cwd: ROOT });
  assert.equal(ignored.status, 0, 'git ignores a stats folder');
});
