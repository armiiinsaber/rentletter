// The real realtor pages (pages/dashboard.js, pages/listing/[id].js, pages/profile.js and their
// API routes) served by Next in this process over the fake stack (tests/helpers/fakeStack.mjs) and
// the route fixture (tests/routes/fixture.mjs): signed in as its realtor, nothing on the network.
// The Supabase, Resend and Anthropic modules resolve to tests/helpers/fakeModules through Node's
// module hooks, which also cover the require() calls Next makes at run time. Each database or key
// value call waits LATENCY_MS, so a page's sequential reads cost what they would in production.
//   node tests/helpers/fakeNextServer.mjs <port> [dev|prod] [latencyMs]
// GET /__fake/pipeline?people=1|2 sets how many people the Pipeline holds (below).
// FAKE_PROFILE=lapsed signs in a realtor whose trial ended two days ago (the BILLING_OFF walk,
// tests/routes/billingOffWebkit.test.mjs); unset, the fixture's founding realtor.
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
const lapsed = process.env.FAKE_PROFILE === 'lapsed';
const t = tables(lapsed ? { plan: 'trial', profileOver: { trial_ends_at: new Date(Date.now() - 2 * 86400000).toISOString() } } : {});
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
// For a walk: how many people the Pipeline holds. GET /__fake/pipeline?people=2 adds a second
// consent beside the fixture's one: Applicant B2B2, asked on L2, who has applied to L1 (Applied on
// that row). people=1 puts it back.
const oneConsent = [...(t.pipeline_consents || [])];
const secondConsent = { id: 'PC2', profile_id: USER.id, listing_id: 'L2', application_id: 'A2', email: 'aB2B2@example.com', status: 'consented', consented_at: new Date(Date.now() - 4 * 86400000).toISOString(), expires_at: new Date(Date.now() + 56 * 86400000).toISOString(), invites: [] };
http.createServer((req, res) => {
  if (req.url.startsWith('/__fake/pipeline')) {
    const n = Number(new URL(req.url, 'http://localhost').searchParams.get('people'));
    t.pipeline_consents = n === 2 ? [...oneConsent, secondConsent] : [...oneConsent];
    res.end(String(t.pipeline_consents.length)); return;
  }
  handle(req, res);
}).listen(port, () => console.log('ready'));
process.on('SIGTERM', () => process.exit(0));
