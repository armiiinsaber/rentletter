// The prompt 6 text and layout measurements, as a source string for page.evaluate: lines ending on a
// single word, separators at line edges (a lone dot or colon at a line start, a trailing dot, colon,
// open bracket or dollar at a line end), the distinct vertical gaps between element siblings outside
// and inside cards, and the page height.
export const MEASURE_SOURCE = `(() => {
  const SEP_START = /^[·:\\]\\)%]$/, SEP_END = /[·:\\(\\[\\$]$/;
  const visible = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const blockOf = (node) => { let el = node.parentElement; while (el && el !== document.body) { const d = getComputedStyle(el).display; if (d !== 'inline') return el; el = el.parentElement; } return document.body; };
  const path = (el) => { const bits = []; let e = el; while (e && e !== document.body && bits.length < 4) { bits.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')); e = e.parentElement; } return bits.join('>'); };
  const lines = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const txt = t.nodeValue; if (!txt || !txt.trim()) continue;
    const p = t.parentElement; if (!p || p.closest('script,style,select,option,noscript') || !visible(p)) continue;
    const block = blockOf(t);
    const re = /[^ \\t\\n\\r]+/g; let m;
    while ((m = re.exec(txt))) {
      const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
      const rect = r.getClientRects()[0]; if (!rect || !rect.width) continue;
      const top = Math.round(rect.top + window.scrollY);
      if (!lines.has(block)) lines.set(block, new Map());
      const L = lines.get(block);
      let key = [...L.keys()].find((k) => Math.abs(k - top) <= 3); if (key === undefined) { key = top; L.set(key, []); }
      L.get(key).push({ w: m[0], left: rect.left });
    }
  }
  const orphans = [], seps = [];
  for (const [block, L] of lines) {
    const tops = [...L.keys()].sort((a, b) => a - b);
    const rows = tops.map((k) => L.get(k).sort((a, b) => a.left - b.left).map((x) => x.w));
    const lastWords = rows.length ? rows[rows.length - 1].join(' ').split(/\\s+/).filter(Boolean).length : 0;
    if (rows.length > 1 && lastWords === 1) orphans.push(path(block) + ': "' + rows[rows.length - 1][0] + '"');
    for (const r of rows) {
      if (SEP_START.test(r[0])) seps.push(path(block) + ' starts "' + r.slice(0, 3).join(' ') + '"');
      if (SEP_END.test(r[r.length - 1])) seps.push(path(block) + ' ends "' + r.slice(-3).join(' ') + '"');
    }
  }
  const gapsOut = {}, gapsIn = {};
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('header') || el.tagName === 'SELECT') continue;
    const kids = [...el.children].filter((k) => visible(k) && !['SCRIPT', 'STYLE', 'OPTION'].includes(k.tagName) && !/^inline(-block)?$/.test(getComputedStyle(k).display));
    if (kids.length < 2) continue;
    const inside = !!el.closest('.rl-card, .mp-ink, .lp-card, .lp-screen');
    kids.sort((a, c) => a.getBoundingClientRect().top - c.getBoundingClientRect().top);
    for (let i = 1; i < kids.length; i++) {
      const prev = kids[i - 1].getBoundingClientRect(), next = kids[i].getBoundingClientRect();
      const g = Math.round(next.top - prev.bottom);
      if (g <= 0) continue;
      const bag = inside ? gapsIn : gapsOut;
      (bag[g] = bag[g] || []).push(path(kids[i - 1]) + ' -> ' + path(kids[i]));
    }
  }
  return { orphans, seps, gapsOut: Object.keys(gapsOut).map(Number).sort((a, b) => a - b), gapsIn: Object.keys(gapsIn).map(Number).sort((a, b) => a - b), gapSamples: Object.fromEntries(Object.entries(gapsOut).map(([k, v]) => [k, v.slice(0, 2)])), height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth };
})()`;
