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

  // Map raw Supabase errors to clean, friendly messages.
  const friendlyError = (msg) => {
    const m = String(msg || '').toLowerCase();
    if (m.includes('already registered') || m.includes('already exists') || m.includes('already been registered')) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (m.includes('password')) return 'That password is too weak — use at least 8 characters.';
    if (m.includes('invalid') && m.includes('email')) return 'Enter a valid email address.';
    return msg || 'Something went wrong. Please try again.';
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
        setError(friendlyError(signUpError.message));
        setLoading(false);
        return;
      }
      // With confirmation ON, no session is returned until the email is confirmed.
      // (If the email already exists, Supabase returns an obfuscated identities-empty user.)
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError('An account with this email already exists. Try signing in instead.');
        setLoading(false);
        return;
      }
      setSent(true);
      setLoading(false);
    } catch (err) {
      setError('Something went wrong. Please try again.');
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
