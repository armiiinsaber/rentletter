// lib/shortLink.js  PURE. The short invite link and the post kit texts.
//   Code    5 characters from ID_ALPHABET (lib/applicationIds.js), minted with crypto.
//   KV      short:{code} holds the invite token, same TTL as linvite:{token} (INVITE_TTL). The
//           invite record carries shortCode. Written by pages/api/listings/invite.js on create,
//           regenerate and the lazy first load; the old code's key is deleted on regenerate.
//   URL     https://rentletter.ca/a/{code}, resolved by pages/a/[code].js.
import crypto from 'crypto';
import { ID_ALPHABET } from './applicationIds.js';

export const SHORT_CODE_LENGTH = 5;
export const INVITE_TTL = 7776000; // 90 days, the invite record's TTL in pages/api/listings/invite.js
export const SITE = 'https://rentletter.ca';

const CODE_RE = new RegExp(`^[${ID_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);
export const isShortCode = (c) => CODE_RE.test(String(c || ''));
export const isDemoCode = (c) => /^DEMO\d$/.test(String(c || ''));
export const newShortCode = () => Array.from({ length: SHORT_CODE_LENGTH }, () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)]).join('');
export const shortKey = (code) => `short:${String(code).toUpperCase()}`;
export const shortUrl = (code) => `${SITE}/a/${String(code).toUpperCase()}`;

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
