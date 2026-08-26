// pages/admin/promos.js — FOUNDER-ONLY. Mint personal promo codes, send the link, see who
// redeemed. Same admin session, shell and ink treatment as /admin/crm. Every write goes through
// /api/admin/promos (service role); the database enforces the 10-active-lifetime cap and the
// one-code-per-profile rule — this page just shows those refusals as a plain sentence.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { C, R } from '../../components/theme';
import { Icon, ConfirmSheet } from '../../components/ui';
import { isAdmin } from '../../lib/adminAuth';
import { adminFetch } from '../../components/admin/adminFetch';
import AdminShell, { Sheet } from '../../components/admin/AdminShell';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin?next=/admin/promos', permanent: false } };
  return { props: {} };
}

const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const suggest = (name) => { const first = String(name || '').trim().split(/\s+/)[0] || ''; const slug = first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); return slug ? `rentletter-${slug}` : ''; };
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const grantText = (c) => (c.grant_type === 'lifetime' ? 'Lifetime' : `${c.trial_days}-day trial`);

export default function Promos() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | migration | error | signedout
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [revoke, setRevoke] = useState(null); // code row
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://rentletter.ca';

  const load = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    const { r, j } = await adminFetch('/api/admin/promos');
    if (r && r.status === 401) { setState('signedout'); return; }
    if (!r || !r.ok) { setErr(j.error || 'Could not load.'); setState('error'); return; }
    if (j.migrationMissing) { setState('migration'); return; }
    setData(j); setState('ready');
  }, []);
  useEffect(() => { load(); }, [load]);
  const post = async (body) => { const { r, j } = await adminFetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { retry5xx: 0 }); if (r && r.status === 401) { setState('signedout'); return { error: 'Signed out.' }; } if (!r || !r.ok) return { error: j.error || 'That didn’t save.' }; return j; };

  const codes = data?.codes || [];
  const lifetimeActive = data?.lifetimeActive ?? 0; const cap = data?.cap ?? 10;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); say('Link copied.'); } catch (e) { say('Could not copy — long-press the link instead.'); } };
  const doRevoke = async () => { if (!revoke) return; setBusy(true); const r = await post({ action: 'revoke', id: revoke.id }); setBusy(false); if (r.error) { say(r.error); return; } setData((d) => ({ ...d, codes: d.codes.map((c) => (c.id === r.code.id ? { ...c, ...r.code } : c)), lifetimeActive: d.codes.filter((c) => c.id !== r.code.id && c.active && c.grant_type === 'lifetime').length })); setRevoke(null); say(`${r.code.code} revoked. Anyone who already redeemed keeps their access.`); };

  return (
    <AdminShell page="promos" title="Promos" right={<button type="button" className="ad-btn primary sm" onClick={() => setCreating(true)} disabled={state !== 'ready'} aria-label="New code"><Icon name="plus" size={15} /><span className="pr-new-l">New code</span></button>}>
      <main className="ad-wrap">
        <div className="ad-head">
          <div style={{ minWidth: 0 }}>
            <div className="ad-eyebrow">Promo codes</div>
            <h1 className="ad-h1">{state === 'ready' ? <>Lifetime codes: <span className="ad-num">{lifetimeActive} of {cap}</span> used.</> : 'Promo codes.'}</h1>
          </div>
          {state === 'ready' && <span className="ad-quiet ad-num">{codes.length} code{codes.length === 1 ? '' : 's'} · {codes.reduce((n, c) => n + c.redemption_count, 0)} redeemed</span>}
        </div>

        {state === 'loading' && <p className="ad-quiet">Loading…</p>}
        {state === 'signedout' && <div className="ad-card pr-state"><div className="ad-eyebrow">Signed out</div><p>Your admin session ended.</p><a className="ad-btn primary" href="/admin?next=/admin/promos">Sign in again</a></div>}
        {state === 'error' && <div className="ad-card pr-state" role="alert"><div className="ad-eyebrow" style={{ color: C.instDangerText }}>Couldn’t load</div><p>{err}</p><button type="button" className="ad-btn secondary" onClick={load}>Try again</button></div>}
        {state === 'migration' && <div className="ad-card pr-state"><div className="ad-eyebrow">One step first</div><h2 className="ad-h2" style={{ marginBottom: 8 }}>The promo tables don’t exist yet.</h2><p>Run <code>db/billing-and-promos.sql</code> in the Supabase SQL editor once, then reload.</p><button type="button" className="ad-btn secondary" onClick={load}>I ran it — reload</button></div>}

        {state === 'ready' && (codes.length ? (
          <ul className="pr-list">
            {codes.map((c) => { const open = openId === c.id; const spent = c.redemption_count >= c.max_redemptions; const url = `${origin}/join/${c.code}`; return (
              <li key={c.id} className={`ad-card pr-row ${c.active ? '' : 'off'}`}>
                <button type="button" className="pr-main" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)}>
                  <span className="pr-code ad-mono">{c.code}</span>
                  <span className="pr-label">{c.label || c.recipient_name || <span style={{ color: C.instMute }}>No label</span>}</span>
                  <span className="pr-meta">
                    <span className={`ad-pill ${c.grant_type === 'lifetime' ? 'green' : 'amber'}`}>{grantText(c)}</span>
                    <span className="ad-num pr-count">{c.redemption_count} / {c.max_redemptions}</span>
                    {!c.active ? <span className="ad-pill quiet">Revoked</span> : spent ? <span className="ad-pill quiet">Used up</span> : <span className="ad-pill red">Live</span>}
                    <span className="ad-quiet ad-num pr-date">{fmt(c.created_at)}</span>
                  </span>
                  <Icon name="chevronD" size={16} color={C.instMute} style={{ transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
                </button>
                {open && (
                  <div className="pr-detail">
                    <div className="ad-f-l" style={{ marginBottom: 6 }}>Join link</div>
                    <div className="pr-url">
                      <span className="ad-mono" style={{ overflowWrap: 'anywhere', flex: 1, minWidth: 0 }}>{url}</span>
                      <button type="button" className="ad-btn secondary sm" onClick={() => copy(url)}><Icon name="copy" size={13} /> Copy</button>
                    </div>
                    <div className="ad-f-l" style={{ margin: '14px 0 6px' }}>Redeemed by</div>
                    {c.redemptions.length ? (
                      <ul className="pr-reds">{c.redemptions.map((r) => <li key={r.profileId}><span className="ad-tick" aria-hidden="true" /><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{r.name || 'No name yet'}</strong>{r.email ? <span className="ad-mono" style={{ color: C.instMute }}> · {r.email}</span> : ''}</span><span className="ad-quiet ad-num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtStamp(r.redeemedAt)}</span></li>)}</ul>
                    ) : <p className="ad-quiet">Nobody yet.</p>}
                    {c.note && <p className="ad-quiet" style={{ marginTop: 12 }}>{c.note}</p>}
                    {c.active && <div style={{ marginTop: 14 }}><button type="button" className="ad-btn ghost sm" style={{ color: C.instDangerText }} onClick={() => setRevoke(c)}>Revoke code</button></div>}
                  </div>
                )}
              </li>
            ); })}
          </ul>
        ) : (
          <div className="ad-card pr-state"><div className="ad-eyebrow">No codes yet</div><h2 className="ad-h2" style={{ marginBottom: 8 }}>Mint one with someone’s name on it.</h2><button type="button" className="ad-btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New code</button></div>
        ))}
      </main>

      {creating && <CreateSheet cap={cap} lifetimeActive={lifetimeActive} post={post} onClose={() => setCreating(false)} onCreated={(code) => { setData((d) => ({ ...d, codes: [code, ...d.codes], lifetimeActive: d.lifetimeActive + (code.active && code.grant_type === 'lifetime' ? 1 : 0) })); setCreating(false); setOpenId(code.id); say(`${code.code} created.`); }} />}
      <ConfirmSheet open={!!revoke} title={revoke ? `Revoke ${revoke.code}?` : ''} body="The link stops working for anyone who hasn’t used it yet. Anyone who already redeemed keeps their access." confirmLabel="Revoke" danger busy={busy} onConfirm={doRevoke} onCancel={() => !busy && setRevoke(null)} />
      {toast && <div role="status" className="ad-toast">{toast}</div>}

      <style jsx global>{`
        @media (max-width: 719px) { .pr-new-l { display: none; } .ad-top-r .ad-btn.primary.sm { width: 40px; padding: 0; min-height: 40px; border-radius: 50%; } }
        .pr-state { padding: clamp(18px, 4vw, 28px); max-width: 560px; }
        .pr-state p { font-size: 14px; color: ${C.instMute}; line-height: 1.6; margin-bottom: 16px; text-wrap: pretty; }
        .pr-state code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: ${C.inst}; padding: 2px 6px; border-radius: 4px; color: ${C.instText}; }
        .pr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .pr-row.off { opacity: 0.6; }
        .pr-main { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'code chev' 'label chev' 'meta chev'; gap: 4px 10px; align-items: center; width: 100%; text-align: left; background: transparent; border: none; color: ${C.instText}; font: inherit; padding: 12px 14px; cursor: pointer; min-height: 56px; }
        .pr-main > svg { grid-area: chev; }
        .pr-code { grid-area: code; font-size: 14px; font-weight: 700; color: ${C.instText}; }
        .pr-label { grid-area: label; font-size: 13.5px; color: ${C.instMute}; overflow-wrap: anywhere; }
        .pr-meta { grid-area: meta; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
        .pr-count { font-size: 13px; font-weight: 700; }
        .pr-date { font-size: 12px; }
        @media (min-width: 720px) { .pr-main { grid-template-columns: 200px minmax(0, 1fr) auto auto; grid-template-areas: 'code label meta chev'; gap: 12px; } .pr-meta { margin-top: 0; justify-content: flex-end; } }
        .pr-detail { border-top: 1px solid ${C.instRule}; padding: 12px 14px 14px; }
        .pr-url { display: flex; align-items: center; gap: 10px; background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; padding: 8px 8px 8px 12px; font-size: 13.5px; }
        .pr-reds { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .pr-reds li { display: flex; align-items: center; gap: 10px; font-size: 14px; min-width: 0; }
        .pr-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .pr-form .span { grid-column: 1 / -1; }
        @media (max-width: 719px) { .pr-form { grid-template-columns: 1fr; } }
        .pr-check { font-size: 12.5px; margin-top: 4px; min-height: 18px; }
      `}</style>
    </AdminShell>
  );
}

function CreateSheet({ cap, lifetimeActive, post, onClose, onCreated }) {
  const [f, setF] = useState({ label: '', recipientName: '', grantType: 'trial', trialDays: '30', maxRedemptions: '1', note: '', code: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const [check, setCheck] = useState({ code: '', state: 'idle' }); // idle | checking | free | taken | bad
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const firstRef = useRef(null);
  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 60); }, []);
  const code = codeTouched ? f.code : suggest(f.recipientName);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  // Live uniqueness check, debounced.
  useEffect(() => {
    const c = String(code || '').trim().toLowerCase();
    if (!c) { setCheck({ code: c, state: 'idle' }); return undefined; }
    if (!CODE_RE.test(c)) { setCheck({ code: c, state: 'bad' }); return undefined; }
    setCheck({ code: c, state: 'checking' });
    const t = setTimeout(async () => { const r = await post({ action: 'check', code: c }); setCheck((cur) => (cur.code === c ? { code: c, state: r.error ? 'idle' : r.available ? 'free' : 'taken' } : cur)); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const lifetimeFull = f.grantType === 'lifetime' && lifetimeActive >= cap;
  const canSave = check.state === 'free' && !busy;
  const save = async (e) => { e.preventDefault(); if (!canSave) return; setBusy(true); setErr(''); const r = await post({ action: 'create', ...f, code, trialDays: Number(f.trialDays), maxRedemptions: Number(f.maxRedemptions) }); setBusy(false); if (r.error) { setErr(r.error); return; } onCreated(r.code); };
  const checkText = { idle: '', checking: 'Checking…', free: 'Available.', taken: 'Already taken.', bad: 'Lowercase letters, numbers and single dashes.' }[check.state];
  return (
    <Sheet eyebrow="New code" title="Who is this for?" onClose={onClose}
      footer={<><button type="submit" form="pr-create" className="ad-btn primary" disabled={!canSave}>{busy ? 'Creating…' : 'Create code'}</button>{err && <span role="alert" style={{ fontSize: 13, color: C.instDangerText, flex: '1 1 200px' }}>{err}</span>}</>}>
      <form id="pr-create" onSubmit={save} className="pr-form">
        <label className="ad-f span"><span className="ad-f-l">Recipient name</span><input ref={firstRef} className="ad-input" value={f.recipientName} onChange={set('recipientName')} placeholder="Alex Moreau" autoCapitalize="words" autoComplete="off" enterKeyHint="next" /></label>
        <label className="ad-f span"><span className="ad-f-l">Label (what you see)</span><input className="ad-input" value={f.label} onChange={set('label')} placeholder="Alex Moreau, Right at Home" autoCapitalize="words" autoComplete="off" /></label>
        <label className="ad-f span"><span className="ad-f-l">Code</span>
          <input className="ad-input ad-mono" style={{ fontSize: 16 }} value={code} onChange={(e) => { setCodeTouched(true); setF((x) => ({ ...x, code: e.target.value.toLowerCase() })); }} placeholder="rentletter-alex" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" inputMode="url" />
          <span className="pr-check" style={{ color: check.state === 'free' ? C.instGreen : check.state === 'taken' || check.state === 'bad' ? C.instDangerText : C.instMute }}>{checkText}</span>
        </label>
        <div className="ad-f span">
          <span className="ad-f-l">Grant</span>
          <div className="ad-seg" role="tablist" aria-label="Grant type" style={{ alignSelf: 'flex-start' }}>
            {[['trial', 'Trial'], ['lifetime', 'Lifetime']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={f.grantType === k} className={f.grantType === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, grantType: k }))}>{l}</button>)}
          </div>
          {f.grantType === 'lifetime' && <span className="ad-quiet ad-num" style={{ fontSize: 12.5 }}>{lifetimeFull ? `All ${cap} lifetime codes are in use — revoke one first.` : `${lifetimeActive} of ${cap} lifetime codes used.`}</span>}
        </div>
        {f.grantType === 'trial' && <label className="ad-f"><span className="ad-f-l">Trial days</span><input className="ad-input" type="number" inputMode="numeric" min={1} max={365} value={f.trialDays} onChange={set('trialDays')} /></label>}
        <label className="ad-f"><span className="ad-f-l">Max redemptions</span><input className="ad-input" type="number" inputMode="numeric" min={1} value={f.maxRedemptions} onChange={set('maxRedemptions')} /></label>
        <label className="ad-f span"><span className="ad-f-l">Note</span><textarea className="ad-input" rows={2} value={f.note} onChange={set('note')} placeholder="Optional" /></label>
      </form>
    </Sheet>
  );
}
