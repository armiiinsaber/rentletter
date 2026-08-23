// components/crm/Morning.js
// The "today" strip above the board: overdue, today, due this week. Three honest cells; when
// there's nothing it says so in one quiet line instead of three empty boxes.
import { C } from '../theme';
import { morning, fmtDay, addDays, today } from './model';

function Cell({ label, tone, items, onOpen, empty }) {
  return (
    <div className={`crm-m-cell ${tone}`}>
      <div className="crm-m-l"><span className="crm-tick" aria-hidden="true" /> {label} <span className="crm-m-n">{items.length}</span></div>
      {items.length ? (
        <ul className="crm-m-list">
          {items.slice(0, 5).map((it) => (
            <li key={`${it.kind}:${it.lead.id}`}><button type="button" className="crm-m-item" onClick={() => onOpen(it.lead.id)}><span className="crm-m-name">{it.lead.name}</span><span className="crm-m-what">{it.what}</span></button></li>
          ))}
          {items.length > 5 && <li className="crm-m-more">+{items.length - 5} more</li>}
        </ul>
      ) : <div className="crm-m-empty">{empty}</div>}
    </div>
  );
}

export default function Morning({ leads, onOpen }) {
  const m = morning(leads);
  const quiet = !m.overdue.length && !m.today.length && !m.week.length;
  const date = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  if (quiet) {
    return (
      <div className="crm-m quiet">
        <span className="crm-tick" aria-hidden="true" /><strong>{date}.</strong> Nothing overdue, nothing today, a clear week. {leads.length ? 'Pick someone to reach.' : 'Add your first lead.'}
      </div>
    );
  }
  return (
    <div className="crm-m" aria-label="This morning">
      <div className="crm-m-date">{date}</div>
      <div className="crm-m-grid">
        <Cell label="Overdue" tone="danger" items={m.overdue} onOpen={onOpen} empty="Nothing overdue." />
        <Cell label="Today" tone="red" items={m.today} onOpen={onOpen} empty="Nothing scheduled today." />
        <Cell label="This week" tone="ink" items={m.week} onOpen={onOpen} empty={`Clear through ${fmtDay(addDays(today(), 7))}.`} />
      </div>
    </div>
  );
}
