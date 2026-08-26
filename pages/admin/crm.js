// pages/admin/crm.js
// FOUNDER-ONLY personal CRM — the morning operating surface. Same admin session as /admin
// (server-checked; unauthenticated visits are sent to the /admin sign-in and back). Board
// (drag-and-drop pipeline) is the primary view; Calendar and Brokerages are a toggle away.
// All data lives in founder-only tables (db/crm.sql) behind /api/admin/crm.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { C, R, SH } from '../../components/theme';
import { GlobalStyle, Wordmark, Icon } from '../../components/ui';
import { isAdmin } from '../../lib/adminAuth';
import { adminFetch } from '../../components/admin/adminFetch';
import Board from '../../components/crm/Board';
import Calendar from '../../components/crm/Calendar';
import Morning from '../../components/crm/Morning';
import { LeadDrawer, BrokerageDrawer } from '../../components/crm/Drawers';
import { STAGE, leadStatus, moveTsToDay, CLOSED } from '../../components/crm/model';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin?next=/admin/crm', permanent: false } };
  return { props: {} };
}

const VIEWS = [{ key: 'board', label: 'Board' }, { key: 'calendar', label: 'Calendar' }, { key: 'brokerages', label: 'Brokerages' }];

export default function Crm() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | migration | error | signedout
  const [err, setErr] = useState('');
  const [view, setView] = useState('board');
  const [open, setOpen] = useState(null); // { kind: 'lead', id } | { kind: 'new', stage, brokerage } | { kind: 'brokerage', id }
  const [toast, setToast] = useState('');
  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const api = useCallback(async (body) => {
    const r = await fetch('/api/admin/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { setState('signedout'); return { error: 'Signed out.' }; }
    if (j.code === 'migration_missing') { setState('migration'); return { error: j.error }; }
    if (!r.ok) return { error: j.error || 'That didn’t save.' };
    return j;
  }, []);
  const load = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    const { r, j } = await adminFetch('/api/admin/crm'); // retries a 401 (session store catching up) and one 5xx/network failure
    if (r && r.status === 401) { setState('signedout'); return; }
    if (j.code === 'migration_missing') { setState('migration'); return; }
    if (!r || !r.ok) { setErr(j.error || (r ? `Could not load (${r.status}).` : 'Could not load — no response.')); setState('error'); return; }
    setData(j); setState('ready');
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { const v = localStorage.getItem('rl_crm_view'); if (VIEWS.some((x) => x.key === v)) setView(v); } catch (e) { /* ignore */ } }, []);
  const pickView = (v) => { setView(v); try { localStorage.setItem('rl_crm_view', v); } catch (e) { /* ignore */ } };

  const brokeragesById = useMemo(() => Object.fromEntries((data?.brokerages || []).map((b) => [b.id, b])), [data]);
  const leads = data?.leads || [];
  const patchLead = (lead) => setData((d) => ({ ...d, leads: d.leads.some((l) => l.id === lead.id) ? d.leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...d.leads] }));

  // ── writes: optimistic where the UI is the source of truth (stage moves, reschedules) ──
  const moveStage = async (id, stage) => {
    const before = leads.find((l) => l.id === id); if (!before || before.stage === stage) return;
    patchLead({ ...before, stage, stage_changed_at: new Date().toISOString() });
    const r = await api({ action: 'save_lead', id, stage });
    if (r.error) { patchLead(before); say(r.error); } else { patchLead(r.lead); say(`${before.name} → ${STAGE[stage].label}`); }
  };
  const reschedule = async (id, kind, day) => {
    const before = leads.find((l) => l.id === id); if (!before) return;
    const patch = kind === 'demo' ? { demo_at: moveTsToDay(before.demo_at, day) } : { follow_up_at: day };
    patchLead({ ...before, ...patch });
    const r = await api({ action: 'save_lead', id, ...patch });
    if (r.error) { patchLead(before); say(r.error); } else { patchLead(r.lead); say(`${before.name}: ${kind === 'demo' ? 'demo' : 'follow-up'} moved.`); }
  };
  const saveLead = async (body) => {
    const r = await api({ action: 'save_lead', ...body }); if (r.error) return r;
    // a new brokerage may have been created server-side
    if (r.lead.brokerage_id && !brokeragesById[r.lead.brokerage_id]) await load(); else patchLead(r.lead);
    if (!body.id) { setOpen({ kind: 'lead', id: r.lead.id }); say('Lead added.'); }
    return r;
  };
  const deleteLead = async (id) => { const r = await api({ action: 'delete_lead', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, leads: d.leads.filter((l) => l.id !== id), notes: d.notes.filter((n) => n.lead_id !== id) })); setOpen(null); say('Lead deleted.'); };
  const saveBrokerage = async (body) => { const r = await api({ action: 'save_brokerage', ...body }); if (r.error) return r; setData((d) => ({ ...d, brokerages: d.brokerages.some((b) => b.id === r.brokerage.id) ? d.brokerages.map((b) => (b.id === r.brokerage.id ? r.brokerage : b)) : [...d.brokerages, r.brokerage].sort((a, b) => a.name.localeCompare(b.name)) })); if (!body.id) setOpen({ kind: 'brokerage', id: r.brokerage.id }); return r; };
  const deleteBrokerage = async (id) => { const r = await api({ action: 'delete_brokerage', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, brokerages: d.brokerages.filter((b) => b.id !== id), leads: d.leads.map((l) => (l.brokerage_id === id ? { ...l, brokerage_id: null } : l)), notes: d.notes.filter((n) => n.brokerage_id !== id) })); setOpen(null); say('Brokerage removed.'); };
  const addNote = async (body) => { const r = await api({ action: 'add_note', ...body }); if (r.error) { say(r.error); return false; } setData((d) => ({ ...d, notes: [r.note, ...d.notes] })); return true; };
  const deleteNote = async (id) => { const r = await api({ action: 'delete_note', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) })); };
  const logout = async () => { await fetch('/api/admin/logout', { method: 'POST' }); window.location.href = '/admin'; };

  const openLead = data && open?.kind === 'lead' ? leads.find((l) => l.id === open.id) : null;
  const openBrk = data && open?.kind === 'brokerage' ? brokeragesById[open.id] : null;
  const active = leads.filter((l) => !CLOSED.has(l.stage)).length;
  const overdue = leads.filter((l) => leadStatus(l).overdue).length;

  return (
    <>
      <Head><title>CRM — Rentletter admin</title><meta name="robots" content="noindex, nofollow" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header className="crm-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Wordmark /><span className="crm-badge">Admin</span>
            <nav className="crm-nav" aria-label="Admin">
              <a href="/admin">Realtors</a><a href="/admin/crm" aria-current="page">CRM</a><a href="/admin/mockups">Mockups</a>
            </nav>
          </div>
          <button type="button" onClick={logout} className="crm-btn ghost">Sign out</button>
        </header>

        <main className="crm-wrap">
          <div className="crm-head">
            <div style={{ minWidth: 0 }}>
              <div className="crm-eyebrow">Pipeline</div>
              <h1 className="rl-serif crm-h1">{state === 'ready' ? (leads.length ? <>{active} in play{overdue ? <>, <span style={{ color: C.danger }}>{overdue} overdue</span></> : ''}.</> : 'Nobody yet.') : 'Your pipeline.'}</h1>
            </div>
            <div className="crm-head-r">
              <div className="crm-seg" role="tablist" aria-label="View">
                {VIEWS.map((v) => <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => pickView(v.key)}>{v.label}</button>)}
              </div>
              <button type="button" className="crm-btn red" onClick={() => setOpen({ kind: 'new', stage: 'new' })} disabled={state !== 'ready'}><Icon name="plus" size={14} /> New lead</button>
            </div>
          </div>

          {state === 'loading' && <p className="crm-quiet">Loading…</p>}
          {state === 'signedout' && <div className="crm-state"><div className="crm-eyebrow">Signed out</div><p>Your admin session ended.</p><a className="crm-btn red" href="/admin?next=/admin/crm">Sign in again</a></div>}
          {state === 'error' && <div className="crm-state" role="alert"><div className="crm-eyebrow" style={{ color: C.danger }}>Couldn’t load</div><p>{err}</p><button type="button" className="crm-btn ink" onClick={load}>Try again</button></div>}
          {state === 'migration' && (
            <div className="crm-state">
              <div className="crm-eyebrow">One step first</div>
              <h2 className="rl-serif" style={{ fontSize: 'clamp(22px, 4vw, 30px)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8, textWrap: 'balance' }}>The CRM tables don’t exist yet.</h2>
              <p>Run <code>db/crm.sql</code> in the Supabase SQL editor once — it creates three founder-only tables (leads, brokerages, notes) with deny-all row security. Nothing else changes. Then reload this page.</p>
              <button type="button" className="crm-btn ink" onClick={load}>I ran it — reload</button>
            </div>
          )}

          {state === 'ready' && view === 'board' && (
            <>
              <Morning leads={leads} onOpen={(id) => setOpen({ kind: 'lead', id })} />
              {leads.length ? (
                <Board leads={leads} brokeragesById={brokeragesById} onOpen={(id) => setOpen({ kind: 'lead', id })} onMove={moveStage} />
              ) : (
                <div className="crm-state">
                  <div className="crm-eyebrow">Empty pipeline</div>
                  <h2 className="rl-serif" style={{ fontSize: 'clamp(22px, 4vw, 30px)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8, textWrap: 'balance' }}>Every client starts as a name on a card.</h2>
                  <p>Add the realtors you’re already talking to — stage and dates can be back-filled, so past calls aren’t lost.</p>
                  <button type="button" className="crm-btn red" onClick={() => setOpen({ kind: 'new', stage: 'new' })}><Icon name="plus" size={14} /> Add the first lead</button>
                </div>
              )}
              {leads.length > 0 && <p className="crm-quiet crm-hint">Drag a card to change its stage — on a phone, press and hold, or use the <strong>≡ menu</strong> on a card.</p>}
            </>
          )}
          {state === 'ready' && view === 'calendar' && <Calendar leads={leads} onOpen={(id) => setOpen({ kind: 'lead', id })} onReschedule={reschedule} />}
          {state === 'ready' && view === 'brokerages' && (
            <Brokerages brokerages={data.brokerages} leads={leads} onOpen={(id) => setOpen({ kind: 'brokerage', id })} onNew={async () => { const name = window.prompt('Brokerage name'); if (name?.trim()) { const r = await saveBrokerage({ name: name.trim() }); if (r.error) say(r.error); } }} />
          )}
        </main>

        {open?.kind === 'new' && data && <LeadDrawer lead={null} brokerages={data.brokerages} brokeragesById={brokeragesById} notes={[]} initialStage={open.stage} initialBrokerage={open.brokerage} onSave={saveLead} onClose={() => setOpen(null)} />}
        {openLead && <LeadDrawer key={openLead.id} lead={openLead} brokerages={data.brokerages} brokeragesById={brokeragesById} notes={data.notes.filter((n) => n.lead_id === openLead.id)} onSave={saveLead} onDelete={deleteLead} onAddNote={addNote} onDeleteNote={deleteNote} onOpenBrokerage={(id) => setOpen({ kind: 'brokerage', id })} onClose={() => setOpen(null)} />}
        {openBrk && <BrokerageDrawer key={openBrk.id} brokerage={openBrk} leads={leads.filter((l) => l.brokerage_id === openBrk.id)} notes={data.notes.filter((n) => n.brokerage_id === openBrk.id)} onSave={saveBrokerage} onDelete={deleteBrokerage} onAddNote={addNote} onDeleteNote={deleteNote} onOpenLead={(id) => setOpen({ kind: 'lead', id })} onNewLead={(b) => setOpen({ kind: 'new', stage: 'new', brokerage: b })} onClose={() => setOpen(null)} />}
        {toast && <div role="status" className="crm-toast">{toast}</div>}
      </div>
      <style jsx global>{`
        .crm-top { border-bottom: 1px solid ${C.rule}; padding: 12px clamp(14px, 3vw, 28px); display: flex; justify-content: space-between; align-items: center; gap: 12px; background: ${C.paper}; }
        .crm-badge { font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.paper}; background: ${C.ink}; padding: 3px 8px; border-radius: ${R.pill}px; }
        .crm-nav { display: flex; gap: 2px; margin-left: 6px; }
        .crm-nav a { font-size: 13px; font-weight: 600; color: ${C.inkSoft}; text-decoration: none; padding: 6px 10px; border-radius: ${R.pill}px; min-height: 32px; display: inline-flex; align-items: center; }
        .crm-nav a[aria-current="page"] { color: ${C.ink}; box-shadow: inset 0 -2px 0 ${C.red}; border-radius: 0; }
        .crm-wrap { max-width: 1400px; margin: 0 auto; padding: clamp(16px, 2.6vw, 28px) clamp(12px, 2.6vw, 24px) 80px; }
        .crm-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 11px; color: ${C.red}; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
        .crm-eyebrow::before { content: ''; width: 18px; height: 2px; background: ${C.red}; border-radius: 1px; }
        .crm-tick { display: inline-block; width: 3px; height: 12px; background: ${C.red}; border-radius: 1px; flex-shrink: 0; }
        .crm-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 16px; }
        .crm-h1 { font-size: clamp(26px, 4vw, 36px); letter-spacing: -0.025em; line-height: 1.05; color: ${C.ink}; text-wrap: balance; }
        .crm-head-r { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .crm-seg { display: inline-flex; background: ${C.paperDeep}; border: 1px solid ${C.rule}; border-radius: ${R.pill}px; padding: 3px; }
        .crm-seg button { border: none; background: transparent; color: ${C.inkSoft}; font: inherit; font-size: 13px; font-weight: 700; padding: 7px 14px; min-height: 36px; border-radius: ${R.pill}px; cursor: pointer; }
        .crm-seg button.on { background: ${C.ink}; color: ${C.paper}; }
        .crm-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; border-radius: ${R.ctrl}px; padding: 9px 14px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; min-height: 40px; text-decoration: none; white-space: nowrap; }
        .crm-btn.red { background: ${C.red}; color: ${C.paper}; }
        .crm-btn.ink { background: ${C.ink}; color: ${C.paper}; }
        .crm-btn.ghost { background: transparent; color: ${C.inkSoft}; border-color: ${C.ruleDark}; }
        .crm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .crm-quiet { font-size: 13px; color: ${C.inkMute}; line-height: 1.55; text-wrap: pretty; }
        .crm-hint { margin-top: 12px; }
        .crm-state { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: clamp(20px, 4vw, 32px); max-width: 560px; }
        .crm-state p { font-size: 14px; color: ${C.inkSoft}; line-height: 1.6; margin-bottom: 16px; text-wrap: pretty; }
        .crm-state code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: ${C.paperDeep}; padding: 2px 6px; border-radius: 4px; }
        .crm-toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 1200; background: ${C.ink}; color: ${C.paper}; padding: 11px 16px; border-radius: ${R.pill}px; font-size: 13px; font-weight: 600; max-width: 92vw; box-shadow: ${SH.raised}; }

        /* ── morning strip ── */
        .crm-m { background: ${C.inst}; color: ${C.instText}; border-radius: ${R.card}px; padding: 14px 16px; margin-bottom: 16px; position: relative; overflow: hidden; }
        .crm-m::before { content: ''; position: absolute; top: 0; left: 0; width: 44px; height: 3px; background: ${C.red}; }
        .crm-m.quiet { display: flex; align-items: center; gap: 10px; font-size: 13.5px; line-height: 1.5; flex-wrap: wrap; }
        .crm-m.quiet strong { color: #fff; }
        .crm-m-date { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.redBright}; margin-bottom: 10px; }
        .crm-m-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .crm-m-cell { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; padding: 10px 12px; min-width: 0; }
        .crm-m-l { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; margin-bottom: 6px; }
        .crm-m-cell.danger .crm-m-l { color: ${C.redBright}; }
        .crm-m-n { margin-left: auto; font-variant-numeric: tabular-nums; color: ${C.instText}; }
        .crm-m-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
        .crm-m-item { display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: left; background: transparent; border: none; color: ${C.instText}; font: inherit; font-size: 13px; padding: 4px 0; cursor: pointer; min-width: 0; }
        .crm-m-name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
        .crm-m-what { color: ${C.instMute}; font-size: 12.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .crm-m-item:hover .crm-m-name { text-decoration: underline; }
        .crm-m-more, .crm-m-empty { font-size: 12.5px; color: ${C.instMute}; padding: 4px 0; }

        /* ── board ── */
        .crm-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(208px, 1fr); gap: 10px; overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 8px; -webkit-overflow-scrolling: touch; scroll-snap-type: x proximity; scroll-padding: 12px; }
        @media (min-width: 1560px) { .crm-board { grid-auto-columns: minmax(0, 1fr); } }
        .crm-col { background: ${C.paperDeep}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; min-height: 280px; display: flex; flex-direction: column; min-width: 0; scroll-snap-align: start; }
        .crm-col.hot { border-color: ${C.red}; box-shadow: inset 0 0 0 1px ${C.red}; }
        .crm-col-h { padding: 12px 12px 8px; border-bottom: 1px solid ${C.rule}; }
        .crm-col-name { font-size: 13px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .crm-col-n { font-size: 12px; font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
        .crm-col-hint { font-size: 11.5px; color: ${C.inkMute}; margin-top: 3px; line-height: 1.35; padding-left: 11px; text-wrap: pretty; }
        .crm-col-body { padding: 8px; display: grid; gap: 8px; align-content: start; flex: 1; }
        .crm-col-empty { border: 1px dashed ${C.ruleDark}; border-radius: ${R.ctrl}px; padding: 14px 10px; font-size: 12.5px; color: ${C.inkMute}; text-align: center; min-height: 64px; display: flex; align-items: center; justify-content: center; }
        .crm-col.hot .crm-col-empty { border-color: ${C.red}; color: ${C.red}; }
        .crm-card { position: relative; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.ctrl}px; padding: 10px 10px 8px; cursor: grab; touch-action: pan-x pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; box-shadow: ${SH.rest}; min-width: 0; outline: none; }
        .crm-card:focus-visible { box-shadow: 0 0 0 2px ${C.red}; }
        .crm-card.overdue { border-left: 3px solid ${C.danger}; }
        .crm-card.lifted { opacity: 0.35; }
        .crm-card-top { display: flex; gap: 8px; align-items: flex-start; }
        .crm-avatar { width: 26px; height: 26px; border-radius: 50%; background: ${C.ink}; color: ${C.paper}; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; letter-spacing: 0.02em; }
        .crm-card-name { font-size: 13.5px; font-weight: 700; color: ${C.ink}; line-height: 1.3; overflow-wrap: break-word; }
        .crm-card-brk { font-size: 12px; color: ${C.inkSoft}; line-height: 1.35; overflow-wrap: break-word; }
        .crm-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; min-width: 0; padding-top: 7px; border-top: 1px solid ${C.rule}; }
        .crm-card-date { font-size: 12px; font-weight: 700; min-width: 0; line-height: 1.3; text-wrap: pretty; }
        .crm-card-date-l { font-weight: 500; opacity: 0.8; }
        .crm-card-flag { flex-shrink: 0; font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.paper}; background: ${C.danger}; padding: 2px 6px; border-radius: ${R.pill}px; }
        .crm-move { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; color: ${C.inkMute}; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; margin: -4px -4px 0 0; }
        .crm-move:hover, .crm-move[aria-expanded="true"] { color: ${C.ink}; border-color: ${C.rule}; background: ${C.paperDeep}; }
        .crm-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; background: ${C.paper}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; box-shadow: ${SH.raised}; padding: 6px; width: 250px; text-align: left; cursor: default; }
        .crm-menu-h { font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; padding: 6px 8px 4px; }
        .crm-menu-i { display: grid; grid-template-columns: 3px 1fr; column-gap: 8px; align-items: center; width: 100%; text-align: left; background: transparent; border: none; border-radius: ${R.ctrl}px; padding: 8px 8px; font: inherit; font-size: 13px; font-weight: 700; color: ${C.ink}; cursor: pointer; min-height: 40px; }
        .crm-menu-i:hover { background: ${C.paperDeep}; }
        .crm-menu-i.on { color: ${C.red}; }
        .crm-menu-hint { grid-column: 2; font-size: 11.5px; font-weight: 500; color: ${C.inkMute}; line-height: 1.3; }
        .crm-board.dragging .crm-card { cursor: grabbing; }
        .crm-board.dragging { scroll-snap-type: none; } /* snap would undo edge auto-scroll mid-drag */

        /* ── drawers ── */
        .crm-scrim { position: fixed; inset: 0; z-index: 1000; background: rgba(15,15,16,0.42); display: flex; justify-content: flex-end; }
        .crm-drawer { width: min(560px, 100%); height: 100%; height: 100dvh; background: ${C.paper}; display: flex; flex-direction: column; box-shadow: ${SH.modal}; }
        .crm-drawer-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px clamp(16px, 3vw, 24px) 12px; border-bottom: 1px solid ${C.rule}; }
        .crm-drawer-t { font-size: clamp(22px, 3vw, 28px); letter-spacing: -0.02em; line-height: 1.1; color: ${C.ink}; overflow-wrap: anywhere; text-wrap: balance; }
        .crm-x { width: 40px; height: 40px; border-radius: 50%; border: 1px solid ${C.rule}; background: transparent; color: ${C.inkSoft}; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
        .crm-drawer-b { flex: 1; overflow-y: auto; padding: 16px clamp(16px, 3vw, 24px) 24px; -webkit-overflow-scrolling: touch; }
        .crm-drawer-f { padding: 12px clamp(16px, 3vw, 24px); padding-bottom: max(12px, env(safe-area-inset-bottom)); border-top: 1px solid ${C.rule}; background: ${C.paper}; }
        .crm-lead-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .crm-link { background: transparent; border: none; color: ${C.red}; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 4px; }
        .crm-pill { font-size: 12px; font-weight: 600; border: 1px solid ${C.rule}; border-radius: ${R.pill}px; padding: 3px 9px; white-space: nowrap; }
        .crm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 12px; }
        .crm-f { display: grid; gap: 5px; min-width: 0; }
        .crm-f.span { grid-column: 1 / -1; }
        .crm-f-l { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; }
        .crm-input { width: 100%; padding: 10px 12px; font: inherit; font-size: 15px; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; background: ${C.card}; color: ${C.ink}; outline: none; min-height: 42px; }
        .crm-input:focus { border-color: ${C.ink}; }
        textarea.crm-input { resize: vertical; line-height: 1.5; }
        .crm-prefix { display: flex; align-items: center; border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; background: ${C.card}; padding-left: 10px; }
        .crm-prefix span { color: ${C.inkMute}; font-size: 14px; }
        .crm-prefix .crm-input { border: none; padding-left: 4px; }
        .crm-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: ${C.ink}; font-weight: 600; min-height: 42px; }
        .crm-check input { width: 18px; height: 18px; accent-color: ${C.red}; }
        .crm-notes { display: grid; gap: 12px; }
        .crm-note-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .crm-note { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.ctrl}px; padding: 10px 12px; }
        .crm-note-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: ${C.inkMute}; font-weight: 600; margin-bottom: 4px; }
        .crm-note-del { margin-left: auto; background: transparent; border: none; color: ${C.inkMute}; cursor: pointer; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
        .crm-note-del:hover { color: ${C.danger}; background: ${C.dangerTint}; }
        .crm-note-body { font-size: 14px; color: ${C.ink}; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
        .crm-people { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .crm-person { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.ctrl}px; padding: 10px 12px; font: inherit; font-size: 13.5px; cursor: pointer; color: ${C.inkSoft}; min-height: 48px; }
        .crm-person-meta { display: block; font-size: 12px; color: ${C.inkMute}; text-wrap: pretty; }
        .crm-flag { font-size: 9.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.danger}; border: 1px solid ${C.danger}; padding: 2px 6px; border-radius: ${R.pill}px; }

        /* ── brokerages view ── */
        .crm-brks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .crm-brk { text-align: left; background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 14px 16px; font: inherit; cursor: pointer; min-width: 0; display: grid; gap: 6px; }
        .crm-brk:hover { border-color: ${C.ruleDark}; box-shadow: ${SH.rest}; }
        .crm-brk-n { font-size: 15px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.01em; overflow-wrap: anywhere; }
        .crm-brk-p { font-size: 12.5px; color: ${C.inkSoft}; line-height: 1.45; text-wrap: pretty; }
        .crm-brk-c { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; display: flex; gap: 8px; align-items: center; }

        /* ── calendar ── */
        .crm-cal-h { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .crm-cal-t { font-size: clamp(20px, 3vw, 26px); letter-spacing: -0.02em; color: ${C.ink}; }
        .crm-cal-dow { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.inkMute}; padding: 0 0 6px; }
        .crm-cal-dow span { padding-left: 8px; }
        .crm-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
        .crm-day { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.ctrl}px; min-height: 104px; padding: 6px; min-width: 0; cursor: default; display: flex; flex-direction: column; gap: 4px; }
        .crm-day.out { background: transparent; border-style: dashed; opacity: 0.6; }
        .crm-day.today { border-color: ${C.ink}; box-shadow: inset 0 0 0 1px ${C.ink}; }
        .crm-day.hot { border-color: ${C.red}; box-shadow: inset 0 0 0 1px ${C.red}; background: ${C.redTint}; }
        .crm-day-n { font-size: 12px; font-weight: 700; color: ${C.inkSoft}; font-variant-numeric: tabular-nums; display: flex; gap: 6px; align-items: center; }
        .crm-day.today .crm-day-n { color: ${C.ink}; }
        .crm-day-today { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.paper}; background: ${C.red}; padding: 1px 5px; border-radius: ${R.pill}px; }
        .crm-day-items { display: grid; gap: 3px; }
        .crm-day-dots { display: none; gap: 3px; flex-wrap: wrap; }
        .crm-chip { display: flex; align-items: center; gap: 5px; width: 100%; text-align: left; background: ${C.paperDeep}; border: 1px solid ${C.rule}; border-radius: 6px; padding: 3px 6px; font: inherit; font-size: 11.5px; font-weight: 600; color: ${C.ink}; cursor: grab; min-width: 0; touch-action: pan-x pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
        .crm-chip.lifted { opacity: 0.35; }
        .crm-chip-t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .crm-chip-mark { width: 3px; height: 12px; border-radius: 1px; background: ${C.red}; flex-shrink: 0; }
        .crm-chip.demo { background: ${C.ink}; color: ${C.paper}; border-color: ${C.ink}; }
        .crm-chip.demo .crm-chip-mark { background: ${C.red}; }
        .crm-chip.overdue { background: ${C.dangerTint}; color: ${C.danger}; border-color: ${C.danger}; }
        .crm-chip.overdue .crm-chip-mark { background: ${C.danger}; }
        .crm-chip.past { background: transparent; color: ${C.inkMute}; border-color: ${C.rule}; }
        .crm-chip.past .crm-chip-mark { background: ${C.ruleDark}; }
        .crm-chip-k { margin-left: auto; font-size: 11px; font-weight: 500; opacity: 0.75; white-space: nowrap; }
        .crm-dot { width: 7px; height: 7px; border-radius: 50%; background: ${C.red}; display: inline-block; }
        .crm-dot.demo { background: ${C.ink}; } .crm-dot.overdue { background: ${C.danger}; } .crm-dot.past { background: ${C.ruleDark}; }
        .crm-cal-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: ${C.inkMute}; margin: 10px 0 14px; }
        .crm-cal-legend > span { display: inline-flex; align-items: center; gap: 5px; }
        .crm-cal-day { background: ${C.card}; border: 1px solid ${C.rule}; border-radius: ${R.card}px; padding: 14px 16px; }
        .crm-cal-day-list { display: grid; gap: 6px; margin-bottom: 10px; }
        .crm-cal-day-list .crm-chip { padding: 8px 10px; font-size: 13px; min-height: 40px; }
        @media (max-width: 719px) {
          .crm-day { min-height: 52px; padding: 5px; cursor: pointer; }
          .crm-day-items { display: none; }
          .crm-day-dots { display: flex; }
          .crm-day-today { display: none; }
          .crm-day.sel { background: ${C.paperDeep}; }
          .crm-m-grid { grid-template-columns: 1fr; }
          .crm-form { grid-template-columns: 1fr; }
          .crm-head-r { width: 100%; justify-content: space-between; }
        }
        @media (max-width: 480px) { .crm-nav a { padding: 6px 7px; font-size: 12.5px; } .crm-badge { display: none; } .crm-nav a[href="/admin/mockups"] { display: none; } .crm-top .crm-btn { padding: 7px 10px; min-height: 34px; } }
        @media (prefers-reduced-motion: no-preference) {
          .crm-drawer { animation: crm-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }
          @keyframes crm-in { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
          .crm-card { transition: box-shadow 160ms ease, opacity 160ms ease; }
          .crm-card:hover { box-shadow: ${SH.raised}; }
          .crm-col, .crm-day { transition: border-color 120ms ease, box-shadow 120ms ease; }
        }
      `}</style>
    </>
  );
}

function Brokerages({ brokerages, leads, onOpen, onNew }) {
  const byB = {}; for (const l of leads) (byB[l.brokerage_id] = byB[l.brokerage_id] || []).push(l);
  const unlinked = byB[null]?.length || byB.undefined?.length || 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <p className="crm-quiet" style={{ margin: 0 }}>{brokerages.length ? `${brokerages.length} firm${brokerages.length === 1 ? '' : 's'} — open one to see everyone you’re talking to there.${unlinked ? ` ${unlinked} lead${unlinked === 1 ? ' has' : 's have'} no brokerage yet.` : ''}` : 'Brokerages appear here as you link leads to them.'}</p>
        <button type="button" className="crm-btn ghost" onClick={onNew}><Icon name="plus" size={13} /> New brokerage</button>
      </div>
      {brokerages.length ? (
        <div className="crm-brks">
          {brokerages.map((b) => { const ppl = byB[b.id] || []; const od = ppl.filter((l) => leadStatus(l).overdue).length; const clients = ppl.filter((l) => l.stage === 'client').length; return (
            <button key={b.id} type="button" className="crm-brk" onClick={() => onOpen(b.id)}>
              <div className="crm-brk-c"><span className="crm-tick" aria-hidden="true" />{ppl.length} {ppl.length === 1 ? 'person' : 'people'}{clients ? ` · ${clients} client${clients === 1 ? '' : 's'}` : ''}{od ? <span style={{ color: C.danger }}> · {od} overdue</span> : ''}</div>
              <div className="crm-brk-n">{b.name}</div>
              <div className="crm-brk-p">{ppl.length ? ppl.map((l) => `${l.name} (${STAGE[l.stage]?.label.toLowerCase()})`).join(', ') : 'Nobody linked yet.'}</div>
            </button>
          ); })}
        </div>
      ) : (
        <div className="crm-state"><div className="crm-eyebrow">No firms yet</div><p>Type a brokerage on any lead and it becomes a record here — with its own notes and everyone at that firm.</p></div>
      )}
    </div>
  );
}
