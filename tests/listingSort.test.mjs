// The order of the realtor's listings and the search past eight (components/dashboard/listingSort.js,
// components/dashboard/ListingsTable.js, components/dashboard/HomeView.js): every order both ways on
// a fixture with ties and missing values, the address and the beds orders, Needs attention first,
// the choice kept on the device for each shelf, the headings with aria-sort, the selection and the
// other columns left alone, and the search shown only past eight listings. The walks open the page
// itself (tests/helpers/typesetStates.mjs: the table sorted by rent, the Sort sheet, nine listings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const S = await import('../components/dashboard/listingSort.js');
const H = await import('../components/dashboard/homeData.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const NOW = Date.parse('2026-11-21T15:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
// A row as rowOf builds it, with what each order reads set by hand.
const row = (id, over = {}) => ({ id, name: '', address: '', unit: '', label: '', rent: null, bedrooms: '', moveIn: null, applicants: 0, newest: null, verified: 0, report: 'none', sentAt: null, lastAt: null, createdAt: null, open: true, counts: { verified: 0, matched: 0, check: 0, waiting: 0, none: 0, sent: 0, lookedAgain: 0, notSelected: 0 }, ...over });
const ids = (rows) => rows.map((r) => r.id);
const both = (rows, key) => [ids(S.sortRows(rows, { key, dir: 'asc' })), ids(S.sortRows(rows, { key, dir: 'desc' }))];
// Every permutation sorts the same: the order never changes between renders.
const shuffles = (list) => [list, [...list].reverse(), [...list.slice(2), ...list.slice(0, 2)], [...list].sort((a, b) => String(b.id).localeCompare(String(a.id)))];
const stable = (rows, sort) => { const want = ids(S.sortRows(rows, sort)); for (const s of shuffles(rows)) assert.deepEqual(ids(S.sortRows(s, sort)), want, `${sort.key} ${sort.dir}: the same order from every start`); return want; };

test('rent sorts by the number, high to low and low to high; ties by latest activity, then address; no rent last both ways', () => {
  const rows = [
    row('a', { address: '55 Gerrard St West', rent: 2600, lastAt: ago(3) }),
    row('b', { address: '888 bay st', unit: '4301', rent: 950, lastAt: ago(1) }),
    row('c', { address: '12 Queen St E', rent: 2600, lastAt: ago(1) }),
    row('d', { address: '1 Yonge St', rent: null, lastAt: ago(0) }),
    row('e', { address: '9 Adelaide St', rent: 12000, lastAt: ago(5) }),
    row('f', { address: '3 Adelaide St', rent: 2600, lastAt: ago(1) }),
  ];
  // 12000 is past 2600 as a number (as text it would sort first). The three at 2600: c and f
  // touched a day ago (f's street, Adelaide, before c's Queen), then a three days ago.
  assert.deepEqual(stable(rows, { key: 'rent', dir: 'desc' }), ['e', 'f', 'c', 'a', 'b', 'd']);
  assert.deepEqual(stable(rows, { key: 'rent', dir: 'asc' }), ['b', 'f', 'c', 'a', 'e', 'd']);
});

test('address: the street, then the number, then the unit, any case, however the unit is written', () => {
  const rows = [
    row('gerrard', { address: '55 Gerrard St West' }),
    row('bay4301', { name: '888 bay st, Unit 4301' }),
    row('bay12', { address: '888 Bay St', unit: '12' }),
    row('bay100', { address: '100 Bay St' }),
    row('baydash', { address: '2001-888 Bay Street' }),
    row('carlaw', { address: '210 Carlaw Ave', unit: '4' }),
    row('none', {}),
    row('named', { name: 'Annex loft' }),
    row('hash', { address: '888 bay st #900' }),
  ];
  assert.deepEqual(S.addressParts('888 bay st, Unit 4301'), { street: 'bay st', number: 888, suffix: '', unit: '4301', rest: 'bay st' });
  assert.deepEqual(S.addressParts('55 Gerrard St West'), { street: 'gerrard st west', number: 55, suffix: '', unit: '', rest: 'gerrard st west' });
  assert.equal(S.addressParts('2001-888 Bay Street').unit, '2001');
  assert.equal(S.addressParts('2001-888 Bay Street').number, 888);
  assert.equal(S.addressParts('12 Unity Rd').unit, '', 'a street whose name starts with "unit" has no unit');
  assert.equal(S.addressParts(''), null);
  assert.equal(S.addressParts('2150 Lake Shore Boulevard West, Penthouse 4512').unit, '4512');
  const [asc, desc] = both(rows, 'address');
  // Annex (a name, no number) first; Bay St: 100, then 888 with units 12, 900, 4301 in number order;
  // Bay Street after Bay St; Carlaw; Gerrard; a listing with no address at all last, both ways.
  assert.deepEqual(asc, ['named', 'bay100', 'bay12', 'hash', 'bay4301', 'baydash', 'carlaw', 'gerrard', 'none']);
  assert.deepEqual(desc, ['gerrard', 'carlaw', 'baydash', 'bay4301', 'hash', 'bay12', 'bay100', 'named', 'none']);
  stable(rows, { key: 'address', dir: 'asc' });
});

test('beds: Studio, the lofts, then the count; no unit type last both ways', () => {
  assert.deepEqual(['Studio', 'Loft', '2-storey loft', '1', '1+den', '2', '4+', '', null, 'Penthouse'].map(S.bedsValue), [0, 0.5, 0.75, 1, 1.5, 2, 4, null, null, null]);
  const rows = [row('two', { bedrooms: '2', lastAt: ago(2) }), row('studio', { bedrooms: 'Studio' }), row('none', { bedrooms: '' }), row('loft', { bedrooms: 'Loft' }), row('two-b', { bedrooms: '2', lastAt: ago(1) }), row('four', { bedrooms: '4+' })];
  assert.deepEqual(both(rows, 'beds'), [['studio', 'loft', 'two-b', 'two', 'four', 'none'], ['four', 'two-b', 'two', 'loft', 'studio', 'none']]);
});

test('move in, applicants, newest applicant, verified, report and last activity: both ways, the ones with no value last', () => {
  const rows = [
    row('L1', { address: '1 A St', moveIn: '2026-12-01', applicants: 5, verified: 2, newest: { name: 'X', at: ago(1) }, report: 'not_sent', lastAt: ago(1) }),
    row('L2', { address: '2 B St', moveIn: '2027-01-15', applicants: 1, verified: 0, newest: { name: 'Y', at: ago(6) }, report: 'sent', sentAt: ago(2), lastAt: ago(2) }),
    row('L3', { address: '3 C St', moveIn: null, applicants: 0, verified: 0, newest: null, report: 'none', lastAt: ago(4) }),
    row('L4', { address: '4 D St', moveIn: '2026-12-01', applicants: 1, verified: 1, newest: { name: 'Z', at: ago(3) }, report: 'not_sent', lastAt: ago(3) }),
    row('L5', { address: '5 E St', moveIn: '2026-11-30', applicants: 0, report: 'closed', open: false, lastAt: null }),
  ];
  assert.deepEqual(both(rows, 'move'), [['L5', 'L1', 'L4', 'L2', 'L3'], ['L2', 'L1', 'L4', 'L5', 'L3']], 'no move in date last; the two on Dec 1 by latest activity');
  assert.deepEqual(both(rows, 'applicants'), [['L2', 'L4', 'L1', 'L3', 'L5'], ['L1', 'L2', 'L4', 'L3', 'L5']], 'no applicants last both ways, by latest activity, the one never touched after');
  assert.deepEqual(both(rows, 'newest'), [['L2', 'L4', 'L1', 'L3', 'L5'], ['L1', 'L4', 'L2', 'L3', 'L5']]);
  assert.deepEqual(both(rows, 'verified'), [['L2', 'L4', 'L1', 'L3', 'L5'], ['L1', 'L4', 'L2', 'L3', 'L5']], 'with no applicant nothing counts, so those go last');
  assert.deepEqual(both(rows, 'report'), [['L1', 'L4', 'L2', 'L5', 'L3'], ['L5', 'L2', 'L1', 'L4', 'L3']], 'not sent, sent, closed; with no applicant no report, last');
  assert.deepEqual(both(rows, 'when'), [['L3', 'L4', 'L2', 'L1', 'L5'], ['L1', 'L2', 'L4', 'L3', 'L5']], 'never any activity last both ways');
  for (const key of ['move', 'applicants', 'newest', 'verified', 'report', 'when']) for (const dir of ['asc', 'desc']) stable(rows, { key, dir });
});

test('newest listing: the day it was made, newest first; Latest activity is the default, newest first', () => {
  const rows = [row('old', { createdAt: ago(30), lastAt: ago(0) }), row('new', { createdAt: ago(1), lastAt: ago(9) }), row('mid', { createdAt: ago(10), lastAt: ago(5) }), row('never', { createdAt: null })];
  assert.deepEqual(ids(S.sortRows(rows, { key: 'created', dir: 'desc' })), ['new', 'mid', 'old', 'never']);
  assert.deepEqual(S.validSort({ key: 'created', dir: 'asc' }), { key: 'created', dir: 'desc' }, 'one way only');
  assert.deepEqual(S.DEFAULT_SORT, { key: 'when', dir: 'desc' });
  assert.deepEqual(ids(S.sortRows(rows, S.DEFAULT_SORT)), ['old', 'mid', 'new', 'never']);
  assert.deepEqual(ids(S.sortRows(rows, null)), ids(S.sortRows(rows, S.DEFAULT_SORT)), 'no order given: the default');
});

test('Needs attention first: a report ready to send, documents to check, documents to ask for, an employer to call; more applicants first within a rank', () => {
  // The order of the cards' one main action (components/dashboard/board.js), read from each row's
  // next step, the same the card, the tiles and Needs you show.
  const next = (kind, n = 0) => ({ kind, n });
  const rows = [
    row('quiet', { address: '1 Quiet St', applicants: 2, report: 'sent', next: next('quiet'), lastAt: ago(0) }),
    row('ready', { address: '2 Ready St', applicants: 2, report: 'not_sent', next: next('send', 2), lastAt: ago(1) }),
    row('new2', { address: '3 New St', applicants: 2, report: 'not_sent', next: next('ask', 2), lastAt: ago(5) }),
    row('new1', { address: '4 New St', applicants: 1, report: 'not_sent', next: next('ask', 1), lastAt: ago(1) }),
    row('check', { address: '5 Check St', applicants: 3, report: 'not_sent', next: next('check', 1), lastAt: ago(9) }),
    row('match', { address: '6 Match St', applicants: 1, report: 'not_sent', next: next('call', 1), lastAt: ago(2) }),
    row('docs', { address: '7 Docs St', applicants: 1, report: 'sent', next: next('open', 1), lastAt: ago(3) }),
    row('empty', { address: '8 Empty St', applicants: 0, report: 'none', next: next('quiet'), lastAt: ago(0.5) }),
    row('rented', { address: '9 Rented St', applicants: 3, report: 'closed', open: false, next: next('quiet'), lastAt: ago(0.2) }),
  ];
  assert.deepEqual(rows.map((r) => S.attentionOf(r).rank), [5, 1, 3, 3, 2, 4, 5, 5, 5]);
  // The report ready to send, then the documents to check, then the two to ask for documents (two
  // applicants before one), the employer to call, then the rest by latest activity, the rented one
  // among them.
  assert.deepEqual(stable(rows, { key: 'attention', dir: 'asc' }), ['ready', 'check', 'new2', 'new1', 'match', 'quiet', 'rented', 'empty', 'docs']);
  assert.deepEqual(S.validSort({ key: 'attention', dir: 'desc' }), { key: 'attention', dir: 'asc' }, 'one way only');
  assert.deepEqual(S.attentionOf(row('none')), { rank: 5, n: 0 }, 'a row with no next step waits on nothing');
});

test('the rows rowOf builds carry what the orders read, from the listing and its applicants', () => {
  const L = { id: 'L1', name: '', address: '888 Bay St', unit: '4301', monthly_rent: '2650', bedrooms: '2', status: 'active', created_at: ago(20), possession_date: '2026-12-01' };
  const r = H.rowOf(L, [{ linkId: 'a', listingId: 'L1', application: { full_name: 'Sofia Russo', created_at: ago(5) }, decisionStatus: 'none', confirmations: {}, docVerifications: [] }]);
  assert.equal(r.rent, 2650, 'the rent is a number');
  assert.equal(r.bedrooms, '2'); assert.equal(r.createdAt, ago(20)); assert.equal(r.address, '888 Bay St'); assert.equal(r.unit, '4301');
  assert.equal(r.label, '888 Bay St, Unit 4301');
  assert.equal(r.counts.none, 1, 'the applicant with no documents asked for');
  assert.deepEqual([r.next.kind, r.next.n, r.next.label], ['ask', 1, 'Ask for documents'], 'the next step, from the board');
  assert.equal(S.attentionOf(r).rank, 3);
});

test('an order held while the data changes: the newest data in the positions set, a new row last, the set of rows its own key', () => {
  const rows = [row('a', { lastAt: ago(3) }), row('b', { lastAt: ago(1) }), row('c', { lastAt: ago(2) })];
  const held = S.orderIds(rows, S.DEFAULT_SORT);
  assert.deepEqual(held, ['b', 'c', 'a']);
  // The server's answer lands: a now has the newest activity. The positions hold, the data is new.
  const fresh = [row('a', { lastAt: ago(0), rent: 999 }), row('b', { lastAt: ago(1) }), row('c', { lastAt: ago(2) })];
  const shown = S.arrange(fresh, held);
  assert.deepEqual(ids(shown), ['b', 'c', 'a']); assert.equal(shown[2].rent, 999, 'the row itself is the new one');
  assert.deepEqual(ids(S.arrange([...fresh, row('d')], held)), ['b', 'c', 'a', 'd'], 'a row the order does not hold goes last');
  assert.deepEqual(ids(S.arrange(fresh.slice(1), held)), ['b', 'c'], 'a row gone is gone');
  assert.equal(S.rowSet(rows), S.rowSet([...rows].reverse()), 'the set, whatever its order');
  assert.notEqual(S.rowSet(rows), S.rowSet(rows.slice(1)));
  assert.deepEqual(S.arrange(null, held), []);
});

test('a heading: its first click sorts one way, a second click the other; another heading starts again', () => {
  const firsts = Object.fromEntries(S.COLUMN_KEYS.map((k) => [k, S.headingSort(S.DEFAULT_SORT, k).dir]));
  assert.deepEqual(firsts, { address: 'asc', rent: 'desc', beds: 'desc', move: 'asc', applicants: 'desc', newest: 'desc', verified: 'desc', report: 'asc', when: 'asc' }, 'Last activity is the default, so its first click turns it to oldest first');
  assert.deepEqual(S.headingSort({ key: 'rent', dir: 'desc' }, 'rent'), { key: 'rent', dir: 'asc' });
  assert.deepEqual(S.headingSort({ key: 'rent', dir: 'asc' }, 'rent'), { key: 'rent', dir: 'desc' });
  assert.deepEqual(S.headingSort({ key: 'rent', dir: 'asc' }, 'address'), { key: 'address', dir: 'asc' });
  // Every column of the table is one a heading sorts.
  const t = src('components/dashboard/ListingsTable.js');
  assert.deepEqual([...t.matchAll(/^\s*\{ key: '(\w+)', head:/gm)].map((m) => m[1]).sort(), [...S.COLUMN_KEYS].sort());
});

test('the eight choices, in order, one of them the order on view; an order only a heading gives comes first by its name', () => {
  assert.deepEqual(S.SORT_CHOICES.map((c) => c.label), ['Latest activity', 'Newest listing', 'Rent high to low', 'Rent low to high', 'Most applicants', 'Needs attention first', 'Move in date soonest', 'Address A to Z']);
  for (const c of S.SORT_CHOICES) { assert.equal(S.sortName(c), c.label); assert.deepEqual(S.validSort(c), { key: c.key, dir: c.dir }); }
  assert.equal(S.choicesFor(S.DEFAULT_SORT), S.SORT_CHOICES);
  const beds = S.choicesFor({ key: 'beds', dir: 'asc' });
  assert.equal(beds.length, 9); assert.equal(beds[0].label, 'Fewest bedrooms'); assert.equal(beds.filter((c) => S.sameSort(c, { key: 'beds', dir: 'asc' })).length, 1);
  for (const key of S.COLUMN_KEYS) for (const dir of ['asc', 'desc']) assert.ok(S.sortName({ key, dir }), `${key} ${dir} has a name`);
  assert.equal(new Set(S.COLUMN_KEYS.flatMap((key) => ['asc', 'desc'].map((dir) => S.sortName({ key, dir })))).size, S.COLUMN_KEYS.length * 2, 'every order its own name');
  for (const name of S.COLUMN_KEYS.flatMap((key) => ['asc', 'desc'].map((dir) => S.sortName({ key, dir })))) assert.doesNotMatch(name, /[-\u2013\u2014]/);
});

test('the choice is kept on the device for each shelf; storage missing, unreadable or holding something else gives the default', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const store = mem();
  assert.deepEqual(S.readSort(store, 'active'), S.DEFAULT_SORT, 'nothing kept yet');
  assert.equal(S.writeSort(store, 'active', { key: 'rent', dir: 'asc' }), true);
  assert.deepEqual(S.readSort(store, 'active'), { key: 'rent', dir: 'asc' });
  assert.deepEqual(S.readSort(store, 'archived'), S.DEFAULT_SORT, 'Archived keeps its own');
  S.writeSort(store, 'archived', { key: 'attention', dir: 'asc' });
  assert.deepEqual([S.readSort(store, 'active'), S.readSort(store, 'archived')], [{ key: 'rent', dir: 'asc' }, { key: 'attention', dir: 'asc' }]);
  assert.deepEqual([...store.m.keys()].sort(), ['rl-listing-sort-active', 'rl-listing-sort-archived']);
  for (const bad of ['{', 'null', '"rent"', '{"key":"constructor","dir":"asc"}', '{"key":"__proto__"}', '{"key":"nope","dir":"asc"}']) {
    store.m.set('rl-listing-sort-active', bad);
    assert.deepEqual(S.readSort(store, 'active'), S.DEFAULT_SORT, bad);
  }
  store.m.set('rl-listing-sort-active', '{"key":"rent","dir":"sideways"}');
  assert.deepEqual(S.readSort(store, 'active'), { key: 'rent', dir: 'desc' }, 'a direction it does not know: the column\'s first');
  const throwing = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.deepEqual(S.readSort(throwing, 'active'), S.DEFAULT_SORT);
  assert.equal(S.writeSort(throwing, 'active', { key: 'rent', dir: 'asc' }), false, 'a failed write is quiet');
  assert.deepEqual(S.readSort(null, 'active'), S.DEFAULT_SORT); assert.equal(S.writeSort(null, 'active', S.DEFAULT_SORT), false);
  // The page reads it after mount, inside try and catch, and writes on each change.
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /const deviceStore = \(\) => \{ try \{ return window\.localStorage; \} catch \(e\) \{ return null; \} \};/);
  assert.match(h, /useIsoLayout\(\(\) => \{\s*const store = deviceStore\(\);\s*const kept = \{ active: readSort\(store, 'active'\), archived: readSort\(store, 'archived'\) \};/);
  assert.match(h, /writeSort\(deviceStore\(\), shelf, s\);/);
});

test('the headings: buttons that sort, aria-sort and the arrow on the one that holds the order, plain words without onSort', async () => {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ListingsTable } = await import('../components/dashboard/ListingsTable.js');
  const rows = [H.rowOf({ id: 'L1', name: '210 Carlaw Ave', monthly_rent: 2600, bedrooms: '2', status: 'active', created_at: ago(3) }, [])];
  const paths = { listing: (id) => `/listing/${id}` };
  const html = renderToStaticMarkup(React.createElement(ListingsTable, { rows, now: NOW, paths, sort: { key: 'rent', dir: 'desc' }, onSort() {} }));
  const heads = [...html.matchAll(/<span role="columnheader"([^>]*)>/g)].map((m) => m[1]);
  assert.equal(heads.length, 9);
  assert.deepEqual(heads.filter((h) => /aria-sort=/.test(h)).map((h) => [h.match(/data-col="(\w+)"/)[1], h.match(/aria-sort="(\w+)"/)[1]]), [['rent', 'descending']], 'aria-sort on the rent heading alone');
  assert.equal((html.match(/<button type="button" class="[^"]*lt-sort/g) || []).length, 9, 'each heading a button');
  assert.deepEqual([...html.matchAll(/class="lt-arrow lt-arrow-(before|after)" data-dir="(\w*)"/g)].filter((m) => m[2]).map((m) => [m[1], m[2]]), [['before', 'desc']], 'one arrow drawn, down, before the number heading');
  const up = renderToStaticMarkup(React.createElement(ListingsTable, { rows, now: NOW, paths, sort: { key: 'address', dir: 'asc' }, onSort() {} }));
  assert.match(up, /data-col="address" aria-sort="ascending"><button[^>]*><span>Address<\/span><span class="lt-arrow lt-arrow-after" data-dir="asc"/, 'after a word heading, up');
  // A word heading's arrow takes no room; a number heading's keeps its room whether it shows or not.
  const lt = code('components/dashboard/ListingsTable.js');
  assert.match(lt, /\.lt :global\(\.lt-arrow\) \{ position: absolute;[^}]*visibility: hidden;/);
  assert.match(lt, /\.lt :global\(\.lt-arrow-before\) \{ position: static;/);
  const plain = renderToStaticMarkup(React.createElement(ListingsTable, { rows, now: NOW, paths }));
  assert.doesNotMatch(plain.replace(/<style[\s\S]*?<\/style>/g, ''), /aria-sort|lt-sort|<button/, 'without onSort the headings are words');
  // The table's track rules are unchanged: one track a column, a spacer before each.
  assert.match(code('components/dashboard/ListingsTable.js'), /const at = \(i\) => \(\{ gridColumn: \(select \? 2 : 1\) \+ 2 \* i \}\);/);
});

test('the page: every table and every card list in the shelf\'s order; the selection, the bar, Needs you and the Pipeline left alone', () => {
  const h = code('components/dashboard/HomeView.js');
  // Each list's order is set by the order chosen, the set of its rows and the signals being in:
  // never by the rows' data alone, so a takeover or fresh signals move no card.
  assert.match(h, /const activeOrder = useMemo\(\(\) => orderIds\(rows, sorts\.active\), \[sorts\.active, rowSet\(rows\), signals\.loaded\]\);/);
  assert.match(h, /const closedOrder = useMemo\(\(\) => orderIds\(closedRows, sorts\.active\), \[sorts\.active, rowSet\(closedRows\), signals\.loaded\]\);/);
  assert.match(h, /const archivedOrder = useMemo\(\(\) => orderIds\(archivedRows, sorts\.archived\), \[sorts\.archived, rowSet\(archivedRows\), signals\.loaded\]\);/);
  assert.match(h, /const sortedRows = arrange\(rows, activeOrder\);\s*const sortedClosed = arrange\(closedRows, closedOrder\);\s*const sortedArchived = arrange\(archivedRows, archivedOrder\);/);
  for (const t of ['rows={shownRows}', 'rows={foundClosed}', 'rows={foundArchived}']) assert.match(h, new RegExp(`<ListingsTable ${t.replace(/[{}]/g, '\\$&')}[^\\n]*sort=\\{sorts\\.(active|archived)\\} onSort=\\{onHeading\\}`), t);
  // The cards (components/dashboard/ListingCard.js) take the same rows as the tables, in the same order.
  for (const list of ['shownRows', 'foundClosed', 'foundArchived']) assert.match(h, new RegExp(`\\{cardsOf\\(${list}\\)\\}`), list);
  // A change of order sets the order and keeps it, nothing else: no route, no scroll, no selection.
  const setSort = h.match(/const setSort = \(next\) => \{[\s\S]*?\n  \};/)[0];
  assert.doesNotMatch(setSort, /setPicked|go\(|goView|router|scroll|setFilter/);
  assert.doesNotMatch(h.match(/const choose = [^\n]*/)[0], /setPicked|go\(|scroll/);
  assert.doesNotMatch(h.match(/const pickFromMenu = [^\n]*/)[0], /setPicked|go\(|scroll/);
  // Needs you and the Pipeline read what they always read.
  assert.match(h, /<NeedsYou items=\{needs\} now=\{now\} onGo=\{onNeed\} \/>/);
  assert.match(h, /const people = signals\.people \|\| \[\];/);
  assert.match(h, /<PipelineSoon people=\{people\} href=\{pipelineHref\} onOpen=\{openPipeline\} \/>/);
  // Needs you from the board, and the board from the listings, never the sorted rows.
  assert.match(h, /const board = useMemo\(\(\) => boardOf\(\{ listings: liveListings, applicantsByListing: byListing,/, 'the board from the listings, never the sorted rows');
  assert.match(h, /needsYouItems\(\{ board, /, 'Needs you from the board');
  // The Sort controls never pass for a fold: the walk opens folds, never menus or sheets.
  assert.match(h, /aria-haspopup="dialog" aria-label=\{`Sort, \$\{sortLabel\}`\} data-sort-open=""/);
  assert.match(h, /aria-haspopup="menu" aria-expanded=\{menuOpen \? 'true' : 'false'\}/);
});

test('the search: past eight listings in the view, by address and unit, any case, every word typed', () => {
  assert.equal(S.SEARCH_FROM, 9, 'more than eight');
  const rows = [row('a', { address: '55 Gerrard St West' }), row('b', { name: '888 Bay St', unit: '4301' }), row('c', { name: 'Annex Loft', address: '12 Bloor St W', unit: 'PH2' }), row('d', { address: '1 Côte Street' })];
  assert.deepEqual(ids(S.matchRows(rows, '')), ['a', 'b', 'c', 'd'], 'nothing typed: all of them');
  assert.deepEqual(ids(S.matchRows(rows, '   ')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(S.matchRows(rows, 'GERRARD')), ['a']);
  assert.deepEqual(ids(S.matchRows(rows, 'bay 4301')), ['b'], 'the address and the unit, as two words');
  assert.deepEqual(ids(S.matchRows(rows, 'unit 4301')), ['b']);
  assert.deepEqual(ids(S.matchRows(rows, 'bloor')), ['c'], 'the street of a listing shown by its name');
  assert.deepEqual(ids(S.matchRows(rows, 'ph2')), ['c']);
  assert.deepEqual(ids(S.matchRows(rows, 'cote')), ['d']);
  assert.deepEqual(ids(S.matchRows(rows, 'st')), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids(S.matchRows(rows, 'harbour')), [], 'none');
  // The order of what matches is the order given.
  assert.deepEqual(ids(S.matchRows([rows[2], rows[0]], 'st')), ['c', 'a']);
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /const inView = shelf === 'archived' \? archivedListings\.length : liveListings\.length;\s*const canFind = inView >= SEARCH_FROM;\s*const q = canFind \? query : '';/, 'the field and its filter only past eight in the view');
  // One field at every width (feat/dashboard-2026), over the cards and the Compact table alike.
  assert.match(h, /\{canFind \? <div className="hv-find-row">\{findField\}\{foundLine\}<\/div> : null\}/);
  assert.match(h, /count\(found, 'listing matches', 'listings match'\)/);
  assert.match(h, /<p role="status">No listing matches your search\.<\/p>\s*<button type="button" className="ds-btn ds-btn-quiet" onClick=\{\(\) => setQuery\(''\)\} data-search-clear="">Clear<\/button>/);
});

test('one height, one radius: the Sort button, the switch, the field and the choices are 44px with the dashboard\'s button radius', () => {
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /className="ds-btn ds-btn-line hv-sort-btn"/);
  // The switches (Active and Archived, Cards and Compact): .hv-seg since feat/dashboard-2026.
  assert.match(h, /:global\(\.hv-seg button\) \{ min-height: 38px;/, '38px inside 2px of padding and a 1px border');
  assert.match(h, /:global\(\.hv-seg\) \{ display: inline-flex; padding: 2px; border-radius: var\(--btn-radius\); border: 1px solid/);
  // A rule's body, its ${...} values included.
  const rule = (sel) => { const m = h.match(new RegExp(`:global\\(${sel.replace(/[.()]/g, '\\$&')}\\) \\{((?:[^}$]|\\$\\{[^}]*\\}|\\$)*)\\}`)); assert.ok(m, sel); return m[1]; };
  assert.match(rule('.hv-find-input'), /min-height: 44px;[\s\S]*border-radius: var\(--btn-radius\);/);
  assert.match(rule('.hv-sort-opt'), /min-height: 44px;[\s\S]*padding: 0 var\(--gap-card\);[\s\S]*border-radius: var\(--btn-radius\);/);
  // No red among the new controls: red is the one main action (New listing).
  const raw = src('components/dashboard/HomeView.js');
  const block = raw.slice(raw.indexOf('The order and the search: the Sort control'), raw.indexOf('/* ── Phone and desktop'));
  assert.ok(block.length > 1000, 'the styles of the new controls');
  assert.doesNotMatch(block, /C\.red\b/);
});
