// components/dashboard/CircleView.js
// The Circle screen (pages/circle.js): the realtors a realtor works with. From the top: requests
// waiting for an answer, the search that finds a realtor by name or brokerage and adds them (or,
// when nobody matches, the realtor's own invite link to copy or send by text), the circle itself,
// requests sent, Invite a realtor, the realtor's brokerage record, and how they appear to others.
// Every read and write is POST /api/circle or POST /api/circle/brokerage (lib/circle.js,
// lib/brokerage.js): session, entitlement and the caller's own id on the server. What is shown of
// another realtor is a name, a brokerage, initials and what they said about their own work:
// never an email, a phone, a listing or a number. No score, no rank, no count of followers.
// Before db/021-realtor-circle.sql has run the screen says the circle is not available yet.
import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { GlobalStyle, ConfirmSheet, StatusPills, LabelValue } from '../ui';
import { C } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { rememberProfile, rememberScreenView, useTakeOver } from '../nav/routes';
import { Reveal, Pending } from '../brand/Loader';
import DashboardHeader from './DashboardHeader';
import InviteRealtor, { joinedOn, writeClipboard } from './InviteRealtor';
import Paywall from './Paywall';
import { setCirclePending } from './MainNav';

const post = async (adapter, url, body) => {
  try {
    const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  } catch (e) { return { ok: false, status: 0, j: {} }; }
};
const FAILED = 'That did not go through. Try again.';
export const smsHref = (link) => `sms:?&body=${encodeURIComponent(`Join me on Rentletter: ${link}`)}`;

const Avatar = ({ initials }) => <span className="cv-avatar" aria-hidden="true">{initials}</span>;
// One realtor: initials, name and brokerage, then whatever the card is for.
const Person = ({ who, children, ...rest }) => (
  <li className="cv-person" {...rest}>
    <div className="cv-who">
      <Avatar initials={who.initials} />
      <div style={{ minWidth: 0 }}>
        <div className="cv-name">{who.name}</div>
        {who.brokerage ? <div className="cv-brok">{who.brokerage}</div> : null}
      </div>
    </div>
    {children}
  </li>
);
const Field = ({ id, label, value, onChange, type = 'text', autoComplete, optional = false }) => (
  <div className="cv-field">
    <label htmlFor={id} className="cv-label">{label}{optional ? ' (optional)' : ''}</label>
    <input id={id} className="cv-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
  </div>
);
const Switch = ({ on, onChange, label, busy, ...rest }) => (
  <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)} className="cv-switch" {...rest}>
    <span className="cv-switch-label">{label}</span>
    <span className="cv-track" data-on={on ? '1' : '0'} aria-hidden="true"><span className="cv-knob" /></span>
  </button>
);

const STANDING = {
  sent: (b) => `We emailed ${b.brokerName} to confirm. Waiting for their answer.`,
  review: (b) => `${b.brokerName} confirmed. Rentletter is reviewing the record.`,
  confirmed: () => 'Confirmed by the broker of record.',
  disputed: () => 'The broker of record said you are not their agent. Check the details and save again.',
  suspended: () => 'This record is on hold. Write to info@rentletter.ca.',
};

export default function CircleView({ initialProfile, entitlement = null }) {
  const adapter = useAdapter();
  const [profile, setProfile] = useState(initialProfile);
  useEffect(() => { rememberProfile(profile); }, [profile]);
  useTakeOver([initialProfile], () => { if (initialProfile) setProfile(initialProfile); });
  useEffect(() => { if (adapter.kind === 'real') rememberScreenView('/circle', { initialProfile: profile, entitlement }); }, [adapter.kind, profile, entitlement]);

  const [data, setData] = useState(null); // the load answer
  const [state, setState] = useState('loading'); // loading | ready | unavailable | locked | failed
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(''); // the action in flight, by a key
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null); // null: no search yet; { q, results }
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ask, setAsk] = useState(null); // { kind: 'remove' | 'block', id, name }
  const [form, setForm] = useState(null); // the brokerage form
  const [formNote, setFormNote] = useState('');
  const [areas, setAreas] = useState('');
  const [areasNote, setAreasNote] = useState('');
  const seq = useRef(0); const copyTimer = useRef(null);

  const load = useCallback(async () => {
    const { ok, status, j } = await post(adapter, '/api/circle', { action: 'load' });
    if (status === 402) { setState('locked'); return; }
    if (!ok) { setState((s) => (s === 'ready' ? s : 'failed')); return; }
    if (!j.available) { setState('unavailable'); return; }
    setData(j); setState('ready'); setCirclePending((j.requests || []).length);
    setAreas((v) => v || (j.me.serviceAreas || []).join(', '));
    setForm((f) => f || { legalName: j.brokerage?.legalName || j.me.brokerage || initialProfile?.brokerage || '', address: j.brokerage?.address || initialProfile?.brokerage_address || '', phone: j.brokerage?.phone || '', brokerName: j.brokerage?.brokerName || '', brokerEmail: j.brokerage?.brokerEmail || '', hstNumber: j.brokerage?.hstNumber || '' });
  }, [adapter, initialProfile]);
  useEffect(() => { if (adapter.kind === 'real') load(); else setState('unavailable'); }, [adapter.kind, load]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  // The search runs as the realtor types, a moment after the last key; only the latest answer is kept.
  useEffect(() => {
    const words = q.trim();
    if (words.length < 2) { setFound(null); setSearching(false); return undefined; }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { ok, j } = await post(adapter, '/api/circle', { action: 'search', q: words });
      if (mine !== seq.current) return;
      setSearching(false);
      if (!ok) { setError(j.error || FAILED); return; }
      setFound({ q: words, results: j.results || [] });
    }, 300);
    return () => clearTimeout(t);
  }, [q, adapter]);

  const act = async (key, body, { then } = {}) => {
    setBusy(key); setError('');
    const { ok, j } = await post(adapter, '/api/circle', body);
    setBusy('');
    if (!ok) { setError(j.error || FAILED); return false; }
    if (then) then(j);
    await load();
    return true;
  };
  // Add: the button says Requested at once, and goes back if the request did not go through.
  const add = async (r) => {
    const set = (s, id) => setFound((f) => (f ? { ...f, results: f.results.map((x) => (x.id === r.id ? { ...x, state: s, connectionId: id === undefined ? x.connectionId : id } : x)) } : f));
    set('sent'); setError('');
    const { ok, j } = await post(adapter, '/api/circle', { action: 'request', profileId: r.id });
    if (!ok) { set('none'); setError(j.error || FAILED); return; }
    set(j.state || 'sent', j.connectionId || null);
    load();
  };
  const acceptFound = (r) => act(`accept:${r.connectionId}`, { action: 'accept', id: r.connectionId }, { then: () => setFound((f) => (f ? { ...f, results: f.results.map((x) => (x.id === r.id ? { ...x, state: 'connected' } : x)) } : f)) });
  const copy = async (link) => { const ok = await writeClipboard(link); setCopied(ok); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); };
  const confirmAsk = async () => { if (!ask) return; const done = await act(`${ask.kind}:${ask.id}`, { action: ask.kind, id: ask.id }); if (done) setFound(null); setAsk(null); };
  const saveSetting = async (key, body) => {
    setBusy(key); setError('');
    const { ok, j } = await post(adapter, '/api/circle', { action: 'settings', ...body });
    setBusy('');
    if (!ok) { setError(j.error || FAILED); return false; }
    setData((d) => (d ? { ...d, me: { ...d.me, ...(typeof j.findable === 'boolean' ? { findable: j.findable } : {}), ...(j.doesRentals !== undefined ? { doesRentals: j.doesRentals } : {}), ...(j.serviceAreas ? { serviceAreas: j.serviceAreas } : {}) } } : d));
    return true;
  };
  const saveBrokerage = async (e) => {
    e.preventDefault(); setBusy('brokerage'); setFormNote(''); setError('');
    const { ok, j } = await post(adapter, '/api/circle/brokerage', { action: 'save', ...form });
    setBusy('');
    if (!ok) { setFormNote(j.error || FAILED); return; }
    setData((d) => (d ? { ...d, brokerage: j.brokerage } : d));
    setFormNote(j.emailed ? `Saved. We emailed ${j.brokerage.brokerName}.` : 'Saved. The email could not be sent. Use Send again.');
  };
  const resend = async () => {
    setBusy('resend'); setFormNote('');
    const { ok, j } = await post(adapter, '/api/circle/brokerage', { action: 'resend' });
    setBusy('');
    setFormNote(ok && j.emailed ? `Sent again to ${j.brokerage.brokerName}.` : (j.error || 'The email could not be sent. Try again.'));
    if (ok && j.brokerage) setData((d) => (d ? { ...d, brokerage: j.brokerage } : d));
  };

  const me = data?.me; const requests = data?.requests || []; const sent = data?.sent || []; const circle = data?.connections || []; const blocked = data?.blocked || [];
  const link = data?.invite?.link || '';
  const nobody = !!found && !searching && found.results.length === 0;

  return (
    <>
      <Head>
        <title>Circle · Rentletter</title>
        <meta name="description" content="The realtors you work with." />
      </Head>
      <GlobalStyle />
      <div className="cv" style={{ minHeight: '100dvh', background: 'var(--paper)', overflowX: 'hidden' }}>
        <DashboardHeader profile={profile} nav="circle" />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--s-2) var(--s-4) 64px' }}>
          <h1 className="t-d1" style={{ color: C.ink, margin: 'var(--s-3) 0 var(--gap-line)' }}>Circle</h1>
          <p style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 'var(--lh-body)', margin: '0 0 var(--gap-card)' }}>The realtors you work with.</p>

          {state === 'locked' && entitlement ? <Paywall entitlement={entitlement} profile={profile} /> : null}
          {state === 'unavailable' ? <p data-circle-unavailable="" className="cv-quiet">Circle is not available yet.</p> : null}
          {state === 'failed' ? (
            <div className="rl-card" role="alert" style={{ padding: 'var(--card-pad)' }}>
              <p className="cv-quiet" style={{ margin: '0 0 var(--s-3)' }}>Your circle could not be loaded.</p>
              <button type="button" className="cv-btn cv-btn-line" onClick={() => { setState('loading'); load(); }}>Try again</button>
            </div>
          ) : null}

          {state === 'loading' || state === 'ready' ? (
            <Reveal ready={state === 'ready'} label="Loading your circle">
              {error ? <div role="alert" data-circle-error="" className="cv-error">{error}</div> : null}

              {/* 1. Requests waiting for this realtor. */}
              {requests.length > 0 && (
                <section className="cv-block" aria-labelledby="cv-requests-title" data-circle-requests="">
                  <h2 id="cv-requests-title" className="cv-h2">Requests <span className="cv-count">{requests.length}</span></h2>
                  <ul className="cv-list">
                    {requests.map((r) => (
                      <Person key={r.connectionId} who={r} data-circle-request="">
                        <p className="cv-meta">Asked to join your circle.</p>
                        <div className="cv-actions">
                          <button type="button" className="cv-btn cv-btn-ink" disabled={!!busy} onClick={() => act(`accept:${r.connectionId}`, { action: 'accept', id: r.connectionId })}><Pending busy={busy === `accept:${r.connectionId}`} label="Accepting">Accept</Pending></button>
                          <button type="button" className="cv-btn cv-btn-line" disabled={!!busy} onClick={() => act(`decline:${r.connectionId}`, { action: 'decline', id: r.connectionId })}><Pending busy={busy === `decline:${r.connectionId}`} label="Declining">Decline</Pending></button>
                          <button type="button" className="cv-btn cv-btn-text" disabled={!!busy} onClick={() => setAsk({ kind: 'block', id: r.connectionId, name: r.name })}>Block</button>
                        </div>
                      </Person>
                    ))}
                  </ul>
                </section>
              )}

              {/* 2. Find and add. */}
              <section className="cv-block" aria-labelledby="cv-find-title" data-circle-find="">
                <h2 id="cv-find-title" className="cv-h2">Find a realtor</h2>
                <label htmlFor="cv-search" className="cv-label">Name or brokerage</label>
                <input id="cv-search" className="cv-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
                <span role="status" aria-live="polite" className="cv-sr">{found && !searching ? `${found.results.length} found` : ''}</span>
                {found && found.results.length > 0 && (
                  <ul className="cv-list" data-circle-results="" style={{ marginTop: 'var(--gap-card)' }}>
                    {found.results.map((r) => (
                      <Person key={r.id} who={r} data-circle-result={r.state}>
                        <div className="cv-actions">
                          {r.state === 'none' && <button type="button" className="cv-btn cv-btn-red" data-circle-add="" onClick={() => add(r)}>Add to circle</button>}
                          {r.state === 'sent' && <button type="button" className="cv-btn cv-btn-line" disabled data-circle-requested="">Requested</button>}
                          {r.state === 'incoming' && <button type="button" className="cv-btn cv-btn-ink" disabled={!!busy} onClick={() => acceptFound(r)}><Pending busy={busy === `accept:${r.connectionId}`} label="Accepting">Accept</Pending></button>}
                          {r.state === 'connected' && <span className="cv-in" data-circle-in="">In your circle</span>}
                        </div>
                      </Person>
                    ))}
                  </ul>
                )}
                {nobody && (
                  <div className="cv-invite" data-circle-invite="">
                    <p className="cv-invite-line">Not on Rentletter yet? Invite them.</p>
                    {link ? (
                      <>
                        <label htmlFor="cv-invite-link" className="cv-label">Your invite link</label>
                        <input id="cv-invite-link" className="cv-input" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
                        <div className="cv-actions">
                          <button type="button" className="cv-btn cv-btn-ink" onClick={() => copy(link)}>{copied ? 'Copied' : 'Copy link'}</button>
                          <a className="cv-btn cv-btn-line" href={smsHref(link)} data-circle-sms="">Share by text</a>
                        </div>
                        <span role="status" aria-live="polite" className="cv-sr">{copied ? 'Invite link copied.' : ''}</span>
                      </>
                    ) : null}
                  </div>
                )}
              </section>

              {/* 3. The circle. */}
              <section className="cv-block" aria-labelledby="cv-circle-title" data-circle-list="">
                <h2 id="cv-circle-title" className="cv-h2">Your circle <span className="cv-count">{circle.length}</span></h2>
                {circle.length === 0 ? (
                  <p className="cv-quiet" data-circle-empty="">No one yet. Find a realtor above and add them.</p>
                ) : (
                  <ul className="cv-list">
                    {circle.map((c) => (
                      <Person key={c.connectionId} who={{ ...c, brokerage: c.record ? c.record.legalName : c.brokerage }} data-circle-connection="">
                        {joinedOn(c.since) ? <p className="cv-meta">Connected since {joinedOn(c.since)}</p> : null}
                        {c.record ? (
                          <div className="cv-record">
                            <div className="cv-meta">{c.record.address}</div>
                            <div className="cv-meta"><LabelValue label="Broker of record:" value={c.record.brokerOfRecord} /></div>
                            {c.record.phone ? <div className="cv-meta">{c.record.phone}</div> : null}
                          </div>
                        ) : null}
                        <StatusPills label="About this realtor" items={[c.record && c.record.confirmed ? 'Brokerage confirmed' : null, c.doesRentals === true ? 'Does rentals' : null, ...(c.serviceAreas || [])].filter(Boolean)} style={{ marginTop: 'var(--s-2)' }} />
                        <div className="cv-history">
                          <div className="cv-label" style={{ marginBottom: 6 }}>Your handoffs with them</div>
                          <StatusPills label="Your handoffs with them" items={[`${c.history.sent} sent`, `${c.history.received} received`, `${c.history.closed} closed`]} />
                        </div>
                        <div className="cv-actions">
                          <button type="button" className="cv-btn cv-btn-text" disabled={!!busy} onClick={() => setAsk({ kind: 'remove', id: c.connectionId, name: c.name })}>Remove</button>
                          <button type="button" className="cv-btn cv-btn-text" disabled={!!busy} onClick={() => setAsk({ kind: 'block', id: c.connectionId, name: c.name })}>Block</button>
                        </div>
                      </Person>
                    ))}
                  </ul>
                )}
              </section>

              {/* 4. Requests this realtor sent. */}
              {sent.length > 0 && (
                <section className="cv-block" aria-labelledby="cv-sent-title" data-circle-sent="">
                  <h2 id="cv-sent-title" className="cv-h2">Requested</h2>
                  <ul className="cv-list">
                    {sent.map((r) => (
                      <Person key={r.connectionId} who={r}>
                        <div className="cv-actions">
                          <button type="button" className="cv-btn cv-btn-text" disabled={!!busy} onClick={() => act(`remove:${r.connectionId}`, { action: 'remove', id: r.connectionId }, { then: () => setFound(null) })}>Cancel request</button>
                        </div>
                      </Person>
                    ))}
                  </ul>
                </section>
              )}

              {/* 5. Invite a realtor: the link, and who joined through it. */}
              <InviteRealtor full />

              {/* 6. The realtor's own brokerage record. */}
              {form && (
                <section className="rl-card cv-card" aria-labelledby="cv-brokerage-title" data-circle-brokerage="">
                  <h2 id="cv-brokerage-title" className="t-d3" style={{ color: C.ink, margin: '0 0 var(--gap-line)' }}>Your brokerage</h2>
                  <p className="cv-quiet" style={{ margin: '0 0 var(--s-4)' }}>Shown on your card to realtors in your circle. Your broker of record confirms it by email.</p>
                  {data.brokerage ? <p className="cv-standing" data-brokerage-standing={data.brokerage.standing}>{(STANDING[data.brokerage.standing] || STANDING.sent)(data.brokerage)}</p> : null}
                  <form onSubmit={saveBrokerage}>
                    <Field id="cv-b-name" label="Legal name" value={form.legalName} onChange={(v) => setForm({ ...form, legalName: v })} autoComplete="organization" />
                    <Field id="cv-b-address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} autoComplete="street-address" />
                    <Field id="cv-b-phone" label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} autoComplete="tel" optional />
                    <Field id="cv-b-broker" label="Broker of record" value={form.brokerName} onChange={(v) => setForm({ ...form, brokerName: v })} autoComplete="off" />
                    <Field id="cv-b-email" label="Broker of record’s email" type="email" value={form.brokerEmail} onChange={(v) => setForm({ ...form, brokerEmail: v })} autoComplete="off" />
                    <Field id="cv-b-hst" label="HST number" value={form.hstNumber} onChange={(v) => setForm({ ...form, hstNumber: v })} autoComplete="off" optional />
                    <div className="cv-actions">
                      <button type="submit" className="cv-btn cv-btn-ink" disabled={!!busy}><Pending busy={busy === 'brokerage'} label="Saving">Save and email them</Pending></button>
                      {data.brokerage && data.brokerage.standing === 'sent' ? <button type="button" className="cv-btn cv-btn-line" disabled={!!busy} onClick={resend}><Pending busy={busy === 'resend'} label="Sending">Send again</Pending></button> : null}
                    </div>
                    {formNote ? <p role="status" className="cv-note" data-brokerage-note="">{formNote}</p> : null}
                  </form>
                </section>
              )}

              {/* 7. How this realtor appears to others. */}
              {me && (
                <section className="rl-card cv-card" aria-labelledby="cv-appear-title" data-circle-settings="">
                  <h2 id="cv-appear-title" className="t-d3" style={{ color: C.ink, margin: '0 0 var(--gap-line)' }}>How you appear</h2>
                  <p className="cv-quiet" style={{ margin: '0 0 var(--s-2)' }}>Search shows your name and brokerage. Nothing else.</p>
                  <Switch on={me.findable} busy={busy === 'findable'} label="Show me in search" data-circle-findable="" onChange={(v) => saveSetting('findable', { findable: v })} />
                  <Switch on={me.doesRentals === true} busy={busy === 'rentals'} label="I do rentals" onChange={(v) => saveSetting('rentals', { doesRentals: v })} />
                  <div className="cv-field" style={{ marginTop: 'var(--s-3)' }}>
                    <label htmlFor="cv-areas" className="cv-label">Areas you work in</label>
                    <input id="cv-areas" className="cv-input" type="text" value={areas} onChange={(e) => { setAreas(e.target.value); setAreasNote(''); }} autoComplete="off" />
                  </div>
                  <div className="cv-actions">
                    <button type="button" className="cv-btn cv-btn-line" disabled={!!busy} onClick={async () => { const ok = await saveSetting('areas', { serviceAreas: areas }); setAreasNote(ok ? 'Saved.' : ''); }}><Pending busy={busy === 'areas'} label="Saving">Save areas</Pending></button>
                  </div>
                  {areasNote ? <p role="status" className="cv-note">{areasNote}</p> : null}
                  {blocked.length > 0 && (
                    <div style={{ marginTop: 'var(--gap-section)' }} data-circle-blocked="">
                      <h3 className="cv-label" style={{ margin: 0 }}>Blocked</h3>
                      <ul className="cv-plain">
                        {blocked.map((b) => (
                          <li key={b.connectionId} className="cv-blocked">
                            <span className="cv-name" style={{ fontSize: 'var(--t-body-2)' }}>{b.name}</span>
                            <button type="button" className="cv-btn cv-btn-text" disabled={!!busy} onClick={() => act(`unblock:${b.connectionId}`, { action: 'unblock', id: b.connectionId })}>Unblock</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
            </Reveal>
          ) : null}
        </div>
        <ConfirmSheet open={!!ask} danger busy={!!busy} title={ask ? (ask.kind === 'block' ? 'Block this realtor?' : 'Remove from your circle?') : ''} body={ask ? (ask.kind === 'block' ? `${ask.name} leaves your circle and cannot send you requests. They are not told.` : `${ask.name} leaves your circle, and you leave theirs. They are not told.`) : ''} confirmLabel={ask && ask.kind === 'block' ? 'Block' : 'Remove'} cancelLabel="Keep" onConfirm={confirmAsk} onCancel={() => setAsk(null)} />
      </div>

      <style jsx>{`
        .cv :global(.cv-block) { margin-top: var(--gap-section); }
        .cv :global(.cv-card) { padding: var(--card-pad); margin-top: var(--gap-section); }
        .cv :global(.cv-h2) { display: flex; align-items: center; gap: var(--s-2); font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0 0 var(--s-3); }
        .cv :global(.cv-count) { font-family: var(--f-body, inherit); font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: 999px; padding: 2px var(--s-2); font-variant-numeric: tabular-nums; letter-spacing: 0; }
        .cv :global(.cv-list) { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
        .cv :global(.cv-plain) { list-style: none; margin: var(--gap-line) 0 0; padding: 0; }
        .cv :global(.cv-person) { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); padding: var(--card-pad); }
        .cv :global(.cv-who) { display: flex; align-items: center; gap: var(--s-3); min-width: 0; }
        .cv :global(.cv-avatar) { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; background: ${C.paperDeep}; border: 1px solid ${C.rule}; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 800; letter-spacing: 0.02em; }
        .cv :global(.cv-name) { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.3; overflow-wrap: anywhere; text-wrap: balance; }
        .cv :global(.cv-brok) { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.4; margin-top: 2px; overflow-wrap: anywhere; text-wrap: balance; }
        .cv :global(.cv-meta) { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: var(--s-2) 0 0; overflow-wrap: anywhere; text-wrap: balance; }
        .cv :global(.cv-record) { margin-top: var(--s-1); }
        .cv :global(.cv-record .cv-meta) { margin-top: 2px; }
        .cv :global(.cv-history) { margin-top: var(--s-3); }
        .cv :global(.cv-actions) { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); margin-top: var(--s-3); }
        .cv :global(.cv-btn) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-size: var(--t-body-2); font-weight: 700; font-family: inherit; cursor: pointer; text-decoration: none; white-space: nowrap; }
        .cv :global(.cv-btn:disabled) { cursor: default; opacity: 0.6; }
        .cv :global(.cv-btn-red) { background: ${C.red}; color: ${C.paper}; border: 1.5px solid ${C.red}; }
        .cv :global(.cv-btn-ink) { background: ${C.ink}; color: ${C.paper}; border: 1.5px solid ${C.ink}; }
        .cv :global(.cv-btn-line) { background: transparent; color: ${C.ink}; border: 1.5px solid ${C.ink}; }
        .cv :global(.cv-btn-text) { background: transparent; color: ${C.inkSoft}; border: none; padding: 0 var(--s-2); text-decoration: underline; }
        .cv :global(.cv-btn:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        .cv :global(.cv-in) { display: inline-flex; align-items: center; min-height: 44px; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; }
        .cv :global(.cv-label) { display: block; font-size: 11px; color: ${C.inkSoft}; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
        .cv :global(.cv-input) { display: block; width: 100%; box-sizing: border-box; min-height: 44px; padding: 0 12px; border: 1px solid ${C.rule}; border-radius: 12px; background: ${C.card}; color: ${C.ink}; font-family: inherit; font-size: 16px; }
        .cv :global(.cv-field) { margin-top: var(--s-3); }
        .cv :global(.cv-quiet) { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; text-wrap: balance; }
        .cv :global(.cv-note) { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); margin: var(--s-3) 0 0; text-wrap: balance; }
        .cv :global(.cv-standing) { font-size: var(--t-body-2); color: ${C.ink}; font-weight: 600; line-height: var(--lh-body); margin: 0; padding: var(--s-3); background: ${C.paperDeep}; border-radius: 12px; text-wrap: balance; }
        .cv :global(.cv-error) { font-size: var(--t-body-2); color: ${C.danger}; line-height: var(--lh-body); margin-top: var(--gap-card); text-wrap: balance; }
        .cv :global(.cv-invite) { margin-top: var(--gap-card); padding: var(--card-pad); background: ${C.card}; border: 1px solid ${C.rule}; border-radius: var(--card-radius); }
        .cv :global(.cv-invite-line) { font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; margin: 0 0 var(--s-3); text-wrap: balance; }
        .cv :global(.cv-sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .cv :global(.cv-switch) { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); width: 100%; min-height: 44px; padding: 0; margin-top: var(--s-2); background: transparent; border: none; border-radius: 12px; color: ${C.ink}; font-family: inherit; font-size: var(--t-body); font-weight: 600; text-align: left; cursor: pointer; }
        .cv :global(.cv-switch:focus-visible) { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.red}; }
        .cv :global(.cv-track) { position: relative; width: 48px; height: 28px; border-radius: 999px; background: ${C.ruleDark}; flex-shrink: 0; }
        .cv :global(.cv-track[data-on='1']) { background: ${C.ink}; }
        .cv :global(.cv-knob) { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: ${C.paper}; }
        .cv :global(.cv-track[data-on='1'] .cv-knob) { transform: translateX(20px); }
        .cv :global(.cv-blocked) { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 44px; }
        /* Below 345px a long name does not fit beside the initials: the initials stand above it,
           so the name keeps the card's width and reads on one line or two even ones. */
        @media (max-width: 344.98px) {
          .cv :global(.cv-who) { flex-direction: column; align-items: flex-start; gap: var(--s-2); }
          .cv :global(.cv-name) { font-size: 15px; }
        }
        @media (prefers-reduced-motion: no-preference) { .cv :global(.cv-knob) { transition: transform 160ms ease; } }
      `}</style>
    </>
  );
}
