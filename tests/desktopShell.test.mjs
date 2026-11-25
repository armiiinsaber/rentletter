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

test('the four tiles: what each says and does, quiet with nothing to do (components/dashboard/StatusBoard.js)', () => {
  const t = code('components/dashboard/StatusBoard.js');
  // In this order, with these words; every number from the board (tests/dashboardBoard.test.mjs).
  assert.match(t, /tile\('toSend', t\.toSend \|\| 0, 'Ready to send', \{ dark: true, act: 'Send report', item: t\.oldestSend \}\)\}\s*\{tile\('toCheck', t\.toCheck \|\| 0, 'Documents to check', \{ act: 'Check now', item: t\.oldestCheck \}\)\}\s*\{tile\('applicants', t\.applicants \|\| 0, 'Applicants',[^\n]*\n\s*\{tile\('all', t\.active \|\| 0, 'Active listings',/);
  // Above zero: the red dot, the action line with its arrow, and a link to the one waited longest.
  assert.match(t, /const live = !!\(act && n > 0 && item\);/);
  assert.match(t, /\{live \? <span className="sb-dot" aria-hidden="true" \/> : null\}/);
  assert.match(t, /\{live \? <span className="sb-act">\{act\}<Icon name="arrow"/);
  assert.match(t, /\? <a key=\{key\} href=\{actionHref\(item, paths\)\} onClick=\{jump\(item\)\}/);
  // Black only while there is a report to send; with nothing to do the tile is quiet and filters.
  assert.match(t, /const cls = `sb-tile\$\{dark && live \? ' sb-dark' : ' rl-glass'\}\$\{act && !live \? ' sb-quiet' : ''\}`;/);
  assert.match(t, /: <button key=\{key\} \{\.\.\.filterBtn\(key\)\} className=\{cls\} data-tile=\{key\}>/);
  assert.match(t, /'aria-pressed': filter === key && key !== 'all' \? 'true' : 'false', onClick: \(\) => onFilter\(key === 'all' \|\| filter === key \? 'all' : key\)/);
  // Four in a row from 1024, two by two under it.
  assert.match(t, /\.sb-tiles \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(t, /@media \(min-width: 1024px\) \{ \.sb-tiles \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  // The date, from the client's clock after mount.
  assert.match(t, /toLocaleDateString\('en-CA', \{ weekday: 'long', month: 'long', day: 'numeric' \}\)/);
  // A changed number rolls: the old one out, the new one in, transform and opacity only, never when
  // motion is reduced (then the old one is not drawn at all).
  assert.match(t, /\.sb :global\(\.sb-roll-was\) \{ display: none; \}/);
  const motion = t.slice(t.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.match(motion, /@keyframes sb-out \{ from \{ opacity: 1; transform: translateY\(0\); \} to \{ opacity: 0; transform: translateY\(-60%\); \} \}/);
  assert.match(motion, /@keyframes sb-in \{ from \{ opacity: 0; transform: translateY\(60%\); \} to \{ opacity: 1; transform: translateY\(0\); \} \}/);
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

test('a row\'s move in date and newest applicant, and the Pipeline soonest first, from what is loaded', () => {
  const by = [app('a', 'Sofia Russo', { createdAt: ago(3) }), app('b', 'Wei Chen', { createdAt: ago(1) }), app('w', 'Gone', { createdAt: ago(0), withdrawnAt: ago(0), decisionStatus: 'withdrawn' })];
  const r = H.rowOf({ ...L1, possession_date: '2026-12-01' }, by);
  assert.equal(r.moveIn, '2026-12-01');
  assert.deepEqual(r.newest, { name: 'Wei Chen', at: ago(1) }, 'the newest live applicant, never one who withdrew');
  assert.equal(H.rowOf(L1, []).newest, null); assert.equal(H.rowOf(L1, []).moveIn, null);
  assert.equal(H.shortDay('2026-12-01'), 'Dec 1', 'the day itself in any zone'); assert.equal(H.shortDay(null), '');
  const soon = (d) => new Date(NOW + d * 86400000).toISOString();
  const people = [{ id: 'P1', status: 'consented', expiresAt: soon(20) }, { id: 'P2', status: 'pending', expiresAt: null }, { id: 'P3', status: 'consented', expiresAt: soon(4) }, { id: 'P4', status: 'consented', expiresAt: soon(20) }];
  assert.deepEqual(H.pipelineSoonest(people).map((p) => p.id), ['P3', 'P1', 'P4', 'P2'], 'the hold that ends soonest first, no end date last, ties in the view\'s order');
  assert.deepEqual(H.pipelineSoonest(null), []);
  assert.equal(H.PIPELINE_SOON_LIMIT, 5);
  const p = { status: 'consented', best: { score: 4.24, label: 'strong', listingName: '210 Carlaw Ave, Unit 4' }, expiresAt: '2026-12-21T15:00:00Z', lastInvitedAt: '2026-11-03T15:00:00Z' };
  assert.deepEqual(H.pipelinePills(p), ['4.2 strong', 'until Dec 21', 'invited Nov 3'], 'the Pipeline view\'s closed row');
  assert.deepEqual(H.pipelinePills({ status: 'pending', askedAt: '2026-11-19T15:00:00Z' }), ['asked Nov 19', 'no answer yet']);
  assert.equal(H.pipelinePlace(p), '210 Carlaw Ave, Unit 4'); assert.equal(H.pipelinePlace({ fromListingName: '88 Harbour St' }), 'from 88 Harbour St');
});

test('the shell: a floating glass sidebar at 1024 and wider, the floating search and bell, the tab bar under 1024', () => {
  const s = code('components/dashboard/DashShell.js');
  assert.match(s, /\['listings', home, 'Listings', 'home'\],\s*\['pipeline', viewHref\(home, 'pipeline'\), 'Pipeline', 'list'\],\s*\['circle', adapter\.paths\.circle \|\| CIRCLE_PATH, 'Circle', 'users'\],\s*\['shared', viewHref\(home, 'shared'\), 'Shared with you', 'user'\],\s*\['profile', adapter\.paths\.profile, 'Profile', 'user'\],/);
  // 232px wide, 16px in from the window's edges, the window's height less the insets, 28px corners.
  assert.match(s, /\.ds \{ --ds-pad: clamp\(24px, calc\(8px \+ 1\.875vw\), 56px\); --ds-side: 232px; --ds-inset: 16px; display: grid; grid-template-columns: calc\(var\(--ds-side\) \+ var\(--ds-inset\)\) minmax\(0, 1fr\);/);
  assert.match(s, /\.ds-side \{ grid-area: side; position: sticky; z-index: 2; top: var\(--ds-inset\); margin: var\(--ds-inset\) 0 var\(--ds-inset\) var\(--ds-inset\); width: var\(--ds-side\); height: calc\(100vh - 2 \* var\(--ds-inset\)\); height: calc\(100dvh - 2 \* var\(--ds-inset\)\);[^}]*border-radius: 28px;/);
  assert.match(s, /<aside className="ds-side rl-glass" data-shell-side="" data-stuck="">/, 'glass, and it floats');
  assert.doesNotMatch(s, /1800px|margin: 0 auto/, 'no cap and no centring');
  // The current place: a dark filled pill. The Listings count from the board; Circle's dot while a request waits.
  assert.match(s, /\.ds-place\[aria-current='page'\] \{ background: \$\{C\.ink\}; color: \$\{C\.paper\};/);
  assert.match(s, /aria-current=\{current === key \? 'page' : undefined\}/);
  assert.match(s, /key === 'circle' && pending > 0 \? <span className="ds-dot" data-shell-dot="">/);
  // The realtor at the bottom: avatar, name, brokerage, the way to the profile.
  assert.match(s, /<a \{\.\.\.linkProps\(adapter\.paths\.profile\)\} className="ds-me" data-shell-me=""/);
  assert.match(s, /\.ds-me \{ margin-top: auto;/);
  // The header in the main area: the search pill at its left, the bell at its right, floating.
  const hd = code('components/dashboard/DashboardHeader.js');
  assert.match(hd, /\.rl-hdr-searchwrap \{ display: inline-flex; width: min\(520px, 100%\); margin-right: auto; border-radius: 999px;/);
  assert.match(hd, /<span className="rl-hdr-kbd"|<kbd className="rl-hdr-kbd" aria-hidden="true"[^>]*>\{mac === false \? 'Ctrl K' : '⌘K'\}<\/kbd>/);
  assert.match(hd, /\.rl-hdr-avatar \{ display: none !important; \}/, 'the avatar is in the sidebar at this width');
  assert.match(s, /\.ds-main :global\(\.rl-header\), \.ds-main :global\(\.rl-header\.rl-shrink\) \{ position: sticky !important; top: 0; background: transparent !important;/, 'only the two controls are glass');
  // A reading column and a view in columns keep their places.
  assert.match(s, /\.ds-main :global\(\.ds-col\) \{[^}]*margin-left: 0 !important;[^}]*padding-left: var\(--ds-pad\) !important;/);
  assert.match(s, /\.ds-main :global\(\.ds-fill\) \{[^}]*max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: var\(--ds-pad\) !important; padding-right: var\(--ds-pad\) !important; \}/);
  for (const v of ['ProfileView', 'CircleView']) assert.match(src(`components/dashboard/${v}.js`), /className="[^"]*\bds-fill\b[^"]*"/, `${v}: the main area's whole width, in columns of its own`);
  assert.match(src('components/dashboard/ListingView.js'), /className="ds-col"/, 'ListingView: a column at the left');
  // Under 1024 the tab bar: fixed, 16px in, 68px tall, round, above the home indicator, gone from 1024.
  const nav = code('components/dashboard/MainNav.js');
  assert.match(nav, /\.mn \{ position: fixed; z-index: 70; left: 16px; right: 16px; bottom: calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\); height: 68px;[^}]*border-radius: 999px;/);
  assert.match(nav, /@media \(min-width: 1024px\) \{ \.mn \{ display: none; \} \}/);
  assert.match(s, /\{nav && !locked \? <MainNav current=\{current\} onNew=\{newListing\} \/> : null\}/);
  assert.match(s, /@media \(max-width: 1023\.98px\) \{ \.ds-tabbed \.ds-main \{ padding-bottom: calc\(68px \+ 2 \* 16px \+ env\(safe-area-inset-bottom, 0px\)\); \} \}/, 'the content scrolls under the bar with room to clear it');
  // A view of the dashboard is chosen in place: a shallow route the frame does not animate.
  assert.match(s, /if \(HOME_VIEWS\.includes\(key\) && onDashboard\(\)\) \{ if \(current !== key\) goView\(href\); return; \}/);
  assert.match(nav, /if \(\(key === 'listings' \|\| key === 'pipeline'\) && onDashboard\(\)\) \{ e\.preventDefault\(\); goView\(href\);/);
  assert.match(code('components/nav/RouteFrame.js'), /if \(opts\.shallow && sameScreen\(at\.current, url\)\) return;/);
  // The Listings view: the board across the main area's whole width, then the cards with Needs you
  // beside them from 1280 (360 to 420px, staying in view under the floating search), under them before.
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /\.hv \{ padding: var\(--s-2\) var\(--ds-pad\) var\(--s-7\); \}/, 'the main area\'s whole width');
  assert.match(h, /@media \(min-width: 1280px\) \{\s*\.hv-cols \{ grid-template-columns: minmax\(0, 1fr\) clamp\(360px, calc\(130px \+ 18vw\), 420px\);/);
  assert.match(h, /\.hv-aside \{ position: sticky; top: calc\(var\(--s-4\) \* 2 \+ 48px\); \}/);
  assert.ok(h.indexOf('<StatusBoard') < h.indexOf('<div className="hv-cols">'), 'the board above the columns, across them');
  assert.match(h, /@media \(min-width: 2200px\) \{ \.hv-cards \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/, 'two cards a row only where each keeps the room for its strip');
  // The four realtor screens wear the same shell; Profile gets the tab bar too.
  for (const v of ['HomeView', 'ListingView', 'CircleView', 'ProfileView']) assert.match(src(`components/dashboard/${v}.js`), /<DashShell /, v);
  assert.match(src('components/dashboard/ProfileView.js'), /<DashShell profile=\{profile\} nav="profile" current="profile">/);
});

test('the visual rules: red for the one main action and what needs the realtor, cards solid, motion on transform and opacity', () => {
  const files = ['components/dashboard/HomeView.js', 'components/dashboard/DashShell.js', 'components/dashboard/MainNav.js', 'components/dashboard/NeedsYou.js', 'components/dashboard/ListingsTable.js', 'components/dashboard/PipelineSoon.js', 'components/dashboard/PeopleList.js', 'components/dashboard/AssistantBell.js', 'components/dashboard/ActionRow.js', 'components/dashboard/StatusBoard.js', 'components/dashboard/ListingCard.js', 'components/dashboard/CommandMenu.js', 'components/dashboard/BoardSkeleton.js'];
  const reds = files.flatMap((f) => code(f).split('\n').filter((l) => /\bC\.red\b/.test(l)).map((l) => `${f.split('/').pop()}: ${(l.match(/[.:#][\w-]+(?:[\s.:\w-()'=\[\]]*)?\{|className|rgba/) || [''])[0].trim()}`));
  // The red fills: the one main action (New listing in the sidebar, the round one in the tab bar,
  // the start's at 1024 and wider) and the signals of what needs the realtor (the dots, the current
  // stage of the strip, the tick of a report sent).
  const want = [
    'HomeView.js: .hv :global(.hv-start-new) {',
    'DashShell.js: .ds-dot {',
    'DashShell.js: :global(.ds-btn-primary) {',
    'MainNav.js: .mn :global(.mn-dot) {',
    'MainNav.js: .mn :global(.mn-new) {',
    'StatusBoard.js: .sb :global(.sb-dot) {',
    'ListingCard.js: .lc-dot {',
    'ListingCard.js: .lc-act-done svg {',
    'ListingCard.js: .lc-cur .lc-bar {',
  ];
  assert.deepEqual([...reds].sort(), [...want].sort(), reds.join('\n'));
  // Cards stay solid: white, 24px corners, a shadow; never glass.
  const card = code('components/dashboard/ListingCard.js');
  assert.match(card, /\.lc \{ position: relative; display: grid;[^}]*background: \$\{C\.card\}; border-radius: 24px;/);
  assert.doesNotMatch(card, /rl-glass|backdrop/);
  // The card lifts 2px under a pointer that hovers; its stronger shadow fades in on a layer of its own.
  assert.match(card, /@media \(hover: hover\) \{ \.lc:hover \{ transform: translateY\(-2px\); \} \.lc:hover::after \{ opacity: 1; \} \}/);
  // Every dashboard button: one height, one radius, one padding.
  assert.match(code('components/dashboard/DashShell.js'), /:global\(\.ds-btn\) \{ display: inline-flex;[^}]*min-height: 44px; padding: 0 var\(--gap-card\); border-radius: var\(--btn-radius\);/);
  // Motion: only transform and opacity, behind the reduced motion query.
  for (const f of ['components/dashboard/NeedsYou.js', 'components/dashboard/StatusBoard.js', 'components/dashboard/ListingCard.js']) {
    const s = code(f);
    for (const m of s.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\s*\}/g)) assert.doesNotMatch(m[1].replace(/opacity|transform|translateY\([^)]*\)|none|from|to|[\d.%-]+|[{}:;\s]/g, ''), /\w/, `${f}: only transform and opacity`);
    const at = s.indexOf('@media (prefers-reduced-motion: no-preference)');
    assert.ok(at > 0, `${f}: behind the reduced motion query`);
    assert.doesNotMatch(s.slice(0, at), /\btransition:|animation:/, `${f}: nothing moves outside it`);
    for (const t of s.slice(at).matchAll(/transition: ([^;]+);/g)) assert.doesNotMatch(t[1].replace(/transform|opacity|\d+ms|cubic-bezier\([^)]*\)|linear|ease[\w-]*|,/g, ''), /\w/, `${f}: a transition of transform or opacity only (${t[1]})`);
  }
  for (const f of ['components/dashboard/MainNav.js', 'components/dashboard/CommandMenu.js', 'components/dashboard/BoardSkeleton.js', 'components/dashboard/DashShell.js']) assert.doesNotMatch(code(f), /transition:|animation:|@keyframes/, `${f}: nothing of its own moves`);
});
