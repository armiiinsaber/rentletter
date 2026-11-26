// The walks' lanes (tests/helpers/lanes.mjs, scripts/walk-lanes.mjs): every route walk runs in
// exactly one lane; the walks whose checks are about timing share a lane; walks that share a port
// share a lane, and no port is used in two lanes; every walk takes its lane's turn; each lane has a
// turn and a shared build of its own; a run of walks goes through the lanes, any other run does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { LANES, AFTER, TOGETHER, SHARED, FALLBACK, laneOf } = await import('./helpers/lanes.mjs');
const walks = readdirSync(`${ROOT}tests/routes`).filter((f) => /Webkit\.test\.mjs$/.test(f)).map((f) => f.replace(/\.test\.mjs$/, ''));
const src = (name) => readFileSync(`${ROOT}tests/routes/${name}.test.mjs`, 'utf8');

test('every route walk runs in exactly one lane, and every name in the map is a walk', () => {
  const named = [...Object.values(LANES).flat(), ...AFTER];
  assert.deepEqual(named.filter((n, i) => named.indexOf(n) !== i), [], 'no walk named twice');
  assert.deepEqual(named.filter((n) => !walks.includes(n)), [], 'no name without its walk file');
  assert.deepEqual(walks.filter((w) => !named.includes(w)), [], `every walk named in a lane (an unnamed one would fall to lane ${FALLBACK})`);
  assert.deepEqual(Object.keys(LANES).sort(), ['a', 'b'], 'two lanes');
  for (const w of walks) assert.ok(['a', 'b', 'after'].includes(laneOf(`tests/routes/${w}.test.mjs`)), w);
});

test('the walks about timing share a lane, and so do walks that share a server', () => {
  assert.deepEqual([...TOGETHER].sort(), ['backWebkit', 'edgeWebkit', 'tapsWebkit', 'zoomWebkit']);
  assert.equal(new Set(TOGETHER.map((w) => laneOf(w))).size, 1, 'back, taps, edge and zoom in one lane');
  for (const group of SHARED) assert.equal(new Set(group.map((w) => laneOf(w))).size, 1, `${group.join(' and ')} in one lane`);
  // Every port a walk listens on: no port in two lanes.
  const ports = new Map();
  for (const w of walks) {
    const s = src(w);
    const found = [...s.matchAll(/\bPORTS?\s*=\s*(\d{4})\b|adminServer\((\d{4})\)|\bport:\s*(\d{4})\b/g)].map((m) => Number(m[1] || m[2] || m[3]));
    for (const port of found) { const at = ports.get(port) || new Set(); at.add(laneOf(w)); ports.set(port, at); }
  }
  for (const [port, at] of ports) assert.equal(at.size, 1, `port ${port} is used in one lane only (${[...at].join(', ')})`);
});

test('every walk takes its lane\'s turn, and each lane has a turn and a build of its own', async () => {
  for (const w of walks) assert.match(src(w), /takeTurn\(|adminServer\(/, `${w} takes the walk turn`);
  const dev = readFileSync(`${ROOT}tests/helpers/devServer.mjs`, 'utf8');
  assert.match(dev, /export const turnFor = \(lane = LANE\) => `\/tmp\/rentletter-dev-\$\{PORT\}\$\{lane \? `\.lane-\$\{lane\}` : ''\}\.turn`;/);
  const { sharedBuildDir } = await import('./helpers/fakeBuild.mjs');
  assert.notEqual(sharedBuildDir('run-1', {}, 'a'), sharedBuildDir('run-1', {}, 'b'), 'a build for each lane');
  assert.match(sharedBuildDir('run-1', {}, 'a'), /^\.next-fake-shared-run-1-lane-a-[0-9a-f]{12}$/);
  const runner = readFileSync(`${ROOT}scripts/test-run.mjs`, 'utf8');
  assert.match(runner, /const walkRun = named\.length > 0 && named\.every\(isWalk\);/, 'a run of walks goes through the lanes');
  assert.match(runner, /walkRun \? \[fileURLToPath\(new URL\('\.\/walk-lanes\.mjs', import\.meta\.url\)\), \.\.\.args\] : \['--test', \.\.\.args\]/, 'any other run is node --test');
  const lanes = readFileSync(`${ROOT}scripts/walk-lanes.mjs`, 'utf8');
  assert.match(lanes, /if \(lane\) env\.RENTLETTER_LANE = lane; else delete env\.RENTLETTER_LANE;/, 'each lane names itself to its walks');
  assert.match(lanes, /files\.every\(\(f\) => f\.startsWith\('tests\/routes\/'\)\)/, 'only the route walks run in lanes; the wrapped text walk\'s parts keep one lane');
});
