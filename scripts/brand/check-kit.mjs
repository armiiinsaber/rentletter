// scripts/brand/check-kit.mjs
// Runs before next build (package.json "build"). Stops the build when the brand kit
// (public/brand/kit) is older than what it is drawn from, or when a file is missing or changed:
// the source hashes in its manifest are computed again (scripts/brand/kitSources.mjs) and every
// file is checked against its recorded size. The fix is always the same: npm run brand:kit.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kitSources } from './kitSources.mjs';

const ROOT = process.cwd();
const KIT = join(ROOT, 'public/brand/kit');
const problems = [];
let manifest = null;
try { manifest = JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8')); } catch (e) { problems.push('public/brand/kit/manifest.json is missing or unreadable.'); }
if (manifest) {
  let now = {};
  try { now = kitSources(ROOT); } catch (e) { problems.push(e.message); }
  for (const [source, hash] of Object.entries(now)) if (manifest.sources?.[source] !== hash) problems.push(`${source} changed after the kit was built.`);
  for (const f of manifest.files || []) {
    const p = join(KIT, manifest.folder, f.path);
    if (!existsSync(p)) problems.push(`${manifest.folder}/${f.path} is missing.`);
    else if (statSync(p).size !== f.size) problems.push(`${manifest.folder}/${f.path} does not match the manifest.`);
  }
  const zip = join(KIT, manifest.zip?.path || '');
  if (!manifest.zip || !existsSync(zip)) problems.push('The kit zip is missing.');
  else if (statSync(zip).size !== manifest.zip.size) problems.push('The kit zip does not match the manifest.');
}
if (problems.length) {
  console.error(`\nThe brand kit is stale, so the build stops here.\n${problems.map((p) => `  ${p}`).join('\n')}\nRun npm run brand:kit and commit public/brand/kit.\n`);
  process.exit(1);
}
console.log(`Brand kit is current: ${manifest.files.length} files.`);
