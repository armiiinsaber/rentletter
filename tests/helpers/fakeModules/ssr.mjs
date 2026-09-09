// Stands in for @supabase/ssr: the RLS client of the installed fake stack.
const stack = () => { const s = globalThis.__rlStack; if (!s) throw new Error('installFakeStack was not called'); return s; };
export function createServerClient() { return new Proxy({}, { get: (_, p) => stack().rls[p] }); }
export const serializeCookieHeader = (name, value) => `${name}=${value}`;
// The browser client is imported by lib/supabase/client.js from components; on the server it is never called.
export function createBrowserClient() { return new Proxy({}, { get: (_, p) => { if (p === 'auth') return { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }; return () => { throw new Error(`browser client used on the server: ${String(p)}`); }; } }); }
