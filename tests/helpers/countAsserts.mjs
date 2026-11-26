// tests/helpers/countAsserts.mjs  How many assertions a walk file made, for the walk runs' table
// (scripts/walk-lanes.mjs loads it into every walk file with --import). It wraps the assertion
// functions of node:assert and node:assert/strict (the default export's methods and the named
// exports alike) with a counter, and when a test file's process ends it writes
// { file, asserts } as one line to $RENTLETTER_STATS/asserts.jsonl. A process that is not a test
// file (a server a walk starts) or a run without RENTLETTER_STATS writes nothing. A call of assert
// itself as a function (assert(x)) is not counted; the walks call its methods.
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FILE = process.argv[1] || '';
const STATS = process.env.RENTLETTER_STATS || '';
let count = 0;
if (STATS && /\.test\.mjs$/.test(FILE)) {
  const assert = createRequire(import.meta.url)('node:assert');
  const NAMES = ['ok', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'fail', 'ifError', 'partialDeepStrictEqual'];
  for (const obj of [assert, assert.strict]) {
    for (const name of NAMES) {
      const fn = obj[name];
      if (typeof fn !== 'function' || fn.__counted) continue;
      const counted = function counted(...args) { count += 1; return fn.apply(this, args); };
      counted.__counted = true;
      obj[name] = counted;
    }
  }
  syncBuiltinESMExports();
  process.on('exit', () => { try { appendFileSync(`${STATS}/asserts.jsonl`, `${JSON.stringify({ file: relative(ROOT, FILE), asserts: count })}\n`); } catch (e) { /* the table goes without it */ } });
}
