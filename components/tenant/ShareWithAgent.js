// components/tenant/ShareWithAgent.js
// "Share with the listing agent", on the tenant's profile page inside Who can see your profile
// (components/tenant/ProfileVault.js). The tenant picks one of their open applications (the
// unit), finds the listing agent by name or brokerage, and shares; or enters the agent's email
// to invite one who is not on Rentletter, and shares once they have joined. Every act is
// POST /api/tenant/shares under the tenant's own session (lib/profileShares.js,
// db/024-share-roles.sql): the same shares, the same view log and the same Stop sharing as a
// share with their realtor. Nothing is shared by an invite, and nobody shares for the tenant.
// On the realtor tokens (components/tenant/ProfileFacts.js ProfileStyles).
import { useEffect, useRef, useState } from 'react';
import { noWidow, dateLong } from '../../lib/typeset';
import { Pending } from '../brand/Loader';

export const AGENT_SEES = 'They see what your realtor sees: your details, the facts read from your documents, your photo, your words and your offer if you added them, and your screening score for this unit. They can open your income and employment documents for 14 days. Never your ID.';

export default function ShareWithAgent({ agents, onChanged }) {
  const units = (agents && agents.units) || []; const invites = (agents && agents.invites) || [];
  const [unit, setUnit] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState(null); // the realtor the tenant is about to share with
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null); // { tone, text, retry }
  const seq = useRef(0);
  const rl = unit || (units[0] && units[0].applicationNumber) || '';

  const post = async (body) => {
    const r = await fetch('/api/tenant/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || 'Something went wrong. Please try again.');
    return j;
  };
  // The search runs a moment after the last key; only the latest answer is kept.
  useEffect(() => {
    const words = q.trim();
    if (words.length < 2 || !rl) { setFound(null); return undefined; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try { const j = await post({ action: 'agent-search', applicationNumber: rl, q: words }); if (mine === seq.current) setFound(j.results || []); }
      catch (e) { if (mine === seq.current) { setFound(null); setNote({ tone: 'warn', text: e.message }); } }
    }, 300);
    return () => clearTimeout(t);
  }, [q, rl]);

  const act = async (key, body, done, retry = null) => {
    if (busy) return false;
    setBusy(key); setNote(null);
    try { await post(body); setBusy(''); if (done) setNote({ tone: 'ok', text: done }); if (onChanged) await onChanged(); return true; }
    catch (e) { setBusy(''); setNote({ tone: 'warn', text: e.message, retry }); return false; }
  };
  const share = async (agent) => { const ok = await act(`share:${agent.id}`, { action: 'agent-share', applicationNumber: rl, agentId: agent.id }, `Shared with ${agent.name}, as listing agent.`, () => share(agent)); if (ok) { setPicked(null); setQ(''); setFound(null); } };
  const invite = async (e) => { e.preventDefault(); const ok = await act('invite', { action: 'agent-invite', applicationNumber: rl, email }, 'Invite sent. Nothing is shared until they join and you share.'); if (ok) setEmail(''); };

  if (!agents || !agents.available) return <p role="status" data-agent-absent="" className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Sharing with a listing agent is not available yet.')}</p>;
  return (
    <div data-share-agent="" style={{ marginTop: 'var(--gap-card)', paddingTop: 'var(--gap-card)', borderTop: '1px solid var(--rule)' }}>
      <h3 className="mp-h2" style={{ fontSize: 'var(--t-body)' }}>Share with the listing agent</h3>
      {units.length === 0 ? <p className="mp-p" data-agent-no-unit="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('After you apply to a unit, you can share your profile with its listing agent here.')}</p> : (
        <>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Your choice, for one unit at a time. You can stop sharing at any time.')}</p>
          {units.length > 1 ? (
            <div style={{ marginTop: 'var(--gap-card)' }}>
              <label htmlFor="sa-unit" className="mp-label" style={{ display: 'block' }}>For which unit</label>
              <select id="sa-unit" className="mp-input" value={rl} onChange={(e) => { setUnit(e.target.value); setPicked(null); setFound(null); setQ(''); }} style={{ fontSize: 'var(--t-body)', marginTop: 'var(--gap-line)' }}>
                {units.map((u) => <option key={u.applicationNumber} value={u.applicationNumber}>{u.listingName}</option>)}
              </select>
            </div>
          ) : <p className="mp-source" data-agent-unit="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`For ${units[0].listingName}`)}</p>}

          {picked ? (
            <div data-agent-confirm="" style={{ marginTop: 'var(--gap-card)' }}>
              <div className="mp-value" style={{ marginTop: 0 }}>{noWidow(picked.name)}</div>
              {picked.brokerage && <div className="mp-source">{noWidow(picked.brokerage)}</div>}
              <p className="mp-p" data-agent-sees="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(AGENT_SEES)}</p>
              <div className="mp-actions">
                <button type="button" data-agent-share="" className="mp-btn" disabled={!!busy} onClick={() => share(picked)}><Pending busy={busy === `share:${picked.id}`} label="Sharing">Share my profile</Pending></button>
                <button type="button" className="mp-link" disabled={!!busy} onClick={() => setPicked(null)}>Not now</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginTop: 'var(--gap-card)' }}>
                <label htmlFor="sa-search" className="mp-label" style={{ display: 'block' }}>Find the listing agent</label>
                <input id="sa-search" className="mp-input" data-agent-search="" type="search" placeholder="Name or brokerage" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" style={{ fontSize: 'var(--t-body)', marginTop: 'var(--gap-line)' }} />
              </div>
              {found && found.length > 0 && (
                <ul className="mp-list" data-agent-results="" style={{ marginTop: 'var(--gap-line)' }}>
                  {found.map((a) => (
                    <li key={a.id} data-agent-result="" style={{ display: 'block' }}>
                      <div className="mp-value" style={{ marginTop: 0 }}>{noWidow(a.name)}</div>
                      {a.brokerage && <div className="mp-source">{noWidow(a.brokerage)}</div>}
                      <button type="button" data-agent-pick="" className="mp-link" onClick={() => { setPicked(a); setNote(null); }} aria-label={`Share with ${a.name}`}>Share with them</button>
                    </li>
                  ))}
                </ul>
              )}
              {found && found.length === 0 && <p className="mp-note" data-agent-none="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('No realtor found by that name. You can invite them by email.')}</p>}
              <form onSubmit={invite} data-agent-invite="" style={{ marginTop: 'var(--gap-card)' }}>
                <label htmlFor="sa-email" className="mp-label" style={{ display: 'block' }}>Not on Rentletter? Invite them by email</label>
                <input id="sa-email" className="mp-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" style={{ fontSize: 'var(--t-body)', marginTop: 'var(--gap-line)' }} />
                <div className="mp-actions"><button type="submit" className="mp-btn" disabled={!!busy || !email.trim()}><Pending busy={busy === 'invite'} label="Sending the invite">Send invite</Pending></button></div>
                <p className="mp-source" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('An invite shares nothing. You share once they have joined.')}</p>
              </form>
            </>
          )}
        </>
      )}

      {note && (
        <div role="status" data-agent-note={note.tone} style={{ marginTop: 'var(--gap-card)' }}>
          <p className={note.tone === 'ok' ? 'mp-note' : 'mp-alert'}>{noWidow(note.text)}</p>
          {note.retry ? <button type="button" data-agent-retry="" className="mp-link" disabled={!!busy} onClick={note.retry}>Try again</button> : null}
        </div>
      )}

      {invites.length > 0 && (
        <ul className="mp-list" data-agent-invites="" style={{ marginTop: 'var(--gap-card)' }}>
          {invites.map((v) => (
            <li key={v.id} data-agent-invited={v.joined ? 'joined' : 'waiting'} style={{ display: 'block' }}>
              <div className="mp-value mp-addr" style={{ marginTop: 0 }}>{v.email}</div>
              {v.listingName && <div className="mp-source">{noWidow(`For ${v.listingName}`)}</div>}
              <div className="mp-source">{noWidow(v.joined ? `${v.joined.name} is on Rentletter. Nothing is shared until you share.` : `Invited on ${dateLong(v.sentAt)}. Not on Rentletter yet. Nothing is shared.`)}</div>
              <div className="mp-actions" style={{ marginTop: 'var(--gap-line)' }}>
                {v.joined && <button type="button" data-agent-share-invited="" className="mp-btn" disabled={!!busy} onClick={() => act(`invited:${v.id}`, { action: 'agent-share-invited', id: v.id }, `Shared with ${v.joined.name}, as listing agent.`)}><Pending busy={busy === `invited:${v.id}`} label="Sharing">Share my profile</Pending></button>}
                <button type="button" className="mp-link" disabled={!!busy} onClick={() => act(`cancel:${v.id}`, { action: 'agent-invite-cancel', id: v.id }, 'Invite cancelled.')}>Cancel invite</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
