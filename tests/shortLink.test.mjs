// The short invite link: the code, the resolve for live, expired and unknown codes, the
// invalidation on regenerate, and the three post kit texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newShortCode, isShortCode, isDemoCode, shortKey, shortUrl, addressSlug, postKitTexts, INVITE_TTL } from '../lib/shortLink.js';
import { ID_ALPHABET } from '../lib/applicationIds.js';

test('the code: five characters of the alphabet, unique enough, never O, 0, I, L or 1', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const c = newShortCode(); assert.equal(c.length, 5); assert.equal(isShortCode(c), true); assert.match(c, new RegExp(`^[${ID_ALPHABET}]{5}$`)); seen.add(c); }
  assert.ok(seen.size > 495);
  for (const bad of ['ABCD', 'ABCDEF', 'ABCD0', 'ABCDO', 'abcde', '', null]) assert.equal(isShortCode(bad), false, String(bad));
  assert.equal(isDemoCode('DEMO1'), true); assert.equal(isShortCode('DEMO1'), false, 'the sandbox code can never collide with a real one');
  assert.equal(shortKey('abcde'), 'short:ABCDE'); assert.equal(shortUrl('abcde'), 'https://rentletter.ca/a/ABCDE');
  assert.equal(INVITE_TTL, 7776000);
});

test('resolve: a live code redirects to the token, an expired or unknown code renders the invalid state', async () => {
  const src = readFileSync(new URL('../pages/a/[code].js', import.meta.url), 'utf8');
  assert.match(src, /kvGet\(shortKey\(code\)\)/);
  assert.match(src, /redirect: \{ destination: `\/apply\/\$\{t\}`, permanent: false \}/, 'live: 302 to the apply page');
  assert.match(src, /This invite link has expired or is no longer active/, 'expired or unknown: the invalid link copy');
  assert.match(src, /This link is no longer active/, 'the invalid card heading');
  // The route reads with the same kvGet the rest of the app uses; a missing key is null.
  const { kvGet } = await import('../lib/kv.js');
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  assert.equal(await kvGet('short:ZZZZZ'), null, 'unknown or expired: nothing comes back');
});

test('the invite route writes the code beside the record and invalidates the old one on regenerate', () => {
  const src = readFileSync(new URL('../pages/api/listings/invite.js', import.meta.url), 'utf8');
  assert.match(src, /payload\.shortCode = shortCode;/, 'the record carries the code');
  assert.match(src, /\$\{base\}\/set\/\$\{shortKey\(shortCode\)\}/, 'short:{code} holds the token');
  assert.match(src, /\$\{base\}\/expire\/\$\{shortKey\(shortCode\)\}\/\$\{INVITE_TTL\}/, 'same TTL as the record');
  assert.match(src, /if \(!reuse && prev\?\.shortCode\) await fetch\(`\$\{base\}\/del\/\$\{shortKey\(prev\.shortCode\)\}`/, 'regenerate deletes the old key');
  assert.match(src, /reuse && isShortCode\(prev\?\.shortCode\) \? prev\.shortCode : newShortCode\(\)/, 'reuse keeps the code, a record without one gets one lazily');
});

test('the three texts with a sample address carry no dash characters', () => {
  const t = postKitTexts('210 Carlaw Ave, Unit 4, Toronto', 'https://rentletter.ca/a/K7MPQ');
  assert.equal(t.description, 'Apply in ten minutes, no PDFs to attach: https://rentletter.ca/a/K7MPQ');
  assert.equal(t.instagram, 'Apply for 210 Carlaw Ave, Unit 4, Toronto: https://rentletter.ca/a/K7MPQ');
  assert.equal(t.reply, 'Hi, yes, 210 Carlaw Ave, Unit 4, Toronto is still available. The application takes about ten minutes and there is nothing to attach: https://rentletter.ca/a/K7MPQ. Happy to answer any questions.');
  for (const v of Object.values(t)) assert.doesNotMatch(v, /[-—–]/, v);
  assert.equal(addressSlug('210 Carlaw Ave, Unit 4, Toronto'), '210-carlaw-ave-unit-4-toronto');
  assert.equal(addressSlug(''), 'listing');
});
