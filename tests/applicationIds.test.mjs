// The application number and owner token: the generator and every validator agree, and the
// numbers minted before 4f5626d (hex segments) keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isApplicationNumber, isOwnerToken, newApplicationNumber, newOwnerToken, ID_ALPHABET, LEGACY_NUMBER_RE } from '../lib/applicationIds.js';

test('new format: what the generator produces passes, including the real number that failed', () => {
  assert.equal(isApplicationNumber('RL-2026-MCKQ-PW9U'), true);
  for (let i = 0; i < 200; i++) { const n = newApplicationNumber(); assert.equal(isApplicationNumber(n), true, n); assert.match(n, new RegExp(`^RL-\\d{4}-[${ID_ALPHABET}]{4}-[${ID_ALPHABET}]{4}$`)); }
  assert.equal(isApplicationNumber(' rl-2026-mckq-pw9u '), true, 'normalizes case and whitespace');
});

test('old format: hex segments minted before 4f5626d still pass', () => {
  for (const n of ['RL-2026-E3E8-3349', 'RL-2026-16DD-2F40', 'RL-2026-137E-400C', 'RL-2025-0000-FFFF']) {
    assert.equal(LEGACY_NUMBER_RE.test(n), true, `${n} is the old format`);
    assert.equal(isApplicationNumber(n), true, n);
  }
});

test('junk is refused: wrong prefix, wrong length, the letters the alphabet skips, a missing segment', () => {
  for (const n of ['RL-2026-MCKQ', 'XX-2026-MCKQ-PW9U', 'RL-26-MCKQ-PW9U', 'RL-2026-MCKQ-PW9UU', 'RL-2026-IOL1-PW9U', 'RL-2026-MCK-PW9U', '', null, 'RL-2026-MCKQ-PW9U; drop']) {
    assert.equal(isApplicationNumber(n), false, String(n));
  }
});

test('owner token: 32 characters of the alphabet, new and old generators alike; anything else refused', () => {
  for (let i = 0; i < 50; i++) { const t = newOwnerToken(); assert.equal(t.length, 32); assert.equal(isOwnerToken(t), true); }
  const legacy = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892'; // the pre 4f5626d generator used this alphabet with Math.random
  assert.equal(isOwnerToken(legacy), true);
  assert.equal(isOwnerToken(legacy.toLowerCase()), true, 'a pasted lower case key normalizes');
  assert.equal(isOwnerToken(legacy.slice(0, 31)), false);
  assert.equal(isOwnerToken(`${legacy}A`), false);
  assert.equal(isOwnerToken('ABCDEFGHJKMNPQRSTUVWXYZ23456789O'), false, 'O is not in the alphabet');
  assert.equal(isOwnerToken(''), false);
});

test('every validator reads the shared helper; no hex only regex remains', () => {
  const files = ['pages/my-application.js', 'pages/api/application/manage.js', 'pages/api/tenant/profile.js', 'pages/api/tenant/sync-application.js', 'pages/api/listings/add-applicant.js', 'pages/api/applications/mirror.js', 'pages/api/generate.js'];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\[A-F0-9\]\{4\}/, `${f} still carries the hex regex`);
    assert.match(src, /lib\/applicationIds/, `${f} imports the helper`);
  }
});
