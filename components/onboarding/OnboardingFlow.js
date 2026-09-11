// components/onboarding/OnboardingFlow.js
// First run onboarding, one screen: the display name. Pure UI: the write goes through the
// callback the page passes in (pages/onboarding.js owns Supabase). Paper treatment, generous
// type. Province, the signing name and branding are asked just in time on the dashboard
// (lib/justInTime.js), never here.
import { useEffect, useRef, useState } from 'react';
import { C, R, FONT } from '../theme';

const NAME_MAX = 80;
const input = { width: '100%', padding: '13px 14px', fontSize: 17, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 52, outline: 'none' };
const label = { display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 };

function Shell({ title, lead, children, aside }) {
  return (
    <main className="ob-main">
      <div className="ob-count">Welcome</div>
      <h1 className="ob-h1">{title}</h1>
      {lead && <p className="ob-lead">{lead}</p>}
      <div className="ob-body">{children}</div>
      {aside}
    </main>
  );
}
const Primary = ({ children, ...p }) => <button type="submit" className="ob-primary" {...p}>{children}</button>;

export function IdentityStep({ profile, onSave }) {
  const [name, setName] = useState((profile?.full_name || '').trim());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []);
  const ok = name.trim().length > 1;
  const submit = async (e) => { e.preventDefault(); if (!ok || busy) return; setBusy(true); setErr(''); const r = await onSave({ full_name: name.trim().slice(0, NAME_MAX) }); setBusy(false); if (r?.error) setErr(r.error); };
  return (
    <Shell title="What should landlords call you?" lead="Your name as it appears to applicants and landlords. Everything else can wait until you need it.">
      <form onSubmit={submit} className="ob-form">
        <div><label style={label} htmlFor="ob-name">Name on reports</label><input ref={ref} id="ob-name" style={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} autoCapitalize="words" autoComplete="name" enterKeyHint="next" placeholder="Jordan Lee" /></div>
        {err && <p role="alert" className="ob-err">{err}</p>}
        <Primary disabled={!ok || busy}>{busy ? 'Saving' : 'Open my dashboard'}</Primary>
      </form>
    </Shell>
  );
}

export function OnboardingStyles() {
  return (
    <style jsx global>{`
      .ob-main { max-width: 560px; margin: 0 auto; padding: clamp(28px, 7vw, 64px) clamp(16px, 4vw, 32px) max(48px, env(safe-area-inset-bottom)); }
      .ob-count { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.inkMute}; margin-bottom: 14px; }
      .ob-h1 { font-family: ${FONT.serif}; font-weight: 600; font-size: clamp(28px, 7.2vw, 40px); letter-spacing: -0.025em; line-height: 1.08; color: ${C.ink}; text-wrap: balance; margin-bottom: 12px; }
      .ob-lead { font-size: clamp(15px, 4vw, 17px); color: ${C.inkSoft}; line-height: 1.55; text-wrap: pretty; margin-bottom: 24px; }
      .ob-form { display: grid; gap: 18px; }
      .ob-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 54px; padding: 0 var(--gap-card); background: ${C.red}; color: ${C.paper}; border: none; border-radius: var(--btn-radius); font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
      .ob-primary:disabled { background: ${C.ruleDark}; cursor: not-allowed; }
      .ob-skip { width: 100%; min-height: 50px; background: ${C.card}; color: ${C.ink}; border: 1px solid ${C.ruleDark}; border-radius: var(--btn-radius); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
      .ob-actions { display: grid; gap: 10px; margin-top: 18px; }
      .ob-err { font-size: 14px; color: ${C.danger}; line-height: 1.5; text-wrap: balance; margin: 0; }
      .ob-card { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: clamp(14px, 3vw, 20px); }
      .ob-link { background: ${C.card}; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; padding: 14px 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: ${C.ink}; overflow-wrap: anywhere; margin-bottom: 12px; user-select: all; }
      .ob-quiet { display: inline-block; margin-top: 16px; font-size: 14px; color: ${C.inkSoft}; font-weight: 600; text-decoration: underline; min-height: 32px; }
      .ob-foot { margin-top: 36px; padding-top: 20px; border-top: 1px solid ${C.rule}; display: grid; gap: 6px; justify-items: start; }
    `}</style>
  );
}
