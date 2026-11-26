// tests/helpers/walkStats.mjs  The walk runs' stats folders (scripts/walk-lanes.mjs): each run of
// walks writes its table as JSON into .next-walk-stats-<run> in the repo root. At the start of each
// walk run, the folders of earlier runs go and only the current one stays. Only a folder whose name
// is exactly that pattern is removed, never a file or a link of that name and never anything else.
// A run still going keeps its folder (a run is named run-<pid> by scripts/test-run.mjs, walks-<pid>
// by scripts/walk-lanes.mjs run alone), as the shared builds of a run still going are kept
// (tests/helpers/fakeBuild.mjs).
import { readdirSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const STATS_FOLDER = /^\.next-walk-stats-[^/\\]+$/;
const runPid = (name) => { const m = name.match(/^\.next-walk-stats-(?:run|walks)-(\d+)$/); return m ? Number(m[1]) : null; };
// A process of another user still exists (EPERM); only no such process (ESRCH) has ended.
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Removes every stats folder in root but current and those of runs still going; returns their names.
export function clearEarlierStats(root, current) {
  const keep = resolve(current);
  const removed = [];
  for (const name of readdirSync(root)) {
    if (!STATS_FOLDER.test(name)) continue;
    const path = join(root, name);
    if (resolve(path) === keep) continue;
    const pid = runPid(name);
    if (pid && running(pid)) continue;
    let stat; try { stat = lstatSync(path); } catch (e) { continue; }
    if (!stat.isDirectory()) continue;
    rmSync(path, { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
