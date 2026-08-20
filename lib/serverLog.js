// lib/serverLog.js
// SERVER-ONLY. One structured error line per failure so the Vercel logs name the cause
// instead of a bare `e.message`. Same spirit as lib/aiErrors.js, for non-AI routes.
//   logServerError('[listings/report-pdf]', e, { listingId, fontPairing: 'signature-script' })
// → [listings/report-pdf] failed {"errorName":"RangeError","message":"...","stack":"...","listingId":...}
export function logServerError(tag, e, ctx = {}) {
  const stack = String(e?.stack || '').split('\n').slice(0, 6).join(' | ');
  console.error(`${tag} failed`, JSON.stringify({
    errorName: e?.name || null,
    message: String(e?.message || e || '').slice(0, 400),
    code: e?.code || null,
    stack: stack.slice(0, 900),
    ...ctx,
  }));
}
