// tests/helpers/walkReport.mjs  A node --test reporter for the walk runs' table (scripts/walk-lanes.mjs):
// each test file's top level tests, passed, failed and skipped (a test the name pattern leaves out
// is skipped), and each one's name and time, as one JSON line per file once the run ends. The run's
// own output stays the spec reporter's; this one writes to a file of its own
// (--test-reporter-destination).
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export default async function* walkReport(source) {
  const files = new Map();
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data || {};
    if (d.nesting !== 0 || !d.file || (d.details && d.details.type === 'suite')) continue;
    const file = relative(ROOT, d.file);
    const f = files.get(file) || { file, pass: 0, fail: 0, skip: 0, tests: [] };
    const skipped = d.skip !== undefined && d.skip !== false;
    if (skipped) f.skip += 1;
    else if (event.type === 'test:pass') f.pass += 1;
    else f.fail += 1;
    // Each test's own time (its hooks before the file's first test, the wait for the turn among
    // them, are not in it).
    if (!skipped) f.tests.push({ name: d.name, ms: Math.round((d.details && d.details.duration_ms) || 0), ok: event.type === 'test:pass' });
    files.set(file, f);
  }
  for (const f of files.values()) yield `${JSON.stringify(f)}\n`;
}
