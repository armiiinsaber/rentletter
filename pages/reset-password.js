// pages/reset-password.js
// Set a new password. The realtor arrives here straight from the reset email. Supabase hands the
// recovery credential over in one of three shapes and this page reads all three:
//   ?code=…                     the PKCE code, exchanged for a session
//   ?token_hash=…&type=recovery the hashed one time token, verified here
//   #access_token=…&refresh_token=…   the implicit pair, which lives in the FRAGMENT and never
//                                     reaches the server, so only the browser can read it
// An expired or used link (#error_code=otp_expired, ?error=…) shows one line and a way to ask for
// another. Establishing the session is all that happens on load: it is what the form needs to
// exist, and Supabase already spent the one time token before the browser landed here. The
// password itself only changes on the tap.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AuthShell, { authInputStyle, authButtonStyle, authErrorStyle, authNoticeStyle, authLabelStyle } from '../components/auth/AuthShell';
import { C } from '../components/theme';

// The link's parameters, wherever they ride: the query string or the fragment.
export function linkParams(search, hash) {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const get = (k) => q.get(k) || h.get(k) || null;
  return {
    code: get('code'),
    tokenHash: get('token_hash'),
    type: get('type'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    error: get('error') || get('error_code'),
    errorDescription: get('error_description'),
  };
}

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('checking'); // checking | ready | expired

  useEffect(() => {
    let done = false;
    let unsubscribe = null;
    let supabase = null;
    try { supabase = getSupabaseBrowserClient(); } catch (e) { setPhase('expired'); return undefined; }
    // The client can consume the fragment on its own (detectSessionInUrl); this catches that race.
    try {
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        if (!done && session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) { done = true; setPhase('ready'); }
      });
      unsubscribe = () => sub?.data?.subscription?.unsubscribe?.();
    } catch (e) { /* the state listener is a belt, never the only path */ }

    (async () => {
      const p = linkParams(window.location.search, window.location.hash);
      // The credential leaves the address bar either way, so a copied URL carries nothing.
      const clearUrl = () => { try { window.history.replaceState({}, '', window.location.pathname); } catch (e) { /* older browsers keep the URL */ } };
      if (p.error) { clearUrl(); if (!done) { done = true; setPhase('expired'); } return; }
      let ok = false;
      try {
        if (p.accessToken && p.refreshToken) {
          const { error: e1 } = await supabase.auth.setSession({ access_token: p.accessToken, refresh_token: p.refreshToken });
          ok = !e1;
        } else if (p.tokenHash) {
          const { error: e2 } = await supabase.auth.verifyOtp({ token_hash: p.tokenHash, type: p.type === 'invite' ? 'invite' : 'recovery' });
          ok = !e2;
        } else if (p.code) {
          const { error: e3 } = await supabase.auth.exchangeCodeForSession(p.code);
          ok = !e3;
        }
        if (!ok) {
          // Either nothing was in the URL (the callback already exchanged it into a cookie) or the
          // client got there first.
          const { data } = await supabase.auth.getSession();
          ok = !!data?.session;
        }
      } catch (e) { ok = false; }
      clearUrl();
      if (!done) { done = true; setPhase(ok ? 'ready' : 'expired'); }
    })();

    return () => { done = true; if (unsubscribe) unsubscribe(); };
  }, []);

  const passwordValid = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = passwordValid && matches && !loading;

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      router.replace('/dashboard');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (phase === 'checking') {
    return (
      <AuthShell
        title="Reset password"
        eyebrow="Realtor dashboard"
        heading="Set a new password."
        footer={<a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Back to sign in</a>}
      >
        <div style={authNoticeStyle} role="status">Opening your reset link.</div>
      </AuthShell>
    );
  }

  if (phase === 'expired') {
    return (
      <AuthShell
        title="Reset password"
        eyebrow="Link expired"
        heading="That link has expired."
        footer={<a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Back to sign in</a>}
      >
        <div style={authNoticeStyle}>Reset links last one hour and work once. <a href="/forgot-password" style={{ color: C.red, fontWeight: 700 }}>Request another</a> and we will email a fresh one.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      eyebrow="Realtor dashboard"
      heading="Set a new password."
      footer={<a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Back to sign in</a>}
    >
      <form onSubmit={submit} noValidate>
        {error && <div style={authErrorStyle}>{error}</div>}
        <label style={{ ...authLabelStyle, marginTop: 0 }} htmlFor="password">New password</label>
        <input
          id="password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="At least 8 characters" style={authInputStyle}
        />
        {touched && password.length > 0 && !passwordValid && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Use at least 8 characters.</div>
        )}
        <label style={authLabelStyle} htmlFor="confirm">Confirm password</label>
        <input
          id="confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="Re enter password" style={authInputStyle}
        />
        {touched && confirm.length > 0 && !matches && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Passwords don't match.</div>
        )}
        <button type="submit" disabled={!canSubmit} style={authButtonStyle(canSubmit)}>
          {loading ? 'Saving…' : 'Save new password →'}
        </button>
      </form>
    </AuthShell>
  );
}
