// lib/signupSource.js  Where a realtor first came from, for the referral share (lib/kpis.js 1e).
// Safe in the browser and on the server: no imports.
//
// The first page a browser lands on sets one cookie, rl_ft, holding ONE short word from the closed
// list below (pages/_app.js). It is never overwritten: the first touch is the first. The sign up
// form sends the word with the new account (pages/signup.js, user metadata), and the auth callback
// writes it to profiles.signup_source once (pages/auth/callback.js, db/013-kpi-daily.sql).
//
// What is stored: the word, or ref: and the code of a ?ref= link. Never the URL, never another
// query parameter, never a token, an invite code, an application number or anything about a tenant.
//
//   direct            the homepage or any other public page
//   invite            /join/<code>, a personal invitation from the founder (the code is not kept)
//   realtor_referral  /signup?ref=1, the link in a realtor to realtor referral email
//   ref:<code>        any other ?ref=<code> link
//   apply             the apply link (/apply/…, /a/…)
//   report            the landlord's report link (/r/…)
//   my_application    the tenant's own application page
//   tenant_page       another tenant page: documents, a co applicant's or guarantor's form, keep me in mind, a referral consent
//   landlord_page     the previous landlord's reference form (/ref/…)
export const FIRST_TOUCH_COOKIE = 'rl_ft';
export const FIRST_TOUCH_MAX_AGE = 90 * 24 * 3600;
export const SIGNUP_SOURCE = /^(direct|invite|realtor_referral|apply|report|my_application|tenant_page|landlord_page|ref:[A-Za-z0-9_-]{1,32})$/;
export const isSignupSource = (v) => typeof v === 'string' && SIGNUP_SOURCE.test(v);

const REF_CODE = /^[A-Za-z0-9_-]{1,32}$/;
// Signed in and machine paths are not a landing: nothing is set there.
const NOT_A_LANDING = /^\/(admin|dashboard|listing|profile|billing|onboarding|auth|api|_next|demo\/dashboard)(\/|$)/;

// pathname and search as the browser has them (location.pathname, location.search).
export function classifyFirstTouch(pathname, search = '') {
  const path = String(pathname || '/');
  if (NOT_A_LANDING.test(path)) return null;
  let ref = null;
  try { ref = new URLSearchParams(String(search || '')).get('ref'); } catch (e) { ref = null; }
  if (ref === '1' && /^\/signup\/?$/.test(path)) return 'realtor_referral';
  if (ref && ref !== '1' && REF_CODE.test(ref)) return `ref:${ref}`;
  if (/^\/join\//.test(path)) return 'invite';
  if (/^\/(apply|a)\//.test(path)) return 'apply';
  if (/^\/r\//.test(path)) return 'report';
  if (/^\/my-application(\/|$)/.test(path)) return 'my_application';
  if (/^\/ref\//.test(path)) return 'landlord_page';
  if (/^\/(upload|party|keep|refer)\//.test(path)) return 'tenant_page';
  return 'direct';
}

// From a Cookie header (server) or document.cookie (browser): the word, or null.
export function readFirstTouch(cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== FIRST_TOUCH_COOKIE) continue;
    let value = v.join('=');
    try { value = decodeURIComponent(value); } catch (e) { return null; }
    return isSignupSource(value) ? value : null;
  }
  return null;
}

// In the browser, once, on the first page: sets the cookie when there is none. Never throws.
export function rememberFirstTouch() {
  try {
    if (typeof document === 'undefined' || readFirstTouch(document.cookie)) return;
    const source = classifyFirstTouch(window.location.pathname, window.location.search);
    if (!source) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${FIRST_TOUCH_COOKIE}=${encodeURIComponent(source)}; Path=/; Max-Age=${FIRST_TOUCH_MAX_AGE}; SameSite=Lax${secure}`;
  } catch (e) { /* cookies off: the profile reads unknown */ }
}

// The word for a new account: what the sign up form sent with it, else this browser's cookie when
// the account is at most a week old (a recovery link on an old account never writes one).
export function signupSourceFor(user, cookieHeader, now = Date.now()) {
  const sent = user && user.user_metadata && user.user_metadata.signup_source;
  if (isSignupSource(sent)) return sent;
  const born = user && user.created_at ? Date.parse(user.created_at) : NaN;
  if (!Number.isFinite(born) || now - born > 7 * 86400000) return null;
  return readFirstTouch(cookieHeader);
}

// SERVER. Writes the word once, on the caller's own profile, and only while the column is empty.
// admin is the service role client. Never throws: before db/013 has run the column is absent and
// the profile simply reads unknown.
export async function recordSignupSource(admin, userId, source) {
  if (!admin || !userId || !isSignupSource(source)) return false;
  try {
    const { error } = await admin.from('profiles').update({ signup_source: source }).eq('id', userId).is('signup_source', null);
    return !error;
  } catch (e) { return false; }
}
