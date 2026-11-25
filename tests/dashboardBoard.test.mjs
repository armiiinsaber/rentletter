// The realtor dashboard's one source (components/dashboard/board.js boardOf): every count and next
// step on the Listings view comes from it, so the tiles, the cards, Needs you, the sidebar's count
// and the Needs attention first order cannot disagree. On the route fixture, loaded through the
// real signals loader (lib/dashboardSignals.js) over the fake stack, the tiles, the cards and Needs
// you agree. Before this, a tile counted the listings with applicants and no report sent (2 on the
// fixture: 88 Harbour St has an applicant whose documents were never asked for), while Needs you
// listed the listings whose report was ready (1). Then: the stage each listing's strip shows, for
// every stage, saying only what is recorded; each card's next step and wait; and what the command
// menu finds (components/dashboard/commandSearch.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fakeSupabase, fakeKv } from './helpers/fakeSupabase.mjs';
import { clockAt } from './helpers/clockAt.mjs';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const B = await import('../components/dashboard/board.js');
const H = await import('../components/dashboard/homeData.js');
const S = await import('../components/dashboard/listingSort.js');
const Q = await import('../components/dashboard/commandSearch.js');
const { loadSignals } = await import('../lib/dashboardSignals.js');
const F = await import('./routes/fixture.mjs');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PATHS = { home: '/dashboard', listing: (id) => `/listing/${id}`, circle: '/circle', profile: '/profile' };
const CHECK = new Set(['check_docs', 'mismatch', 'edited']);

// The fixture as the dashboard receives it: its listings and the signals the page loads with.
async function fixtureSignals(t) {
  clockAt(t, new Date(F.NOW + F.DAY).toISOString());
  const tables = F.tables();
  const { restore } = fakeKv(new Map());
  try {
    const listings = tables.listings.filter((l) => l.profile_id === F.USER.id);
    const signals = await loadSignals({ supabase: fakeSupabase(tables), admin: fakeSupabase(tables), user: F.USER, listings });
    return { listings, signals, now: F.NOW + F.DAY };
  } finally { restore(); }
}

test('one source: on the fixture the tiles, the cards, Needs you, the sidebar and the order agree', async (t) => {
  const { listings, signals, now } = await fixtureSignals(t);
  assert.ok(signals && signals.applicantsByListing, 'the signals loaded');
  const by = signals.applicantsByListing;
  const board = B.boardOf({ listings, applicantsByListing: by, people: signals.people || [], now });
  const needs = H.needsYouItems({ board, people: signals.people || [], shares: [], circlePending: 0, now, paths: PATHS });
  const cards = listings.map((l) => board.byId[l.id]);
  const rows = listings.map((l) => H.rowOf(l, by[l.id] || [], board.byId[l.id]));
  // Ready to send: the tile, the cards whose step is Send report, Needs you's Ready to send items,
  // the rows the Ready to send filter keeps, and Needs attention first's top rank.
  const sendCards = cards.filter((c) => c.next.kind === 'send').map((c) => c.id);
  assert.equal(board.tiles.toSend, 1, 'one listing has a report ready to send: 210 Carlaw');
  assert.deepEqual(sendCards, ['L1']);
  assert.deepEqual(needs.filter((i) => i.kind === 'ready').map((i) => i.key), ['ready:L1']);
  assert.deepEqual(rows.filter((r) => r.next.kind === 'send').map((r) => r.id), sendCards);
  assert.equal(rows.filter((r) => S.attentionOf(r).rank === 1).length, board.tiles.toSend);
  assert.equal(board.tiles.oldestSend.listingId, 'L1', 'the tile opens the listing that waited longest');
  // Documents to check: the tile, the cards' counts and Needs you's check items.
  assert.equal(board.tiles.toCheck, cards.reduce((n, c) => n + c.toCheck, 0));
  assert.equal(board.tiles.toCheck, needs.filter((i) => CHECK.has(i.kind)).length);
  // Every listing item in Needs you is a card's red dot, and every red dot has one.
  const withItems = new Set(needs.filter((i) => i.go && i.go.kind === 'action' && i.go.item.listingId).map((i) => i.go.item.listingId));
  assert.deepEqual(cards.filter((c) => c.dot).map((c) => c.id).sort(), [...withItems].sort());
  // Ask for documents on the card: the applicants Needs you asks for documents for, on that listing.
  for (const c of cards.filter((x) => x.next.kind === 'ask')) assert.equal(c.next.n, needs.filter((i) => i.kind === 'request' && i.go.item.listingId === c.id).length, c.id);
  // Applicants and Active listings: the cards' own counts; the sidebar shows the same Active count.
  assert.equal(board.tiles.applicants, cards.reduce((n, c) => n + c.applicants, 0));
  assert.equal(board.tiles.active, listings.length);
  assert.match(code('components/dashboard/HomeView.js'), /listingsCount=\{ready && !locked \? board\.tiles\.active : null\}/, 'the sidebar reads the board');
  assert.match(code('components/dashboard/DashShell.js'), /key === 'listings' && count != null \? <span className="ds-num" data-shell-count="">\{count\}<\/span>/);
  // Why the old numbers disagreed: the old tile counted any listing with an applicant and no report
  // sent. That is both listings here; only one has a report ready.
  const old = listings.filter((l) => (by[l.id] || []).some((a) => !a.withdrawnAt) && !(by[l.id] || []).some((a) => a.lastSentAt)).length;
  assert.equal(old, 2, 'what the old tile said');
  assert.notEqual(old, board.tiles.toSend);
  assert.equal(typeof H.standingOf, 'undefined', 'the old second count is gone');
  // The page wires every count to the board and nothing else.
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /const board = useMemo\(\(\) => boardOf\(\{ listings: liveListings, applicantsByListing: byListing, people: signals\.people \|\| \[\], now \}\)/);
  assert.match(h, /<StatusBoard tiles=\{board\.tiles\}/);
  assert.match(h, /needsYouItems\(\{ board, /);
  assert.match(h, /rowOf\(l, byListing\[l\.id\] \|\| \[\], board\.byId\[l\.id\]\)/);
  assert.match(h, /card=\{cardFor\(l\)\}/);
  assert.match(code('components/dashboard/ListingsTable.js'), /toSend: \(r\) => !!\(r\.next && r\.next\.kind === 'send'\), toCheck: \(r\) => r\.toCheck > 0/, 'the tiles\' filters read the same next step');
});

// ── The stage ───────────────────────────────────────────────────────────────────────────────────
const NOW = F.NOW;
const ago = F.ago;
const MATCHED = { analyzedAt: ago(2), nameMatch: 'match', documents: [{ documentType: 'employment letter', extracted: { applicantName: 'Sofia Russo', employer: 'Northwind', annualSalaryPrinted: 92000 } }], comparisons: [{ field: 'Employer', status: 'match', found: 'Northwind' }, { field: 'Income', status: 'match', annual: 92000, found: '$92,000 a year' }] };
const L = (over = {}) => ({ id: 'L1', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', status: 'active', invite_token: 'tok', invite_url: 'https://rentletter.ca/apply/tok', created_at: ago(20), ...over });
const A = (linkId, over = {}) => ({ linkId, listingId: 'L1', application: { full_name: `Person ${linkId}`, created_at: ago(5) }, createdAt: ago(5), decisionStatus: 'none', confirmations: {}, docVerifications: [], docRequest: null, lastSentAt: null, ...over });
const docs = { docVerifications: [MATCHED] };
const called = { confirmations: { employer: { at: ago(1), by: 'You' } } };
const stage = (l, apps) => B.stageOf(l, apps);
const at = (s) => (s.current == null ? (s.rented ? 'rented' : 'closed') : B.STAGES[s.current]);

test('the stage: every stage, from what is recorded, the most advanced applicant deciding', () => {
  assert.deepEqual(B.STAGES, ['Invited', 'Applied', 'Documents', 'Employer called', 'Report', 'Rented']);
  // No link and nobody: Invited is the step.
  let s = stage(L({ invite_token: null, invite_url: null }), []);
  assert.deepEqual([s.done, at(s)], [[false, false, false, false, false, false], 'Invited']);
  // The link and nobody yet: Applied is the step.
  s = stage(L(), []);
  assert.deepEqual([s.done, at(s)], [[true, false, false, false, false, false], 'Applied']);
  // An applicant with no documents: Documents is the step. Someone applied through the link even
  // when the listing carries no link of its own.
  s = stage(L({ invite_token: null, invite_url: null }), [A('a')]);
  assert.deepEqual([s.done, at(s)], [[true, true, false, false, false, false], 'Documents']);
  // Documents read and matched: Employer called is the step.
  s = stage(L(), [A('a', docs)]);
  assert.deepEqual([s.done, at(s)], [[true, true, true, false, false, false], 'Employer called']);
  // The realtor tapped Called employer: Report is the step.
  s = stage(L(), [A('a', { ...docs, ...called })]);
  assert.deepEqual([s.done, at(s)], [[true, true, true, true, false, false], 'Report']);
  // In a report the realtor sent: Rented is the step.
  s = stage(L(), [A('a', { ...docs, ...called, lastSentAt: ago(0.5) })]);
  assert.deepEqual([s.done, at(s)], [[true, true, true, true, true, false], 'Rented']);
  // Rented: every segment done, none current.
  s = stage(L({ status: 'rented', closed_at: ago(1) }), [A('a')]);
  assert.deepEqual([s.done.every(Boolean), s.current, s.rented], [true, null, true]);
  // Withdrawn from the market: what was done, nothing current.
  s = stage(L({ status: 'closed', closed_at: ago(1) }), [A('a', docs)]);
  assert.deepEqual([s.done, s.current, s.closed], [[true, true, true, false, false, false], null, true]);
});

test('the stage says only what happened', () => {
  // A report sent before anyone called the employer: Employer called stays pale.
  let s = stage(L(), [A('a', { ...docs, lastSentAt: ago(0.5) })]);
  assert.deepEqual([s.done, at(s)], [[true, true, true, false, true, false], 'Rented']);
  // Documents on file that did not match: not done.
  s = stage(L(), [A('a', { docVerifications: [{ ...MATCHED, nameMatch: 'mismatch' }] })]);
  assert.equal(s.done[2], false, 'a name that did not match is not Documents done');
  // Documents asked for and not in: not done.
  s = stage(L(), [A('a', { docRequest: { status: 'requested', requestedAt: ago(2) } })]);
  assert.equal(at(s), 'Documents');
  // The tenant edited their profile after the report and after the call: neither counts any more.
  s = stage(L(), [A('a', { docVerifications: [MATCHED], confirmations: { employer: { at: ago(1.5), by: 'You' } }, application: { full_name: 'Person a', created_at: ago(5), profile_updated_at: ago(1) } })]);
  assert.deepEqual([s.done[2], s.done[3], at(s)], [false, false, 'Documents']);
  // The called applicant was set aside, withdrew, or was told no: they no longer decide.
  for (const out of [{ decisionStatus: 'reject', decisionChangedAt: ago(0.5) }, { withdrawnAt: ago(0.5) }]) {
    s = stage(L(), [A('a', { ...docs, ...called, ...out }), A('b')]);
    assert.equal(at(s), 'Documents', JSON.stringify(out));
  }
  // The most advanced decides, whatever the order.
  for (const apps of [[A('a'), A('b', { ...docs, ...called })], [A('b', { ...docs, ...called }), A('a')]]) assert.equal(at(stage(L(), apps)), 'Report');
});

test('the card: the next step in the order of the main action, the wait, the dot', () => {
  const card = (apps, over = {}) => { const l = L(over); return B.boardOf({ listings: [l], applicantsByListing: { L1: apps }, now: NOW }).byId.L1; };
  let c = card([A('a', { ...docs, ...called }), A('b', { docVerifications: [{ ...MATCHED, nameMatch: 'mismatch', analyzedAt: ago(4) }] }), A('c')]);
  assert.deepEqual([c.next.kind, c.next.label, c.next.words], ['send', 'Send report', 'Ready to send'], 'a report ready to send comes first');
  assert.deepEqual([c.next.wait, c.next.long, c.dot, c.toCheck], ['waiting 1 day', false, true, 1], 'waiting since the employer was called');
  c = card([A('b', { docVerifications: [{ ...MATCHED, nameMatch: 'mismatch', analyzedAt: ago(4) }] }), A('c')]);
  assert.deepEqual([c.next.kind, c.next.label, c.next.words, c.next.wait, c.next.long], ['check', 'Check documents', '1 to check', 'waiting 4 days', true]);
  c = card([A('c', { createdAt: ago(6) }), A('d', { createdAt: ago(2) })]);
  assert.deepEqual([c.next.kind, c.next.label, c.next.words, c.next.wait], ['ask', 'Ask for documents', '2 to ask for documents', 'waiting 6 days'], 'the wait of the one asked longest ago');
  c = card([A('a', docs)]);
  assert.deepEqual([c.next.kind, c.next.label, c.next.words, c.next.wait, c.next.long], ['call', 'Call the employer', '1 employer to call', 'waiting 2 days', false]);
  c = card([]);
  assert.deepEqual([c.next.kind, c.next.label, c.next.words, c.next.wait, c.dot], ['quiet', 'Open', 'No applicants yet', '', false], 'quiet when nothing waits');
  c = card([A('a', { ...docs, ...called, lastSentAt: ago(1) })]);
  assert.deepEqual([c.next.kind, c.dot], ['quiet', false]); assert.match(c.next.words, /^Report sent [A-Z][a-z]{2} \d{1,2}$/);
  c = card([A('a')], { status: 'rented', closed_at: ago(1) });
  assert.deepEqual([c.next.kind, c.dot], ['quiet', false]); assert.match(c.next.words, /^Rented [A-Z][a-z]{2} \d{1,2}$/);
  // The faces: newest first, up to four shown by the card, initials of the first and last name.
  c = card([A('a', { createdAt: ago(5), application: { full_name: 'Sofia Russo' } }), A('b', { createdAt: ago(1), application: { full_name: 'Wei Chen' } })]);
  assert.deepEqual(c.people.map((p) => p.initials), ['WC', 'SR']);
  assert.equal(c.link, 'https://rentletter.ca/apply/tok');
  // Before the client's clock is known (the server's render), no wait is said.
  assert.equal(B.boardOf({ listings: [L()], applicantsByListing: { L1: [A('a', docs)] }, now: null }).byId.L1.next.wait, '');
  for (const w of [B.waitWords(0), B.waitWords(1), B.waitWords(9)]) assert.doesNotMatch(w, /[—–]/);
  assert.deepEqual([B.waitWords(1), B.waitWords(9)], ['waiting 1 day', 'waiting 9 days']);
});

test('the tiles: what each counts', () => {
  const l1 = L(); const l2 = L({ id: 'L2', invite_token: null, invite_url: null }); const l3 = L({ id: 'L3', status: 'rented', closed_at: ago(2) });
  const by = { L1: [A('a', { ...docs, ...called }), A('b', { createdAt: ago(10) }), A('w', { withdrawnAt: ago(1) })], L2: [], L3: [A('r')] };
  const b = B.boardOf({ listings: [l1, l2, l3], applicantsByListing: by, now: NOW });
  assert.deepEqual({ ...b.tiles, oldestSend: b.tiles.oldestSend && b.tiles.oldestSend.key, oldestCheck: b.tiles.oldestCheck }, { toSend: 1, toCheck: 0, applicants: 2, active: 2, newThisWeek: 1, withoutApplicants: 1, oldestSend: 'ready:L1', oldestCheck: null }, 'the rented listing and the one who withdrew are not counted');
  assert.deepEqual(B.boardOf({}).tiles, { toSend: 0, toCheck: 0, applicants: 0, active: 0, newThisWeek: 0, withoutApplicants: 0, oldestSend: null, oldestCheck: null });
});

// ── The command menu ────────────────────────────────────────────────────────────────────────────
test('the command menu finds listings by address and unit, applicants by name, and the actions', () => {
  const listings = [L({ created_at: ago(3) }), L({ id: 'L2', name: '88 Harbour St, Unit 2104', address: '88 Harbour St, Unit 2104, Toronto', created_at: ago(1) }), L({ id: 'L3', name: '1 Old Rd', address: '1 Old Rd', archived_at: ago(1), created_at: ago(9) })];
  const by = { L1: [A('a', { application: { full_name: 'Zoë Moreau' } }), A('w', { withdrawnAt: ago(1), application: { full_name: 'Gone Away' } })], L2: [A('b', { listingId: 'L2', application: { full_name: 'Wei Chen' } })] };
  const find = (query, canArchive = true) => Q.commandResults({ query, listings, applicantsByListing: by, canArchive });
  // Nothing typed: the actions, then the newest listings not archived.
  const none = find('');
  assert.deepEqual(none.filter((r) => r.kind === 'action').map((r) => r.label), ['New listing', 'Pipeline', 'Circle', 'Shared with you', 'Profile', 'Archived listings']);
  assert.deepEqual(none.filter((r) => r.kind === 'listing').map((r) => r.listingId), ['L2', 'L1']);
  assert.deepEqual(find('', false).filter((r) => r.kind === 'action').map((r) => r.action), ['new', 'pipeline', 'circle', 'shared', 'profile'], 'Archived only once archive is set up');
  // An address, any case, every word; the unit as written.
  assert.deepEqual(find('CARLAW').map((r) => r.id), ['listing:L1']);
  assert.deepEqual(find('harbour 2104').map((r) => r.id), ['listing:L2']);
  assert.deepEqual(find('carlaw unit 4').map((r) => r.id), ['listing:L1']);
  assert.deepEqual(find('unit 4').map((r) => r.id), ['listing:L1', 'listing:L2'], 'each word anywhere in the address, as the listings search reads it (Unit 2104)');
  assert.deepEqual(find('old rd').map((r) => [r.id, r.detail]), [['listing:L3', 'Archived']]);
  // A name, accents or not; never someone who withdrew.
  assert.deepEqual(find('zoe').map((r) => [r.id, r.listingId, r.linkId, r.detail]), [['applicant:a', 'L1', 'a', '210 Carlaw Ave, Unit 4']]);
  assert.deepEqual(find('gone'), []);
  // An action by its name or its words.
  assert.deepEqual(find('pipe').map((r) => r.id), ['action:pipeline']);
  assert.deepEqual(find('new').map((r) => r.id), ['action:new']);
  assert.deepEqual(find('archived').map((r) => r.id), ['action:archived']);
  assert.deepEqual(find('nothing like this'), []);
});

test('the command menu: one global key, the one sheet, the keys, the focus', () => {
  const shell = code('components/dashboard/DashShell.js');
  // Command K, or Control K off a Mac: the one key the shell binds, and the only global keydown.
  assert.equal((shell.match(/addEventListener\('keydown'/g) || []).length, 1);
  assert.match(shell, /if \(\(e\.key === 'k' \|\| e\.key === 'K'\) && \(e\.metaKey \|\| e\.ctrlKey\) && !e\.altKey && !e\.shiftKey\) \{ e\.preventDefault\(\); setMenuOpen\(\(v\) => !v\); \}/);
  const m = code('components/dashboard/CommandMenu.js');
  assert.match(m, /<Sheet open=\{open\} onClose=\{onClose\} label="Search listings, tenants or actions"/, 'the one sheet: Escape, a tap outside and the focus back to what opened it');
  assert.match(m, /if \(e\.key === 'Tab'\) \{ e\.preventDefault\(\); return; \}/, 'the focus stays in the menu');
  assert.match(m, /e\.key === 'ArrowDown'/); assert.match(m, /e\.key === 'ArrowUp'/); assert.match(m, /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); run\(results\[at\]\); \}/);
  assert.match(m, /role="combobox"[^>]*aria-activedescendant=/); assert.match(m, /role="listbox"/); assert.match(m, /role="option" aria-selected=/);
  // What a result runs: a listing, an applicant on their listing, an action.
  assert.match(shell, /if \(r\.kind === 'listing'\) \{ go\(adapter\.paths\.listing\(r\.listingId\)\); return; \}/);
  assert.match(shell, /if \(r\.kind === 'applicant'\) \{ go\(actionHref\(\{ listingId: r\.listingId, linkId: r\.linkId, panel: 'checklist' \}, adapter\.paths\)\); return; \}/);
});

test('the Compact view is kept on the device, as the order is', () => {
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /const MODE_STORE = 'rl-listing-view';/);
  assert.match(h, /const readMode = \(store\) => \{ try \{ return store && store\.getItem\(MODE_STORE\) === 'compact' \? 'compact' : 'cards'; \} catch \(e\) \{ return 'cards'; \} \};/, 'storage missing or blocked: the cards');
  assert.match(h, /const writeMode = \(store, mode\) => \{ try \{ if \(store\) store\.setItem\(MODE_STORE, mode === 'compact' \? 'compact' : 'cards'\); \} catch \(e\) \{/);
  assert.match(h, /const m = readMode\(store\); modeSeen = m; setModeState\(m\);/, 'read after the first paint, as the order is');
  assert.match(h, /const setMode = \(m\) => \{ modeSeen = m; setModeState\(m\); writeMode\(deviceStore\(\), m\); \};/);
});
