// tests/helpers/textLines.mjs  The rule wrapped text is held to on the realtor's pages: no line holds
// one word, no line runs under 60% of the block's longest line, no word (a link included) is split
// across two lines, and every line sits inside its block. Measured in the page word by word.
//   readLines(locator)            -> [{ text, data, box: { left, right }, lines: [{ words, left, right }], split }]
//   assertBalanced(block, name, { link })   asserts the rule on one measured block; a link block
//                                 (link: true) is one line, whole, inside its block, and may stand alone
import assert from 'node:assert/strict';

export function readLines(locator) {
  return locator.evaluateAll((els) => els.map((el) => {
    const ws = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) {
      const re = /\S+/g; let x;
      while ((x = re.exec(n.data))) {
        const r = document.createRange(); r.setStart(n, x.index); r.setEnd(n, x.index + x[0].length);
        const q = [...r.getClientRects()].filter((c) => c.width > 0);
        if (q.length) ws.push({ w: x[0], top: Math.min(...q.map((c) => c.top)), left: Math.min(...q.map((c) => c.left)), right: Math.max(...q.map((c) => c.right)), split: new Set(q.map((c) => Math.round(c.top))).size > 1 });
      }
    }
    const lines = [];
    for (const w of ws) { const l = lines.find((b) => Math.abs(b.top - w.top) < 2); if (l) { l.words.push(w.w); l.left = Math.min(l.left, w.left); l.right = Math.max(l.right, w.right); } else lines.push({ top: w.top, left: w.left, right: w.right, words: [w.w] }); }
    lines.sort((a, b) => a.top - b.top);
    const box = el.getBoundingClientRect();
    return { text: el.textContent.replace(/\s+/g, ' ').trim(), data: { ...el.dataset }, box: { left: box.left, right: box.right }, lines: lines.map(({ words, left, right }) => ({ words, left, right })), split: ws.filter((w) => w.split).map((w) => w.w) };
  }));
}

export function assertBalanced(b, name, { link = false } = {}) {
  const all = b.lines.map((l) => l.words.join(' ')).join(' / ');
  assert.deepEqual(b.split, [], `${name}: no word split across two lines (${all})`);
  for (const l of b.lines) assert.ok(l.left >= b.box.left - 0.5 && l.right <= b.box.right + 0.5, `${name}: "${l.words.join(' ')}" inside its block (${Math.round(l.left)} to ${Math.round(l.right)}, block ${Math.round(b.box.left)} to ${Math.round(b.box.right)})`);
  if (link) { assert.equal(b.lines.length, 1, `${name}: the link on one line (${all})`); return; }
  if (b.lines.length < 2) return;
  const widest = Math.max(...b.lines.map((l) => l.right - l.left));
  for (const l of b.lines) {
    assert.ok(l.words.length >= 2, `${name}: "${l.words.join(' ')}" alone on a line (${all})`);
    assert.ok(l.right - l.left >= 0.6 * widest, `${name}: "${l.words.join(' ')}" short beside the block's other lines (${Math.round(l.right - l.left)} of ${Math.round(widest)}: ${all})`);
  }
}
