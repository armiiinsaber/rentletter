// components/dashboard/ReferModal.js
// Realtor 1 → "Refer to another realtor". Creates a PENDING referral; the applicant must approve
// by email before anything is shared. The modal says so plainly.
import { useState } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';

export default function ReferModal({ listingId, applicant, onClose, onCreated }) {
  const [toName, setToName] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const app = applicant?.application || {};
  const valid = toName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail);

  const submit = async (e) => {
    e.preventDefault(); if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/referrals/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId, linkId: applicant.linkId, toName, toEmail, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Could not create the referral.');
      onCreated?.(j.referral);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 24px)', zIndex: 140 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="rl-modal" style={{ maxWidth: 480, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 'clamp(18px, 4vw, 26px)' }}>
        <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Refer to another realtor</div>
        <h3 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 6 }}>Pass {app.full_name ? app.full_name.split(' ')[0] : 'this applicant'} to a colleague</h3>
        <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 16 }}>
          Good applicant, wrong unit? Refer them. <strong style={{ color: C.ink }}>Nothing is shared until the applicant approves</strong> — they get an email showing exactly what would go to the other realtor, and can decline. You’ll see the outcome here.
        </p>
        <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>Receiving realtor’s name</label>
        <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Priya Patel" style={{ width: '100%', padding: '11px 12px', fontSize: 15, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, outline: 'none', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>Their email</label>
        <input type="email" inputMode="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="priya@brokerage.ca" style={{ width: '100%', padding: '11px 12px', fontSize: 15, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, outline: 'none', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 6 }}>Note to them (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 400))} rows={2} placeholder="Great applicant — wrong budget for my unit. Looking in the east end, ~$2,400." style={{ width: '100%', padding: '11px 12px', fontSize: 14, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, background: C.card, color: C.ink, outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 6 }} />
        <div style={{ fontSize: 11.5, color: C.inkMute, marginBottom: 14, lineHeight: 1.5 }}>The applicant sees this note too. Keep it about the unit fit — not about them.</div>
        <div style={{ padding: '10px 12px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
          If approved, {toName.trim() ? toName.trim().split(' ')[0] : 'they'} receive the applicant’s facts (employment, income, rental history, household, references, intro){applicant?.docVerifications?.length ? ' plus a dated summary of your document check — never the documents' : ''}. They don’t see your listing or your notes.
        </div>
        {error && <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 42 }}>Cancel</button>
          <button type="submit" disabled={!valid || busy} style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: !valid || busy ? 'not-allowed' : 'pointer', opacity: !valid || busy ? 0.5 : 1, minHeight: 42, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy ? 'Sending…' : <>Ask the applicant <Icon name="send" size={14} /></>}
          </button>
        </div>
      </form>
    </div>
  );
}
