// tests/helpers/clockAt.mjs  The process clock, moved to a fixed moment for one test. For the tests
// whose code reads the clock from the process and takes none as an argument (Fit reads each fact's
// age against it). new Date() and Date.now() read that moment plus the time since the call, so time
// still runs (lib/queryTrace.js measures overlap with it); a date built from a value is untouched,
// and every Date still answers instanceof Date.
//   clockAt(t, at)   t the node:test context, at a Date, an ISO string or milliseconds; undone when t ends
export function clockAt(t, at) {
  const Real = globalThis.Date;
  const offset = new Real(at).getTime() - Real.now();
  if (!Number.isFinite(offset)) throw new Error(`clockAt: ${at} is not a date`);
  class At extends Real {
    constructor(...a) { if (a.length === 0) super(Real.now() + offset); else super(...a); }
    static now() { return Real.now() + offset; }
    static [Symbol.hasInstance](v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  }
  globalThis.Date = At;
  t.after(() => { globalThis.Date = Real; });
}
