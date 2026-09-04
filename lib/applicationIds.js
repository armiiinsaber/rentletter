// lib/applicationIds.js  PURE, shared by the generator, every route and the tenant page.
// The application number and the owner token: one alphabet, one generator, one validator each.
//
//   Number  RL-YYYY-XXXX-XXXX. Since 4f5626d the two segments come from ID_ALPHABET (no 0, O, 1,
//           I or L). Numbers minted before that are hex segments ([A-F0-9]); they stay valid.
//   Token   32 characters from ID_ALPHABET, before and after 4f5626d.
//
// Every check normalizes first (trim, upper case), so a pasted lower case key passes.
import crypto from 'crypto';

export const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const OWNER_TOKEN_LENGTH = 32;

const SEG = `(?:[${ID_ALPHABET}]{4}|[A-F0-9]{4})`;
const NUMBER_RE = new RegExp(`^RL-\\d{4}-${SEG}-${SEG}$`);
const TOKEN_RE = new RegExp(`^[${ID_ALPHABET}]{${OWNER_TOKEN_LENGTH}}$`);
export const LEGACY_NUMBER_RE = /^RL-\d{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

export const normalizeApplicationNumber = (v) => String(v || '').trim().toUpperCase();
export const normalizeOwnerToken = (v) => String(v || '').trim().toUpperCase();

export const isApplicationNumber = (v) => NUMBER_RE.test(normalizeApplicationNumber(v));
export const isOwnerToken = (v) => TOKEN_RE.test(normalizeOwnerToken(v));

const pick = (n) => Array.from({ length: n }, () => ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)]).join('');
export const newApplicationNumber = (year = new Date().getFullYear()) => `RL-${year}-${pick(4)}-${pick(4)}`;
export const newOwnerToken = () => pick(OWNER_TOKEN_LENGTH);
// The landlord report page token: the same 32 characters of the alphabet (lib/reportSnapshot.js).
export const newReportToken = () => pick(OWNER_TOKEN_LENGTH);
export const isReportToken = (v) => TOKEN_RE.test(String(v || ''));
