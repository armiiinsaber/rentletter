// pages/forgot-password.js
// Request a password-reset email via Supabase Auth. The link routes through
// /auth/callback (establishing a short-lived recovery session) and on to
// /reset-password, where the realtor sets a new password.
import { useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { isValidEmail } from '../lib/validation';
import AuthShell, { authInputStyle, authButtonStyle, authErrorStyle, authNoticeStyle, authLabelStyle } from '../components/auth/AuthShell';
import { C } from '../components/theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const emailValid = isValidEmail(email);
  const canSubmit = emailValid && !loading;

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) {
        setError(resetError.message);
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
        title="Reset password"
        eyebrow="Check your email"
        heading="Reset link sent."
        sub="If an account exists for that address, we've emailed a link to reset your password."
        footer={<a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Back to sign in</a>}
      >
        <div style={authNoticeStyle}>Sent to <strong>{email.trim()}</strong>. The link expires soon — check spam if it doesn't arrive.</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      eyebrow="Realtor dashboard"
      heading="Forgot your password?"
      sub="Enter your email and we'll send you a link to set a new one."
      footer={<a href="/signin" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Back to sign in</a>}
    >
      <form onSubmit={submit} noValidate>
        {error && <div style={authErrorStyle}>{error}</div>}
        <label style={{ ...authLabelStyle, marginTop: 0 }} htmlFor="email">Email</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="you@brokerage.com" style={authInputStyle}
        />
        {touched && email.trim() && !emailValid && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Enter a valid email address.</div>
        )}
        <button type="submit" disabled={!canSubmit} style={authButtonStyle(canSubmit)}>
          {loading ? 'Sending…' : 'Send reset link →'}
        </button>
      </form>
    </AuthShell>
  );
}
