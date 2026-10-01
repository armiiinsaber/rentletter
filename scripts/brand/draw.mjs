// scripts/brand/draw.mjs
// The drawing the two brand builds share: the app icons and splash (scripts/brand/build-brand.mjs)
// and the brand kit (scripts/brand/kit.mjs). Each function takes the logo or the mark geometry
// (lib/brand/logoPaths.js LOGO and MARK) and returns an SVG string, so the kit and the installed
// icons are the same drawing.
export const INK = '#0f0f10', RED = '#d72027', PAPER = '#faf8f3', INST = '#101012', INST_TEXT = '#e8e4d9', WHITE = '#ffffff';
// The small mark in two palettes on one geometry. The admin install (public/admin-icon-*.png, never
// rebuilt here) is the ink ground with the red stripe and the paper R. The realtor app is its
// inverse: the red ground, the ink stripe (inst, #101012) and the white R (card, #ffffff).
export const PALETTES = Object.freeze({
  admin: Object.freeze({ ground: INST, stripe: RED, letter: INST_TEXT }),
  realtor: Object.freeze({ ground: RED, stripe: INST, letter: WHITE }),
});
export const r2 = (n) => Math.round(n * 100) / 100;

// The logo centred in a W by H box (default: its own size plus pad). ink: the word; bar: the bar.
export const logoSvg = (LOGO, { height, ink = INK, bar = RED, bg = null, pad = 0, w = null, h = null }) => {
  const s = height / LOGO.h; const W = w ?? Math.ceil(LOGO.w * s + pad * 2); const H = h ?? Math.ceil(height + pad * 2);
  const ox = (W - LOGO.w * s) / 2, oy = (H - LOGO.h * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}<g transform="translate(${r2(ox)} ${r2(oy)}) scale(${s})"><rect x="${LOGO.bar.x}" y="${LOGO.bar.y}" width="${LOGO.bar.w}" height="${LOGO.bar.h}" rx="${LOGO.bar.rx}" fill="${bar}"/><path d="${LOGO.text}" fill="${ink}"/></g></svg>`;
};

// The iOS home screen corner: a radius of 22.37 percent of the side.
export const IOS_RADIUS = 0.2237;

// The mark at a pixel size. At 32 and under the bar snaps to whole pixels, so it stays one crisp
// stroke; the geometry is otherwise the same mark. rounded: the ground takes the iOS corner, the
// corners outside it transparent. bare: no ground, the stripe and the R in one colour (palette
// .letter), scaled to fill the square with a margin of one eighth of the side.
export const markSvg = (MARK, { px, kind = 'any', palette = PALETTES.realtor, rounded = false, bare = false }) => {
  const m = MARK[kind]; const { ground, stripe, letter } = palette;
  if (bare) return bareMarkSvg(MARK, m, px, letter);
  const s = px / MARK.size; const { x, y, w, h, rx } = m.bar;
  const groundRect = (size) => `<rect width="${size}" height="${size}"${rounded ? ` rx="${r2(size * IOS_RADIUS)}"` : ''} fill="${ground}"/>`;
  if (px <= 32) { const X = Math.round(x * s), W = Math.max(1, Math.round(w * s)), Y = Math.round(y * s), H = Math.round(h * s); return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${groundRect(px)}<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="${stripe}"/><g transform="scale(${s})"><path d="${m.r}" fill="${letter}"/></g></svg>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${MARK.size} ${MARK.size}">${groundRect(MARK.size)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${stripe}"/><path d="${m.r}" fill="${letter}"/></svg>`;
};

// The bare mark's frame in the 512 units: the stripe and the R's box, centred, fitted inside the
// square less a margin of an eighth of the side on every edge.
export const bareFrame = (MARK, kind = 'any') => {
  const m = MARK[kind]; const b = m.bar; const R = pathBox(m.r);
  const x0 = Math.min(b.x, R.x1), x1 = Math.max(b.x + b.w, R.x2), y0 = Math.min(b.y, R.y1), y1 = Math.max(b.y + b.h, R.y2);
  const inner = MARK.size * 0.75; const k = inner / Math.max(x1 - x0, y1 - y0);
  return { k, tx: (MARK.size - (x1 - x0) * k) / 2 - x0 * k, ty: (MARK.size - (y1 - y0) * k) / 2 - y0 * k };
};
const bareMarkSvg = (MARK, m, px, colour) => {
  const { k, tx, ty } = bareFrame(MARK); const s = px / MARK.size; const b = m.bar;
  if (px <= 32) {
    const X = Math.round((tx + b.x * k) * s), W = Math.max(1, Math.round(b.w * k * s)), Y = Math.round((ty + b.y * k) * s), H = Math.round(b.h * k * s);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="${colour}"/><g transform="scale(${s}) translate(${r2(tx)} ${r2(ty)}) scale(${r2(k * 10000) / 10000})"><path d="${m.r}" fill="${colour}"/></g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${MARK.size} ${MARK.size}"><g transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(k * 10000) / 10000})"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}" fill="${colour}"/><path d="${m.r}" fill="${colour}"/></g></svg>`;
};

// The box of an absolute path made of M, L, H, V, Q, C and Z (what opentype.js writes): every
// point, control points included, which bounds the curve.
export function pathBox(d) {
  const re = /([MLHVQCZ])([^MLHVQCZ]*)/g; let m; let cx = 0, cy = 0;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  while ((m = re.exec(d))) {
    const v = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'H') { for (const x of v) { cx = x; add(cx, cy); } continue; }
    if (m[1] === 'V') { for (const y of v) { cy = y; add(cx, cy); } continue; }
    for (let i = 0; i + 1 < v.length; i += 2) { cx = v[i]; cy = v[i + 1]; add(cx, cy); }
  }
  return { x1, y1, x2, y2 };
}
