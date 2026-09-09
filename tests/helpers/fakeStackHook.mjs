// tests/helpers/fakeStackHook.mjs  register() this before importing anything under pages or lib.
//   resolve: the real Supabase, Resend and Anthropic modules resolve to tests/helpers/fakeModules,
//            which read globalThis.__rlStack at call time; extensionless relative imports resolve
//            as Next resolves them.
//   load:    files under pages and components are JSX; they are compiled with Next's own swc so
//            a page's getServerSideProps can be called from node.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const FAKES = {
  '@supabase/ssr': './fakeModules/ssr.mjs',
  '@supabase/supabase-js': './fakeModules/supabaseJs.mjs',
  resend: './fakeModules/resend.mjs',
  '@anthropic-ai/sdk': './fakeModules/anthropic.mjs',
};
export async function resolve(spec, ctx, next) {
  if (FAKES[spec]) return { url: new URL(FAKES[spec], import.meta.url).href, shortCircuit: true };
  try { return await next(spec, ctx); } catch (e) {
    // Next resolves extensionless imports (its own next/head, and the repo's relative imports); plain node does not.
    for (const ext of ['.js', '/index.js']) { try { return await next(spec + ext, ctx); } catch (e2) { /* next */ } }
    throw e;
  }
}
let swc = null;
export async function load(url, ctx, next) {
  if (/\/(pages|components)\/.*\.js$/.test(url) && !/node_modules/.test(url)) {
    if (!swc) swc = require('next/dist/build/swc');
    const source = await readFile(fileURLToPath(url), 'utf8');
    const out = await swc.transform(source, { filename: fileURLToPath(url), jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'es6' }, isModule: true, sourceMaps: false, disableNextSsg: true, disablePageConfig: true });
    return { format: 'module', source: out.code, shortCircuit: true };
  }
  return next(url, ctx);
}
