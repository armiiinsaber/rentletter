// The real realtor pages (pages/dashboard.js, pages/listing/[id].js, pages/profile.js and their
// API routes) served by Next in this process over the fake stack (tests/helpers/fakeStack.mjs) and
// the route fixture (tests/routes/fixture.mjs): signed in as its realtor, nothing on the network.
// The Supabase, Resend and Anthropic modules resolve to tests/helpers/fakeModules through Node's
// module hooks, which also cover the require() calls Next makes at run time. Each database or key
// value call waits LATENCY_MS, so a page's sequential reads cost what they would in production.
//   node tests/helpers/fakeNextServer.mjs <port> [dev|prod] [latencyMs]
// It builds into, or serves from, .next-fake-<port> (NEXT_DIST_DIR, next.config.js); prod needs
// `NEXT_DIST_DIR=.next-fake-<port> FAKE_STACK_BUILD=1 next build` first. Prints "ready" when up.
import { registerHooks, createRequire } from 'node:module';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FAKES = {
  '@supabase/ssr': new URL('./fakeModules/ssr.mjs', import.meta.url).href,
  '@supabase/supabase-js': new URL('./fakeModules/supabaseJs.mjs', import.meta.url).href,
  resend: new URL('./fakeModules/resend.mjs', import.meta.url).href,
  '@anthropic-ai/sdk': new URL('./fakeModules/anthropic.mjs', import.meta.url).href,
};
registerHooks({ resolve(spec, ctx, next) { return FAKES[spec] ? { url: FAKES[spec], format: 'module', shortCircuit: true } : next(spec, ctx); } });

const port = Number(process.argv[2] || 3150);
const mode = process.argv[3] || 'dev';
globalThis.__rlFakeLatencyMs = Number(process.argv[4] || 3);
const { installFakeStack } = await import('./fakeStack.mjs');
const { tables, USER } = await import('../routes/fixture.mjs');
// The real tables have every column; the fixture leaves out one the listing page passes on, which
// the database would send as null (Next refuses undefined in props).
const t = tables();
for (const a of t.applications || []) if (!('rent_to_income_ratio' in a)) a.rent_to_income_ratio = null;
const stack = installFakeStack({ tables: t, user: USER });
globalThis.__rlFakeStackFor = stack;
process.env.NEXT_DIST_DIR = `.next-fake-${port}`;
if (mode === 'prod') process.env.NODE_ENV = 'production'; // one React build, the production one
const require = createRequire(ROOT);
const next = require('next');
const app = next({ dev: mode !== 'prod', dir: ROOT, hostname: 'localhost', port });
const handle = app.getRequestHandler();
await app.prepare();
http.createServer((req, res) => handle(req, res)).listen(port, () => console.log('ready'));
process.on('SIGTERM', () => process.exit(0));
