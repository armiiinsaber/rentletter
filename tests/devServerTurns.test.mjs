// The walk files take turns on the shared dev server (tests/helpers/devServer.mjs). Proved here on
// a lock of its own, with real processes: no two turns ever overlap, every process gets one, and
// a turn left behind by a process that died is cleared and taken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeTurn, giveTurn } from './helpers/devServer.mjs';

const helper = fileURLToPath(new URL('./helpers/devServer.mjs', import.meta.url));
const walker = (turn, out, hold) => `
  import { takeTurn, giveTurn } from ${JSON.stringify(helper)};
  import { writeFileSync } from 'node:fs';
  await takeTurn(${JSON.stringify(turn)});
  const start = Date.now();
  await new Promise((r) => setTimeout(r, ${hold}));
  writeFileSync(${JSON.stringify(out)} + '/' + process.pid, JSON.stringify({ start, end: Date.now() }));
  giveTurn(${JSON.stringify(turn)});
`;
const run = (code) => new Promise((resolve, reject) => { const c = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' }); c.on('exit', (n) => (n === 0 ? resolve() : reject(new Error(`walker exited ${n}`)))); });

test('eight processes asking at once: eight turns, none overlapping, three rounds in a row', async () => {
  for (let round = 0; round < 3; round++) {
    const dir = mkdtempSync(join(tmpdir(), 'rl-turns-')); const turn = join(dir, 'turn'); const out = join(dir, 'out'); mkdirSync(out);
    await Promise.all(Array.from({ length: 8 }, () => run(walker(turn, out, 120))));
    const spans = readdirSync(out).map((f) => JSON.parse(readFileSync(join(out, f), 'utf8'))).sort((a, b) => a.start - b.start);
    assert.equal(spans.length, 8, 'every process got its turn');
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i].start >= spans[i - 1].end, `round ${round}: turn ${i} started ${spans[i - 1].end - spans[i].start}ms before the one ahead of it ended`);
    assert.equal(existsSync(turn), false, 'the last turn was given back');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a turn held by a process that no longer runs is cleared and taken; a turn is only given back by its holder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl-turns-')); const turn = join(dir, 'turn');
  mkdirSync(turn); writeFileSync(join(turn, 'pid'), '999999'); // nobody
  const t0 = Date.now(); await takeTurn(turn);
  assert.ok(Date.now() - t0 < 3000, 'taken without waiting for anyone');
  assert.equal(Number(readFileSync(join(turn, 'pid'), 'utf8')), process.pid);
  giveTurn(turn); assert.equal(existsSync(turn), false);
  mkdirSync(turn); writeFileSync(join(turn, 'pid'), String(process.ppid)); // someone else, alive
  giveTurn(turn); assert.equal(existsSync(turn), true, 'someone else\'s turn is left alone');
  rmSync(dir, { recursive: true, force: true });
});
