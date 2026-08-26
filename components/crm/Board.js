// components/crm/Board.js
// The pipeline: seven columns, cards, drag between columns (mouse drag / touch long-press via
// useDrag) plus explicit one-tap actions on every card — the guaranteed path on a phone:
// Note, Sent (follow-up email went out → next touch in a week), Done (demo happened), and the
// ⋯ stage menu. Columns always render, even empty: the shape of the pipeline is the information.
import { useEffect, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { STAGES, STAGE, cardDate, leadStatus, initials } from './model';
import useDrag from './useDrag';

const TONE = { danger: C.instDangerText, red: C.redBright, green: C.instGreen, mute: C.instMute, ink: C.instText };

export function StageMenu({ current, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); }; const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('pointerdown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k); }; }, [onClose]);
  return (
    <div ref={ref} className="ad-menu crm-menu" role="menu" onClick={(e) => e.stopPropagation()}>
      <div className="ad-menu-h">Move to</div>
      {STAGES.map((s) => (
        <button key={s.key} type="button" role="menuitem" className={`ad-menu-i ${s.key === current ? 'on' : ''}`} onClick={() => { onPick(s.key); onClose(); }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ad-tick" aria-hidden="true" style={{ opacity: s.key === current ? 1 : 0 }} />{s.label}</span>
          <span className="ad-menu-hint" style={{ paddingLeft: 11 }}>{s.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function LeadCard({ lead, brokerage, onOpen, onMove, onNote, onFollowUpSent, onDemoDone, lifted, bind }) {
  const [menu, setMenu] = useState(false);
  const d = cardDate(lead);
  const s = leadStatus(lead);
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <article {...(bind ? bind({ id: lead.id, kind: 'lead' }) : {})} className={`crm-card ${lifted ? 'lifted' : ''} ${s.overdue ? 'overdue' : ''}`} onClick={() => onOpen(lead.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(lead.id); } }} tabIndex={0} role="button" aria-label={`${lead.name}${brokerage ? `, ${brokerage.name}` : ''}`}>
      <div className="crm-card-top">
        <span className="crm-avatar" aria-hidden="true">{initials(lead.name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crm-card-name">{lead.name}</div>
          <div className="crm-card-brk">{brokerage?.name || <span style={{ color: C.instMute }}>No brokerage</span>}</div>
        </div>
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <button type="button" className="ad-iconbtn crm-move" aria-label={`Move ${lead.name} to another stage`} aria-haspopup="menu" aria-expanded={menu} onClick={stop(() => setMenu((m) => !m))}><Icon name="more" size={16} /></button>
          {menu && <StageMenu current={lead.stage} onPick={(k) => onMove(lead.id, k)} onClose={() => setMenu(false)} />}
        </span>
      </div>
      <div className="crm-card-foot">
        {d ? <span className="crm-card-date" style={{ color: TONE[d.tone] || C.instText }}><span className="crm-card-date-l">{d.label}</span> {d.text}</span> : <span className="crm-card-date" style={{ color: C.instMute }}>No date</span>}
        <span className="crm-card-acts" onClick={(e) => e.stopPropagation()}>
          {s.fu && !s.closed && <button type="button" className="crm-qa" onClick={stop(() => onFollowUpSent(lead.id))} title="Follow-up email sent"><Icon name="mail" size={13} /><span>Sent</span></button>}
          {lead.stage === 'demo_booked' && <button type="button" className="crm-qa" onClick={stop(() => onDemoDone(lead.id))} title="Demo done"><Icon name="check" size={13} /><span>Done</span></button>}
          <button type="button" className="crm-qa" onClick={stop(() => onNote(lead.id))} title="Add a note"><Icon name="edit" size={13} /><span>Note</span></button>
        </span>
      </div>
    </article>
  );
}

export default function Board({ leads, brokeragesById, onOpen, onMove, onNote, onFollowUpSent, onDemoDone }) {
  const { bind, dragging, over } = useDrag(({ id, target }) => { if (target?.startsWith('stage:')) onMove(id, target.slice(6)); });
  const byStage = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  for (const l of leads) (byStage[l.stage] || byStage.new).push(l);
  const sortCol = (a, b) => { const sa = leadStatus(a), sb = leadStatus(b); if (sa.overdue !== sb.overdue) return sa.overdue ? -1 : 1; return String(b.updated_at || '').localeCompare(String(a.updated_at || '')); };
  return (
    <div className={`crm-board ${dragging ? 'dragging' : ''}`} role="list" aria-label="Pipeline">
      {STAGES.map((s) => {
        const list = byStage[s.key].sort(sortCol);
        const hot = over === `stage:${s.key}`;
        return (
          <section key={s.key} className={`crm-col ${hot ? 'hot' : ''}`} data-drop={`stage:${s.key}`} role="listitem" aria-label={`${s.label}, ${list.length}`}>
            <header className="crm-col-h" title={STAGE[s.key].hint}>
              <span className="ad-tick" aria-hidden="true" />
              <span className="crm-col-name">{s.label}</span>
              <span className="crm-col-n ad-num">{list.length}</span>
            </header>
            <div className="crm-col-body">
              {list.map((l) => <LeadCard key={l.id} lead={l} brokerage={brokeragesById[l.brokerage_id]} onOpen={onOpen} onMove={onMove} onNote={onNote} onFollowUpSent={onFollowUpSent} onDemoDone={onDemoDone} lifted={dragging?.id === l.id} bind={bind} />)}
              {!list.length && <div className="crm-col-empty">{dragging ? 'Drop here' : '—'}</div>}
              {!!list.length && dragging && <div className="crm-col-empty" style={{ minHeight: 44 }}>Drop here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
