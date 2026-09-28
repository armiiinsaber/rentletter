// Every route under pages/api that writes as a realtor carries the session, requireEntitlement
// and an explicit ownership check. Found from the source: a route with a realtor session whose
// own code, or a lib function it imports, writes (a table write, a KV write, a storage write, an
// email send). The test fails on any such route missing one of the three, naming it.
//
// Three routes are exempt from requireEntitlement by design and named here with the reason: they
// are how a LOCKED realtor unlocks, so the gate cannot sit in front of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { ROOT, walk, exportedFunctions } from '../helpers/stateRoutes.mjs';

const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const SESSION = /withRealtor\(|requireRealtor\(|auth\.getUser\(\)/;
const ENTITLEMENT = /withRealtor\(|requireEntitlement\(/;
const WRITE = /\.(insert|update|upsert|delete)\(|\.rpc\(|\bkv(Set|SetJson|Sadd|Srem|Del|Incr|Lpush|Rpush)\(|storage\.from\([^)]*\)\.(upload|remove)|\.emails\.send\(|mintRequest\(|transition(Application|Applications|Listing|ApplicationIfAllowed)\(/;
// The forms an ownership check takes in this codebase: the helper that refuses another realtor's
// row, or the row keyed by the caller's own id.
const OWNERSHIP = /ownedListing\(|ownedApplicant\(|authorizeApplicant\(|updateOwnProfile\(|redeemPromoCode\(\{[^}]*profileId: user\.id|loadReportContext\(|loadApplicantVerification\(|String\([^)]*profile_id\) !== String\([^)]*user\.id\)|profile_id !== user\.id|\.eq\('id', (ctx\.)?user\.id\)|\.eq\('profile_id', (ctx\.)?user\.id\)|profile_id: (ctx\.)?user\.id|profile_id: userId|\.eq\('profile_id', userId\)|\.eq\('id', userId\)|keyFor\(user\.id\)|\bnotOwned\(|fromProfile: \{ \.\.\.ctx\.profile, id: ctx\.user\.id \}|claimReferrals\(ctx\.user\)/;
const EXEMPT = {
  'pages/api/billing/checkout.js': 'the unlock path: a locked realtor starts Stripe checkout here',
  'pages/api/billing/portal.js': 'the unlock path: a locked realtor manages or restarts their subscription here',
  'pages/api/promos/redeem.js': 'the unlock path: a locked realtor redeems a promo code here',
};

// lib/signalsCache.js holds a derived cache of the realtor's own dashboard reads (filled on a
// read, cleared on a write): not a write of record, so it does not make a read route a writer.
const NOT_A_WRITE = ['lib/signalsCache.js'];

// The lib functions a route imports, with their bodies (one level: the helper the route calls).
function importedLibFunctions(routePath, text) {
  const out = [];
  for (const m of text.matchAll(/import \{([^}]*)\} from '((?:\.\.\/)+lib\/[^']+)'/g)) {
    if (NOT_A_WRITE.some((f) => m[2].endsWith(f.replace(/^lib\//, 'lib/').replace(/\.js$/, '')) || m[2].endsWith(f))) continue;
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    let file = resolve(dirname(join(ROOT, routePath)), m[2]); if (!/\.js$/.test(file)) file += '.js';
    if (!existsSync(file)) continue;
    const fns = Object.fromEntries(exportedFunctions(readFileSync(file, 'utf8')).map((f) => [f.name, f.body]));
    // The helper's body, plus the bodies of the same file's exported functions it calls (one more
    // level: claimReferrals writes through saveReferral, decideApplicant through ownedApplicant).
    const withCalls = (body) => body + Object.entries(fns).filter(([k]) => new RegExp(`\\b${k}\\(`).test(body)).map(([, b]) => b).join('\n');
    for (const n of names) if (fns[n]) out.push({ name: n, file: relative(ROOT, file), body: withCalls(fns[n]) });
  }
  return out;
}

export function realtorWriteRoutes() {
  const out = [];
  for (const p of walk(join(ROOT, 'pages', 'api'))) {
    const rel = relative(ROOT, p);
    const text = readFileSync(p, 'utf8');
    if (!SESSION.test(text)) continue; // public, cron, admin and tenant routes are not realtor routes
    const helpers = importedLibFunctions(rel, text);
    const writesHere = WRITE.test(text);
    const writingHelpers = helpers.filter((h) => WRITE.test(h.body)).map((h) => `${h.file} ${h.name}`);
    if (!writesHere && !writingHelpers.length) continue;
    const ownsHere = OWNERSHIP.test(text);
    const owningHelpers = helpers.filter((h) => OWNERSHIP.test(h.body)).map((h) => `${h.file} ${h.name}`);
    out.push({ route: rel, session: SESSION.test(text), entitlement: ENTITLEMENT.test(text), ownership: ownsHere || owningHelpers.length > 0, via: [...writingHelpers], owningVia: owningHelpers });
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

test('every realtor write route carries session, requireEntitlement and an ownership check', () => {
  const routes = realtorWriteRoutes();
  console.log(`realtor write routes (${routes.length}):\n${routes.map((r) => `  ${r.route}${r.via.length ? `  (writes through ${r.via.join(', ')})` : ''}`).join('\n')}`);
  assert.ok(routes.length >= 30, `the scan found the realtor writers (${routes.length})`);
  for (const must of ['pages/api/events/read.js', 'pages/api/referrals/claim.js', 'pages/api/listings/status.js', 'pages/api/applicants/decision.js', 'pages/api/notifications.js']) assert.ok(routes.some((r) => r.route === must), `${must} is found as a realtor write`);
  const missing = [];
  for (const r of routes) {
    if (!r.session) missing.push(`${r.route}: no session`);
    if (!r.entitlement && !EXEMPT[r.route]) missing.push(`${r.route}: no requireEntitlement`);
    if (!r.ownership) missing.push(`${r.route}: no ownership check`);
  }
  assert.deepEqual(missing, [], `every realtor write route carries all three:\n${missing.join('\n')}`);
  for (const [route, why] of Object.entries(EXEMPT)) { assert.ok(existsSync(join(ROOT, route)), `${route} exists (${why})`); assert.ok(routes.some((r) => r.route === route) || !WRITE.test(src(route)), route); }
});

test('the two routes the audit named gate on entitlement after the session, before the write', () => {
  for (const route of ['pages/api/events/read.js', 'pages/api/referrals/claim.js']) {
    const text = src(route);
    const session = text.indexOf('requireRealtor('); const gate = text.indexOf('requireEntitlement(req, res, ctx.supabase, ctx.user)'); const write = text.search(WRITE) >= 0 ? text.search(WRITE) : text.indexOf('claimReferrals(');
    assert.ok(session > 0 && gate > session && write > gate, `${route}: session, then entitlement, then the write (${session}, ${gate}, ${write})`);
  }
});
