// Smart taps, the arithmetic and the wiring (lib/motion.js):
//   planHitAreas: every target grows to 44 by 44 where there is room, centred; two that would meet
//   split the gap at its midpoint; a side held back hands the rest to the opposite side; a form
//   field is never covered; a control inside a card is not held back by the card.
//   pickTarget: the tap resolver's choice. One clearly nearest (1.5 times closer than the next)
//   within 16px wins; two near equally, a destructive control or a text field: nothing.
//   isDestructive: marked data-destructive, or words that are an irreversible act.
// The browser walks (tests/routes/tapsWebkit.test.mjs) run the same rules on the real pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIT, RESOLVE, planHitAreas, pickTarget, isDestructive, distanceToBox } from '../lib/motion.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const box = (l, t, w, h, more = {}) => ({ l, t, r: l + w, b: t + h, inside: [], ...more });
const grown = (b, e) => ({ l: b.l - e.l, t: b.t - e.t, r: b.r + e.r, b: b.b + e.b });
const size = (b, e) => { const g = grown(b, e); return { w: g.r - g.l, h: g.b - g.t }; };
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

test('a lone small control grows to 44 by 44, centred, and a big one is left alone', () => {
  const [e, f] = planHitAreas([box(100, 100, 34, 34), box(200, 300, 120, 48)]);
  assert.deepEqual(e, { l: 5, r: 5, t: 5, b: 5 });
  assert.deepEqual(f, { l: 0, r: 0, t: 0, b: 0 });
  assert.equal(HIT, 44);
});

test('two controls closer than their areas split the gap at the midpoint', () => {
  // Two 24px tall rows, 10px apart: each takes 5px of the gap and the rest on its free side.
  const boxes = [box(20, 100, 300, 24), box(20, 134, 300, 24)];
  const [a, b] = planHitAreas(boxes);
  assert.equal(a.b, 5); assert.equal(b.t, 5);
  assert.equal(a.t, 15, 'the first row takes the rest above it'); assert.equal(b.b, 15, 'the second below it');
  assert.equal(size(boxes[0], a).h, 44); assert.equal(size(boxes[1], b).h, 44);
  assert.ok(!overlap(grown(boxes[0], a), grown(boxes[1], b)));
  // Side by side: two 30px wide icons 6px apart split the 6px.
  const side = [box(100, 0, 30, 44), box(136, 0, 30, 44)];
  const [l, r] = planHitAreas(side);
  assert.equal(l.r, 3); assert.equal(r.l, 3); assert.equal(l.l, 11); assert.equal(r.r, 11);
});

test('one that needs less than half the gap leaves the rest to the other', () => {
  // A 40px tall row needs 2px each side; a 20px row below, 16px away, takes the other 14.
  const [a, b] = planHitAreas([box(0, 0, 300, 40), box(0, 56, 300, 20)]);
  assert.equal(a.b, 2); assert.equal(b.t, 12, 'all it needed'); assert.equal(b.b, 12);
  const [c, d] = planHitAreas([box(0, 0, 300, 40), box(0, 50, 300, 20)]);
  assert.equal(c.b, 2); assert.equal(d.t, 8, 'the gap less the first one'); assert.equal(d.b, 16, 'the rest below');
});

test('a form field is never covered, and a control inside a card is not held back by it', () => {
  // A checkbox label 10px under a text field and directly over another label: it may not reach 44.
  const boxes = [box(20, 852, 170, 64, { fixed: true }), box(20, 926, 350, 24), box(20, 950, 350, 24)];
  const [field, first, second] = planHitAreas(boxes);
  assert.deepEqual(field, { l: 0, r: 0, t: 0, b: 0 }, 'a field cannot carry an extension');
  assert.equal(first.t, 10, 'up to the field, not over it'); assert.equal(first.b, 0, 'the rows touch');
  assert.equal(second.t, 0); assert.equal(second.b, 20, 'the second takes all of its 44 below');
  assert.equal(size(boxes[1], first).h, 34, 'held by its neighbours on both sides');
  // With 20px between the two rows (the New listing sheet), both reach 44.
  const spaced = [box(20, 852, 170, 64, { fixed: true }), box(20, 926, 350, 24), box(20, 970, 350, 24)];
  const [, s1, s2] = planHitAreas(spaced);
  assert.deepEqual([size(spaced[1], s1).h, size(spaced[2], s2).h], [44, 44]);
  assert.deepEqual([s1.t, s1.b, s2.t, s2.b], [10, 10, 10, 10]);
  // A 30px button inside a card: the card does not limit it.
  const card = box(0, 0, 360, 200); const btn = box(300, 160, 30, 30, { inside: [0] });
  const [, e] = planHitAreas([card, btn]);
  assert.deepEqual(e, { l: 7, r: 7, t: 7, b: 7 });
});

test('no two grown areas ever overlap, and a field is never covered (random layouts)', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let round = 0; round < 300; round++) {
    const boxes = [];
    for (let tries = 0; boxes.length < 8 && tries < 200; tries++) {
      const b = box(Math.round(rnd() * 360), Math.round(rnd() * 600), 12 + Math.round(rnd() * 120), 12 + Math.round(rnd() * 40), { fixed: rnd() < 0.2 });
      if (!boxes.some((o) => overlap(o, b))) boxes.push(b);
    }
    const ext = planHitAreas(boxes);
    const g = boxes.map((b, i) => grown(b, ext[i]));
    for (let i = 0; i < boxes.length; i++) {
      for (const k of ['l', 'r', 't', 'b']) assert.ok(ext[i][k] >= 0, 'never negative');
      const s = size(boxes[i], ext[i]);
      assert.ok(s.w <= Math.max(HIT, boxes[i].r - boxes[i].l) + 1e-9 && s.h <= Math.max(HIT, boxes[i].b - boxes[i].t) + 1e-9, 'never past 44');
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(g[i], g[j]), `round ${round}: ${i} and ${j} overlap`);
    }
  }
});

test('the resolver picks one clearly nearest target within 16px, never two near equally', () => {
  assert.deepEqual(RESOLVE, { radius: 16, ratio: 1.5 });
  assert.equal(pickTarget([{ d: 6 }, { d: 12 }]), 0, 'twice as close');
  assert.equal(pickTarget([{ d: 12 }, { d: 6 }]), 1, 'in any order');
  assert.equal(pickTarget([{ d: 8 }, { d: 11 }]), -1, 'under 1.5 times closer: ambiguous');
  assert.equal(pickTarget([{ d: 8 }, { d: 12 }]), 0, 'exactly 1.5 times closer is clear');
  assert.equal(pickTarget([{ d: 17 }]), -1, 'past 16px: nothing');
  assert.equal(pickTarget([{ d: 10 }, { d: 20 }]), 0, 'the next one past 16px does not count');
  assert.equal(pickTarget([]), -1);
});

test('the resolver never lands on a destructive control or a text field', () => {
  assert.equal(pickTarget([{ d: 4, destructive: true }, { d: 14 }]), -1, 'Remove nearest: nothing, not the next one');
  assert.equal(pickTarget([{ d: 4, field: true }]), -1, 'a field needs a direct hit');
  assert.equal(pickTarget([{ d: 4 }, { d: 14, destructive: true }]), 0, 'a harmless control nearest still works');
});

test('the distance to a box is zero inside it and straight or diagonal outside it', () => {
  const r = { left: 10, top: 10, right: 50, bottom: 30 };
  assert.equal(distanceToBox(20, 20, r), 0);
  assert.equal(distanceToBox(0, 20, r), 10);
  assert.equal(distanceToBox(53, 34, r), 5);
});

test('what counts as destructive', () => {
  const el = ({ text = '', label = null, marked = false } = {}) => ({ textContent: text, getAttribute: (k) => (k === 'aria-label' ? label : null), closest: (s) => (s === '[data-destructive]' && marked ? {} : null) });
  for (const text of ['Remove', 'Delete listing', 'Delete…', 'Withdraw', 'Mark as rented', 'Mark withdrawn', 'Set aside', 'Revoke code', 'Discard', 'Decline']) assert.ok(isDestructive(el({ text })), text);
  assert.ok(isDestructive(el({ text: '×', label: 'Remove lease.pdf' })), 'the words of an icon button');
  assert.ok(isDestructive(el({ text: 'Withdrew', marked: true })), 'marked');
  for (const text of ['Invite', 'Restore', 'Details', 'Create listing', 'Removed from view']) assert.equal(isDestructive(el({ text })), false, text);
});

test('the wiring: installed once for every page, every destructive control marked', () => {
  const frame = src('components/nav/RouteFrame.js');
  assert.match(frame, /installPress\(\); const b = installHitAreas\(\); const c = installTapResolver\(\);/);
  assert.match(src('components/ui.js'), /\$\{HIT_CSS\}/);
  // The confirm button of every confirm sheet, and the controls that act at once or open one.
  assert.match(src('components/ui.js'), /<button data-destructive="" onClick=\{onConfirm\}/);
  const marked = {
    'components/dashboard/PeopleList.js': ['Remove'],
    'components/dashboard/ListingView.js': ['openSetAside', 'withdrawApplicant', 'setRentedOpen\\(true\\)', 'setDeleteOpen\\(true\\)', 'confirmSetAside'],
    'components/dashboard/ApplicantDocIntel.js': ['setConfirm\\(true\\)', 'removeFile\\(i\\)', 'setConfirmDelete\\(true\\)', 'deleteArchivedEntry', 'setConfirmArchId\\(entry\\.id\\)'],
    'components/dashboard/CompareTenants.js': ['removeAt'],
    'components/dashboard/ProfileEditorBody.js': ['removeLogo'],
    'components/tenant/DocumentUploader.js': ['removeFile\\(f\\.key\\)'],
    'components/Sheet.js': ['setAsking\\(false\\); onClose'],
    'pages/my-application/[rl].js': ["'revoke'"],
    'pages/refer/[token].js': ["decide\\('decline'\\)"],
  };
  // Each button's opening, from <button up to its closing tag: the one that does the act is marked.
  const buttons = (s) => s.split('<button').slice(1).map((b) => b.split('</button>')[0]);
  for (const [file, acts] of Object.entries(marked)) {
    const all = buttons(src(file));
    for (const a of acts) {
      const doing = all.filter((b) => new RegExp(a).test(b));
      assert.ok(doing.length > 0, `${file}: a button that does ${a}`);
      for (const b of doing) assert.match(b, /^[^>]*?data-destructive=""/, `${file}: ${a} is marked`);
    }
  }
});

test('Pipeline: Applied is a status pill, Remove a 44px quiet control, the header opens and closes', () => {
  const s = src('components/dashboard/PeopleList.js');
  assert.match(s, /items=\{\[fitText\(f\), f\.listingName, f\.applied \? 'Applied' : null\]\}/);
  assert.doesNotMatch(s, />Applied<\/span>/, 'no longer a control lookalike');
  assert.match(s, /<button type="button" data-destructive="" onClick=\{\(\) => setConfirm\(p\)\} style=\{\{ display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44,/);
  assert.match(s, /data-tap-card=\{rows\.length \? '' : undefined\}/);
  assert.match(s, /aria-expanded=\{headerOpen\} onClick=\{toggleHeader\}/);
});
