// components/dashboard/PeopleList.js
// Pipeline: the ink block on the dashboard, the same surface as the greeting. Everyone who was asked when a unit went rented (pending,
// muted, no invite yet) and everyone who said yes (consented, not ended), scored against every active listing (lib/pipelineState.js peopleRows, the same
// Fit the listing page shows, documents excluded, confirmations carried). Each row: the name or
// the email, then the facts as pills: the score, the address it was scored for, where they came
// from when that is another listing, the date it lasts until, and applied or invited. The whole card
// is one tap target (Enter and Space too): a tap anywhere opens it and a tap anywhere closes it,
// while the controls inside keep their own action. Open, each active listing gets one row: its
// score, its address and its one control (Invite, Invited, or the Applied mark), so the summary
// drops the score, the address and the status those rows now carry; each fact shows once. Remove
// asks first. Every write goes through /api/pipeline/* (session, entitlement, ownership).
import { useEffect, useState } from 'react';
import { C, R } from '../theme';
import { ConfirmSheet, StatusPills } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { shortDate } from '../../lib/pipelineState';

const fitText = (f) => (f.score != null ? `${Number(f.score).toFixed(1)} ${f.label}` : 'No Fit yet');
// Inside the card these keep their own action and never open or close it.
const OWN_ACTION = 'button, a, input, select, textarea, label, [data-own-action]';

export default function PeopleList({ people, onChanged, className = '', style }) {
  const adapter = useAdapter();
  const [rows, setRows] = useState(people || []);
  useEffect(() => { setRows(people || []); }, [people]);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(''); // `${consentId}:${listingId}` | `remove:${consentId}`
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null); // the row to remove
  // "#people" from the Next item: open the card at the top of the view.
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#people') return;
    const el = document.getElementById('people'); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60);
  }, []);

  const invite = async (row, fit) => {
    const key = `${row.id}:${fit.listingId}`;
    setBusy(key); setNote('');
    try {
      const r = await adapter.fetch('/api/pipeline/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consentId: row.id, listingId: fit.listingId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || 'Could not send the invite.'); return; }
      const at = j.invitedAt || new Date().toISOString();
      setRows((cur) => cur.map((p) => (p.id === row.id ? { ...p, lastInvitedAt: at, invites: [...(p.invites || []), { listingId: fit.listingId, at }], fits: p.fits.map((f) => (f.listingId === fit.listingId ? { ...f, invitedAt: at } : f)) } : p)));
      onChanged?.();
    } catch { setNote('Could not send the invite.'); }
    finally { setBusy(''); }
  };
  const remove = async (row) => {
    setBusy(`remove:${row.id}`); setNote('');
    try {
      const r = await adapter.fetch('/api/pipeline/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consentId: row.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || 'Could not remove them.'); return; }
      setRows((cur) => cur.filter((p) => p.id !== row.id)); setConfirm(null); setOpenId(null);
      onChanged?.();
    } catch { setNote('Could not remove them.'); }
    finally { setBusy(''); }
  };

  const pending = (p) => p.status === 'pending';
  // The summary. Closed: the score, the address it is for, the other listing they came from, the
  // date, applied or invited. Open: only what the listing rows below do not already show.
  const line2 = (p, open) => {
    if (pending(p)) return <StatusPills tone="ink" label="Status" items={[`asked ${shortDate(p.askedAt)}`, 'no answer yet']} />;
    const bits = [];
    if (!p.best) bits.push('Asked to hear about similar units');
    else if (!open) bits.push(`${Number(p.best.score).toFixed(1)} ${p.best.label}`, p.best.listingName);
    // The address once: "from" only when they came from a listing other than the one scored.
    if (p.fromListingName && !(p.best && p.best.listingName === p.fromListingName)) bits.push(`from ${p.fromListingName}`);
    if (p.expiresAt) bits.push(`until ${shortDate(p.expiresAt)}`);
    if (!open) { if (p.applied) bits.push('applied'); else if (p.lastInvitedAt) bits.push(`invited ${shortDate(p.lastInvitedAt)}`); }
    return bits.length ? <StatusPills tone="ink" label="Status" items={bits} /> : null;
  };
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));
  // On ink: paper outlined controls, paper text, the muted paper for a row that is still waiting.
  const ctrl = { minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.paper, border: `1.5px solid ${C.paper}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };
  const quiet = { border: `1px solid ${C.instRule}`, color: C.instMute };

  return (
    <section id="people" className={className} aria-label="Pipeline" style={{ background: C.inst, color: C.instText, borderRadius: 'var(--card-radius)', padding: 'var(--card-pad)', scrollMarginTop: 'var(--s-4)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s-3)', marginBottom: rows.length ? 'var(--s-2)' : 'var(--s-1)' }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--f-display)', fontSize: 'var(--t-d3)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 'var(--lh-display)', color: C.paper }}>Pipeline</h2>
        <span style={{ fontSize: 'var(--t-d3)', color: C.paper, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{rows.length}</span>
      </div>
      {note ? <div role="alert" style={{ fontSize: 'var(--t-body-2)', color: C.danger, marginBottom: 'var(--s-2)' }}>{note}</div> : null}
      {rows.length === 0 ? (
        <p style={{ fontSize: 'var(--t-body-2)', color: C.instMute, lineHeight: 'var(--lh-body)', margin: 0, textWrap: 'pretty' }}>Nobody yet. Applicants who lose out on a rented unit appear here once asked.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((p, i) => {
            const open = openId === p.id;
            return (
              <li key={p.id} data-person={p.id} style={{ borderTop: i ? `1px solid ${C.instRule}` : 'none' }}>
                <div role="button" tabIndex={0} aria-expanded={open} aria-label={`${p.display}, ${open ? 'tap to close' : 'tap to open'}`} data-press=""
                  onClick={(e) => { const own = e.target.closest(OWN_ACTION); if (own && own !== e.currentTarget) return; toggle(p.id); }}
                  onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.id); } }}
                  style={{ minHeight: 44, padding: 'var(--s-2) 0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                  <div style={{ fontSize: 'var(--t-body)', color: pending(p) ? C.instMute : C.instText, fontWeight: 600, lineHeight: 'var(--lh-body)', overflowWrap: 'anywhere' }}>{p.display}</div>
                  {line2(p, open) ? <div style={{ marginTop: 'var(--s-2)' }}>{line2(p, open)}</div> : null}
                  {open && (
                    <div style={{ paddingTop: 'var(--s-2)', paddingBottom: 'var(--s-1)' }}>
                      {(p.fits || []).length === 0 && <div style={{ fontSize: 'var(--t-body-2)', color: C.instMute, lineHeight: 'var(--lh-body)', minHeight: 44, display: 'flex', alignItems: 'center' }}>No active listing to invite them to.</div>}
                      {(p.fits || []).map((f) => (
                        <div key={f.listingId} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--s-2) var(--s-3)', minHeight: 44, padding: 'var(--s-1) 0' }}>
                          {/* The pills keep their full width; when the row is too narrow the control moves below them. */}
                          <StatusPills tone="ink" label={`Fit for ${f.listingName}`} items={[fitText(f), f.listingName]} style={{ flex: '1 1 auto' }} />
                          {f.applied ? <span data-own-action="" style={{ ...ctrl, ...quiet, display: 'inline-flex', alignItems: 'center', cursor: 'default' }}>Applied</span>
                            : pending(p) ? <button type="button" disabled title="Waiting for their yes" aria-label="Invite, waiting for their yes" style={{ ...ctrl, ...quiet, cursor: 'default' }}>Invite</button>
                            : f.invitedAt ? <button type="button" disabled style={{ ...ctrl, ...quiet, cursor: 'default' }}>Invited {shortDate(f.invitedAt)}</button>
                            : <button type="button" onClick={() => invite(p, f)} disabled={busy === `${p.id}:${f.listingId}`} style={{ ...ctrl, opacity: busy === `${p.id}:${f.listingId}` ? 0.6 : 1 }}>{busy === `${p.id}:${f.listingId}` ? 'Sending' : 'Invite'}</button>}
                        </div>
                      ))}
                      <button type="button" onClick={() => setConfirm(p)} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.instMute, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmSheet open={!!confirm} title={`Remove ${confirm?.display || ''}?`} body="They leave Pipeline. Their application, if any, stays where it was." confirmLabel="Remove" danger busy={busy === `remove:${confirm?.id}`} onConfirm={() => confirm && remove(confirm)} onCancel={() => setConfirm(null)} />
    </section>
  );
}
