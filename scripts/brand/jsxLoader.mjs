// scripts/brand/jsxLoader.mjs
// Node module hooks for the brand kit's motion files (scripts/brand/motion.mjs), which render the
// product's own React component, components/brand/DoorMark.js, on the server. Two jobs, as Next
// does them for the app: extensionless relative imports resolve to .js or /index.js, and a file
// under components/ is compiled from JSX with the SWC that ships inside Next (no new dependency).
// Register it with module.register before importing a component.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let swc = null;
const compile = async (source, filename) => {
  if (!swc) { swc = require('next/dist/build/swc/index.js'); await swc.loadBindings?.(); }
  const out = await swc.transform(source, { filename, sourceMaps: false, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'es6' } });
  return out.code;
};

export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if (spec.startsWith('.') || spec.startsWith('/')) { for (const ext of ['.js', '/index.js']) { try { return await next(spec + ext, ctx); } catch (e2) { /* next */ } } }
    throw e;
  }
}

export async function load(url, ctx, next) {
  if (url.startsWith('file:') && /\/components\/.*\.js$/.test(url)) {
    const filename = fileURLToPath(url);
    return { format: 'module', source: await compile(await readFile(filename, 'utf8'), filename), shortCircuit: true };
  }
  return next(url, ctx);
}
