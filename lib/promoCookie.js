// lib/promoCookie.js — SERVER-ONLY. The rl_promo cookie set by /join/<code>: read it, redeem it
// for the signed-in profile, clear it. Used by the auth callback (where the account is born) and
// by the dashboard load as a fallback (sign-in without the email-link hop). Never throws and
// never blocks the caller: a failed redemption just leaves the profile at plan = 'none'.
import { redeemPromoCode, CODE_RE, normalizeCode } from './promos';

export const PROMO_COOKIE = 'rl_promo';
export const readPromoCookie = (req) => { const v = req?.cookies?.[PROMO_COOKIE]; const c = normalizeCode(v ? decodeURIComponent(v) : ''); return CODE_RE.test(c) ? c : null; };
export function clearPromoCookie(res) {
  const prev = res.getHeader('Set-Cookie'); const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
  res.setHeader('Set-Cookie', [...list, `${PROMO_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`]);
}
export async function redeemPromoFromCookie(req, res, profileId) {
  const code = readPromoCookie(req); if (!code || !profileId) return null;
  let r = null;
  try { r = await redeemPromoCode({ code, profileId }); } catch (e) { r = null; }
  clearPromoCookie(res);
  return r;
}
