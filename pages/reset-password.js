// pages/reset-password.js
// Set a new password. The realtor arrives here from the reset email via
// /auth/callback, which has already established a recovery session (cookie).
// We update the password, then send them to the dashboard.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import AuthShell, { authInputStyle, authButtonStyle, authErrorStyle, authNoticeStyle, authLabelStyle } from '../components/auth/AuthShell';
import { C } from '../components/theme';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(null); // null = checking

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data?.session);
    });
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
      router.replace('/landlord');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (hasSession === false) {
    return (
      <AuthShell
        title="Reset password"
        eyebrow="Link required"
        heading="Open the reset link first."
        sub="To set a new password, use the link we emailed you. It may have expired — request a new one."
        footer={<a href="/forgot-password" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Request a new link</a>}
      >
        <div style={authNoticeStyle}>For your security, password resets must start from the email link.</div>
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
          placeholder="Re-enter password" style={authInputStyle}
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
