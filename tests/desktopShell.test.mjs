// The desktop dashboard (components/dashboard/DashShell.js, HomeView.js, ListingsTable.js,
// NeedsYou.js): the three numbers, the table's rows, the Needs you column and its relative times,
// all counted from what the dashboard already loads (components/dashboard/homeData.js); and the
// visual rules the brief sets for every width, read from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const H = await import('../components/dashboard/homeData.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const NOW = Date.parse('2026-11-21T15:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const L1 = { id: 'L1', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', status: 'active', created_at: ago(20) };
const L2 = { id: 'L2', name: '88 Harbour St, Unit 2104', address: '88 Harbour St, Unit 2104, Toronto', monthly_rent: 3100, bedrooms: 'Studio', status: 'active', created_at: ago(10) };
const app = (linkId, name, over = {}) => ({ linkId, listingId: 'L1', application: { full_name: name, created_at: ago(5) }, decisionStatus: 'none', confirmations: {}, docVerifications: [], ...over });

test('the three numbers: open listings, live applicants, reports to send', () => {
  const by = { L1: [app('a', 'Sofia Russo'), app('b', 'Wei Chen'), app('w', 'Gone', { withdrawnAt: ago(1), decisionStatus: 'withdrawn' })], L2: [app('c', 'Lucia Fernandez', { lastSentAt: ago(2) })] };
  const n = H.standingOf([L1, L2], by);
  assert.equal(n.listings, 2);
  assert.equal(n.toSend, 1, 'L2 has its report sent');
  assert.ok(n.applicants >= 3, `the live applicants (${n.applicants})`);
  assert.deepEqual(H.standingOf([], {}), { listings: 0, applicants: 0, toSend: 0 });
});

test('a table row: address, rent, beds, applicants, verified, report and last activity', () => {
  const r = H.rowOf(L2, [app('c', 'Lucia Fernandez', { listingId: 'L2', lastSentAt: ago(2) })]);
  assert.equal(r.label, '88 Harbour St, Unit 2104');
  assert.equal(r.rent, 3100); assert.equal(r.beds, 'Studio'); assert.equal(r.applicants, 1);
  assert.equal(r.report, 'sent'); assert.equal(r.sentAt, ago(2));
  assert.equal(r.lastAt, ago(2), 'the report going is the newest thing on it');
  const empty = H.rowOf(L1, []);
  assert.equal(empty.report, 'none'); assert.equal(empty.applicants, 0); assert.equal(empty.lastAt, L1.created_at);
  assert.equal(H.rowOf({ ...L1, status: 'rented', closed_at: ago(1) }, []).report, 'closed');
});

test('relative times from the client clock', () => {
  assert.equal(H.relTime(null, NOW), '');
  assert.equal(H.relTime(ago(0), null), '', 'nothing before the client clock is known');
  assert.equal(H.relTime(new Date(NOW - 30000).toISOString(), NOW), 'Just now');
  assert.equal(H.relTime(new Date(NOW - 25 * 60000).toISOString(), NOW), '25 min ago');
  assert.equal(H.relTime(ago(2), NOW), '2 days ago');
  assert.equal(H.relTime(new Date(NOW + 3 * 86400000).toISOString(), NOW), 'In 3 days');
  for (const s of [H.relTime(ago(1), NOW), H.relTime(ago(40), NOW)]) assert.doesNotMatch(s, /[—–]/);
});

test('Needs you: the next things to do, newest first, from what is loaded', () => {
  const by = { L1: [app('a', 'Sofia Russo', { createdAt: ago(3) })] };
  const people = [{ id: 'P1', status: 'consented', display: 'Priya Natarajan', expiresAt: new Date(NOW + 3 * 86400000).toISOString(), fits: [] }, { id: 'P2', status: 'consented', display: 'Far Off', expiresAt: new Date(NOW + 40 * 86400000).toISOString(), fits: [] }];
  const shares = [{ id: 'S1', listingName: '1 Bloor St E, Unit 3407', sharedAt: ago(1) }, { id: 'S2', listingName: 'Ended', sharedAt: ago(1), ended: 'stopped' }];
  const items = H.needsYouItems({ listings: [L1], applicantsByListing: by, people, shares, circlePending: 2, now: NOW, paths: { home: '/dashboard', circle: '/circle' } });
  const keys = items.map((i) => i.key);
  assert.ok(keys.includes('hold:P1'), 'a hold ending within a week');
  assert.ok(!keys.includes('hold:P2'), 'a hold ending later is not urgent');
  assert.ok(keys.includes('shared:S1') && !keys.includes('shared:S2'), 'a live share, never an ended one');
  assert.equal(items.find((i) => i.key === 'circle').title, '2 Circle requests');
  assert.equal(keys[keys.length - 1], 'circle', 'an item with no time sits after the timed ones');
  assert.equal(items.find((i) => i.key === 'request:a').at, ago(3), 'a new applicant is timed by when they applied');
  const timed = items.filter((i) => i.at).map((i) => i.at);
  assert.deepEqual(timed, [...timed].sort().reverse(), 'newest first');
  for (const i of items) { assert.ok(i.verb && i.title, i.key); assert.doesNotMatch(`${i.title} ${i.detail}`, /[—–·]/, i.key); }
  assert.deepEqual(H.needsYouItems({ listings: [], now: NOW }), [], 'nothing loaded: nothing to do');
});

test('the shell: a sidebar of five places at 1024 and wider, the tabs gone, centred past 1800', () => {
  const s = code('components/dashboard/DashShell.js');
  assert.match(s, /\['listings', home, 'Listings'\],\s*\['pipeline', viewHref\(home, 'pipeline'\), 'Pipeline'\],\s*\['circle', adapter\.paths\.circle \|\| CIRCLE_PATH, 'Circle'\],\s*\['shared', viewHref\(home, 'shared'\), 'Shared with you'\],\s*\['profile', adapter\.paths\.profile, 'Profile'\],/);
  assert.match(s, /@media \(min-width: 1024px\) \{\s*\.ds \{ display: grid; grid-template-columns: 240px minmax\(0, 1fr\);[^}]*max-width: 1800px; margin: 0 auto;/);
  assert.match(code('components/dashboard/MainNav.js'), /@media \(min-width: 1024px\) \{ \.mn \{ display: none; \} \}/, 'the pill tabs are gone at this width');
  assert.match(s, /aria-current=\{current === key \? 'page' : undefined\}/, 'the current place is marked');
  // A view of the dashboard is chosen in place: a shallow route the frame does not animate.
  assert.match(s, /if \(HOME_VIEWS\.includes\(key\) && onDashboard\(\)\) \{ if \(current !== key\) goView\(href\); return; \}/);
  assert.match(code('components/nav/RouteFrame.js'), /if \(opts\.shallow && sameScreen\(at\.current, url\)\) return;/);
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /\.hv-cols \{ grid-template-columns: minmax\(0, 1fr\) 320px;/, 'Needs you beside the table from 1280, about 340px');
  assert.match(h, /\.hv-cols \{ grid-template-columns: minmax\(0, 1fr\) 360px;/, 'and a little wider from 1600');
  assert.match(h, /@media \(min-width: 1280px\)/, 'and under it between 1024 and 1279');
  // The four realtor screens wear the same shell.
  for (const v of ['HomeView', 'ListingView', 'CircleView', 'ProfileView']) assert.match(src(`components/dashboard/${v}.js`), /<DashShell /, v);
});

test('the visual rules: red only for the main action, one dark block, statuses as pills, counts as numbers', () => {
  const files = ['components/dashboard/HomeView.js', 'components/dashboard/DashShell.js', 'components/dashboard/MainNav.js', 'components/dashboard/NeedsYou.js', 'components/dashboard/ListingsTable.js', 'components/dashboard/PeopleList.js', 'components/dashboard/AssistantBell.js', 'components/dashboard/ActionRow.js'];
  const reds = files.flatMap((f) => code(f).split('\n').filter((l) => /\bC\.red\b/.test(l)).map((l) => `${f}: ${l.trim().slice(0, 90)}`));
  // The two red fills left: the phone's New listing and the sidebar's, the one main action on each view.
  assert.deepEqual(reds.map((r) => r.split(':')[0]), ['components/dashboard/HomeView.js', 'components/dashboard/DashShell.js'], reds.join('\n'));
  assert.match(reds[0], /\.dash-new \{/); assert.match(reds[1], /\.ds-btn-primary/);
  // One dark block: the phone's greeting card. The Pipeline card is white.
  assert.match(code('components/dashboard/PeopleList.js'), /background: C\.card, color: C\.ink/);
  assert.doesNotMatch(code('components/dashboard/PeopleList.js'), /C\.inst\b/);
  assert.doesNotMatch(code('components/dashboard/HomeView.js'), /tone="ink"/, 'no count as a pill on the ink card');
  assert.doesNotMatch(code('components/dashboard/HomeView.js'), /\.dash-count \{[^}]*border-radius: 999px/, 'the count is a plain number');
  assert.doesNotMatch(code('components/dashboard/MainNav.js'), /\.mn-badge\) \{[^}]*background/, 'the Circle count is a plain number');
  assert.doesNotMatch(code('components/dashboard/PeopleList.js'), /<button type="button" disabled/, 'no status drawn as a button');
  // Every dashboard button: one height, one radius, one padding.
  assert.match(code('components/dashboard/DashShell.js'), /\.ds :global\(\.ds-btn\) \{ display: inline-flex;[^}]*min-height: 44px; padding: 0 var\(--gap-card\); border-radius: var\(--btn-radius\);/);
  assert.match(code('components/dashboard/HomeView.js'), /\.dash-new \{ width: 100%; min-height: 44px;[^\n]*border-radius: var\(--btn-radius\); padding: 0 var\(--gap-card\);/);
  // Motion: only transform and opacity, behind the reduced motion query.
  for (const f of ['components/dashboard/NeedsYou.js', 'components/dashboard/ListingsTable.js']) {
    const s = code(f);
    for (const m of s.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\s*\}/g)) assert.doesNotMatch(m[1].replace(/opacity|transform|translateY\([^)]*\)|none|from|to|[\d.]+|[{}:;\s]/g, ''), /\w/, `${f}: only transform and opacity`);
    assert.match(s, /@media \(prefers-reduced-motion: no-preference\)/, `${f}: behind the reduced motion query`);
  }
});
