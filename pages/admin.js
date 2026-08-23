// pages/admin.js
// FOUNDER-ONLY internal dashboard. Not a product surface. Password-gated (ADMIN_PASSWORD) with a
// 7-day HttpOnly/Strict session; every read + action is re-checked server-side in /api/admin/*.
// Shows realtor onboarding at a glance; lets the founder suspend or HARD-DELETE accounts.
// Tenants appear as one count — no tenant PII is ever sent to this page.
import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { C, R } from '../components/theme';
import { GlobalStyle, Wordmark, Icon } from '../components/ui';
import { useRouter } from 'next/router';
import { isAdmin } from '../lib/adminAuth';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  return { props: { authed: await isAdmin(req) } };
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
function ago(iso) {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30); return m < 12 ? `${m}mo ago` : `${Math.floor(m / 12)}y ago`;
}
const Eyebrow = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
    <span aria-hidden="true" style={{ width: 22, height: 2, background: C.red, borderRadius: 1 }} />
    <span style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span>
  </div>
);

export default function Admin({ authed: initialAuthed }) {
  const router = useRouter();
  const [authed, setAuthed] = useState(initialAuthed);
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'signupAt', dir: 'desc' });
  const [sel, setSel] = useState(new Set());
  const [modal, setModal] = useState(null); // { kind: 'delete'|'suspend'|'unsuspend', preview }
  const [typed, setTyped] = useState({});
  const [orphans, setOrphans] = useState(true);
  const [toast, setToast] = useState('');

  const load = async () => {
    setErr('');
    const r = await fetch('/api/admin/overview');
    if (r.status === 401) { setAuthed(false); return; }
    const j = await r.json();
    if (!r.ok) { setErr(j.error || 'Failed to load.'); return; }
    setData(j);
  };
  useEffect(() => { if (authed) load(); }, [authed]);

  const login = async (e) => {
    e.preventDefault(); setBusy(true); setLoginErr('');
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setPw('');
    if (!r.ok) { setLoginErr(j.error || 'Sign-in failed.'); return; }
    // Sent here from another admin page (e.g. /admin/crm)? Go back there. Admin paths only.
    const next = typeof router.query.next === 'string' && /^\/admin(\/[a-z-]+)?$/.test(router.query.next) ? router.query.next : null;
    if (next && next !== '/admin') { router.replace(next); return; }
    setAuthed(true);
  };
  const logout = async () => { await fetch('/api/admin/logout', { method: 'POST' }); setAuthed(false); setData(null); };

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    let list = data.realtors.filter((r) => !needle || [r.name, r.brokerage, r.email, r.province].some((v) => String(v || '').toLowerCase().includes(needle)));
    const { key, dir } = sort;
    list = [...list].sort((a, b) => {
      const av = a[key], bv = b[key];
      const cmp = typeof av === 'number' || typeof bv === 'number' ? (Number(av) || 0) - (Number(bv) || 0) : String(av || '').localeCompare(String(bv || ''));
      return dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, q, sort]);
  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = data ? data.realtors.filter((r) => sel.has(r.id)) : [];

  const openAction = async (kind) => {
    if (!selected.length) return;
    setTyped({}); setOrphans(true);
    if (kind === 'delete') {
      setBusy(true);
      const r = await fetch('/api/admin/realtors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', ids: selected.map((s) => s.id) }) });
      const j = await r.json(); setBusy(false);
      if (!r.ok) { setErr(j.error || 'Preview failed.'); return; }
      setModal({ kind, preview: j });
    } else setModal({ kind, preview: { accounts: selected } });
  };
  const runAction = async () => {
    if (!modal) return;
    setBusy(true); setErr('');
    const body = { action: modal.kind, ids: modal.preview.accounts.map((a) => a.id) };
    if (modal.kind === 'delete') { body.confirmEmails = Object.values(typed); body.deleteOrphanApplications = orphans; }
    const r = await fetch('/api/admin/realtors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || 'Action failed.'); return; }
    const res = j.result || j;
    setToast(modal.kind === 'delete'
      ? `Deleted ${res.profiles} account${res.profiles === 1 ? '' : 's'} · ${res.listings} listings · ${res.junctionRows} applicant links · ${res.applications} orphaned applications${res.errors?.length ? ` · ${res.errors.length} step(s) errored (see audit)` : ''}`
      : `${modal.kind === 'suspend' ? 'Suspended' : 'Reinstated'} ${j.banned}${j.columnMissing ? ' (auth-layer only — run db/admin-suspend.sql)' : ''}`);
    setTimeout(() => setToast(''), 6000);
    setModal(null); setSel(new Set()); load();
  };
  const allTyped = modal?.kind === 'delete' && modal.preview.accounts.every((a) => a.email && String(typed[a.id] || '').trim().toLowerCase() === a.email.toLowerCase());

  const shell = (children) => (
    <>
      <Head><title>Admin — Rentletter</title><meta name="robots" content="noindex, nofollow" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: '14px clamp(16px, 3vw, 28px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Wordmark /><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.paper, background: C.ink, padding: '3px 8px', borderRadius: R.pill }}>Admin</span>{authed && <nav className="ad-nav" aria-label="Admin"><a href="/admin" aria-current="page">Realtors</a><a href="/admin/crm">CRM</a><a href="/admin/mockups">Mockups</a></nav>}</div>
          {authed && <button onClick={logout} style={{ background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: R.pill, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: C.inkSoft }}>Sign out</button>}
        </header>
        {children}
        {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 300, background: C.ink, color: C.paper, padding: '12px 18px', borderRadius: R.pill, fontSize: 13.5, fontWeight: 600, maxWidth: '92vw', boxShadow: '0 8px 24px rgba(15,15,16,0.22)' }}>{toast}</div>}
      </div>
      <style jsx global>{`
        .ad-nav { display: flex; gap: 2px; margin-left: 6px; }
        .ad-nav a { font-size: 13px; font-weight: 600; color: ${C.inkSoft}; text-decoration: none; padding: 6px 10px; min-height: 32px; display: inline-flex; align-items: center; }
        .ad-nav a[aria-current="page"] { color: ${C.ink}; box-shadow: inset 0 -2px 0 ${C.red}; }
        @media (max-width: 480px) { .ad-nav a { padding: 6px 7px; font-size: 12.5px; } .ad-nav a[href="/admin/mockups"] { display: none; } }
        .ad-wrap { max-width: 1240px; margin: 0 auto; padding: clamp(20px, 3vw, 36px) clamp(16px, 3vw, 28px) 72px; }
        .ad-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 22px; }
        .ad-stat { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 14px 16px; min-width: 0; }
        .ad-stat-l { font-size: 10.5px; color: ${C.inkMute}; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
        .ad-stat-v { font-size: 30px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.02em; line-height: 1; font-variant-numeric: tabular-nums; }
        .ad-card { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; overflow: hidden; }
        .ad-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table.ad { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 860px; }
        table.ad th { text-align: left; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; font-weight: 700; padding: 10px 12px; border-bottom: 1px solid ${C.rule}; white-space: nowrap; cursor: pointer; user-select: none; background: ${C.paperDeep}; }
        table.ad td { padding: 10px 12px; border-bottom: 1px solid ${C.rule}; vertical-align: middle; color: ${C.ink}; }
        table.ad tr:last-child td { border-bottom: none; }
        table.ad tr.sel td { background: #fff7f7; }
        .ad-pill { font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: ${R.pill}px; white-space: nowrap; }
        .ad-btn { border: none; border-radius: ${R.ctrl}px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; min-height: 38px; }
        .ad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ad-input { width: 100%; padding: 11px 12px; font-size: 14px; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; background: ${C.card}; color: ${C.ink}; outline: none; }
        .ad-bar { position: sticky; bottom: 0; background: ${C.ink}; color: ${C.paper}; border-radius: ${R.card}px; padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; box-shadow: 0 -6px 20px rgba(15,15,16,0.12); }
      `}</style>
    </>
  );

  if (!authed) {
    return shell(
      <div className="ad-wrap" style={{ maxWidth: 440 }}>
        <Eyebrow>Founder access</Eyebrow>
        <h1 className="rl-serif" style={{ fontSize: 'clamp(28px, 5vw, 38px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.05, marginBottom: 18, textWrap: 'balance' }}>Admin sign-in</h1>
        <form onSubmit={login}>
          <input className="ad-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="Password" style={{ marginBottom: 12, padding: 14 }} />
          {loginErr && <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13 }}>{loginErr}</div>}
          <button type="submit" className="ad-btn" disabled={busy || !pw} style={{ width: '100%', background: C.ink, color: C.paper, minHeight: 48 }}>{busy ? 'Checking…' : 'Sign in'}</button>
        </form>
        <p style={{ marginTop: 14, fontSize: 12, color: C.inkMute, lineHeight: 1.5 }}>Five attempts per 15 minutes. Sessions last 7 days.</p>
      </div>
    );
  }

  const c = data?.counts;
  return shell(
    <div className="ad-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Eyebrow>Onboarding</Eyebrow>
          <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 4vw, 36px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.05 }}>Realtors, this morning.</h1>
        </div>
        <div style={{ fontSize: 12, color: C.inkMute }}>{data ? `As of ${new Date(data.generatedAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'} · <button onClick={load} style={{ background: 'transparent', border: 'none', color: C.red, fontWeight: 700, cursor: 'pointer', fontSize: 12, padding: 0 }}>Refresh</button></div>
      </div>
      {err && <div role="alert" style={{ marginBottom: 14, padding: '10px 12px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13 }}>{err}</div>}

      {c && (
        <>
          <div className="ad-stats">
            {[['Realtors', c.realtors], ['Active realtors', c.activeRealtors], ['Suspended', c.suspended], ['Listings', c.listings], ['Applications', c.applications], ['Tenants', c.tenants ?? '—']].map(([l, v]) => (
              <div className="ad-stat" key={l}><div className="ad-stat-l">{l}</div><div className="ad-stat-v">{v}</div></div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: C.inkMute, marginTop: -12, marginBottom: 22, lineHeight: 1.5 }}>
            <strong style={{ color: C.inkSoft }}>Active</strong> = {data.activeDefinition}. <strong style={{ color: C.inkSoft }}>Tenants</strong> = {c.tenantsBasis} — count only; no tenant data is shown here.
          </p>
        </>
      )}

      {data?.brokerages?.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Eyebrow>Brokerages with more than one realtor</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {data.brokerages.map((b) => (
              <button key={b.name} onClick={() => setQ(b.name)} className="ad-card" style={{ textAlign: 'left', padding: '12px 14px', cursor: 'pointer', border: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 4, overflowWrap: 'anywhere' }}>{b.name}</div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>{b.realtors} realtors · {b.active} active · {b.listings} listings · {b.applications} applications</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="ad-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brokerage, email, province…" style={{ flex: '1 1 260px', minWidth: 0 }} />
        <span style={{ fontSize: 12, color: C.inkMute }}>{rows.length} of {data?.realtors?.length ?? 0}</span>
      </div>
      <div className="ad-card">
        <div className="ad-tablewrap">
          <table className="ad">
            <thead><tr>
              <th style={{ cursor: 'default', width: 36 }}><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...rows.map((r) => r.id)]) : new Set([...sel].filter((id) => !rows.some((r) => r.id === id))))} /></th>
              {[['name', 'Name'], ['brokerage', 'Brokerage'], ['email', 'Email'], ['province', 'Prov'], ['signupAt', 'Signed up'], ['listings', 'Listings'], ['applications', 'Applications'], ['lastActivity', 'Last activity'], ['active', 'Status']].map(([k, l]) => (
                <th key={k} onClick={() => toggleSort(k)}>{l}{sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={sel.has(r.id) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${r.email || r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td style={{ fontWeight: 700 }}>{r.name || <span style={{ color: C.inkMute, fontWeight: 500 }}>—</span>}{r.accountStatus === 'founder' && <span className="ad-pill" style={{ marginLeft: 6, color: C.green, background: C.greenTint }}>Founder{r.signupNumber ? ` #${r.signupNumber}` : ''}</span>}</td>
                  <td>{r.brokerage || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.email || '—'}</td>
                  <td>{r.province || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.signupAt)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.listings}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.applications}</td>
                  <td style={{ whiteSpace: 'nowrap' }} title={r.lastActivity || ''}>{ago(r.lastActivity)}</td>
                  <td>{r.suspended ? <span className="ad-pill" style={{ color: C.paper, background: C.danger }}>Suspended</span> : r.active ? <span className="ad-pill" style={{ color: C.green, background: C.greenTint }}>Active</span> : <span className="ad-pill" style={{ color: C.inkMute, background: C.paperDeep }}>Quiet</span>}</td>
                </tr>
              ))}
              {data && rows.length === 0 && <tr><td colSpan={10} style={{ color: C.inkMute, textAlign: 'center', padding: 24 }}>{data.realtors.length ? 'No realtors match that search.' : 'No realtors yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="ad-bar">
          <span style={{ fontSize: 13, fontWeight: 700, flex: '1 1 auto' }}>{selected.length} selected</span>
          <button className="ad-btn" disabled={busy} onClick={() => openAction('suspend')} style={{ background: '#2a2a2e', color: C.paper }}>Suspend</button>
          <button className="ad-btn" disabled={busy} onClick={() => openAction('unsuspend')} style={{ background: '#2a2a2e', color: C.paper }}>Reinstate</button>
          <button className="ad-btn" disabled={busy} onClick={() => openAction('delete')} style={{ background: C.danger, color: C.paper }}>Delete permanently…</button>
          <button className="ad-btn" onClick={() => setSel(new Set())} style={{ background: 'transparent', color: '#c8c2b3', border: '1px solid #3a3a3e' }}>Clear</button>
        </div>
      )}

      {data?.audit?.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow>Admin audit trail</Eyebrow>
          <div className="ad-card" style={{ fontSize: 12.5 }}>
            {data.audit.slice(0, 20).map((a, i) => (
              <div key={i} style={{ padding: '8px 12px', borderBottom: i < Math.min(data.audit.length, 20) - 1 ? `1px solid ${C.rule}` : 'none', display: 'flex', gap: 12, flexWrap: 'wrap', color: C.inkSoft }}>
                <span style={{ fontFamily: 'monospace', color: C.inkMute, whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span style={{ fontWeight: 700, color: a.action === 'delete' ? C.danger : C.ink }}>{a.action}</span>
                <span style={{ overflowWrap: 'anywhere' }}>{a.accounts ? a.accounts.map((x) => x.email || x.id).join(', ') : a.ids ? `${a.ids.length} account(s)` : ''}{a.profiles != null ? ` · ${a.listings} listings, ${a.junctionRows} links, ${a.applications} orphaned apps` : ''}{a.errors?.length ? ` · errors: ${a.errors.join('; ')}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div onClick={() => !busy && setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200 }}>
          <div onClick={(e) => e.stopPropagation()} className="rl-modal" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 'clamp(18px, 3vw, 26px)' }}>
            {modal.kind === 'delete' ? (
              <>
                <div style={{ fontSize: 11, color: C.danger, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Permanent deletion</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 10 }}>Delete {modal.preview.accounts.length === 1 ? 'this account' : `${modal.preview.accounts.length} accounts`} and everything they own</h2>
                <div style={{ padding: '12px 14px', background: C.dangerTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink, lineHeight: 1.55, marginBottom: 14 }}>
                  <strong>This cannot be undone.</strong> It removes, in order: {modal.preview.junctionRows} applicant link{modal.preview.junctionRows === 1 ? '' : 's'} (with any decisions and document verifications on them), {modal.preview.listings} listing{modal.preview.listings === 1 ? '' : 's'} and their invite links, the profile{modal.preview.accounts.length === 1 ? '' : 's'}, brand assets, and the sign-in{modal.preview.accounts.length === 1 ? '' : 's'}. Applications linked to <em>other</em> realtors' listings ({modal.preview.applicationsSharedElsewhere}) and tenant profiles are never touched.
                </div>
                <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.ctrl, overflow: 'hidden', marginBottom: 14 }}>
                  {modal.preview.accounts.map((a, i) => (
                    <div key={a.id} style={{ padding: '10px 12px', borderTop: i ? `1px solid ${C.rule}` : 'none', display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: 13 }}><strong>{a.name || 'Unnamed'}</strong>{a.brokerage ? ` · ${a.brokerage}` : ''} · <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.email || 'no email on auth user'}</span></div>
                      <input className="ad-input" placeholder={`Type ${a.email || 'the email'} to confirm`} value={typed[a.id] || ''} onChange={(e) => setTyped((t) => ({ ...t, [a.id]: e.target.value }))} autoComplete="off" spellCheck={false} style={{ padding: '9px 10px', fontFamily: 'monospace', fontSize: 13, borderColor: typed[a.id] && a.email && typed[a.id].trim().toLowerCase() === a.email.toLowerCase() ? C.green : C.ruleDark }} />
                    </div>
                  ))}
                </div>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 16, cursor: 'pointer' }}>
                  <input type="checkbox" checked={orphans} onChange={(e) => setOrphans(e.target.checked)} style={{ marginTop: 3, accentColor: C.danger }} />
                  <span>Also delete the <strong>{modal.preview.applicationsOrphaned}</strong> application record{modal.preview.applicationsOrphaned === 1 ? '' : 's'} that would be left linked to nothing (test submissions). The tenants' own copies (KV snapshots, profiles) are kept either way.</span>
                </label>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="ad-btn" disabled={busy} onClick={() => setModal(null)} style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}` }}>Cancel</button>
                  <button className="ad-btn" disabled={busy || !allTyped} onClick={runAction} style={{ background: C.danger, color: C.paper }}>{busy ? 'Deleting…' : `Delete ${modal.preview.accounts.length === 1 ? 'account' : `${modal.preview.accounts.length} accounts`} permanently`}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.red, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{modal.kind === 'suspend' ? 'Suspend' : 'Reinstate'}</div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 10 }}>{modal.kind === 'suspend' ? 'Block sign-in for' : 'Restore access for'} {modal.preview.accounts.length} account{modal.preview.accounts.length === 1 ? '' : 's'}?</h2>
                <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>{modal.kind === 'suspend' ? 'Nothing is deleted. Their dashboard redirects to sign-in and new sign-ins are refused until you reinstate.' : 'Lifts the sign-in ban and clears the suspended flag.'}</p>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13, color: C.ink, lineHeight: 1.6 }}>{modal.preview.accounts.map((a) => <li key={a.id}>{a.name || 'Unnamed'} · <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.email}</span></li>)}</ul>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="ad-btn" disabled={busy} onClick={() => setModal(null)} style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}` }}>Cancel</button>
                  <button className="ad-btn" disabled={busy} onClick={runAction} style={{ background: C.ink, color: C.paper }}>{busy ? 'Working…' : (modal.kind === 'suspend' ? 'Suspend' : 'Reinstate')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
