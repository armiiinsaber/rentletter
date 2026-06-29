// pages/signup.js
// Realtor sign up (email + password) via Supabase Auth. Email confirmation is
// ON, so on success we show a "check your email" state. The confirmation link
// routes through /auth/callback, which establishes the session and lands on the
// dashboard. The DB trigger creates the profile + assigns founder/trial on
// confirmation.
import { useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { isValidEmail } from '../lib/validation';
import AuthShell, { authInputStyle, authButtonStyle, authErrorStyle, authNoticeStyle, authLabelStyle } from '../components/auth/AuthShell';
import { C } from '../components/theme';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [agreed, setAgreed] = useState(false); // required: Terms + Privacy

  const emailValid = isValidEmail(email);
  const passwordValid = password.length >= 8;
  const confirmValid = confirm.length > 0 && confirm === password;
  const canSubmit = emailValid && passwordValid && confirmValid && !loading;

  const GENERIC = 'Something went wrong creating your account. Please try again.';

  // Map a Supabase auth error (the WHOLE object, not just .message) to a clean, friendly
  // STRING. Classifies by code + HTTP status + message keywords, and NEVER returns a raw
  // object, an empty value, or junk like "{}" / "[object Object]" — always the GENERIC
  // fallback when it can't produce something meaningful.
  const friendlyError = (err) => {
    const code = String(err?.code || err?.error_code || '').toLowerCase();
    const status = Number(err?.status || err?.statusCode || 0);
    const raw = typeof err?.message === 'string' ? err.message : '';
    const m = raw.toLowerCase();

    // Weak password (check before the generic 422 "already exists" mapping below).
    if (code.includes('weak_password') || (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('should be') || m.includes('characters') || m.includes('short')))) {
      return 'That password is too weak — use at least 8 characters.';
    }
    // Already registered (most common when re-testing the same email). When email
    // confirmation is on, Supabase usually returns status 422 / a user_already_exists code.
    if (code.includes('user_already_exists') || code.includes('email_exists') ||
        m.includes('already registered') || m.includes('already exists') || m.includes('already been registered') ||
        (status === 422 && (m === '' || m.includes('user') || m.includes('email') || m === '{}'))) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    // Rate limited.
    if (status === 429 || code.includes('over_') || code.includes('rate_limit') || m.includes('rate limit') || m.includes('too many') || m.includes('try again later')) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    // Invalid email.
    if (code.includes('email_address_invalid') || (m.includes('invalid') && m.includes('email'))) {
      return 'Enter a valid email address.';
    }
    // Sign-ups disabled on the project.
    if (code.includes('signup_disabled') || m.includes('signups not allowed') || m.includes('signup is disabled')) {
      return 'Sign-ups are temporarily unavailable. Please try again later.';
    }
    // A clean, human-readable message? Show it. Otherwise the generic fallback — never the
    // raw object or "{}".
    const clean = raw.trim();
    if (clean && clean !== '{}' && clean.toLowerCase() !== '[object object]' && clean.length <= 160 && /[a-z]/i.test(clean)) {
      return clean;
    }
    return GENERIC;
  };

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    if (!agreed) return; // blocked until the Terms + Privacy box is checked (inline error shows)
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/landlord`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo },
      });
      if (signUpError) {
        setError(friendlyError(signUpError)); // pass the whole error so code/status classify it
        setLoading(false);
        return;
      }
      // With confirmation ON, no session is returned until the email is confirmed. For an
      // ALREADY-REGISTERED email, Supabase obfuscates the response: it returns a user with an
      // EMPTY identities array (and no error) instead of telling you the email is taken. Detect
      // that and show the "account exists" message rather than a misleading "check your email".
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('An account with this email already exists. Try signing in instead.');
        setLoading(false);
        return;
      }
      // No error and no user at all → don't show a false success screen.
      if (!data?.user) {
        setError(GENERIC);
        setLoading(false);
        return;
      }
      setSent(true);
      setLoading(false);
    } catch (err) {
      // Thrown (network / misconfigured client). NEVER surface the raw object (it serializes
      // to "{}") or internal config text — show a friendly generic string.
      setError(GENERIC);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Confirm your email"
        eyebrow="Almost there"
        heading="Check your email."
        sub="We sent a confirmation link to your inbox. Click it to activate your account and sign in."
        footer={<>Wrong address? <a href="/signup" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Start over</a></>}
      >
        <div style={authNoticeStyle}>
          Confirmation sent to <strong>{email.trim()}</strong>. The link expires soon — if it doesn't arrive, check spam or try again.
        </div>
        <a href="/signin" style={{ ...authButtonStyle(true), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          Go to sign in
        </a>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign up"
      eyebrow="Realtor dashboard"
      heading="Create your account."
      sub="Organize your applicants, rank everyone against your landlord's criteria, and send a polished report to your landlord client."
      footer={<>Already have an account? <a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Sign in</a></>}
    >
      <form onSubmit={submit} noValidate>
        {/* Render the error ONLY when it's a non-empty string — never a raw object (an
            object child would render/throw oddly, e.g. the reported "{}"). Defensive: keeps
            the form to exactly Email / Password / Confirm / agreement / submit. */}
        {typeof error === 'string' && error.trim() ? <div style={authErrorStyle}>{error}</div> : null}
        <label style={{ ...authLabelStyle, marginTop: 0 }} htmlFor="email">Email</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="you@brokerage.com" style={authInputStyle}
        />
        {touched && email.trim() && !emailValid && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Enter a valid email address.</div>
        )}
        <label style={authLabelStyle} htmlFor="password">Password</label>
        <input
          id="password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="At least 8 characters" style={authInputStyle}
        />
        {touched && password.length > 0 && !passwordValid ? (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Use at least 8 characters.</div>
        ) : (
          <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 4 }}>Use at least 8 characters.</div>
        )}
        <label style={authLabelStyle} htmlFor="confirm">Confirm password</label>
        <input
          id="confirm" type="password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="Re-enter your password" style={authInputStyle}
        />
        {touched && confirm.length > 0 && !confirmValid && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Passwords don’t match.</div>
        )}
        {/* Required agreement — makes the Terms binding at signup. */}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, marginBottom: 6, cursor: 'pointer', fontSize: 13, color: C.inkSoft, lineHeight: 1.5 }}>
          <input
            type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
            aria-label="I agree to the Terms of Service and Privacy Policy"
            style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: C.red, cursor: 'pointer' }}
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.red, fontWeight: 700, textDecoration: 'underline' }}>Terms of Service</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.red, fontWeight: 700, textDecoration: 'underline' }}>Privacy Policy</a>.
          </span>
        </label>
        {touched && !agreed && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>You must agree to the Terms of Service and Privacy Policy to continue.</div>
        )}
        <button type="submit" disabled={!canSubmit} style={authButtonStyle(canSubmit)}>
          {loading ? 'Creating account…' : 'Create account →'}
        </button>
      </form>
    </AuthShell>
  );
}
