// lib/profileShareStore.js  SERVER ONLY (takes the service role client). The one read of a
// tenant's profile on behalf of a realtor (docs/design/profile-and-circle.md sections 4.12 and
// 6.2). It reads the view public.tenant_profile_shareable (db/015-profile-verified-email.sql),
// never the table public.tenant_profiles: the table holds each application's owner token
// (applications) and every answer the tenant typed, and the view holds neither. What comes back
// is lib/profileFacts.js sharePayload, checked by assertSharePayload before it is returned.
//
// No route calls this yet: the share (who may read, approved by the tenant) arrives with
// profile_shares. Until then this is the reader that later routes must use, and
// tests/profileFacts.test.mjs fails if realtor facing code reads the table instead.
//
//   readShareableProfile(admin, profileId) -> { ok: true, payload } | { ok: false, reason }
//     reason: 'absent' (db/015 has not run), 'not found', 'failed'
import { sharePayload, assertSharePayload } from './profileFacts.js';

export const SHAREABLE_VIEW = 'tenant_profile_shareable';
export const SHAREABLE_COLUMNS = 'id, facts, facts_updated_at, email_verified_at';
const msg = (e) => String((e && e.message) || e || '');
export const viewAbsent = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204' || /(does not exist|could not find|schema cache)/i.test(msg(e)));

export async function readShareableProfile(admin, profileId) {
  try {
    if (!admin || !profileId) return { ok: false, reason: 'not found' };
    const { data, error } = await admin.from(SHAREABLE_VIEW).select(SHAREABLE_COLUMNS).eq('id', String(profileId)).maybeSingle();
    if (error) return { ok: false, reason: viewAbsent(error) ? 'absent' : 'failed' };
    if (!data) return { ok: false, reason: 'not found' };
    // Document checks arrive with the vault (tenant_profile_checks): none yet.
    return { ok: true, payload: assertSharePayload(sharePayload(data, [])) };
  } catch (e) { return { ok: false, reason: 'failed' }; }
}
