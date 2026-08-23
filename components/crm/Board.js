// components/crm/Board.js
// The pipeline: seven columns, cards, drag between columns (mouse drag / touch long-press via
// useDrag) plus an explicit "Move" stage picker on every card — the guaranteed path on a phone.
// Columns always render, even empty: the shape of the pipeline is the information.
import { useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { STAGES, STAGE, cardDate, leadStatus, initials } from './model';
import useDrag from './useDrag';

const TONE = { danger: C.danger, red: C.red, green: C.green, mute: C.inkMute, ink: C.ink };

export function StageMenu({ current, onPick, onClose }) {
  return (
    <div className="crm-menu" role="menu" onClick={(e) => e.stopPropagation()}>
      <div className="crm-menu-h">Move to</div>
      {STAGES.map((s) => (
        <button key={s.key} type="button" role="menuitem" className={`crm-menu-i ${s.key === current ? 'on' : ''}`} onClick={() => { onPick(s.key); onClose(); }}>
          <span className="crm-tick" aria-hidden="true" style={{ opacity: s.key === current ? 1 : 0 }} />
          <span>{s.label}</span>
          <span className="crm-menu-hint">{s.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function LeadCard({ lead, brokerage, onOpen, onMove, lifted, bind }) {
  const [menu, setMenu] = useState(false);
  const d = cardDate(lead);
  const s = leadStatus(lead);
  return (
    <article {...(bind ? bind({ id: lead.id, kind: 'lead' }) : {})} className={`crm-card ${lifted ? 'lifted' : ''} ${s.overdue ? 'overdue' : ''}`} onClick={() => onOpen(lead.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(lead.id); }} tabIndex={0} role="button" aria-label={`${lead.name}${brokerage ? `, ${brokerage.name}` : ''}`}>
      <div className="crm-card-top">
        <span className="crm-avatar" aria-hidden="true">{initials(lead.name)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crm-card-name">{lead.name}</div>
          <div className="crm-card-brk">{brokerage?.name || <span style={{ color: C.inkMute }}>No brokerage</span>}</div>
        </div>
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <button type="button" className="crm-move" aria-label={`Move ${lead.name} to another stage`} aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}>
            <Icon name="list" size={14} />
          </button>
          {menu && <StageMenu current={lead.stage} onPick={(k) => onMove(lead.id, k)} onClose={() => setMenu(false)} />}
        </span>
      </div>
      <div className="crm-card-foot">
        {d ? (
          <span className="crm-card-date" style={{ color: TONE[d.tone] || C.ink }}>
            <span className="crm-card-date-l">{d.label}</span> {d.text}
          </span>
        ) : <span className="crm-card-date" style={{ color: C.inkMute }}>No date set</span>}
      </div>
    </article>
  );
}

export default function Board({ leads, brokeragesById, onOpen, onMove }) {
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
          <section key={s.key} className={`crm-col ${hot ? 'hot' : ''} crm-col-${s.key}`} data-drop={`stage:${s.key}`} role="listitem" aria-label={`${s.label}, ${list.length}`}>
            <header className="crm-col-h">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span className="crm-tick" aria-hidden="true" />
                <span className="crm-col-name">{s.label}</span>
                <span className="crm-col-n">{list.length}</span>
              </div>
              <div className="crm-col-hint">{STAGE[s.key].hint}</div>
            </header>
            <div className="crm-col-body">
              {list.map((l) => <LeadCard key={l.id} lead={l} brokerage={brokeragesById[l.brokerage_id]} onOpen={onOpen} onMove={onMove} lifted={dragging?.id === l.id} bind={bind} />)}
              {!list.length && <div className="crm-col-empty">{dragging ? 'Drop here' : s.key === 'client' ? 'No clients yet.' : s.key === 'set_aside' ? 'Nobody set aside.' : 'Empty.'}</div>}
              {!!list.length && dragging && <div className="crm-col-empty" style={{ minHeight: 44 }}>Drop here</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
