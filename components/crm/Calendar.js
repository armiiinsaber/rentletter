// components/crm/Calendar.js
// A real month calendar of demo calls and follow-ups. Click an item → the lead. Drag an item to
// another day → reschedule (demo keeps its time; follow-up moves its date) — same useDrag as the
// board, so it works with a mouse and with a long-press on a phone. On narrow screens the grid
// shows dots and a tapped day's items are listed beneath it (chips don't fit in a 50px cell).
import { useMemo, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { calendarItems, today, ymd, parseYmd, fmtTime, fmtDay, weekday } from './model';
import useDrag from './useDrag';

const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Chip({ it, bind, lifted, onOpen, compact }) {
  const cls = `crm-chip ${it.kind} ${it.tone} ${lifted ? 'lifted' : ''}`;
  return (
    <button type="button" {...bind({ id: `${it.kind}:${it.lead.id}`, kind: it.kind })} className={cls} onClick={() => onOpen(it.lead.id)} title={`${it.lead.name} — ${it.kind === 'demo' ? `demo ${fmtTime(it.ts)}` : 'follow-up'}`}>
      <span className="crm-chip-mark" aria-hidden="true" />
      <span className="crm-chip-t">{it.kind === 'demo' && !compact ? `${fmtTime(it.ts)} ` : ''}{it.lead.name}</span>
      {compact && <span className="crm-chip-k">{it.kind === 'demo' ? `demo · ${fmtTime(it.ts)}` : 'follow-up'}</span>}
    </button>
  );
}

export default function Calendar({ leads, onOpen, onReschedule }) {
  const t = today();
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState(t);
  const items = useMemo(() => calendarItems(leads), [leads]);
  const byDay = useMemo(() => { const o = {}; for (const it of items) (o[it.day] = o[it.day] || []).push(it); return o; }, [items]);
  const { bind, dragging, over } = useDrag(({ id, target }) => { if (!target?.startsWith('day:')) return; const [kind, leadId] = id.split(':'); onReschedule(leadId, kind, target.slice(4)); });

  // 6-row grid starting Monday
  const first = new Date(cur.y, cur.m, 1); const offset = (first.getDay() + 6) % 7;
  const start = new Date(cur.y, cur.m, 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return ymd(d); });
  const inMonth = (day) => parseYmd(day).getMonth() === cur.m;
  const go = (n) => setCur((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const monthCount = items.filter((it) => inMonth(it.day)).length;
  const selItems = byDay[sel] || [];

  return (
    <div className={`crm-cal ${dragging ? 'dragging' : ''}`}>
      <div className="crm-cal-h">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h2 className="rl-serif crm-cal-t">{monthLabel(cur.y, cur.m)}</h2>
          <span style={{ fontSize: 12.5, color: C.inkMute }}>{monthCount ? `${monthCount} on the calendar` : 'Nothing scheduled'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="crm-btn ghost" onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /></button>
          <button type="button" className="crm-btn ghost" onClick={() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); setSel(t); }}>Today</button>
          <button type="button" className="crm-btn ghost" onClick={() => go(1)} aria-label="Next month"><Icon name="chevron" size={14} /></button>
        </div>
      </div>
      <div className="crm-cal-dow" aria-hidden="true">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="crm-cal-grid" role="grid">
        {cells.map((day) => {
          const list = byDay[day] || []; const isT = day === t; const hot = over === `day:${day}`;
          return (
            <div key={day} role="gridcell" data-drop={`day:${day}`} className={`crm-day ${inMonth(day) ? '' : 'out'} ${isT ? 'today' : ''} ${hot ? 'hot' : ''} ${sel === day ? 'sel' : ''}`} onClick={() => setSel(day)}>
              <span className="crm-day-n">{parseYmd(day).getDate()}{isT && <span className="crm-day-today">Today</span>}</span>
              <div className="crm-day-items">{list.map((it) => <Chip key={`${it.kind}:${it.lead.id}`} it={it} bind={bind} lifted={dragging?.id === `${it.kind}:${it.lead.id}`} onOpen={onOpen} />)}</div>
              <div className="crm-day-dots" aria-label={list.length ? `${list.length} items` : undefined}>{list.slice(0, 4).map((it) => <span key={`${it.kind}:${it.lead.id}`} className={`crm-dot ${it.kind} ${it.tone}`} />)}</div>
            </div>
          );
        })}
      </div>
      <div className="crm-cal-legend" aria-hidden="true">
        <span><span className="crm-dot demo upcoming" /> Demo</span><span><span className="crm-dot fu upcoming" /> Follow-up</span><span><span className="crm-dot fu overdue" /> Overdue</span><span><span className="crm-dot demo past" /> Done</span>
      </div>
      <section className="crm-cal-day" aria-label={`Items on ${fmtDay(sel, { year: true })}`}>
        <div className="crm-eyebrow">{sel === t ? 'Today' : `${weekday(sel)} ${fmtDay(sel)}`}</div>
        {selItems.length ? <div className="crm-cal-day-list">{selItems.map((it) => <Chip key={`${it.kind}:${it.lead.id}`} it={it} bind={bind} lifted={dragging?.id === `${it.kind}:${it.lead.id}`} onOpen={onOpen} compact />)}</div> : <p className="crm-quiet" style={{ margin: 0 }}>{sel === t ? 'Nothing scheduled today.' : 'Nothing on this day.'}</p>}
        <p className="crm-quiet" style={{ marginBottom: 0 }}>Drag an item onto a day to reschedule it — on a phone, press and hold first.</p>
      </section>
    </div>
  );
}
