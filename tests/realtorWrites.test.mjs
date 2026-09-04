// Every realtor write goes through a route: the gate (401, 402), the explicit ownership check
// (403 for another realtor's row, 404 for none), the happy path with its event, the signals
// cache and the pending nudge set, and a source assertion that no component or page writes to
// Supabase from the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
import { fakeSupabase } from './helpers/fakeSupabase.mjs';

const { withRealtor } = await import('../lib/realtorRoute.js');
const W = await import('../lib/realtorWrites.js');

const res = () => { const r = { code: 0, body: null, headers: {} }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const fakeServer = (user, profile) => () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }) });

test('withRealtor: 405, 503, 401 without a session, 402 for a lapsed trial, then the handler with user and gate', async () => {
  const handler = async ({ user, gate }, req, r) => r.status(200).json({ ok: true, user: user.id, plan: gate.entitlement.status });
  const configured = () => true;
  let r = res(); await withRealtor(handler, { configured, server: fakeServer(null), admin: () => ({}) })({ method: 'GET' }, r); assert.equal(r.code, 405);
  r = res(); await withRealtor(handler, { configured: () => false, server: fakeServer(null), admin: () => ({}) })({ method: 'POST' }, r); assert.equal(r.code, 503);
  r = res(); await withRealtor(handler, { configured, server: fakeServer(null), admin: () => ({}) })({ method: 'POST' }, r); assert.equal(r.code, 401);
  const lapsed = { id: 'U1', is_founder: false, plan: 'none', subscription_status: null, created_at: '2025-01-01T00:00:00Z', trial_ends_at: '2025-01-08T00:00:00Z' };
  r = res(); await withRealtor(handler, { configured, server: fakeServer({ id: 'U1' }, lapsed), admin: () => ({}) })({ method: 'POST' }, r); assert.equal(r.code, 402, 'the entitlement gate');
  const founder = { id: 'U1', plan: 'founding' };
  r = res(); await withRealtor(handler, { configured, server: fakeServer({ id: 'U1' }, founder), admin: () => ({}) })({ method: 'POST' }, r); assert.equal(r.code, 200); assert.equal(r.body.user, 'U1');
});

const db = () => {
  const tables = {
    listings: [{ id: 'L1', profile_id: 'me', name: 'Carlaw', address: '210 Carlaw', status: 'active' }, { id: 'L2', profile_id: 'other', name: 'Theirs' }],
    listing_applicants: [{ id: 'J1', listing_id: 'L1', application_id: 'A1', decision_status: 'none', decision_priority: 'normal' }, { id: 'J2', listing_id: 'L2', application_id: 'A2', decision_status: 'none' }, { id: 'J3', listing_id: 'L1', application_id: 'A3', decision_status: 'reject' }],
    applications: [{ id: 'A1', full_name: 'Priya Nair' }, { id: 'A2', full_name: 'Not Mine' }, { id: 'A3', full_name: 'Aside' }],
    profiles: [{ id: 'me', full_name: 'Sarah Chen', brand_color: null }],
    events: [],
  };
  const admin = fakeSupabase(tables); admin.tables = tables; return admin;
};
const deps = (admin) => { const d = { admin, userId: 'me', invalidated: [], sremmed: [], now: new Date('2026-09-10T12:00:00Z') }; d.invalidate = (id) => d.invalidated.push(id); d.srem = async (id) => d.sremmed.push(id); return d; };
const events = (admin) => admin.tables.events.map((e) => [e.type, e.listing_id, e.payload]);

test('decision: 404 unknown, 403 another realtor, set aside records the event, clears the cache and the set; restore and finalist record theirs', async () => {
  const admin = db(); const d = deps(admin);
  assert.equal((await W.decideApplicant(d, { linkId: 'nope', status: 'reject', reasonCode: 'income_below_min' })).status, 404);
  assert.equal((await W.decideApplicant(d, { linkId: 'J2', status: 'reject', reasonCode: 'income_below_min' })).status, 403);
  assert.equal((await W.decideApplicant(d, { linkId: 'J1', status: 'reject' })).status, 400, 'set aside needs a screenable reason');
  const r = await W.decideApplicant(d, { linkId: 'J1', status: 'reject', reasonCode: 'income_below_min', notes: 'x' });
  assert.equal(r.status, 200); assert.equal(admin.tables.listing_applicants[0].decision_status, 'reject'); assert.equal(admin.tables.listing_applicants[0].decision_reason_code, 'income_below_min');
  assert.deepEqual(events(admin).map((e) => e[0]), ['applicant_set_aside']); assert.equal(events(admin)[0][2].reason, 'Income below the stated minimum');
  assert.deepEqual(d.invalidated, ['me']); assert.deepEqual(d.sremmed, ['J1']);
  const r2 = await W.decideApplicant(d, { linkId: 'J3', status: 'none', reasonCode: null });
  assert.equal(r2.status, 200); assert.equal(events(admin).at(-1)[0], 'applicant_restored');
  const r3 = await W.decideApplicant(d, { linkId: 'J1', priority: 'top' });
  assert.equal(r3.status, 200); assert.equal(events(admin).at(-1)[0], 'applicant_marked_finalist'); assert.equal(events(admin).at(-1)[2].removed, false);
});

test('withdraw: ownership, withdrawn_at, the event, the cache, the set', async () => {
  const admin = db(); const d = deps(admin);
  assert.equal((await W.withdrawApplicant(d, { linkId: 'J2' })).status, 403);
  const r = await W.withdrawApplicant(d, { linkId: 'J1' });
  assert.equal(r.status, 200); assert.ok(admin.tables.listing_applicants[0].withdrawn_at);
  assert.deepEqual(events(admin).map((e) => e[0]), ['applicant_withdrew']); assert.deepEqual(d.invalidated, ['me']); assert.deepEqual(d.sremmed, ['J1']);
});

test('listings: create with profile_id from the session, update only the form fields, delete closes then removes and records without listing_id', async () => {
  const admin = db(); const d = deps(admin);
  const c = await W.createListing(d, { address: '1 New St', monthly_rent: 2000, bedrooms: '1', profile_id: 'someone-else', status: 'rented', invite_token: 'x' });
  assert.equal(c.status, 200); const row = admin.tables.listings.at(-1);
  assert.equal(row.profile_id, 'me'); assert.equal(row.address, '1 New St'); assert.equal('status' in row, false, 'status is not a form field'); assert.equal('invite_token' in row, false);
  assert.equal(events(admin).at(-1)[0], 'listing_created');
  assert.equal((await W.updateListing(d, { listingId: 'L2', monthly_rent: 1 })).status, 403);
  const u = await W.updateListing(d, { listingId: 'L1', monthly_rent: 2700, profile_id: 'x', pref_max_occupants: 9 });
  assert.equal(u.status, 200); assert.equal(admin.tables.listings[0].monthly_rent, 2700); assert.equal(admin.tables.listings[0].profile_id, 'me'); assert.equal('pref_max_occupants' in admin.tables.listings[0], false, 'a dropped column is never written');
  assert.equal(events(admin).at(-1)[0], 'listing_updated');
  assert.equal((await W.deleteListing(d, { listingId: 'L2' })).status, 403);
  const del = await W.deleteListing(d, { listingId: 'L1' });
  assert.equal(del.status, 200); assert.equal(admin.tables.listings.some((l) => l.id === 'L1'), false);
  const ev = events(admin).at(-1); assert.equal(ev[0], 'listing_updated'); assert.equal(ev[1], null, 'no listing_id, the row would cascade away'); assert.equal(ev[2].status, 'deleted');
  assert.deepEqual(d.sremmed.sort(), ['J1', 'J3'], 'every applicant on the listing leaves the pending set');
  assert.equal(d.invalidated.length, 3);
});

test('profile and branding: only their fields, the branding event, an absent optional column is dropped', async () => {
  const admin = db(); const d = deps(admin);
  const p = await W.updateProfile(d, { full_name: 'S. Chen', is_founder: true, plan: 'paid', province: 'bc' });
  assert.equal(p.status, 200); const prof = admin.tables.profiles[0];
  assert.equal(prof.full_name, 'S. Chen'); assert.equal(prof.province, 'BC'); assert.equal('is_founder' in prof, false); assert.equal('plan' in prof, false);
  assert.equal(events(admin).length, 0, 'a profile edit is not a timeline event');
  const b = await W.updateBranding(d, { brand_color: '#1F3A5F', brand_color_secondary: 'nope', plan: 'paid' });
  assert.equal(b.status, 200); assert.equal(prof.brand_color, '#1f3a5f'); assert.equal(prof.brand_color_secondary, null);
  assert.equal(events(admin).at(-1)[0], 'branding_updated');
  assert.equal((await W.updateBranding(d, { plan: 'paid' })).status, 400);
  const t2 = { profiles: [{ id: 'me' }], events: [] };
  const admin2 = fakeSupabase(t2, { absentColumns: ['brand_palette'] });
  const b2 = await W.updateBranding(deps(admin2), { brand_color: '#112233', brand_palette: { a: 1 } });
  assert.equal(b2.status, 200); assert.deepEqual(b2.body.skipped, ['brand_palette']); assert.equal(t2.profiles[0].brand_color, '#112233');
});

test('no component or page outside pages/api writes to Supabase from the browser', () => {
  const root = new URL('..', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; if (n === 'node_modules' || n === '.next') continue; if (statSync(p).isDirectory()) { if (p.endsWith('/pages/api')) continue; walk(p); } else if (/\.js$/.test(n)) files.push(p); } };
  walk(`${root}components`); walk(`${root}pages`);
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = /\.from\(['"][a-z_]+['"]\)[\s\S]{0,160}?\.(insert|update|upsert|delete|rpc)\(/g;
    let m; while ((m = re.exec(src))) offenders.push(`${f.replace(root, '')}: .${m[1]}( at offset ${m.index}`);
    if (/\.rpc\(/.test(src)) offenders.push(`${f.replace(root, '')}: .rpc(`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
  assert.equal(files.length > 40, true);
});
