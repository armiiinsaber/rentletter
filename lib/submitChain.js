// lib/submitChain.js  PURE, runs in the browser (pages/apply/[token].js) and in tests.
// What happens after /api/generate answered with the application number: the invite tag
// (/api/invite/tag, KV) and then the mirror (/api/applications/mirror, the row under the
// listing). The done page waits for both. A step that fails is retried CHAIN_RETRIES times with
// a growing pause; when the last try fails the tenant is held on "Saving your application" with
// a Try again button, and the application is never reported as done. Every call is a repeat safe
// call on the server (a second tag or mirror of the same number changes nothing).
//
//   runSubmitChain({ post, token, applicationNumber })
//     post(url, body) -> Promise<{ ok, status, json }>   the caller's fetch, injected
//     -> { ok: true, docRequest }                          the application reached the listing
//     -> { ok: false, step: 'tag' | 'mirror', attempts, error }
export const CHAIN_RETRIES = 3;
// The pause before the second, third and fourth try, in milliseconds.
export const CHAIN_BACKOFF_MS = Object.freeze([600, 1500, 3000]);
export const SAVING_COPY = Object.freeze({
  title: 'Saving your application',
  body: 'Your application number is ready. We are adding it to the listing so the realtor sees it.',
  heldTitle: 'Your application is not on the listing yet',
  heldBody: 'The connection dropped before it reached the listing. Nothing is lost. Try again, and keep your number in case you need to reach the realtor.',
  tryAgain: 'Try again',
});

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One step, CHAIN_RETRIES retries with CHAIN_BACKOFF_MS between. fn() resolves to the answer or
// throws; an answer with ok false is a failure too. Returns { ok, value, attempts, error }.
export async function withRetry(fn, { retries = CHAIN_RETRIES, backoff = CHAIN_BACKOFF_MS, sleep = defaultSleep } = {}) {
  let error = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)]);
    try {
      const value = await fn(attempt);
      if (value && value.ok === false) { error = value.error || new Error(`answered ${value.status || 'not ok'}`); continue; }
      return { ok: true, value, attempts: attempt + 1, error: null };
    } catch (e) { error = e; }
  }
  return { ok: false, value: null, attempts: retries + 1, error };
}

// A fetch answer read the same way for every step: 2xx with no error field is a success.
export const readAnswer = ({ ok, status, json }) => (ok && !(json && json.error) ? { ok: true, status, json: json || {} } : { ok: false, status, error: new Error((json && json.error) || `HTTP ${status}`) });

export async function runSubmitChain({ post, token, applicationNumber, retries = CHAIN_RETRIES, backoff = CHAIN_BACKOFF_MS, sleep = defaultSleep }) {
  const opts = { retries, backoff, sleep };
  const step = (url) => withRetry(async () => readAnswer(await post(url, { token, applicationNumber })), opts);
  // 1. The tag first: the mirror checks the number against the invite's submissions.
  const tag = await step('/api/invite/tag');
  if (!tag.ok) return { ok: false, step: 'tag', attempts: tag.attempts, error: tag.error };
  // 2. The mirror: the row, the junction, the document request.
  const mirror = await step('/api/applications/mirror');
  if (!mirror.ok) return { ok: false, step: 'mirror', attempts: mirror.attempts, error: mirror.error };
  const j = mirror.value.json || {};
  const docRequest = j.docRequest && j.docRequest.token ? { token: j.docRequest.token, url: j.docRequest.url, askCreditReport: !!j.docRequest.askCreditReport } : null;
  return { ok: true, docRequest, mirrored: j.mirrored !== false, attempts: { tag: tag.attempts, mirror: mirror.attempts } };
}
