// tests/helpers/textLines.mjs  The rule wrapped text is held to on every page: no line holds one
// word, no line runs under 60% of the block's longest line, no word (a link included) is split
// across two lines, and every line sits inside its block. Measured in the page word by word.
//   readLines(locator, { own })   -> [{ text, data, box: { left, right }, lines: [{ words, left, right }], split }]
//                                 own: only the words whose nearest block is the element itself; a
//                                 block nested inside it is measured as a block of its own (inline,
//                                 inline-block and contents boxes sit on the element's own lines)
//   assertBalanced(block, name, { link })   asserts the rule on one measured block; a link block
//                                 (link: true) is one line, whole, inside its block, and may stand alone
//   readPage(page)                -> { blocks, wide }: every text block a person can see on the page,
//                                 each measured with readLines(.., { own: true }), and the page width
//                                 (tests/helpers/screens.mjs WIDER_THAN_VIEWPORT)
//   pageProblems({ blocks, wide }) -> one line per break: the rule above on every block (a block
//                                 cut short with an ellipsis is a break), and a page wider than the screen
import assert from 'node:assert/strict';
import { WIDER_THAN_VIEWPORT } from './screens.mjs';

export function readLines(locator, { own = false } = {}) {
  return locator.evaluateAll((els, mine) => els.map((el) => {
    const INLINE = /^(inline|contents|inline-block|inline-flex|inline-grid|inline-table|ruby)$/;
    const blockOf = (node) => { let e = node.parentElement; while (e && e !== el && INLINE.test(getComputedStyle(e).display)) e = e.parentElement; return e; };
    const ws = []; const texts = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) {
      if (mine && (blockOf(n) !== el || n.parentElement.closest('script,style,noscript,template,svg,option,select,textarea'))) continue;
      texts.push(n.data);
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
    return { text: (mine ? texts.join('') : el.textContent).replace(/\s+/g, ' ').trim(), data: { ...el.dataset }, box: { left: box.left, right: box.right }, lines: lines.map(({ words, left, right }) => ({ words, left, right })), split: ws.filter((w) => w.split).map((w) => w.w) };
  }), own);
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

// Run in the page. Marks every block a person can see that holds text of its own: the nearest box
// that is not inline (inline-block and contents count as inline) above each text node. Left out:
// text in scripts, SVG and form controls; a box hidden (display, visibility, opacity 0 on it or
// above it, a clip), cut away to nothing by a clipping box above it (a closed fold), or entirely
// off the screen to the side. Each mark carries a short path for the report, whether the block is
// cut short with an ellipsis, whether it holds a forced line break, and whether its text is a
// single link or email address (data-tl-*).
export const MARK_BLOCKS = () => {
  for (const e of document.querySelectorAll('[data-tl-block]')) for (const k of ['block', 'path', 'cut', 'br', 'link']) e.removeAttribute(`data-tl-${k}`);
  const INLINE = /^(inline|contents|inline-block|inline-flex|inline-grid|inline-table|ruby)$/;
  const blockOf = (node) => { let e = node.parentElement; while (e && e !== document.body && INLINE.test(getComputedStyle(e).display)) e = e.parentElement; return e; };
  const iw = window.innerWidth;
  const seen = (el) => {
    let r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.left >= iw) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || Number(cs.opacity) === 0) return false;
      if ((cs.clip && cs.clip !== 'auto' && cs.position === 'absolute') || /inset\((50|100)%/.test(cs.clipPath || '')) return false;
      if (e !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
        const c = e.getBoundingClientRect();
        const w = Math.min(r.right, c.right) - Math.max(r.left, c.left); const h = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
        if (w < 2 || h < 2) return false;
        r = { left: Math.max(r.left, c.left), right: Math.min(r.right, c.right), top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom) };
      }
    }
    return true;
  };
  const desc = (e) => { const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter((c) => !/^jsx-/.test(c)).slice(0, 2).join('.') : ''; const data = Object.keys(e.dataset || {}).filter((k) => !/^tl/.test(k)).slice(0, 2).map((k) => `[data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`).join(''); return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${cls ? `.${cls}` : ''}${data}`; };
  const path = (el) => { const bits = []; for (let e = el; e && e !== document.body && bits.length < 4; e = e.parentElement) bits.unshift(desc(e)); return bits.join(' > '); };
  const blocks = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = walker.nextNode())) {
    if (!/\S/.test(n.data)) continue;
    const p = n.parentElement; if (!p || p.closest('script,style,noscript,template,svg,option,select,textarea,title')) continue;
    const b = blockOf(n); if (!b || b === document.body) continue;
    if (!blocks.has(b)) blocks.set(b, []);
    blocks.get(b).push(n);
  }
  let i = 0;
  for (const [b, nodes] of blocks) {
    if (!seen(b)) continue;
    const own = nodes.map((x) => x.data).join('').replace(/\s+/g, ' ').trim();
    const cs = getComputedStyle(b);
    b.setAttribute('data-tl-block', String(i++));
    b.setAttribute('data-tl-path', path(b));
    if (cs.textOverflow === 'ellipsis' && b.scrollWidth > b.clientWidth + 1) b.setAttribute('data-tl-cut', '1');
    if ([...b.querySelectorAll('br')].some((br) => blockOf(br.firstChild || br) === b || br.parentElement === b)) b.setAttribute('data-tl-br', '1');
    if (/^(https?:\/\/\S+|[\w.+-]+@[\w-]+(\.[\w-]+)+|[\w-]+(\.[\w-]+)+\/\S*)$/.test(own)) b.setAttribute('data-tl-link', '1');
  }
  return i;
};

export async function readPage(page) {
  await page.evaluate(MARK_BLOCKS);
  const blocks = await readLines(page.locator('[data-tl-block]'), { own: true });
  const wide = await page.evaluate(WIDER_THAN_VIEWPORT);
  return { blocks, wide };
}

// Every break on a measured page, one line each: "<path>: <what is wrong>".
export function pageProblems({ blocks, wide }) {
  const out = [];
  for (const b of blocks) {
    if (!b.lines.length) continue;
    const where = b.data.tlPath || 'a block';
    if (b.data.tlCut) { out.push(`${where}: "${b.text}" cut short with an ellipsis`); continue; }
    try { assertBalanced(b, where, { link: b.data.tlLink === '1' }); } catch (e) { out.push(`${e.message.split('\n')[0]}${b.data.tlBr ? ' (the block holds a forced line break)' : ''}`); }
  }
  if (wide && (wide.asIs > wide.iw || wide.lifted > wide.iw)) out.push(`the page: ${wide.asIs}px wide (${wide.lifted}px with the masks lifted) on a ${wide.iw}px screen${wide.out.length ? `: ${wide.out.map((o) => `${o.el} from ${o.left} to ${o.right}`).join('; ')}` : ''}`);
  else if (wide && wide.out.length) out.push(`the page: ${wide.out.map((o) => `${o.el} from ${o.left} to ${o.right}`).join('; ')} past the screen edge`);
  return out;
}
