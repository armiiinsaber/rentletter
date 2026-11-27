// tests/helpers/darkAudit.mjs  What the dark walk (tests/routes/darkWebkit.test.mjs) reads on each
// page, run in the page. THEME_AUDIT(minText, minMark) answers:
//   theme    the theme in force by the page's own tokens: the computed --c-paper, html[data-theme]
//   text     every piece of text on screen under minText to 1 against what is under it: its colour
//            (with its own and its ancestors' opacity) over the backgrounds of its ancestors, laid
//            one over the other down to the page's canvas
//   marks    every icon (an svg's stroke or fill, a small filled box of 3 to 24px a side, the ticks
//            and the dots) under minMark to 1 against what is under it; a hairline in the rule
//            colour (an empty tick) is decoration, and a box with a border that holds minMark (a
//            colour swatch) is bounded by it
//   light    every surface of 2000px² or more painted light (luminance over 0.4) that is not a
//            logo's plate, a picture, or inside a subtree held light (.rl-theme-light). An ink
//            filled surface (a button, pill, tile, card or band) is a raised charcoal in dark
//            (components/theme.js inkFill), so it is never let through.
// Text that is disabled, clipped away or transparent is left out, and so is anything
// over a picture or a gradient, which no colour pair can describe. A glass surface is read over the
// ancestors under it, as the page lays it.
export const THEME_AUDIT = ({ minText = 4.5, minMark = 3 } = {}) => {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const root = document.documentElement;
  const canvas = parse(getComputedStyle(root).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const base = canvas.a > 0 ? { ...canvas, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  const desc = (el) => { const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : (el.className?.baseVal || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.'); return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`; };
  const path = (el) => { const out = []; for (let e = el; e && e !== document.body && out.length < 4; e = e.parentElement) out.unshift(desc(e)); return out.join(' > '); };
  // What is under an element: its ancestors' backgrounds over the canvas; null over a picture or a gradient.
  const under = (el, self = false) => {
    const layers = []; let alpha = 1;
    for (let e = self ? el : el.parentElement; e && e !== root; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url\(.*\.svg/.test(cs.backgroundImage)) return null;
      const bg = parse(cs.backgroundColor); if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 1) break;
    }
    let c = base; for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c);
    return { c, alpha };
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e !== root; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) return false; if (r.bottom < 0 || r.right < 0 || r.top > innerHeight * 3 || r.left > innerWidth) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false; if ((cs.clip && cs.clip !== 'auto') || /inset\((50|100)%/.test(cs.clipPath || '')) return false; return true; };
  // Text hidden from assistive technology still has to read on screen (an illustration's initials):
  // it is checked too, but for text set in the hairline colour, a decoration by its token (the
  // homepage's faint step numerals).
  const hidden = (el) => !!el.closest('[hidden], [inert], .rl-theme-light') || !!el.closest('button:disabled, [aria-disabled="true"], input:disabled, select:disabled, textarea:disabled, fieldset:disabled');
  const decor = (el, fg) => !!el.closest('[aria-hidden="true"]') && hairlines.some((h) => h && Math.abs(h.r - fg.r) + Math.abs(h.g - fg.g) + Math.abs(h.b - fg.b) < 6);
  const rootCs = getComputedStyle(root);
  const hairlines = ['--c-rule-rgb', '--c-inst-rule-rgb'].map((v) => parse(`rgb(${rootCs.getPropertyValue(v)})`));
  const text = []; const marks = []; const light = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || !shown(el) || hidden(el)) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg || fg.a === 0 || decor(el, fg)) continue;
    const u = under(el, true); if (!u) continue;
    const o = opacityOf(el); if (o < 0.05) continue;
    const ink = over({ ...fg, a: fg.a * o }, u.c);
    const r = ratio(ink, u.c);
    if (r < minText) text.push({ at: path(el), text: n.nodeValue.trim().replace(/\s+/g, ' ').slice(0, 48), fg: hex(ink), bg: hex(u.c), ratio: Math.round(r * 100) / 100 });
  }
  for (const el of document.querySelectorAll('body svg, body span, body i, body div')) {
    if (!shown(el) || el.closest('[hidden], .rl-theme-light, button:disabled')) continue;
    const r = el.getBoundingClientRect();
    let col = null;
    if (el.tagName.toLowerCase() === 'svg') {
      if (el.closest('svg') !== el || el.querySelector('image, foreignObject') || r.width > 48 || r.height > 48) continue; // an icon, not a drawing
      const shape = [...el.querySelectorAll('path, rect, circle, ellipse, line, polyline')].find((x) => !x.closest('defs, clipPath, mask')); if (!shape) continue;
      const s = getComputedStyle(shape); const st = parse(s.stroke); const fi = parse(s.fill);
      col = st && st.a > 0 && s.stroke !== 'none' ? st : fi && fi.a > 0 ? fi : null;
      if (el.closest('[data-door], .rl-wordmark')) col = null; // the marks are checked by the theme's own tokens
    } else if (r.width >= 3 && r.width <= 24 && r.height >= 3 && r.height <= 24 && !el.children.length && !el.textContent.trim()) {
      const bg = parse(getComputedStyle(el).backgroundColor); col = bg && bg.a > 0 ? bg : null;
    }
    if (!col) continue;
    // A hairline in the rule colour is decoration (an empty tick), never a mark to read; a swatch
    // carries its own border, which is its boundary.
    if (hairlines.some((h) => h && Math.abs(h.r - col.r) + Math.abs(h.g - col.g) + Math.abs(h.b - col.b) < 6)) continue;
    const own = getComputedStyle(el); const edge = parse(own.borderTopColor);
    const u = under(el); if (!u) continue;
    if (parseFloat(own.borderTopWidth) >= 1 && edge && edge.a > 0 && ratio(over(edge, u.c), u.c) >= minMark) continue;
    const o = opacityOf(el); if (o < 0.5) continue; // a mark held faint on purpose: the empty tick, the half tick
    const m = over({ ...col, a: col.a * o }, u.c); const k = ratio(m, u.c);
    if (k < minMark) marks.push({ at: path(el), fg: hex(m), bg: hex(u.c), ratio: Math.round(k * 100) / 100 });
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('.rl-theme-light, .rl-logo-plate')) continue;
    const r = el.getBoundingClientRect(); if (r.width * r.height < 2000) continue;
    if (/^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(el.tagName)) continue;
    const bg = parse(getComputedStyle(el).backgroundColor); if (!bg || bg.a < 0.5) continue;
    const c = over(bg, base); if (lum(c) <= 0.4) continue;
    light.push({ at: path(el), bg: hex(c), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
  }
  const paper = getComputedStyle(root).getPropertyValue('--c-paper').trim();
  return { theme: root.getAttribute('data-theme') || 'auto', paper, canvas: hex(base), text: text.slice(0, 40), marks: marks.slice(0, 40), light: light.slice(0, 40), counts: { text: text.length, marks: marks.length, light: light.length } };
};
