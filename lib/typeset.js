// lib/typeset.js  PURE. The two text rules the tenant pages are measured against: no line ends on
// a single word (noWidow ties the last two words), and a date, a money value or a count reads one
// way everywhere ("September 8, 2026", "$90,000/yr", "$3,400/mo", "2 provided").
export const NBSP = ' ';
export const noWidow = (text) => {
  const t = String(text ?? '').trim();
  const i = t.lastIndexOf(' ');
  return i > 0 ? `${t.slice(0, i)}${NBSP}${t.slice(i + 1)}` : t;
};
export const dateLong = (iso) => {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? `${iso}T00:00:00` : iso);
  if (isNaN(d)) return null;
  return noWidow(d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }));
};
export const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return n ? `$${n.toLocaleString('en-CA')}` : null; };
export const moneyYr = (v) => (money(v) ? `${money(v)}/yr` : null);
export const moneyMo = (v) => (money(v) ? `${money(v)}/mo` : null);
export const count = (n, noun, plural = `${noun}s`) => `${Number(n) || 0}${NBSP}${Number(n) === 1 ? noun : plural}`;
