// components/EvenLines.js  Even lines (CLAUDE.md, Layout) where the browser stops short.
// Every block wraps with text-wrap: balance (pages/_app.js), which sets the lines of a block to
// about the same length. It stops short in two ways. Chrome balances a block of six lines or fewer
// and wraps a longer one as it comes, so a long paragraph on a phone can end on one word. And
// balance evens the lengths without minding the words, so a short block can still leave one word
// on a line of its own ("2150 Lake Shore / Boulevard West, / Penthouse / 4512, Toronto").
// After each render, each resize or turn of the phone and each change to the page, every block that wraps that way is
// narrowed until it reads even: a block of seven lines or more to the narrowest width that keeps
// its number of lines (the words move down until the last line is as full as the others, the way
// balance sets a shorter block); any other, a step at a time, to the first width where every line
// holds two words or more and none runs under 60% of the longest, set balanced or, where balance
// leaves a word alone and plain wrapping does not, wrapped plainly. A block no width evens is left as
// the browser set it, and so is every block that already reads even (Safari balances long blocks
// itself). With no JavaScript the page reads as the browser wrapped it. Layout only: no word moves
// between blocks and none changes; a centred or right aligned block keeps its alignment.
//   useEvenLines()   once, in pages/_app.js
import { useEffect } from 'react';

const INLINE = /^(inline|contents|inline-block|inline-flex|inline-grid|inline-table|ruby)$/;
const LONG = 7; // Chrome balances six lines or fewer itself
const SHORT = 0.6; // a line under 60% of the block's longest reads as left behind
const narrowed = new Map(); // element -> its own max-width and side margins before it was narrowed

// The page's blocks of text and, for each, its own text nodes (a block nested inside is its own).
function textBlocks() {
  const display = new Map();
  const shown = (e) => { if (!display.has(e)) display.set(e, getComputedStyle(e).display); return display.get(e); };
  const out = new Map();
  const walk = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT); let n;
  while ((n = walk.nextNode())) {
    if (!/\S/.test(n.data)) continue;
    let e = n.parentElement;
    if (!e || e.closest('script,style,svg,textarea,select,option,noscript')) continue;
    while (e && e !== document.body && INLINE.test(shown(e))) e = e.parentElement;
    if (!e || e === document.body) continue;
    if (!out.has(e)) out.set(e, []);
    out.get(e).push(n);
  }
  return [...out];
}

// The lines a block's own words fall on: [{ words, left, right }], top to bottom; split when a word
// runs over two lines.
function linesOf(nodes) {
  const lines = []; let split = false;
  for (const n of nodes) {
    const re = /\S+/g; let x;
    while ((x = re.exec(n.data))) {
      const r = document.createRange(); r.setStart(n, x.index); r.setEnd(n, x.index + x[0].length);
      const q = [...r.getClientRects()].filter((c) => c.width > 0); if (!q.length) continue;
      if (new Set(q.map((c) => Math.round(c.top))).size > 1) split = true;
      const top = Math.min(...q.map((c) => c.top)); const left = Math.min(...q.map((c) => c.left)); const right = Math.max(...q.map((c) => c.right));
      const l = lines.find((b) => Math.abs(b.top - top) < 2);
      if (l) { l.words++; l.left = Math.min(l.left, left); l.right = Math.max(l.right, right); } else lines.push({ top, words: 1, left, right });
    }
  }
  lines.sort((a, b) => a.top - b.top);
  return { lines, split };
}
const lineCount = (nodes) => { const tops = []; for (const n of nodes) { const r = document.createRange(); r.selectNodeContents(n); for (const c of r.getClientRects()) if (c.width > 0 && !tops.some((t) => Math.abs(t - c.top) < 2)) tops.push(c.top); } return tops.length; };
// Even: no word split, every line inside the block, and past one line, two words or more on each
// and none under 60% of the longest (tests/helpers/textLines.mjs holds the walks to the same rule).
function reads(el, nodes) {
  const { lines, split } = linesOf(nodes); const box = el.getBoundingClientRect();
  if (split || lines.some((l) => l.left < box.left - 0.5 || l.right > box.right + 0.5)) return false;
  if (lines.length < 2) return true;
  const widest = Math.max(...lines.map((l) => l.right - l.left));
  return lines.every((l) => l.words >= 2 && l.right - l.left >= SHORT * widest);
}

function even() {
  // Back to the width each block had, so a new screen width starts from the layout as written.
  for (const [el, was] of narrowed) Object.assign(el.style, was);
  narrowed.clear();
  for (const [el, nodes] of textBlocks()) {
    if (lineCount(nodes) < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.textWrapMode === 'nowrap' || /^(nowrap|pre)$/.test(cs.whiteSpace) || reads(el, nodes)) continue;
    const was = { maxWidth: el.style.maxWidth, marginLeft: el.style.marginLeft, marginRight: el.style.marginRight, textWrap: el.style.textWrap };
    const width = el.getBoundingClientRect().width; const count = lineCount(nodes);
    const align = cs.textAlign;
    const set = (w) => { el.style.maxWidth = `${w}px`; if (align === 'center') { el.style.marginLeft = 'auto'; el.style.marginRight = 'auto'; } else if (align === 'right' || align === 'end') el.style.marginLeft = 'auto'; };
    let done = false;
    if (count >= LONG) {
      let lo = Math.floor(width * 0.6); let hi = Math.floor(width);
      set(lo);
      if (lineCount(nodes) === count) hi = lo;
      else { while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); set(mid); if (lineCount(nodes) > count) lo = mid; else hi = mid; } }
      set(hi); done = reads(el, nodes);
    }
    if (!done) {
      const step = Math.max(2, Math.round(width * 0.02));
      const tryAt = (w) => { set(w); el.style.textWrap = was.textWrap; if (reads(el, nodes)) return true; el.style.textWrap = 'wrap'; if (reads(el, nodes)) return true; el.style.textWrap = was.textWrap; return false; };
      for (let w = Math.floor(width); w >= width * 0.5 && !done; w -= step) done = tryAt(w);
    }
    if (done) narrowed.set(el, was); else Object.assign(el.style, was); // no width evens it: as the browser set it
  }
}

export function useEvenLines() {
  useEffect(() => {
    let frame = 0; let timer = 0;
    const soon = (ms) => { clearTimeout(timer); timer = setTimeout(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(even); }, ms); };
    soon(0);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => soon(0));
    const onResize = () => soon(50);
    window.addEventListener('resize', onResize);
    // A turn of the phone: iOS fires orientationchange before the new width settles, then resize.
    window.addEventListener('orientationchange', onResize);
    const watch = new MutationObserver(() => soon(120));
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); watch.disconnect(); };
  }, []);
}
