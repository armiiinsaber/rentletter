// lib/realtorInvite.js  SERVER ONLY. Invite a realtor: each realtor's own link, and the realtors
// who joined through it (db/017-realtor-invites.sql). One level: who brought whom in, nothing
// about anyone further along. Not the tenant referral system (lib/referrals.js), which passes a
// tenant between realtors and shares nothing with this file.
//
//   profiles.invite_code   the realtor's one stable code. Made here, by the server, the first time
//                          the realtor opens the invite section, and never changed afterwards.
//   profiles.invited_by    the realtor whose link a new realtor signed up from. Written once, at
//                          signup, by lib/signupSource.js recordSignupSource and by nothing else.
//
// What a realtor can read: their own code, and for each realtor they invited a name and a join
// date. Never an invited realtor's email, plan, listings, applicants or numbers, and never
// anyone else's code or list. Every query here is keyed by the caller's own id.
// Before db/017 has run the columns are absent: the section answers that it is not available.
import { randomInt } from 'node:crypto';
import { isInviteCode } from './signupSource';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newInviteCode = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
export const inviteLink = (code) => `${siteBase()}/join?invite=${code}`;

const msg = (e) => String((e && e.message) || e || '');
const columnAbsent = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /(does not exist|could not find)/i.test(msg(error)));

// The caller's own code, made on the first call. A profile's code is written only while it has
// none, so two calls at once end on the same code; a code another profile already holds is
// refused by the unique index and another is tried.
export async function ensureInviteCode(admin, userId) {
  const read = () => admin.from('profiles').select('invite_code').eq('id', userId).maybeSingle();
  let { data, error } = await read();
  if (error) return columnAbsent(error) ? { available: false } : { error };
  if (!data) return { missing: true };
  for (let attempt = 0; attempt < 4 && !isInviteCode(data.invite_code); attempt++) {
    const write = await admin.from('profiles').update({ invite_code: newInviteCode() }).eq('id', userId).is('invite_code', null);
    if (write.error && columnAbsent(write.error)) return { available: false };
    ({ data, error } = await read());
    if (error || !data) return { error: error || new Error('profile gone') };
  }
  return isInviteCode(data.invite_code) ? { available: true, code: data.invite_code } : { error: new Error('no invite code could be made') };
}

// The realtors who signed up from the caller's link: name and join date, newest first.
export async function invitedRealtors(admin, userId) {
  const { data, error } = await admin.from('profiles').select('full_name, created_at').eq('invited_by', userId).order('created_at', { ascending: false }).limit(500);
  if (error) return columnAbsent(error) ? { available: false } : { error };
  return { available: true, invited: (data || []).map((p) => ({ name: String(p.full_name || '').trim() || null, joinedAt: p.created_at || null })) };
}

// What the invite section shows (pages/api/profile/invite.js).
export async function loadRealtorInvite({ admin, userId }) {
  const mine = await ensureInviteCode(admin, userId);
  if (mine.error) throw mine.error;
  if (mine.missing) return { status: 404, body: { error: 'Profile not found.' } };
  if (!mine.available) return { status: 200, body: { available: false } };
  const list = await invitedRealtors(admin, userId);
  if (list.error) throw list.error;
  if (!list.available) return { status: 200, body: { available: false } };
  return { status: 200, body: { available: true, code: mine.code, link: inviteLink(mine.code), invited: list.invited } };
}
