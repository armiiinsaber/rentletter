// lib/features.js  PURE, shared by the browser and the server. Product switches.
//
//   REFERRALS_ENABLED  The realtor to realtor referral system (consent screen, inbox, claim,
//                      assign, accept). Frozen: the code stays, its surfaces go dark, the routes
//                      answer 410 "Referrals are paused", the dashboard load skips its reads.
//                      Nothing is deleted until the pipeline replaces it.
//
// referralsEnabled() is what every surface reads; overrideFeature is for tests only.
export const REFERRALS_ENABLED = false;

const overrides = {};
export function overrideFeature(name, value) { if (value === undefined) delete overrides[name]; else overrides[name] = value; }
export function referralsEnabled() { return overrides.referrals !== undefined ? overrides.referrals : REFERRALS_ENABLED; }
export const REFERRALS_PAUSED = { error: 'Referrals are paused.', code: 'referrals_paused' };

// The sandbox: every token, code or link id the demo mints starts with demo (any case): demo…,
// demo-ref…, demo0000000000000001, DEMO-demo-carlaw, DEMO1. Every production route and page with
// a sandbox branch asks this first and returns before its limiter and its clients.
export const isSandboxToken = (t) => /^demo/i.test(String(t || ''));
