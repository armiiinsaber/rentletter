// lib/billingOff.js  ISOMORPHIC. Until per rental billing ships, nobody pays: BILLING_OFF.
//   BILLING_OFF=true (or 1)   billing is off: every signed in realtor is entitled
//   BILLING_OFF=false (or 0)  billing is on: everything behaves as it did before the flag
//   unset                     off in production, on everywhere else (development and the tests
//                             keep today's behaviour)
// next.config.js hands the value to the browser at build time, so the server and the screen always
// read the same answer. The decision itself stays in lib/entitlements.js; the places that act on it
// (lib/requireEntitlement.js, the paywall, the trial and plan copy) ask this first.
export function billingOff(value = process.env.BILLING_OFF, nodeEnv = process.env.NODE_ENV) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return nodeEnv === 'production';
}
