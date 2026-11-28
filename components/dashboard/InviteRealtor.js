// components/dashboard/InviteRealtor.js
// Invite a realtor: the card on the Circle screen (components/dashboard/CircleView.js, full) with
// the realtor's own invite link, a Copy button and the realtors who joined through the link, by
// name and join date and nothing else. The profile page (components/dashboard/ProfileView.js)
// carries the same section as one line and a link to that card. One request, POST /api/profile/invite
// (lib/realtorInvite.js), which also makes the realtor's code the first time. Before
// db/017-realtor-invites.sql has run the route answers that the section is not available and
// nothing is drawn. The words promise nothing: no reward is described or implied.
// This is not the tenant referral system (components and routes under referrals), which passes a
// tenant to another realtor.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { linkProps } from '../nav/routes';

// The clipboard, with the one fallback every browser still has.
export async function writeClipboard(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* the fallback below */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch (e) { return false; }
}
export const joinedOn = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Toronto' }); };

export default function InviteRealtor({ full = false }) {
  const adapter = useAdapter();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    // The sandbox has no account to invite from.
    if (adapter.kind !== 'real') return undefined;
    let live = true;
    (async () => {
      try {
        const r = await adapter.fetch('/api/profile/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const j = await r.json().catch(() => ({}));
        if (live && r.ok && j && j.available && j.link) setData(j);
      } catch (e) { /* the section stays out of the page */ }
    })();
    return () => { live = false; clearTimeout(timer.current); };
  }, [adapter]);
  if (!data) return null;
  const copy = async () => {
    const ok = await writeClipboard(data.link);
    setCopied(ok);
    clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000);
  };
  const invited = Array.isArray(data.invited) ? data.invited : [];
  // On the profile page: the section's name, one line, and the way to the card in Circle.
  if (!full) {
    return (
      <section id="invite-a-realtor" data-invite-realtor="" className="rl-card" aria-labelledby="invite-a-realtor-title" style={{ padding: 'var(--card-pad)', marginTop: 'var(--gap-section)', scrollMarginTop: 'calc(var(--ds-bar-h, 0px) + 16px)' }}>
        <h2 id="invite-a-realtor-title" className="t-d3" style={{ color: C.ink, margin: '0 0 var(--gap-line)' }}>Invite a realtor</h2>
        <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', margin: '0 0 var(--s-3)', textWrap: 'balance' }}>Your invite link is in Circle, with everyone who joined through it.</p>
        <a {...linkProps('/circle#invite-a-realtor')} data-invite-open-circle="" className="ds-btn ds-btn-line">Open Circle</a>
      </section>
    );
  }
  return (
    <section id="invite-a-realtor" data-invite-realtor="" className="rl-card" aria-labelledby="invite-a-realtor-title" style={{ padding: 'var(--card-pad)', marginTop: 'var(--gap-section)', scrollMarginTop: 'calc(var(--ds-bar-h, 0px) + 16px)' }}>
      <h2 id="invite-a-realtor-title" className="t-d3" style={{ color: C.ink, margin: '0 0 var(--gap-line)' }}>Invite a realtor</h2>
      <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', margin: '0 0 var(--s-4)', textWrap: 'balance' }}>Share your link with a realtor you know. When they sign up from it, their name appears here.</p>
      <label htmlFor="invite-a-realtor-link" style={{ display: 'block', fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Your invite link</label>
      <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'stretch' }}>
        <input id="invite-a-realtor-link" type="text" readOnly value={data.link} onFocus={(e) => e.target.select()} style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '0 12px', border: `1px solid ${C.ruleDark}`, borderRadius: 'var(--btn-radius)', background: C.paper, color: C.ink, fontFamily: 'inherit' }} />
        <button type="button" onClick={copy} style={{ minHeight: 44, minWidth: 96, padding: '0 var(--gap-card)', background: C.inkFill, color: C.onInk, border: `1.5px solid ${C.inkFill}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{copied ? 'Invite link copied.' : ''}</span>
      <h3 style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 'var(--gap-section) 0 0' }}>Joined through your link</h3>
      {invited.length === 0 ? (
        <p data-invite-empty="" style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: 'var(--gap-line) 0 0', textWrap: 'balance' }}>No one has joined through your link yet.</p>
      ) : (
        <ul data-invite-list="" style={{ listStyle: 'none', margin: 'var(--gap-line) 0 0', padding: 0 }}>
          {invited.map((r, i) => (
            <li key={`${r.joinedAt || ''}-${i}`} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ fontSize: 'var(--t-body)', color: C.ink, fontWeight: 600, lineHeight: 1.35, textWrap: 'balance', overflowWrap: 'anywhere' }}>{r.name || 'Name not added yet'}</div>
              {joinedOn(r.joinedAt) ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 1.45, marginTop: 2 }}>Joined {joinedOn(r.joinedAt)}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
