// pages/admin/crm.js
// FOUNDER-ONLY personal CRM — the daily operating surface, opened from the phone's home screen.
// Same admin session as /admin (server-checked; unauthenticated visits are sent to the /admin
// sign-in and back). Three views: Today (the pipeline in time — the phone default), Board (the
// pipeline by stage — the desktop default) and Firms. All data lives in founder-only tables
// (db/crm.sql) behind /api/admin/crm. Shell + shared styles: components/admin/AdminShell.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { C, R, SH } from '../../components/theme';
import { Icon } from '../../components/ui';
import { isAdmin } from '../../lib/adminAuth';
import { adminFetch } from '../../components/admin/adminFetch';
import AdminShell from '../../components/admin/AdminShell';
import Board from '../../components/crm/Board';
import Calendar from '../../components/crm/Calendar';
import Agenda from '../../components/crm/Agenda';
import { QuickAdd, LeadDrawer, BrokerageDrawer } from '../../components/crm/Drawers';
import { STAGE, leadStatus, moveTsToDay, addDays, today, fmtDay, CLOSED } from '../../components/crm/model';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin?next=/admin/crm', permanent: false } };
  return { props: {} };
}

const VIEWS = [{ key: 'today', label: 'Today' }, { key: 'board', label: 'Board' }, { key: 'firms', label: 'Firms' }];

export default function Crm() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | migration | error | signedout
  const [err, setErr] = useState('');
  const [view, setView] = useState('today');
  const [month, setMonth] = useState(false);   // Today view: agenda (default) or the month grid
  const [open, setOpen] = useState(null); // { kind: 'lead', id, notes? } | { kind: 'new', stage, brokerage } | { kind: 'brokerage', id }
  const [toast, setToast] = useState('');
  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const api = useCallback(async (body) => {
    const { r, j } = await adminFetch('/api/admin/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { retry5xx: 0 });
    if (r && r.status === 401) { setState('signedout'); return { error: 'Signed out.' }; }
    if (j.code === 'migration_missing') { setState('migration'); return { error: j.error }; }
    if (!r || !r.ok) return { error: j.error || 'That didn’t save.' };
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
  // Remembered view; first visit: Today on a phone, Board on a desktop.
  useEffect(() => { try { const v = localStorage.getItem('rl_crm_view'); if (VIEWS.some((x) => x.key === v)) setView(v); else if (window.innerWidth >= 900) setView('board'); } catch (e) { /* ignore */ } }, []);
  const pickView = (v) => { setView(v); try { localStorage.setItem('rl_crm_view', v); } catch (e) { /* ignore */ } };

  const brokeragesById = useMemo(() => Object.fromEntries((data?.brokerages || []).map((b) => [b.id, b])), [data]);
  const leads = data?.leads || [];
  const patchLead = (lead) => setData((d) => ({ ...d, leads: d.leads.some((l) => l.id === lead.id) ? d.leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...d.leads] }));

  // ── writes: optimistic where the UI is the source of truth ──
  const update = async (id, patch, msg) => {
    const before = leads.find((l) => l.id === id); if (!before) return;
    patchLead({ ...before, ...patch });
    const r = await api({ action: 'save_lead', id, ...patch });
    if (r.error) { patchLead(before); say(r.error); } else { patchLead(r.lead); if (msg) say(msg(before, r.lead)); }
  };
  const moveStage = (id, stage) => { const before = leads.find((l) => l.id === id); if (!before || before.stage === stage) return; update(id, { stage, stage_changed_at: new Date().toISOString() }, (b) => `${b.name} → ${STAGE[stage].label}`); };
  const reschedule = (id, kind, day) => { const before = leads.find((l) => l.id === id); if (!before) return; update(id, kind === 'demo' ? { demo_at: moveTsToDay(before.demo_at, day) } : { follow_up_at: day }, (b) => `${b.name}: ${kind === 'demo' ? 'demo' : 'follow-up'} moved to ${fmtDay(day)}.`); };
  // One tap from the board or agenda: the email went out → next touch a week from today.
  const followUpSent = (id) => { const next = addDays(today(), 7); update(id, { follow_up_email_sent: true, follow_up_email_sent_at: today(), follow_up_at: next }, (b) => `${b.name}: sent. Next follow-up ${fmtDay(next)}.`); };
  const demoDone = (id) => update(id, { stage: 'demo_done', stage_changed_at: new Date().toISOString() }, (b) => `${b.name}: demo done.`);
  const saveLead = async (body) => {
    const r = await api({ action: 'save_lead', ...body }); if (r.error) return r;
    if (r.lead.brokerage_id && !brokeragesById[r.lead.brokerage_id]) await load(); else patchLead(r.lead);
    if (!body.id) { setOpen(null); say(`${r.lead.name} added to ${STAGE[r.lead.stage]?.label}.`); }
    return r;
  };
  const deleteLead = async (id) => { const r = await api({ action: 'delete_lead', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, leads: d.leads.filter((l) => l.id !== id), notes: d.notes.filter((n) => n.lead_id !== id) })); setOpen(null); say('Lead deleted.'); };
  const saveBrokerage = async (body) => { const r = await api({ action: 'save_brokerage', ...body }); if (r.error) return r; setData((d) => ({ ...d, brokerages: d.brokerages.some((b) => b.id === r.brokerage.id) ? d.brokerages.map((b) => (b.id === r.brokerage.id ? r.brokerage : b)) : [...d.brokerages, r.brokerage].sort((a, b) => a.name.localeCompare(b.name)) })); return r; };
  const deleteBrokerage = async (id) => { const r = await api({ action: 'delete_brokerage', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, brokerages: d.brokerages.filter((b) => b.id !== id), leads: d.leads.map((l) => (l.brokerage_id === id ? { ...l, brokerage_id: null } : l)) })); setOpen(null); say('Brokerage deleted.'); };
  const addNote = async (body) => { const r = await api({ action: 'add_note', ...body }); if (r.error) { say(r.error); return false; } setData((d) => ({ ...d, notes: [r.note, ...d.notes] })); return true; };
  const deleteNote = async (id) => { const r = await api({ action: 'delete_note', id }); if (r.error) return say(r.error); setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== id) })); };

  const openLead = data && open?.kind === 'lead' ? leads.find((l) => l.id === open.id) : null;
  const openBrk = data && open?.kind === 'brokerage' ? brokeragesById[open.id] : null;
  const active = leads.filter((l) => !CLOSED.has(l.stage)).length;
  const overdue = leads.filter((l) => leadStatus(l).overdue).length;
  const acts = { onOpen: (id) => setOpen({ kind: 'lead', id }), onNote: (id) => setOpen({ kind: 'lead', id, notes: true }), onFollowUpSent: followUpSent, onDemoDone: demoDone, onMove: moveStage };
  const newLead = () => setOpen({ kind: 'new', stage: 'new' });

  return (
    <AdminShell page="crm" title="CRM" right={<button type="button" className="ad-btn primary sm" onClick={newLead} disabled={state !== 'ready'} aria-label="New lead"><Icon name="plus" size={15} /><span className="crm-new-l">New lead</span></button>}>
      <main className="ad-wrap">
        <div className="ad-head">
          <div style={{ minWidth: 0 }}>
            <div className="ad-eyebrow">Pipeline</div>
            <h1 className="ad-h1">{state === 'ready' ? (leads.length ? <><span className="ad-num">{active}</span> in play{overdue ? <>, <span className="ad-num" style={{ color: C.instDangerText }}>{overdue} overdue</span></> : ''}.</> : 'Nobody yet.') : 'Your pipeline.'}</h1>
          </div>
          <div className="ad-seg crm-views" role="tablist" aria-label="View">
            {VIEWS.map((v) => <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => pickView(v.key)}>{v.label}</button>)}
          </div>
        </div>

        {state === 'loading' && <p className="ad-quiet">Loading…</p>}
        {state === 'signedout' && <div className="ad-card crm-state"><div className="ad-eyebrow">Signed out</div><p>Your admin session ended.</p><a className="ad-btn primary" href="/admin?next=/admin/crm">Sign in again</a></div>}
        {state === 'error' && <div className="ad-card crm-state" role="alert"><div className="ad-eyebrow" style={{ color: C.instDangerText }}>Couldn’t load</div><p>{err}</p><button type="button" className="ad-btn secondary" onClick={load}>Try again</button></div>}
        {state === 'migration' && (
          <div className="ad-card crm-state">
            <div className="ad-eyebrow">One step first</div>
            <h2 className="ad-h2" style={{ marginBottom: 8 }}>The CRM tables don’t exist yet.</h2>
            <p>Run <code>db/crm.sql</code> in the Supabase SQL editor once — three founder-only tables with deny-all row security. Then reload.</p>
            <button type="button" className="ad-btn secondary" onClick={load}>I ran it — reload</button>
          </div>
        )}

        {state === 'ready' && view === 'today' && (
          <>
            <div className="crm-today-bar">
              <button type="button" className={`ad-btn sm ${month ? 'ghost' : 'secondary'}`} aria-pressed={!month} onClick={() => setMonth(false)}><Icon name="list" size={14} /> Agenda</button>
              <button type="button" className={`ad-btn sm ${month ? 'secondary' : 'ghost'}`} aria-pressed={month} onClick={() => setMonth(true)}><Icon name="calendar" size={14} /> Month</button>
            </div>
            {month ? <Calendar leads={leads} onOpen={acts.onOpen} onReschedule={reschedule} /> : <Agenda leads={leads} brokeragesById={brokeragesById} {...acts} onNew={newLead} />}
          </>
        )}
        {state === 'ready' && view === 'board' && (
          leads.length ? <Board leads={leads} brokeragesById={brokeragesById} {...acts} /> : (
            <div className="ad-card crm-state">
              <div className="ad-eyebrow">Empty pipeline</div>
              <h2 className="ad-h2" style={{ marginBottom: 8 }}>Every client starts as a name on a card.</h2>
              <button type="button" className="ad-btn primary" onClick={newLead}><Icon name="plus" size={14} /> Add the first lead</button>
            </div>
          )
        )}
        {state === 'ready' && view === 'firms' && (
          <Brokerages brokerages={data.brokerages} leads={leads} onOpen={(id) => setOpen({ kind: 'brokerage', id })} onNew={async () => { const name = window.prompt('Brokerage name'); if (name?.trim()) { const r = await saveBrokerage({ name: name.trim() }); if (r?.error) say(r.error); } }} />
        )}
      </main>

      {open?.kind === 'new' && data && <QuickAdd brokerages={data.brokerages} initialStage={open.stage} initialBrokerage={open.brokerage} onSave={saveLead} onClose={() => setOpen(null)} />}
      {openLead && <LeadDrawer key={openLead.id} lead={openLead} focusNotes={!!open.notes} brokerages={data.brokerages} brokeragesById={brokeragesById} notes={data.notes.filter((n) => n.lead_id === openLead.id)} onSave={saveLead} onDelete={deleteLead} onAddNote={addNote} onDeleteNote={deleteNote} onOpenBrokerage={(id) => setOpen({ kind: 'brokerage', id })} onClose={() => setOpen(null)} />}
      {openBrk && <BrokerageDrawer key={openBrk.id} brokerage={openBrk} leads={leads.filter((l) => l.brokerage_id === openBrk.id)} notes={data.notes.filter((n) => n.brokerage_id === openBrk.id)} onSave={saveBrokerage} onDelete={deleteBrokerage} onAddNote={addNote} onDeleteNote={deleteNote} onOpenLead={(id) => setOpen({ kind: 'lead', id })} onNewLead={(b) => setOpen({ kind: 'new', stage: 'new', brokerage: b })} onClose={() => setOpen(null)} />}
      {toast && <div role="status" className="ad-toast">{toast}</div>}

      <style jsx global>{`
        .crm-views { max-width: 100%; }
        @media (max-width: 719px) { .crm-views { width: 100%; } .crm-new-l { display: none; } .ad-top-r .ad-btn.primary.sm { width: 40px; padding: 0; min-height: 40px; border-radius: 50%; } }
        .crm-state { padding: clamp(18px, 4vw, 28px); max-width: 560px; }
        .crm-state p { font-size: 14px; color: ${C.instMute}; line-height: 1.6; margin-bottom: 16px; text-wrap: pretty; }
        .crm-state code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; background: ${C.inst}; padding: 2px 6px; border-radius: 4px; color: ${C.instText}; }
        .crm-today-bar { display: flex; gap: 6px; margin-bottom: 12px; }
        .crm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .crm-form .span { grid-column: 1 / -1; }
        @media (max-width: 719px) { .crm-form { grid-template-columns: 1fr; } }
        .crm-prefix { display: flex; align-items: center; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; background: ${C.inst}; padding-left: 12px; }
        .crm-prefix span { color: ${C.instMute}; font-size: 16px; }
        .crm-prefix .ad-input { border: none; padding-left: 2px; background: transparent; }
        .crm-prefix:focus-within { border-color: ${C.instText}; }
        .crm-facts { display: grid; gap: 8px; font-size: 14.5px; }
        .crm-fact { display: inline-flex; align-items: center; gap: 8px; color: ${C.instText}; text-decoration: none; min-height: 32px; }
        /* ── agenda ── */
        .crm-ag-date { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.instMute}; margin-bottom: 8px; }
        .crm-ag-quiet { font-size: 15px; color: ${C.instText}; margin-bottom: 14px; text-wrap: pretty; }
        .crm-ag-sec { margin-bottom: 16px; }
        .crm-ag-h { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.instMute}; margin-bottom: 6px; }
        .crm-ag-sec.danger .crm-ag-h { color: ${C.instDangerText}; } .crm-ag-sec.danger .ad-tick { background: ${C.instDangerText}; }
        .crm-ag-sec.red .crm-ag-h { color: ${C.redBright}; }
        .crm-ag-n { margin-left: 2px; color: ${C.instText}; }
        .crm-ag-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .crm-ag-row { display: flex; align-items: stretch; gap: 6px; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 4px 6px 4px 0; min-width: 0; }
        .crm-ag-row.overdue { border-left: 3px solid ${C.instDangerText}; }
        .crm-ag-row.today { border-left: 3px solid ${C.redBright}; }
        .crm-ag-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; text-align: left; background: transparent; border: none; color: ${C.instText}; font: inherit; padding: 8px 4px 8px 12px; min-height: 52px; cursor: pointer; border-radius: ${R.ctrl}px; }
        .crm-ag-mark { display: none; }
        .crm-ag-name { display: block; font-size: 15px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
        .crm-ag-what { display: block; font-size: 12.5px; color: ${C.instMute}; line-height: 1.35; text-wrap: pretty; }
        .crm-ag-acts { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .crm-ag-empty { font-size: 13px; color: ${C.instMute}; padding: 6px 0; }
        @media (max-width: 480px) { .crm-ag-acts .ad-btn.sm { padding: 6px 9px; } }
        /* ── board ── */
        .crm-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: 10px; overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 8px; -webkit-overflow-scrolling: touch; scroll-snap-type: x proximity; }
        @media (max-width: 719px) { .crm-board { grid-auto-columns: 86vw; scroll-snap-type: x mandatory; margin: 0 calc(-1 * clamp(14px, 2.6vw, 24px)); padding: 0 clamp(14px, 2.6vw, 24px) 8px; scroll-padding: 0 clamp(14px, 2.6vw, 24px); } }
        @media (min-width: 1700px) { .crm-board { grid-auto-columns: minmax(0, 1fr); } }
        .crm-col { background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; min-height: 280px; display: flex; flex-direction: column; min-width: 0; scroll-snap-align: start; }
        .crm-col.hot { border-color: ${C.redBright}; box-shadow: inset 0 0 0 1px ${C.redBright}; }
        .crm-col-h { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px; border-bottom: 1px solid ${C.instRule}; min-width: 0; }
        .crm-col-name { font-size: 13.5px; font-weight: 800; color: ${C.instText}; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .crm-col-n { font-size: 12.5px; font-weight: 700; color: ${C.instMute}; margin-left: auto; }
        .crm-col-body { padding: 8px; display: grid; gap: 8px; align-content: start; flex: 1; }
        .crm-col-empty { border: 1px dashed ${C.instRule}; border-radius: ${R.ctrl}px; padding: 14px 10px; font-size: 12.5px; color: ${C.instMute}; text-align: center; min-height: 56px; display: flex; align-items: center; justify-content: center; }
        .crm-col.hot .crm-col-empty { border-color: ${C.redBright}; color: ${C.redBright}; }
        .crm-card { position: relative; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; padding: 10px 10px 8px; cursor: grab; touch-action: pan-x pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; color: ${C.instText}; }
        .crm-card:focus-visible { box-shadow: 0 0 0 2px ${C.redBright}; outline: none; }
        .crm-card.overdue { border-left: 3px solid ${C.instDangerText}; }
        .crm-card.lifted { opacity: 0.35; }
        .crm-card-top { display: flex; gap: 8px; align-items: flex-start; }
        .crm-avatar { width: 28px; height: 28px; border-radius: 50%; background: ${C.instText}; color: ${C.inst}; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; letter-spacing: 0.02em; }
        .crm-card-name { font-size: 14px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
        .crm-card-brk { font-size: 12.5px; color: ${C.instMute}; line-height: 1.35; overflow-wrap: anywhere; }
        .crm-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; min-width: 0; padding-top: 7px; border-top: 1px solid ${C.instRule}; }
        .crm-card-date { font-size: 12.5px; font-weight: 700; min-width: 0; line-height: 1.3; text-wrap: pretty; }
        .crm-card-date-l { font-weight: 500; opacity: 0.8; }
        .crm-card-acts { display: flex; gap: 2px; flex-shrink: 0; }
        .crm-qa { display: inline-flex; align-items: center; gap: 4px; background: transparent; border: 1px solid transparent; color: ${C.instMute}; font: inherit; font-size: 12px; font-weight: 700; padding: 6px 8px; min-height: 34px; border-radius: ${R.ctrl}px; cursor: pointer; }
        .crm-qa:hover { color: ${C.instText}; border-color: ${C.instRule}; background: ${C.inst}; }
        .crm-move { width: 36px; height: 36px; margin: -6px -6px 0 0; color: ${C.instMute}; }
        .crm-menu { width: 260px; text-align: left; cursor: default; }
        .crm-menu .ad-menu-i.on { color: ${C.redBright}; }
        .crm-board.dragging .crm-card { cursor: grabbing; }
        .crm-board.dragging { scroll-snap-type: none; }
        /* ── notes / people ── */
        .crm-note-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .crm-note { background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; padding: 10px 12px; }
        .crm-note-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: ${C.instMute}; font-weight: 600; margin-bottom: 4px; }
        .crm-note-del { margin-left: auto; background: transparent; border: none; color: ${C.instMute}; cursor: pointer; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
        .crm-note-del:hover { color: ${C.instDangerText}; background: rgba(173,34,41,0.18); }
        .crm-note-body { font-size: 14.5px; color: ${C.instText}; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
        .crm-people { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .crm-person { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; padding: 10px 12px; font: inherit; font-size: 14px; color: ${C.instText}; cursor: pointer; min-height: 48px; }
        .crm-person-meta { display: block; font-size: 12.5px; color: ${C.instMute}; text-wrap: pretty; }
        /* ── firms ── */
        .crm-brks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .crm-brk { text-align: left; background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 14px 16px; font: inherit; color: ${C.instText}; cursor: pointer; min-width: 0; display: grid; gap: 6px; }
        .crm-brk:hover { border-color: ${C.instMute}; }
        .crm-brk-n { font-size: 15.5px; font-weight: 800; letter-spacing: -0.01em; overflow-wrap: anywhere; }
        .crm-brk-p { font-size: 12.5px; color: ${C.instMute}; line-height: 1.45; text-wrap: pretty; }
        .crm-brk-c { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.instMute}; display: flex; gap: 8px; align-items: center; }
        /* ── calendar ── */
        .crm-cal-h { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
        .crm-cal-t { font-size: clamp(20px, 3vw, 26px); }
        .crm-cal-dow { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.instMute}; padding: 0 0 6px; }
        .crm-cal-dow span { padding-left: 6px; }
        .crm-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
        .crm-day { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.ctrl}px; min-height: 104px; padding: 6px; min-width: 0; cursor: default; display: flex; flex-direction: column; gap: 4px; }
        .crm-day.out { background: transparent; border-style: dashed; opacity: 0.55; }
        .crm-day.today { border-color: ${C.instText}; box-shadow: inset 0 0 0 1px ${C.instText}; }
        .crm-day.hot { border-color: ${C.redBright}; box-shadow: inset 0 0 0 1px ${C.redBright}; }
        .crm-day-n { font-size: 12px; font-weight: 700; color: ${C.instMute}; font-variant-numeric: tabular-nums; display: flex; gap: 6px; align-items: center; }
        .crm-day.today .crm-day-n { color: ${C.instText}; }
        .crm-day-today { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.paper}; background: ${C.red}; padding: 1px 5px; border-radius: ${R.pill}px; }
        .crm-day-items { display: grid; gap: 3px; }
        .crm-day-dots { display: none; gap: 3px; flex-wrap: wrap; }
        .crm-chip { display: flex; align-items: center; gap: 5px; width: 100%; text-align: left; background: ${C.inst}; border: 1px solid ${C.instRule}; border-radius: 6px; padding: 3px 6px; font: inherit; font-size: 11.5px; font-weight: 600; color: ${C.instText}; cursor: pointer; min-width: 0; }
        .crm-chip.lifted { opacity: 0.35; }
        .crm-chip-t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .crm-chip-mark { width: 3px; height: 12px; border-radius: 1px; background: ${C.redBright}; flex-shrink: 0; }
        .crm-chip.demo { background: ${C.instText}; color: ${C.inst}; border-color: ${C.instText}; }
        .crm-chip.demo .crm-chip-mark { background: ${C.red}; }
        .crm-chip.overdue { background: rgba(173,34,41,0.2); color: ${C.instDangerText}; border-color: ${C.instDangerText}; }
        .crm-chip.overdue .crm-chip-mark { background: ${C.instDangerText}; }
        .crm-chip.past { background: transparent; color: ${C.instMute}; border-color: ${C.instRule}; }
        .crm-chip.past .crm-chip-mark { background: ${C.instRule}; }
        .crm-chip-k { margin-left: auto; font-size: 11px; font-weight: 500; opacity: 0.75; white-space: nowrap; }
        .crm-dot { width: 7px; height: 7px; border-radius: 50%; background: ${C.redBright}; display: inline-block; }
        .crm-dot.demo { background: ${C.instText}; } .crm-dot.overdue { background: ${C.instDangerText}; } .crm-dot.past { background: ${C.instRule}; }
        .crm-cal-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: ${C.instMute}; margin: 10px 0 14px; }
        .crm-cal-legend > span { display: inline-flex; align-items: center; gap: 5px; }
        .crm-cal-day { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 14px 16px; }
        .crm-cal-day-list { display: grid; gap: 6px; margin-bottom: 10px; }
        .crm-cal-day-list .crm-chip { padding: 8px 10px; font-size: 13.5px; min-height: 44px; }
        @media (max-width: 719px) {
          .crm-day { min-height: 48px; padding: 5px; cursor: pointer; }
          .crm-day-items { display: none; }
          .crm-day-dots { display: flex; }
          .crm-day-today { display: none; }
          .crm-day.sel { background: ${C.instRule}; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .crm-card { transition: box-shadow 160ms ease, opacity 160ms ease; }
          .crm-card:hover { box-shadow: ${SH.raised}; }
          .crm-col, .crm-day { transition: border-color 120ms ease, box-shadow 120ms ease; }
        }
      `}</style>
    </AdminShell>
  );
}

function Brokerages({ brokerages, leads, onOpen, onNew }) {
  const byB = {}; for (const l of leads) (byB[l.brokerage_id] = byB[l.brokerage_id] || []).push(l);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="ad-quiet ad-num">{brokerages.length} firm{brokerages.length === 1 ? '' : 's'}</span>
        <button type="button" className="ad-btn secondary sm" onClick={onNew}><Icon name="plus" size={13} /> New firm</button>
      </div>
      {brokerages.length ? (
        <div className="crm-brks">
          {brokerages.map((b) => { const ppl = byB[b.id] || []; const od = ppl.filter((l) => leadStatus(l).overdue).length; const clients = ppl.filter((l) => l.stage === 'client').length; return (
            <button key={b.id} type="button" className="crm-brk" onClick={() => onOpen(b.id)}>
              <div className="crm-brk-c"><span className="ad-tick" aria-hidden="true" /><span className="ad-num">{ppl.length} {ppl.length === 1 ? 'person' : 'people'}{clients ? ` · ${clients} client${clients === 1 ? '' : 's'}` : ''}</span>{od ? <span className="ad-pill danger">{od} overdue</span> : null}</div>
              <div className="crm-brk-n">{b.name}</div>
              <div className="crm-brk-p">{ppl.length ? ppl.map((l) => `${l.name} (${STAGE[l.stage]?.label.toLowerCase()})`).join(', ') : 'Nobody linked yet.'}</div>
            </button>
          ); })}
        </div>
      ) : (
        <div className="ad-card crm-state"><div className="ad-eyebrow">No firms yet</div><p>Type a brokerage on any lead and it becomes a record here.</p></div>
      )}
    </div>
  );
}
