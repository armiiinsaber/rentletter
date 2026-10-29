// pages/signin.js
// Realtor sign in (email + password) via Supabase Auth. Replaces the old custom
// magic-link sign-in UI. On success, the session is stored in cookies and the
// realtor is sent to the dashboard.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { isValidEmail } from '../lib/validation';
import AuthShell, { authInputStyle, authButtonStyle, authErrorStyle, authLabelStyle } from '../components/auth/AuthShell';
import { C } from '../components/theme';
import { Pending } from '../components/brand/Loader';
import { holdOpening } from '../components/brand/AppStart';
import { prefetchCode } from '../components/nav/routes';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState(typeof router.query.error === 'string' ? router.query.error : '');
  const [loading, setLoading] = useState(false);

  // The dashboard's code, while the realtor types (never its data, which comes through the checks).
  useEffect(() => { prefetchCode(['/dashboard']); }, []);
  const emailValid = isValidEmail(email);
  const canSubmit = emailValid && password.length > 0 && !loading;

  const submit = async (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        const msg = /email not confirmed/i.test(signInError.message)
          ? 'Please confirm your email first, check your inbox for the confirmation link.'
          : /invalid login credentials/i.test(signInError.message)
            ? 'Incorrect email or password.'
            : signInError.message;
        setError(msg);
        setLoading(false);
        return;
      }
      const next = typeof router.query.next === 'string' && router.query.next.startsWith('/')
        ? router.query.next : '/dashboard';
      // The opening screen carries the button's door on until the next screen is ready
      // (components/brand/AppStart.js holdOpening): one door from the tap to the finished screen.
      holdOpening();
      router.replace(next);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      eyebrow="Realtor dashboard"
      heading="Sign in to Rentletter."
      footer={<>New here? <a href="/signup" style={{ color: C.red, fontWeight: 700, textDecoration: 'none' }}>Create an account</a></>}
    >
      <form onSubmit={submit} noValidate>
        {error && <div style={authErrorStyle}>{error}</div>}
        <label style={{ ...authLabelStyle, marginTop: 0 }} htmlFor="email">Email</label>
        <input
          id="email" name="username" type="email" inputMode="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="you@brokerage.com" style={authInputStyle}
        />
        {touched && email.trim() && !emailValid && (
          <div style={{ fontSize: 12, color: C.red, marginBottom: 4 }}>Enter a valid email address.</div>
        )}
        <label style={authLabelStyle} htmlFor="password">Password</label>
        <input
          id="password" name="password" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password" style={authInputStyle}
        />
        <div style={{ marginTop: 8 }}>
          <a href="/forgot-password" style={{ fontSize: 13, color: C.inkSoft, textDecoration: 'underline' }}>Forgot your password?</a>
        </div>
        <button type="submit" disabled={!canSubmit} style={authButtonStyle(canSubmit)}>
          <Pending busy={loading} label="Signing in">Sign in →</Pending>
        </button>
      </form>
    </AuthShell>
  );
}
