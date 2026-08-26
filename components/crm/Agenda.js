// components/crm/Agenda.js
// The pipeline IN TIME — what today needs, in the order it needs it, with the action on the row.
// Overdue → Today → This week → Later. A follow-up row can be marked sent (next touch is
// scheduled a week out), a demo row marked done (stage → demo done), any row noted or opened.
// This is the phone's default view: open, see what's due, act, close.
import { C } from '../theme';
import { Icon } from '../ui';
import { agenda, fmtDay, fmtTime, relDay, STAGE } from './model';

function Row({ it, onOpen, onNote, onFollowUpSent, onDemoDone }) {
  const l = it.lead;
  const tone = it.bucket === 'overdue' ? 'overdue' : it.bucket === 'today' ? 'today' : '';
  return (
    <li className={`crm-ag-row ${tone}`}>
      <button type="button" className="crm-ag-main" onClick={() => onOpen(l.id)}>
        <span className="crm-ag-mark" aria-hidden="true" />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="crm-ag-name">{l.name}</span>
          <span className="crm-ag-what">{it.kind === 'demo' ? `Demo${it.ts ? ` · ${fmtTime(it.ts)}` : ''}` : 'Follow up'}{it.bucket === 'overdue' ? ` · was ${relDay(it.when)}` : it.bucket !== 'today' ? ` · ${relDay(it.when)}` : ''}{l.brokerageName ? ` · ${l.brokerageName}` : ''}</span>
        </span>
        <Icon name="chevron" size={14} color={C.instMute} />
      </button>
      <div className="crm-ag-acts">
        {it.kind === 'fu' && <button type="button" className="ad-btn secondary sm" onClick={() => onFollowUpSent(l.id)} title="Mark the follow-up email sent; next follow-up in a week"><Icon name="mail" size={13} /> Sent</button>}
        {it.kind === 'demo' && <button type="button" className="ad-btn secondary sm" onClick={() => onDemoDone(l.id)} title="Demo done"><Icon name="check" size={13} /> Done</button>}
        <button type="button" className="ad-btn ghost sm" onClick={() => onNote(l.id)} aria-label={`Add a note for ${l.name}`}><Icon name="edit" size={13} /> Note</button>
      </div>
    </li>
  );
}

function Section({ label, tone, items, empty, children, ...acts }) {
  if (!items.length && !empty) return null;
  return (
    <section className={`crm-ag-sec ${tone || ''}`} aria-label={label}>
      <div className="crm-ag-h"><span className="ad-tick" aria-hidden="true" />{label}<span className="ad-num crm-ag-n">{items.length}</span></div>
      {items.length ? <ul className="crm-ag-list">{items.map((it) => <Row key={`${it.kind}:${it.lead.id}`} it={it} {...acts} />)}</ul> : <div className="crm-ag-empty">{empty}</div>}
      {children}
    </section>
  );
}

export default function Agenda({ leads, brokeragesById, onOpen, onNote, onFollowUpSent, onDemoDone, onNew }) {
  const withBrk = leads.map((l) => ({ ...l, brokerageName: brokeragesById?.[l.brokerage_id]?.name || null }));
  const a = agenda(withBrk);
  const date = new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  const acts = { onOpen, onNote, onFollowUpSent, onDemoDone };
  const quiet = !a.overdue.length && !a.today.length;
  return (
    <div className="crm-ag">
      <div className="crm-ag-date">{date}</div>
      {quiet && <p className="crm-ag-quiet">{leads.length ? 'Nothing overdue, nothing due today.' : 'No leads yet.'} {a.week.length ? `${a.week.length} this week.` : a.later.length ? `Next up ${fmtDay(a.later[0].when)}.` : leads.length ? 'Pick someone to reach.' : ''}</p>}
      <Section label="Overdue" tone="danger" items={a.overdue} {...acts} />
      <Section label="Today" tone="red" items={a.today} {...acts} />
      <Section label="This week" items={a.week} empty={quiet ? null : 'Clear for the rest of the week.'} {...acts} />
      <Section label="Later" items={a.later} {...acts} />
      {!leads.length && <button type="button" className="ad-btn primary" onClick={onNew}><Icon name="plus" size={14} /> Add the first lead</button>}
      {!!leads.length && !a.overdue.length && !a.today.length && !a.week.length && !a.later.length && (
        <div className="ad-well" style={{ padding: '14px 16px', marginTop: 6 }}>
          <div className="ad-quiet" style={{ color: C.instText, fontSize: 14 }}>Nothing scheduled at all. Open a lead on the board and set a follow-up so it shows up here.</div>
        </div>
      )}
      <p className="ad-quiet" style={{ marginTop: 12, fontSize: 12.5 }}>Sent = email went out; the next follow-up lands a week later. Done = demo happened; the lead moves to {STAGE.demo_done.label}.</p>
    </div>
  );
}
