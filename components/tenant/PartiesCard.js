// components/tenant/PartiesCard.js
// "Applying with someone?" The primary's one card for the people on their application
// (lib/parties.js): two quiet actions, Add a co applicant and, only when the listing accepts one,
// Add a guarantor; a name and an email; then the list of who was invited with their standing.
// Shown at the end of the apply form (pages/apply/[token].js) and on the tenant's own application
// page (pages/my-application/[rl].js). Talks to POST /api/party/manage with the primary's own
// credential; it never shows a party's income or documents, and never a token.
import { useEffect, useState } from 'react';
import { Field } from '../apply/fields';
import { Eyebrow, noWidow } from './ProfileFacts';
import { StatusPills } from '../ui';
import { INVITE_CARD, PARTY_STATUS } from '../../lib/parties';
import { PARTY_ROLE } from '../../lib/application-state';

export default function PartiesCard({ applicationNumber, ownerToken, acceptsGuarantor: acceptsFromInvite = null }) {
  const [state, setState] = useState({ phase: 'loading', parties: [], acceptsGuarantor: acceptsFromInvite !== false, canInvite: {} });
  const [role, setRole] = useState(null); // the role being invited, or null
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const call = async (body) => {
    const r = await fetch('/api/party/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationNumber, ownerToken, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Could not do that.'); e.status = r.status; throw e; }
    return j;
  };
  useEffect(() => {
    if (!applicationNumber || !ownerToken) return;
    let gone = false;
    call({ action: 'list' })
      .then((j) => { if (!gone) setState({ phase: 'ready', parties: j.parties || [], acceptsGuarantor: !!j.acceptsGuarantor, canInvite: j.canInvite || {} }); })
      .catch((e) => { if (!gone) setState((s) => ({ ...s, phase: e.status === 503 ? 'unavailable' : 'ready' })); });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationNumber, ownerToken]);
  if (!applicationNumber || !ownerToken || state.phase === 'unavailable') return null;

  const send = async () => {
    if (busy || !role) return;
    setBusy(true); setError('');
    try {
      const j = await call({ action: 'invite', role, name, email });
      setState({ phase: 'ready', parties: j.parties || [], acceptsGuarantor: !!j.acceptsGuarantor, canInvite: j.canInvite || {} });
      setRole(null); setName(''); setEmail('');
    } catch (e) { setError(e.message || 'Could not send that.'); }
    finally { setBusy(false); }
  };
  const live = state.parties.filter((p) => p.status !== PARTY_STATUS.DECLINED && p.status !== PARTY_STATUS.WITHDRAWN);
  const left = state.parties.filter((p) => p.status === PARTY_STATUS.DECLINED || p.status === PARTY_STATUS.WITHDRAWN);
  const canCo = state.canInvite[PARTY_ROLE.CO_APPLICANT] !== false;
  const canGuarantor = state.acceptsGuarantor && state.canInvite[PARTY_ROLE.GUARANTOR] !== false;
  return (
    <div className="rl-card mp-card" data-parties-card="">
      <Eyebrow>Your application</Eyebrow>
      <h2 className="mp-h2" style={{ marginTop: 'var(--gap-line)' }}>{INVITE_CARD.title}</h2>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(INVITE_CARD.body)}</p>
      {state.parties.length > 0 && (
        <ul className="mp-list" aria-label="People on this application" style={{ marginTop: 'var(--gap-card)' }}>
          {state.parties.map((p) => (
            <li key={p.id} data-party-status={p.status}>
              <span style={{ minWidth: 0 }}>
                <span className="mp-value" style={{ marginTop: 0, display: 'block' }}>{noWidow(p.name)}</span>
                <StatusPills label={`${p.name}, standing`} items={[p.roleLabel, p.statusLabel]} style={{ marginTop: 'var(--gap-line)' }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {role ? (
        <div className="mp-form" data-invite-form="">
          <div className="mp-label">{role === PARTY_ROLE.GUARANTOR ? INVITE_CARD.addGuarantor : INVITE_CARD.addCoApplicant}</div>
          <Field label={INVITE_CARD.nameLabel} value={name} onChange={setName} placeholder="Alex Smith" />
          <Field label={INVITE_CARD.emailLabel} value={email} onChange={setEmail} placeholder="alex@email.com" type="email" inputMode="email" />
          {error && <p role="alert" className="mp-alert">{noWidow(error)}</p>}
          <div className="rl-ctrl-row">
            <button type="button" onClick={send} disabled={busy} className="mp-btn mp-btn-red">{busy ? 'Sending' : INVITE_CARD.send}</button>
            <button type="button" onClick={() => { setRole(null); setError(''); }} disabled={busy} className="mp-btn">{INVITE_CARD.cancel}</button>
          </div>
        </div>
      ) : (
        <div className="rl-ctrl-row" style={{ marginTop: 'var(--gap-card)' }}>
          {canCo && <button type="button" onClick={() => setRole(PARTY_ROLE.CO_APPLICANT)} className="mp-btn">{left.length && !live.length ? INVITE_CARD.inviteAnother : INVITE_CARD.addCoApplicant}</button>}
          {canGuarantor && <button type="button" onClick={() => setRole(PARTY_ROLE.GUARANTOR)} className="mp-btn">{INVITE_CARD.addGuarantor}</button>}
        </div>
      )}
      {!role && error && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(error)}</p>}
    </div>
  );
}
