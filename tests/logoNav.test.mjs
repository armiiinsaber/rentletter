// The Rentletter logo in the realtor dashboard (components/dashboard/logoNav.js): on another view it
// goes to Listings, on Listings scrolled down it scrolls to the top, on Listings at the top it does
// nothing. The browser walk (tests/routes/logoWebkit.test.mjs) taps the real logo for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const { onListingsView, logoAction } = await import('../components/dashboard/logoNav.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a. on any other view the logo goes to Listings', () => {
  for (const href of ['/listing/L1', '/profile', '/circle', '/billing', '/dashboard?view=pipeline', '/dashboard?view=shared', '/demo/dashboard?listing=demo-carlaw', '/demo/dashboard?profile=1', '/demo/dashboard?circle=1', '/demo/dashboard?view=pipeline']) {
    assert.equal(onListingsView(href), false, href);
    assert.equal(logoAction({ onListings: onListingsView(href), scrollY: 0 }), 'go', href);
    assert.equal(logoAction({ onListings: onListingsView(href), scrollY: 800 }), 'go', href);
  }
});

test('b. on Listings, scrolled down, it scrolls to the top', () => {
  for (const href of ['/dashboard', '/dashboard?view=listings', '/dashboard#people', '/demo/dashboard']) {
    assert.equal(onListingsView(href), true, href);
    assert.equal(logoAction({ onListings: true, scrollY: 1 }), 'top');
    assert.equal(logoAction({ onListings: true, scrollY: 1200 }), 'top');
  }
});

test('c. on Listings at the top it does nothing', () => {
  assert.equal(logoAction({ onListings: true, scrollY: 0 }), 'none');
  assert.equal(logoAction({ onListings: true, scrollY: -4 }), 'none', 'an overscroll bounce at the top is the top');
  // Every logo in the dashboard goes through logoProps, never a plain route link: a plain link to
  // the dashboard pushed the same route, which is what moved the screen and brought it back.
  const header = src('components/dashboard/DashboardHeader.js');
  assert.match(header, /logoProps\(/);
  assert.doesNotMatch(header, /linkProps\(adapter\.paths\.home\)/);
  const nav = src('components/dashboard/logoNav.js');
  assert.match(nav, /e\.preventDefault\(\);\s*const act = logoAction/);
  assert.match(nav, /if \(act === 'go'\) \{ go\(home\); return; \}/);
});
