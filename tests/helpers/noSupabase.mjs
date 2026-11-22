// tests/helpers/noSupabase.mjs  No request for a supabase.co host leaves a walk's browser.
// A production build inlines the Supabase address at build time (NEXT_PUBLIC_SUPABASE_URL), so a page
// that calls Supabase from the browser (the reset page's verifyOtp on a token_hash link) would reach
// a real supabase.co host with a dummy key. The production walks stop every such request in the
// browser context, the way the other production walks always have (ctx.route(/supabase\.co\//,
// abort)), and then check that none went out all the same.
//   blockSupabase(ctx)        stops every request for a supabase.co address in this context and
//                             watches every request the context makes; answers the guard
//   guard.answered(request)   a request the walk's own stub answered in the browser (a page route
//                             that fulfills it) counts as kept in, not as left
//   noSupabaseLeft(ctx, tag)  asserts the context was guarded and that no request for a supabase.co
//                             host was let through; call it at the end of the walk, before the close
import assert from 'node:assert/strict';

const HOST = /(^|\.)supabase\.co$/i;
const hostOf = (url) => { try { return new URL(url).hostname; } catch (e) { return ''; } };

export async function blockSupabase(ctx) {
  const seen = []; const kept = new Set();
  ctx.on('request', (r) => { if (HOST.test(hostOf(r.url()))) seen.push(r); });
  await ctx.route(/supabase\.co\//, (route) => { kept.add(route.request()); return route.abort(); });
  const guard = {
    answered: (request) => { kept.add(request); },
    left: () => seen.filter((r) => !kept.has(r)).map((r) => `${r.method()} ${hostOf(r.url())}${new URL(r.url()).pathname}`),
    stopped: () => seen.filter((r) => kept.has(r)).length,
  };
  ctx.__noSupabase = guard;
  return guard;
}

export function noSupabaseLeft(ctx, tag = '') {
  const guard = ctx && ctx.__noSupabase;
  assert.ok(guard, `${tag}: the context stops supabase.co requests (blockSupabase)`);
  assert.deepEqual(guard.left(), [], `${tag}: no request left the browser for a supabase.co host`);
}
