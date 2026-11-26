// tests/helpers/fillsWidth.mjs  No page wastes the screen. Run in the page (page.evaluate(FILLS_WIDTH)):
// the content's bounding box against its area, and whether the two agree. The area is the shell's
// main area (.ds-main, the realtor's screens, components/dashboard/DashShell.js), or the window on
// any other page. The content is every visible line of text, every control and image, and every
// painted box (a card: a background, a border or a shadow) narrower than the area, inside it; the
// shell's header, its sidebar, the tab bar and anything fixed to the window are left out (they are
// the frame, not the page). A painted box the area's whole width is a band of colour, not content.
// The rule: the content either reaches within the page padding of both sides of its area (the
// shell's --ds-pad, or --page-gutter on a page without the shell), or it is centred, its left and
// right margins within 5% of each other. A page of one narrow column with a wide empty band beside
// it fails both.
//   const r = await page.evaluate(FILLS_WIDTH); r.ok, r.why
export const FILLS_WIDTH = () => {
  const html = document.documentElement;
  const area = document.querySelector('.ds-main');
  const ar = area ? area.getBoundingClientRect() : { left: 0, right: html.clientWidth };
  const root = area || document.body;
  const num = (v) => parseFloat(v) || 0;
  // The padding as laid out: a custom property holds clamp() unresolved, so a probe measures it.
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:var(${area ? '--ds-pad' : '--page-gutter'})`;
  (area ? area.closest('.ds') || area : document.body).appendChild(probe);
  const pad = probe.getBoundingClientRect().width; probe.remove();
  // The frame: the page's own header and footer, the shell's header, sidebar and tab bar.
  const frame = 'header, footer, [role=banner], [role=contentinfo], .rl-header, [data-shell-side], .ds-side';
  const fixed = new Set();
  for (const el of root.querySelectorAll('*')) { const p = getComputedStyle(el).position; if (p === 'fixed') fixed.add(el); }
  const out = (el) => { for (let n = el; n && n !== root; n = n.parentElement) { if (fixed.has(n)) return true; } return !!el.closest(frame); };
  const seen = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && num(cs.opacity) > 0.01; };
  let l = Infinity; let r = -Infinity; let count = 0; let byL = ''; let byR = '';
  const name = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).filter((c) => !c.startsWith('jsx-')).slice(0, 2).join('.')}` : ''} "${(el.textContent || '').trim().slice(0, 30)}"` : '');
  // Above the page's top, or clipped to nothing (a skip link, a label for screen readers): unseen.
  const unseen = (el, b) => b.bottom + window.scrollY <= 0 || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(getComputedStyle(el).clip) || getComputedStyle(el).clipPath.includes('inset(50%');
  // A decoration (aria-hidden) counts only inside the box of the visible element that holds it: a
  // drawing's part that hangs past its column (the laptop's base under the homepage's screen) is
  // not where the content sits.
  const host = (el) => { const h = el.closest('[aria-hidden="true"]'); const p = h && h.parentElement; return p && root.contains(p) ? p.getBoundingClientRect() : null; };
  const take = (b, el) => {
    if (b.width <= 1 || b.height <= 1 || b.right <= ar.left || b.left >= ar.right) return;
    const hb = el ? host(el) : null;
    const bl = hb ? Math.max(b.left, hb.left) : b.left; const br = hb ? Math.min(b.right, hb.right) : b.right;
    if (br - bl <= 1 || (el && unseen(el, b))) return;
    const L = Math.max(bl, ar.left); const R = Math.min(br, ar.right);
    if (L < l) { l = L; byL = name(el); } if (R > r) { r = R; byR = name(el); } count++;
  };
  // Text, line by line.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const range = document.createRange();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement; if (!el || out(el) || !seen(el)) continue;
    range.selectNodeContents(t); for (const b of range.getClientRects()) take(b, el);
  }
  // Controls, images and painted boxes.
  const areaW = ar.right - ar.left;
  for (const el of root.querySelectorAll('*')) {
    if (out(el) || !seen(el)) continue;
    const b = el.getBoundingClientRect(); if (b.width <= 1 || b.height <= 1) continue;
    if (el.matches('img, svg, input, select, textarea, button, canvas, video, [role=img]')) { take(b, el); continue; }
    const cs = getComputedStyle(el);
    const painted = (cs.backgroundColor && !/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor)) || num(cs.borderTopWidth) + num(cs.borderLeftWidth) > 0 && cs.borderTopStyle !== 'none' || (cs.boxShadow && cs.boxShadow !== 'none');
    if (painted && b.width < areaW - 2) take(b, el);
  }
  const left = Math.round(l - ar.left); const right = Math.round(ar.right - r);
  const reaches = left <= pad + 1 && right <= pad + 1;
  const centred = Math.abs(left - right) <= 0.05 * Math.max(left, right) + 1;
  const ok = count > 0 && (reaches || centred);
  return { ok, reaches, centred, left, right, byL, byR, pad: Math.round(pad), area: [Math.round(ar.left), Math.round(ar.right)], content: [Math.round(l), Math.round(r)], why: ok ? '' : `the content runs ${Math.round(l)} to ${Math.round(r)} in an area ${Math.round(ar.left)} to ${Math.round(ar.right)}: ${left}px on the left and ${right}px on the right, neither within the ${Math.round(pad)}px padding of both sides nor centred (left edge ${byL}, right edge ${byR})` };
};
