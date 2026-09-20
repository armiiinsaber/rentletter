// tests/helpers/stateRoutes.mjs  Finds, from the source, every route under pages/api that changes
// the state of an application or a listing. The writers in lib/applicationTransitions.js are the
// seed; any exported function whose body calls one of them joins the set, and so on until
// nothing new joins; a route is one that calls a function in the set.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SEED = Object.freeze(['transitionApplication', 'transitionApplicationIfAllowed', 'transitionApplications', 'transitionListing', 'recordStart', 'startingState']);

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.js$/.test(name)) out.push(p);
  }
  return out;
}
const calls = (src, name) => new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(src);

// The exported functions of one file, each with its own body (up to the next top level export).
export function exportedFunctions(src) {
  const out = [];
  const re = /^export (?:default )?(?:async )?function\s+(\w+)|^export const (\w+)\s*=/gm;
  const marks = []; let m;
  while ((m = re.exec(src))) marks.push({ name: m[1] || m[2], at: m.index });
  marks.forEach((k, i) => out.push({ name: k.name, body: src.slice(k.at, i + 1 < marks.length ? marks[i + 1].at : src.length) }));
  return out;
}

export function stateChangingFunctions() {
  const names = new Set(SEED);
  const files = walk(join(ROOT, 'lib')).map((p) => ({ p, fns: exportedFunctions(readFileSync(p, 'utf8')) }));
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of files) for (const fn of f.fns) {
      if (names.has(fn.name)) continue;
      const body = fn.body.replace(new RegExp(`function\\s+${fn.name}\\s*\\(`), 'function (');
      if ([...names].some((n) => calls(body, n))) { names.add(fn.name); grew = true; }
    }
  }
  return names;
}

export function stateChangingRoutes() {
  const names = stateChangingFunctions();
  const routes = [];
  for (const p of walk(join(ROOT, 'pages', 'api'))) {
    const src = readFileSync(p, 'utf8');
    const via = [...names].filter((n) => calls(src, n));
    if (via.length) routes.push({ route: relative(ROOT, p), via });
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}
