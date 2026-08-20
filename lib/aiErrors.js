// lib/aiErrors.js
// SERVER-ONLY. Turns an error thrown by an @anthropic-ai/sdk call into (a) a structured
// server log line that actually says what went wrong and (b) an honest user-facing message
// + machine code. Before this, every AI route logged only `e.message` and answered with one
// generic "try again" string, which hid credential, quota and timeout problems behind the
// same sentence a transient blip would produce.
//
// Usage:
//   } catch (e) {
//     const ai = describeAiError(e, '[branding/generate-logo]');
//     return res.status(ai.status).json({ error: ai.message, code: ai.code });
//   }

export function describeAiError(e, tag = '[ai]') {
  const status = Number(e?.status) || null;
  const apiType = e?.error?.error?.type || e?.error?.type || null;   // e.g. authentication_error
  const apiMsg = e?.error?.error?.message || null;
  const requestId = e?.request_id || e?.headers?.['request-id'] || null;
  const name = e?.name || null;
  const msg = String(e?.message || e || '');
  const isTimeout = name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(msg);
  const isConn = name === 'APIConnectionError' || /ECONNRESET|ENOTFOUND|fetch failed|socket hang up/i.test(msg);

  // One structured line — grep for the tag in the Vercel logs.
  console.error(`${tag} AI call failed`, JSON.stringify({
    httpStatus: status, apiType, apiMsg, requestId, errorName: name, message: msg.slice(0, 400),
  }));

  let code, message, http;
  if (status === 401 || status === 403 || apiType === 'authentication_error' || apiType === 'permission_error') {
    code = 'ai_auth'; http = 503;
    message = 'The AI service rejected our credentials. This is on our side, not yours — please try again later.';
  } else if (status === 429 || apiType === 'rate_limit_error') {
    code = 'ai_rate_limit'; http = 503;
    message = 'The AI service is at capacity right now. Wait a minute and try again.';
  } else if (status === 529 || apiType === 'overloaded_error' || (status && status >= 500)) {
    code = 'ai_upstream'; http = 503;
    message = 'The AI service is temporarily unavailable. Wait a minute and try again.';
  } else if (status === 400 || apiType === 'invalid_request_error' || status === 404 || apiType === 'not_found_error') {
    code = 'ai_bad_request'; http = 502;
    message = 'The AI service rejected this request. We have logged the details — please try again later.';
  } else if (isTimeout) {
    code = 'ai_timeout'; http = 504;
    message = 'The AI service took too long to answer. Please try again.';
  } else if (isConn) {
    code = 'ai_network'; http = 503;
    message = 'Could not reach the AI service. Check your connection and try again.';
  } else {
    code = 'ai_unknown'; http = 500;
    message = null; // caller supplies its own generic sentence
  }
  return { status: http, code, message, httpStatus: status, apiType, requestId };
}
