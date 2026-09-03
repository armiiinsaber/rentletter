// lib/promos.js
// SERVER-ONLY. Promo codes: validation, redemption, and the founder's admin operations. Every
// read and write goes through the service-role client (the tables are RLS'd to nobody else).
// Import this ONLY from pages/api/** and getServerSideProps — never from a component.
import { getSupabaseAdminClient } from './supabase/admin';

export const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const normalizeCode = (s) => String(s || '').trim().toLowerCase();
// "Alex Moreau" → "rentletter-alex"; anything → url-safe slug
export const suggestCode = (name) => { const first = String(name || '').trim().split(/\s+/)[0] || ''; const slug = first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); return slug ? `rentletter-${slug}` : ''; };

const MISSING = (e) => e && (e.code === '42P01' || e.code === '42883' || /relation .* does not exist|could not find the (table|function)|schema cache/i.test(e.message || ''));
const admin = () => getSupabaseAdminClient();

const publicShape = (row) => ({ valid: true, recipientName: row.recipient_name || null, grantType: row.grant_type, trialDays: row.grant_type === 'trial' ? row.trial_days : null });
export const INVALID = Object.freeze({ valid: false, recipientName: null, grantType: null, trialDays: null });

// What the public join page / validate route may know: only that an active code with
// redemptions remaining exists, and how to describe it. Same shape for every failure.
export async function validatePromoCode(code) {
  const c = normalizeCode(code);
  if (!CODE_RE.test(c)) return { ...INVALID };
  const { data, error } = await admin().from('promo_codes').select('recipient_name, grant_type, trial_days, active, max_redemptions, redemption_count').eq('code', c).maybeSingle();
  if (error || !data || !data.active || data.redemption_count >= data.max_redemptions) return { ...INVALID };
  return publicShape(data);
}

const MESSAGES = {
  granted_lifetime: 'Founding member, free for life.',
  granted_trial: 'Trial started.',
  already_redeemed: 'This account has already used a code.',
  exhausted: 'This code has already been used.',
  inactive: 'This code is no longer active.',
  invalid: 'This code is not valid.',
  no_profile: 'Account not ready yet.',
};

// Redeem for a signed-in profile. Atomic: the whole thing is one SQL function (row lock +
// unique (code, profile) + count + grant in a single transaction), so two concurrent calls for
// the same profile resolve to one grant and one 'already_redeemed'. Never throws.
export async function redeemPromoCode({ code, profileId }) {
  const c = normalizeCode(code);
  if (!CODE_RE.test(c) || !profileId) return { ok: false, status: 'invalid', message: MESSAGES.invalid };
  try {
    const { data, error } = await admin().rpc('redeem_promo_code', { p_code: c, p_profile_id: profileId });
    if (error) { if (MISSING(error)) return { ok: false, status: 'unavailable', message: 'Promo codes are not set up yet.' }; return { ok: false, status: 'error', message: 'Could not redeem right now.' }; }
    const status = String(data || 'error');
    return { ok: status.startsWith('granted_'), status, message: MESSAGES[status] || 'Could not redeem right now.' };
  } catch (e) { return { ok: false, status: 'error', message: 'Could not redeem right now.' }; }
}

// ── Founder admin ────────────────────────────────────────────────────────────────────────────
export const LIFETIME_CAP = 10;
export async function listPromoCodes() {
  const sb = admin();
  const [{ data: codes, error }, { data: reds, error: e2 }] = await Promise.all([
    sb.from('promo_codes').select('*').order('created_at', { ascending: false }),
    sb.from('promo_redemptions').select('id, promo_code_id, profile_id, redeemed_at').order('redeemed_at', { ascending: false }),
  ]);
  if (error || e2) { const e = error || e2; if (MISSING(e)) return { migrationMissing: true, codes: [], lifetimeActive: 0 }; throw new Error(e.message); }
  // Who redeemed: email + name from profiles (service role), keyed by profile id.
  const ids = [...new Set((reds || []).map((r) => r.profile_id))];
  let who = new Map();
  if (ids.length) { const { data: profiles } = await sb.from('profiles').select('id, full_name, email').in('id', ids); who = new Map((profiles || []).map((p) => [p.id, p])); }
  const byCode = new Map();
  for (const r of reds || []) { const p = who.get(r.profile_id) || {}; (byCode.get(r.promo_code_id) || byCode.set(r.promo_code_id, []).get(r.promo_code_id)).push({ profileId: r.profile_id, name: p.full_name || null, email: p.email || null, redeemedAt: r.redeemed_at }); }
  const list = (codes || []).map((c) => ({ ...c, redemptions: byCode.get(c.id) || [] }));
  return { migrationMissing: false, codes: list, lifetimeActive: list.filter((c) => c.active && c.grant_type === 'lifetime').length };
}
export async function codeAvailable(code) {
  const c = normalizeCode(code); if (!CODE_RE.test(c)) return { ok: false, reason: 'format' };
  const { data, error } = await admin().from('promo_codes').select('id').eq('code', c).maybeSingle();
  if (error) { if (MISSING(error)) return { ok: false, reason: 'migration' }; throw new Error(error.message); }
  return { ok: !data, reason: data ? 'taken' : null };
}
// Turns the database's own refusals into one plain sentence.
export function readableDbError(e) {
  const m = String(e?.message || e || '');
  if (/Lifetime code limit reached/i.test(m)) return 'Lifetime code limit reached: 10 active lifetime codes already exist. Revoke one first.';
  if (/promo_codes_code_key|duplicate key/i.test(m)) return 'That code is already taken.';
  if (/promo_codes_code_format/i.test(m)) return 'Codes are lowercase letters, numbers and single dashes.';
  if (/promo_codes_trial_days/i.test(m)) return 'Trial codes need a length between 1 and 365 days.';
  if (/promo_codes_max_redemptions/i.test(m)) return 'Max redemptions must be at least 1.';
  return m.replace(/^.*?:\s*/, '').slice(0, 200) || 'That didn’t save.';
}
export async function createPromoCode({ code, label, recipientName, grantType, trialDays, maxRedemptions, note }) {
  const c = normalizeCode(code);
  const row = { code: c, label: label?.trim() || null, recipient_name: recipientName?.trim() || null, grant_type: grantType === 'lifetime' ? 'lifetime' : 'trial', trial_days: grantType === 'lifetime' ? null : Math.max(1, Math.min(365, Number(trialDays) || 30)), max_redemptions: Math.max(1, Number(maxRedemptions) || 1), note: note?.trim() || null };
  const { data, error } = await admin().from('promo_codes').insert(row).select().single();
  if (error) throw new Error(readableDbError(error));
  return { ...data, redemptions: [] };
}
export async function revokePromoCode(id) {
  const { data, error } = await admin().from('promo_codes').update({ active: false }).eq('id', id).select().single();
  if (error) throw new Error(readableDbError(error));
  return data;
}
