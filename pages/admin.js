// pages/admin.js
// FOUNDER-ONLY internal dashboard. Password-gated (ADMIN_PASSWORD) with a 1-year HttpOnly/Strict
// session; every read + action is re-checked server-side in /api/admin/*. Shows realtor
// onboarding at a glance; lets the founder suspend or HARD-DELETE accounts. Tenants appear as
// one count — no tenant PII is ever sent to this page. Shell + styles: components/admin/AdminShell.
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { C, R } from '../components/theme';
import { Icon } from '../components/ui';
import { isAdmin } from '../lib/adminAuth';
import { adminFetch, waitForAdminSession } from '../components/admin/adminFetch';
import AdminShell, { Sheet, Info } from '../components/admin/AdminShell';

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
// "Previously #3 (Aug 26, 2026)" — the founder number history recorded on renumber.
const priorNumbers = (r) => (r.signupNumberHistory?.length ? `Previously ${r.signupNumberHistory.map((h) => `#${h.from} (until ${new Date(h.at).toLocaleDateString('en-CA', { dateStyle: 'medium' })})`).join(', ')}` : undefined);

const StatusPill = ({ r }) => (r.suspended ? <span className="ad-pill danger">Suspended</span> : r.active ? <span className="ad-pill green">Active</span> : <span className="ad-pill quiet">Quiet</span>);
const FounderPill = ({ r }) => (r.accountStatus === 'founder' ? (
  <span title={priorNumbers(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
    <span className="ad-pill green">Founder{r.signupNumber ? <span className="ad-num"> #{r.signupNumber}</span> : ''}</span>
    {r.signupNumberHistory?.length > 0 && <span className="ad-num" style={{ fontSize: 11, color: C.instMute, whiteSpace: 'nowrap' }}>was #{r.signupNumberHistory.map((h) => h.from).join(', #')}</span>}
  </span>
) : r.accountStatus === 'trial' ? <span className="ad-pill amber">Trial</span> : r.accountStatus === 'lapsed' ? <span className="ad-pill quiet">Lapsed</span> : null);

const COLS = [['email', 'Email'], ['name', 'Name'], ['brokerage', 'Brokerage'], ['province', 'Prov'], ['signupAt', 'Signed up'], ['listings', 'Listings'], ['applications', 'Applications'], ['lastActivity', 'Last activity'], ['active', 'Status']];

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
  const [auditOpen, setAuditOpen] = useState(false);

  const load = async () => {
    setErr('');
    const { r, j } = await adminFetch('/api/admin/overview'); // retries a 401 (session store catching up) and one 5xx/network failure
    if (r && r.status === 401) { setAuthed(false); return; }
    if (!r || !r.ok) { setErr(j.error || (r ? `Failed to load (${r.status}).` : 'Failed to load — no response.')); return; }
    setData(j);
  };
  useEffect(() => { if (authed) load(); }, [authed]);

  const login = async (e) => {
    e.preventDefault(); setBusy(true); setLoginErr('');
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setPw('');
    if (!r.ok) { setLoginErr(j.error || 'Sign-in failed.'); return; }
    // Complete the round-trip: the session is written to a replicating store, so wait until it
    // reads back before rendering anything that needs it (else the first fetch is told 401).
    setBusy(true); const ready = await waitForAdminSession(); setBusy(false);
    if (!ready) { setLoginErr('Signed in, but the session isn’t readable yet — try again in a moment.'); return; }
    // Sent here from another admin page (e.g. /admin/crm)? Go back there. Admin paths only.
    const next = typeof router.query.next === 'string' && /^\/admin(\/[a-z-]+)?$/.test(router.query.next) ? router.query.next : null;
    if (next && next !== '/admin') { router.replace(next); return; }
    setAuthed(true);
  };

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
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = data ? data.realtors.filter((r) => sel.has(r.id)) : [];

  const openAction = async (kind) => {
    if (!selected.length) return;
    setTyped({}); setOrphans(true);
    if (kind === 'delete') {
      setBusy(true);
      const { r, j } = await adminFetch('/api/admin/realtors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', ids: selected.map((s) => s.id) }) });
      setBusy(false);
      if (!r || !r.ok) { setErr(j.error || 'Preview failed.'); return; }
      setModal({ kind, preview: j });
    } else setModal({ kind, preview: { accounts: selected } });
  };
  const runAction = async () => {
    if (!modal) return;
    setBusy(true); setErr('');
    const body = { action: modal.kind, ids: modal.preview.accounts.map((a) => a.id) };
    if (modal.kind === 'delete') { body.confirmEmails = Object.values(typed); body.deleteOrphanApplications = orphans; }
    const { r, j } = await adminFetch('/api/admin/realtors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { retry5xx: 0 });
    setBusy(false);
    if (!r || !r.ok) { setErr(j.error || 'Action failed.'); return; }
    const res = j.result || j;
    const shifted = j.renumber?.shifts?.length;
    setToast(modal.kind === 'delete'
      ? `Deleted ${res.profiles} account${res.profiles === 1 ? '' : 's'} · ${res.listings} listings · ${res.junctionRows} links · ${res.applications} orphaned apps${shifted ? ` · ${shifted} founder${shifted === 1 ? '' : 's'} renumbered` : ''}${res.errors?.length ? ` · ${res.errors.length} step(s) errored (see audit)` : ''}`
      : `${modal.kind === 'suspend' ? 'Suspended' : 'Reinstated'} ${j.banned}${j.columnMissing ? ' (auth-layer only — run db/admin-suspend.sql)' : ''}`);
    setTimeout(() => setToast(''), 6000);
    setModal(null); setSel(new Set()); load();
  };
  const allTyped = modal?.kind === 'delete' && modal.preview.accounts.every((a) => a.email && String(typed[a.id] || '').trim().toLowerCase() === a.email.toLowerCase());

  if (!authed) {
    return (
      <AdminShell page="realtors" title="Sign in" signedIn={false}>
        <div className="ad-wrap" style={{ maxWidth: 440 }}>
          <div className="ad-eyebrow">Founder access</div>
          <h1 className="ad-h1" style={{ marginBottom: 18 }}>Sign in.</h1>
          <form onSubmit={login}>
            <input className="ad-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="Password" style={{ marginBottom: 12, minHeight: 50 }} autoFocus />
            {loginErr && <div role="alert" className="ad-alert" style={{ marginBottom: 12 }}><span>{loginErr}</span></div>}
            <button type="submit" className="ad-btn primary" disabled={busy || !pw} style={{ width: '100%', minHeight: 50 }}>{busy ? 'Checking…' : 'Sign in'}</button>
          </form>
        </div>
      </AdminShell>
    );
  }

  const c = data?.counts;
  const audit = data?.audit || [];
  return (
    <AdminShell page="realtors" title="Realtors">
      <div className="ad-wrap">
        <div className="ad-head">
          <div style={{ minWidth: 0 }}>
            <div className="ad-eyebrow">Realtors</div>
            <h1 className="ad-h1">{c ? <>{c.realtors} signed up, <span className="ad-num">{c.activeRealtors}</span> active.</> : 'Realtors.'}</h1>
          </div>
          <div className="ad-quiet" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data ? `As of ${new Date(data.generatedAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}` : 'Loading…'}
            <button type="button" className="ad-link" onClick={load}>Refresh</button>
          </div>
        </div>
        {err && <div role="alert" className="ad-alert" style={{ marginBottom: 14 }}><span>{err}</span>{!data && <button type="button" className="ad-btn secondary sm" onClick={load} disabled={busy}>Try again</button>}</div>}

        {c && (
          <div className="ad-stats">
            {[
              ['Active', c.activeRealtors, data.activeDefinition],
              ['Suspended', c.suspended, null],
              ['Listings', c.listings, null],
              ['Applications', c.applications, null],
            ].map(([l, v, info]) => (
              <div className="ad-stat" key={l}><div className="ad-stat-l">{l}{info && <Info text={`Active = ${info}.`} />}</div><div className="ad-stat-v ad-num">{v}</div></div>
            ))}
          </div>
        )}

        {data?.brokerages?.length > 0 && (
          <div className="ad-chips" aria-label="Brokerages with more than one realtor">
            {data.brokerages.map((b) => (
              <button key={b.name} type="button" className={`ad-chip ${q === b.name ? 'on' : ''}`} onClick={() => setQ(q === b.name ? '' : b.name)} title={`${b.realtors} realtors · ${b.active} active · ${b.listings} listings`}>
                {b.name} <span className="ad-num">{b.realtors}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
            <Icon name="search" size={16} color={C.instMute} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="ad-input" type="search" inputMode="search" autoCapitalize="none" autoCorrect="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, brokerage" aria-label="Search realtors" style={{ paddingLeft: 38 }} />
          </div>
          <span className="ad-quiet ad-num">{rows.length} of {data?.realtors?.length ?? 0}</span>
        </div>

        {/* ≥ 720px: a table (Email → Name → Brokerage; email is the only guaranteed field). */}
        <div className="ad-card ad-table-card">
          <table className="ad-table">
            <thead><tr>
              <th style={{ width: 40 }}><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...rows.map((r) => r.id)]) : new Set([...sel].filter((id) => !rows.some((r) => r.id === id))))} /></th>
              {COLS.map(([k, l]) => <th key={k}><button type="button" onClick={() => toggleSort(k)} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>{l}{sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={sel.has(r.id) ? 'sel' : ''}>
                  <td><input type="checkbox" aria-label={`Select ${r.email || r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="ad-mono" style={{ overflowWrap: 'anywhere' }}>{r.email || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{r.name || <span style={{ color: C.instMute, fontWeight: 500 }}>—</span>} <FounderPill r={r} /></td>
                  <td>{r.brokerage || '—'}</td>
                  <td>{r.province || '—'}</td>
                  <td className="ad-num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.signupAt)}</td>
                  <td className="ad-num">{r.listings}</td>
                  <td className="ad-num">{r.applications}</td>
                  <td className="ad-num" style={{ whiteSpace: 'nowrap' }} title={r.lastActivity || ''}>{ago(r.lastActivity)}</td>
                  <td><StatusPill r={r} /></td>
                </tr>
              ))}
              {data && rows.length === 0 && <tr><td colSpan={10} style={{ color: C.instMute, textAlign: 'center', padding: 24 }}>{data.realtors.length ? 'No realtors match that search.' : 'No realtors yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {/* < 720px: cards. */}
        <div className="ad-list">
          {rows.map((r) => (
            <label key={r.id} className={`ad-card ad-row ${sel.has(r.id) ? 'sel' : ''}`}>
              <input type="checkbox" aria-label={`Select ${r.email || r.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
              <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 4 }}>
                <div className="ad-mono" style={{ color: C.instText, fontSize: 13.5, overflowWrap: 'anywhere' }}>{r.email || '—'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{r.name || <span style={{ color: C.instMute, fontWeight: 500 }}>No name</span>}{r.brokerage ? <span style={{ color: C.instMute, fontWeight: 500 }}> · {r.brokerage}</span> : ''}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><StatusPill r={r} /><FounderPill r={r} /></div>
                <div className="ad-quiet ad-num" style={{ fontSize: 12.5 }}>{r.listings} listing{r.listings === 1 ? '' : 's'} · {r.applications} app{r.applications === 1 ? '' : 's'} · joined {fmtDate(r.signupAt)} · seen {ago(r.lastActivity)}</div>
              </div>
            </label>
          ))}
          {data && rows.length === 0 && <div className="ad-quiet" style={{ padding: '20px 0', textAlign: 'center' }}>{data.realtors.length ? 'No realtors match that search.' : 'No realtors yet.'}</div>}
        </div>

        {selected.length > 0 && (
          <div className="ad-bar" role="region" aria-label="Selected accounts">
            <span className="ad-num" style={{ fontSize: 13.5, fontWeight: 700, flex: '1 1 auto' }}>{selected.length} selected</span>
            <button type="button" className="ad-btn secondary sm" disabled={busy} onClick={() => openAction('suspend')}>Suspend</button>
            <button type="button" className="ad-btn secondary sm" disabled={busy} onClick={() => openAction('unsuspend')}>Reinstate</button>
            <button type="button" className="ad-btn danger sm" disabled={busy} onClick={() => openAction('delete')}>Delete…</button>
            <button type="button" className="ad-btn ghost sm" onClick={() => setSel(new Set())}>Clear</button>
          </div>
        )}

        {audit.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <button type="button" className="ad-disclose" aria-expanded={auditOpen} onClick={() => setAuditOpen((o) => !o)}>
              <span className="ad-eyebrow" style={{ marginBottom: 0 }}>Audit trail</span><span className="ad-num ad-quiet">{audit.length} {audit.length === 1 ? 'entry' : 'entries'}</span><Icon name="chevronD" size={16} color={C.instMute} style={{ marginLeft: 'auto', transform: auditOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
            {auditOpen && (
              <div className="ad-card" style={{ fontSize: 12.5, marginTop: 8 }}>
                {audit.slice(0, 40).map((a, i) => (
                  <div key={i} className="ad-audit-row" style={{ borderBottom: i < Math.min(audit.length, 40) - 1 ? `1px solid ${C.instRule}` : 'none' }}>
                    <span className="ad-mono ad-num" style={{ color: C.instMute, whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span style={{ fontWeight: 700, color: a.action === 'delete' ? C.instDangerText : C.instText }}>{a.action}</span>
                    {a.action === 'founder_renumber' && <span style={{ overflowWrap: 'anywhere', color: C.instMute }}>{(a.deleted || []).map((d) => `${d.email}${d.number ? ` (#${d.number})` : ''}`).join(', ')} deleted → {a.shifts?.length ? a.shifts.map((s) => `#${s.from}→#${s.to}`).join(', ') : 'no one shifted'}{a.historyColumnMissing ? ' · history column missing (db/founder-renumber.sql)' : ''}{a.errors?.length ? ` · ${a.errors.length} error(s)` : ''}</span>}
                    <span style={{ overflowWrap: 'anywhere', color: C.instMute }}>{a.accounts ? a.accounts.map((x) => x.email || x.id).join(', ') : a.ids ? `${a.ids.length} account(s)` : ''}{a.profiles != null ? ` · ${a.listings} listings, ${a.junctionRows} links, ${a.applications} orphaned apps` : ''}{a.errors?.length && a.action !== 'founder_renumber' ? ` · ${a.errors.length} error(s): ${a.errors.join('; ')}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {modal && (
        modal.kind === 'delete' ? (
          <Sheet eyebrow="Permanent deletion" title={`Delete ${modal.preview.accounts.length === 1 ? 'this account' : `${modal.preview.accounts.length} accounts`} and everything they own`} onClose={() => !busy && setModal(null)}
            footer={<><button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setModal(null)}>Cancel</button><button type="button" className="ad-btn danger" disabled={busy || !allTyped} onClick={runAction} style={{ marginLeft: 'auto' }}>{busy ? 'Deleting…' : `Delete ${modal.preview.accounts.length === 1 ? 'account' : `${modal.preview.accounts.length} accounts`}`}</button></>}>
            <div className="ad-alert" style={{ marginBottom: 14 }}>
              <span><strong>This cannot be undone.</strong> Removes {modal.preview.junctionRows} applicant link{modal.preview.junctionRows === 1 ? '' : 's'} (with decisions and verifications), {modal.preview.listings} listing{modal.preview.listings === 1 ? '' : 's'} and their invite links, the profile, logo and auth user.{modal.preview.applicationsSharedElsewhere ? ` ${modal.preview.applicationsSharedElsewhere} application${modal.preview.applicationsSharedElsewhere === 1 ? '' : 's'} also on other listings stay.` : ''}</span>
            </div>
            <div className="ad-well" style={{ overflow: 'hidden', marginBottom: 14 }}>
              {modal.preview.accounts.map((a, i) => (
                <div key={a.id} style={{ padding: '12px 12px', borderTop: i ? `1px solid ${C.instRule}` : 'none', display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}><span className="ad-mono" style={{ fontSize: 13 }}>{a.email || 'no email on auth user'}</span>{a.name ? <> · <strong>{a.name}</strong></> : ''}{a.brokerage ? ` · ${a.brokerage}` : ''}</div>
                  <input className="ad-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder={`Type ${a.email || 'the email'} to confirm`} value={typed[a.id] || ''} onChange={(e) => setTyped((t) => ({ ...t, [a.id]: e.target.value }))} autoComplete="off" spellCheck={false} />
                </div>
              ))}
            </div>
            <label className="ad-check" style={{ alignItems: 'flex-start', fontWeight: 500, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
              <input type="checkbox" checked={orphans} onChange={(e) => setOrphans(e.target.checked)} style={{ marginTop: 3, accentColor: C.instDanger }} />
              <span>Also delete the <strong className="ad-num">{modal.preview.applicationsOrphaned}</strong> application record{modal.preview.applicationsOrphaned === 1 ? '' : 's'} left linked to nothing. Tenants’ own profiles are untouched.</span>
            </label>
          </Sheet>
        ) : (
          <Sheet eyebrow={modal.kind === 'suspend' ? 'Suspend' : 'Reinstate'} title={`${modal.kind === 'suspend' ? 'Block sign-in for' : 'Restore access for'} ${modal.preview.accounts.length === 1 ? 'this account' : `${modal.preview.accounts.length} accounts`}`} onClose={() => !busy && setModal(null)}
            footer={<><button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setModal(null)}>Cancel</button><button type="button" className="ad-btn primary" disabled={busy} onClick={runAction} style={{ marginLeft: 'auto' }}>{busy ? 'Working…' : (modal.kind === 'suspend' ? 'Suspend' : 'Reinstate')}</button></>}>
            <p className="ad-quiet" style={{ fontSize: 14, color: C.instText, marginBottom: 12 }}>{modal.kind === 'suspend' ? 'Nothing is deleted. Their dashboard redirects to sign-in and new sign-ins are refused until you reinstate.' : 'Lifts the block; everything they had is still there.'}</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>{modal.preview.accounts.map((a) => <li key={a.id} style={{ overflowWrap: 'anywhere' }}><span className="ad-mono">{a.email || a.id}</span>{a.name ? ` · ${a.name}` : ''}</li>)}</ul>
          </Sheet>
        )
      )}
      {toast && <div role="status" className="ad-toast">{toast}</div>}

      <style jsx global>{`
        .ad-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
        .ad-stat { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 12px 14px; min-width: 0; }
        .ad-stat-l { font-size: 10.5px; color: ${C.instMute}; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; white-space: nowrap; }
        .ad-stat-v { font-size: clamp(22px, 5vw, 30px); font-weight: 800; color: ${C.instText}; letter-spacing: -0.02em; line-height: 1; }
        @media (max-width: 480px) { .ad-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .ad-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .ad-chip { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid ${C.instRule}; color: ${C.instText}; border-radius: ${R.pill}px; padding: 7px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; min-height: 36px; max-width: 100%; }
        .ad-chip > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ad-chip .ad-num { color: ${C.instMute}; }
        .ad-chip.on { background: ${C.instText}; color: ${C.inst}; border-color: ${C.instText}; }
        .ad-chip.on .ad-num { color: ${C.inst}; }
        .ad-table-card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ad-table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 900px; }
        .ad-table th { text-align: left; padding: 0; border-bottom: 1px solid ${C.instRule}; white-space: nowrap; }
        .ad-table th button { font: inherit; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.instMute}; font-weight: 700; padding: 12px 12px; background: transparent; border: none; cursor: pointer; width: 100%; text-align: left; min-height: 44px; }
        .ad-table th button[aria-sort] { color: ${C.instText}; }
        .ad-table td { padding: 10px 12px; border-bottom: 1px solid ${C.instRule}; vertical-align: middle; color: ${C.instText}; }
        .ad-table tr:last-child td { border-bottom: none; }
        .ad-table tr.sel td { background: rgba(255,90,95,0.08); }
        .ad-table input[type="checkbox"], .ad-row input[type="checkbox"] { width: 20px; height: 20px; accent-color: ${C.red}; }
        .ad-list { display: none; gap: 8px; }
        .ad-row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; cursor: pointer; }
        .ad-row input[type="checkbox"] { margin-top: 2px; flex-shrink: 0; }
        .ad-row.sel { border-color: ${C.redBright}; }
        @media (max-width: 719px) { .ad-table-card { display: none; } .ad-list { display: grid; } }
        .ad-bar { position: sticky; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 40; background: ${C.instText}; color: ${C.inst}; border-radius: ${R.card}px; padding: 10px 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; box-shadow: 0 -6px 24px rgba(0,0,0,0.4); }
        .ad-bar .ad-btn.secondary { color: ${C.inst}; border-color: rgba(16,16,18,0.35); }
        .ad-bar .ad-btn.ghost { color: rgba(16,16,18,0.7); }
        .ad-disclose { display: flex; align-items: center; gap: 10px; width: 100%; background: transparent; border: none; padding: 10px 0; cursor: pointer; text-align: left; min-height: 44px; }
        .ad-audit-row { padding: 10px 12px; display: flex; gap: 10px 12px; flex-wrap: wrap; color: ${C.instText}; }
      `}</style>
    </AdminShell>
  );
}
