// Creating a listing and its invite, then updating it: pages/api/listings/create.js, invite.js and
// update.js through their handlers over the fake stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('../helpers/fakeStackHook.mjs', import.meta.url);
import { installFakeStack, fakeReq, fakeRes } from '../helpers/fakeStack.mjs';
import { tables, USER, OTHER, ago } from './fixture.mjs';

const create = (await import('../../pages/api/listings/create.js')).default;
const invite = (await import('../../pages/api/listings/invite.js')).default;
const update = (await import('../../pages/api/listings/update.js')).default;
const { fetchListingApplicants } = await import('../../lib/supabaseBridge.js');
const { INVITE_TTL, isShortCode } = await import('../../lib/shortLink.js');
let stack;
const up = (opts = {}) => { if (stack) stack.restore(); stack = installFakeStack({ tables: tables(opts.fixture || {}), user: opts.user === undefined ? USER : opts.user }); return stack; };
const call = async (handler, body) => { const res = fakeRes(); await handler(fakeReq({ body }), res); return res; };
const BODY = { address: '5 New St, Unit 2, Toronto', monthly_rent: 2600, bedrooms: '2', landlord_name: 'Pat Owner', landlord_email: 'pat@example.com', pref_rent_to_income_max_pct: 40, pref_requires_landlord_reference: true };

test('create: 401 without a session, 402 for a lapsed profile', async () => {
  up({ user: null });
  assert.equal((await call(create, BODY)).code, 401);
  up({ fixture: { plan: 'trial', profileOver: { trial_ends_at: ago(2) } } });
  const r = await call(create, BODY);
  assert.equal(r.code, 402); assert.equal(r.body.code, 'payment_required'); assert.equal(r.body.status, 'trial_expired');
  assert.equal(stack.db.tables.listings.filter((l) => l.address === BODY.address).length, 0, 'nothing inserted');
});

test('create inserts the row for the session\'s realtor, the invite path mints the record, the code and the link, and both events land', async () => {
  const s = up();
  const r = await call(create, { ...BODY, profile_id: OTHER.id });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const row = s.db.tables.listings.find((l) => l.address === BODY.address);
  assert.equal(row.profile_id, USER.id, 'profile_id comes from the session, never the body');
  assert.equal(row.pref_rent_to_income_max_pct, 40); assert.equal(row.name, BODY.address);
  assert.deepEqual(s.db.tables.events.filter((e) => e.type === 'listing_created').map((e) => [e.profile_id, e.listing_id]), [[USER.id, row.id]]);
  // the invite, as the dashboard calls it right after create (components/dashboard/HomeView.js)
  const inv = await call(invite, { listingId: row.id });
  assert.equal(inv.code, 200, JSON.stringify(inv.body));
  const { token, url, shortCode, shortUrl } = inv.body;
  assert.match(token, /^[a-f0-9]{20}$/); assert.equal(url, `https://rentletter.ca/apply/${token}`);
  assert.equal(shortCode.length, 7); assert.ok(isShortCode(shortCode)); assert.equal(shortUrl, `https://rentletter.ca/a/${shortCode}`);
  const rec = s.kv.values[`linvite:${token}`];
  assert.equal(rec.realtorName, 'Sarah Chen'); assert.equal(rec.realtorBrokerage, 'Demo Realty'); assert.equal(rec.province, 'ON');
  assert.deepEqual(rec.unit, { address: BODY.address, monthlyRent: '2600', bedrooms: '2', allowsPets: 'any', allowsSmoking: 'no', parkingIncluded: 'no' });
  assert.equal(rec.submissionCount, 0); assert.equal(rec.shortCode, shortCode);
  assert.equal(s.kv.ttl(`linvite:${token}`), INVITE_TTL, 'the 90 day TTL'); assert.equal(INVITE_TTL, 90 * 24 * 3600);
  assert.equal(s.kv.values[`short:${shortCode}`], token); assert.equal(s.kv.ttl(`short:${shortCode}`), INVITE_TTL);
  const after = s.db.tables.listings.find((l) => l.id === row.id);
  assert.equal(after.invite_token, token); assert.equal(after.invite_url, url);
  assert.equal(s.db.tables.events.filter((e) => e.type === 'invite_link_created' && e.listing_id === row.id).length, 1);
  // a second call reuses the token and the code
  const again = await call(invite, { listingId: row.id });
  assert.equal(again.body.token, token); assert.equal(again.body.shortCode, shortCode);
  // regenerate: the old code deleted, the new one written, the row and the record replaced
  const re = await call(invite, { listingId: row.id, regenerate: true });
  assert.equal(re.code, 200); assert.notEqual(re.body.token, token); assert.notEqual(re.body.shortCode, shortCode);
  assert.equal(s.kv.values[`short:${shortCode}`], undefined, 'the old code is dead');
  assert.equal(s.kv.values[`short:${re.body.shortCode}`], re.body.token);
  assert.equal(s.kv.values[`linvite:${re.body.token}`].shortCode, re.body.shortCode);
  assert.equal(s.db.tables.listings.find((l) => l.id === row.id).invite_token, re.body.token);
  // another realtor's listing: 404 under RLS, nothing minted
  const foreign = await call(invite, { listingId: 'L9' });
  assert.equal(foreign.code, 404);
});

test('update: a rent change re scores the applicants; only whitelisted fields are written', async () => {
  const s = up();
  const before = (await fetchListingApplicants(s.db, 'L1')).find((a) => a.linkId === 'J1').application.fit;
  assert.equal(before.ratio, 34);
  const r = await call(update, { listingId: 'L1', monthly_rent: 3600, profile_id: OTHER.id, name: 'Renamed unit', evil: 'x' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const row = s.db.tables.listings.find((l) => l.id === 'L1');
  assert.equal(row.monthly_rent, 3600); assert.equal(row.name, 'Renamed unit');
  assert.equal(row.profile_id, USER.id, 'profile_id is not whitelisted'); assert.equal('evil' in row, false);
  const after = (await fetchListingApplicants(s.db, 'L1')).find((a) => a.linkId === 'J1').application.fit;
  assert.equal(after.ratio, 47); assert.ok(after.score < before.score, `Fit moved: ${before.score} to ${after.score}`);
  const ev = s.db.tables.events.find((e) => e.type === 'listing_updated');
  assert.equal(ev.listing_id, 'L1'); assert.equal(ev.payload.listingName, 'Renamed unit');
  // lib/events.js clean() keeps strings, numbers and booleans only, so the fields array the route passes is never stored: an observation, not a change made here.
  assert.equal((await call(update, { listingId: 'L9', monthly_rent: 1 })).code, 403, 'not the realtor\'s listing');
  assert.equal(s.db.tables.listings.find((l) => l.id === 'L9').monthly_rent, 2000);
});
