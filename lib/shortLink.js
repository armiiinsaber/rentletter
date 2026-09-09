// lib/shortLink.js  PURE. The short invite link and the post kit texts.
//   Code    7 characters from ID_ALPHABET (lib/applicationIds.js), minted with crypto. Codes
//           minted before this were 5 characters; they keep resolving.
//   KV      short:{code} holds the invite token, same TTL as linvite:{token} (INVITE_TTL). The
//           invite record carries shortCode. Written by pages/api/listings/invite.js on create,
//           regenerate and the lazy first load; the old code's key is deleted on regenerate.
//   URL     https://rentletter.ca/a/{code}, resolved by pages/a/[code].js.
import crypto from 'crypto';
import { ID_ALPHABET } from './applicationIds.js';

export const SHORT_CODE_LENGTH = 7;
export const LEGACY_SHORT_CODE_LENGTH = 5;
export const SHORT_LINK_IP_LIMIT = 60; // an hour, per IP, before the KV read (pages/a/[code].js)
export const INVITE_TTL = 7776000; // 90 days, the invite record's TTL in pages/api/listings/invite.js
export const SITE = 'https://rentletter.ca';

const CODE_RE = new RegExp(`^(?:[${ID_ALPHABET}]{${LEGACY_SHORT_CODE_LENGTH}}|[${ID_ALPHABET}]{${SHORT_CODE_LENGTH}})$`);
export const isShortCode = (c) => CODE_RE.test(String(c || ''));
// Sandbox codes: DEMO1 (five) and DEMO001 (seven) both open the sandbox invite.
export const isDemoCode = (c) => /^DEMO\d{1,3}$/.test(String(c || ''));
export const newShortCode = () => Array.from({ length: SHORT_CODE_LENGTH }, () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)]).join('');
export const shortKey = (code) => `short:${String(code).toUpperCase()}`;
export const shortUrl = (code) => `${SITE}/a/${String(code).toUpperCase()}`;

// The resolve behind pages/a/[code].js, pure over its clients so it is tested with fakes:
//   resolveShortCode(code, { kvGet, limiter, ip, now }) -> { redirect } | { invalid } | { limited }
// The IP limiter runs before the KV read (60 an hour, lib/rateLimit.js); the sandbox codes never
// touch KV; an unknown or expired code is the invalid state.
export async function resolveShortCode(rawCode, { kvGet, limiter, ip, now = Date.now(), checkLimits } = {}) {
  const code = String(rawCode || '').toUpperCase();
  if (isDemoCode(code)) return { redirect: '/apply/demo0000000000000001', sandbox: true };
  if (!isShortCode(code)) return { invalid: 'This link does not look right. Please use the exact link the listing realtor posted.' };
  if (checkLimits && limiter) {
    const limited = await checkLimits(limiter, { ip, now, scope: 'short', ipLimit: SHORT_LINK_IP_LIMIT });
    if (!limited.ok) return { limited: 'Too many link opens from this connection in the last hour. Please try again later.' };
  }
  try {
    const token = kvGet ? await kvGet(shortKey(code)) : null;
    const t = typeof token === 'string' ? token : (token && token.token) || null;
    if (t && /^[a-f0-9]{20}$/.test(t)) return { redirect: `/apply/${t}` };
  } catch (e) { console.error('[a/code] resolve failed:', e?.message || e); }
  return { invalid: 'This invite link has expired or is no longer active. Please contact the listing realtor for a new link.' };
}

// The address as a file name: lower case, letters and digits, single dashes, no leading or
// trailing dash. "210 Carlaw Ave, Unit 4, Toronto" becomes "210-carlaw-ave-unit-4-toronto".
export const addressSlug = (address) => String(address || 'listing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'listing';

// The three texts the realtor copies. No dash characters anywhere in them.
export function postKitTexts(address, short) {
  const where = String(address || 'the unit').trim();
  return {
    description: `Apply in ten minutes, no PDFs to attach: ${short}`,
    instagram: `Apply for ${where}: ${short}`,
    reply: `Hi, yes, ${where} is still available. The application takes about ten minutes and there is nothing to attach: ${short}. Happy to answer any questions.`,
  };
}
