// components/dashboard/PromoEntry.js
// "Have a code?" for accounts that already exist. Posts to /api/promos/redeem (the same atomic
// path the signup callback uses), says what was granted in plain words, and refreshes the page
// so lib/entitlements.js sees the new plan. A failure gets one neutral line that never reveals
// whether the code exists.
import { useState } from 'react';
import { C, R } from '../theme';

export default function PromoEntry({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const submit = async (e) => {
    e.preventDefault(); if (busy || !code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/promos/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { setMsg({ ok: true, text: j.status === 'granted_lifetime' ? 'Founding member: Rentletter is free for you, for life.' : 'Your free period is on. Everything is unlocked.' }); setTimeout(() => window.location.reload(), 1800); }
      else setMsg({ ok: false, text: r.status === 401 ? 'Sign in first, then enter the code.' : 'That code can’t be used on this account.' });
    } catch (err) { setMsg({ ok: false, text: 'That code can’t be used on this account.' }); }
    setBusy(false);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: compact ? 13 : 14, color: C.inkSoft, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', minHeight: 32 }}>Have a code?</button>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 420 }} aria-label="Redeem a code">
      <label htmlFor="promo-code" style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your code</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="promo-code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="rentletter-yourname" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" inputMode="url"
          style={{ flex: 1, minWidth: 0, padding: '11px 12px', fontSize: 16, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, minHeight: 46 }} />
        <button type="submit" disabled={busy || !code.trim()} style={{ background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '0 16px', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', minHeight: 46, opacity: busy || !code.trim() ? 0.6 : 1 }}>{busy ? 'Checking…' : 'Apply'}</button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 13.5, color: msg.ok ? C.green : C.inkSoft, lineHeight: 1.5, margin: 0, textWrap: 'balance' }}>{msg.text}</p>}
    </form>
  );
}
