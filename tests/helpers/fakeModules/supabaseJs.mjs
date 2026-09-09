// Stands in for @supabase/supabase-js: the service role client of the installed fake stack. The
// real admin module caches its client, so this proxy resolves the stack on every property read.
const stack = () => { const s = globalThis.__rlStack; if (!s) throw new Error('installFakeStack was not called'); return s; };
export function createClient() { return new Proxy({}, { get: (_, p) => stack().db[p] }); }
