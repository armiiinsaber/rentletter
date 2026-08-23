// components/crm/Drawers.js
// LeadDrawer — the lead record: every field editable (including dates and stage, for
// back-filling), brokerage as a linked entity, append-only timestamped notes.
// BrokerageDrawer — the firm: its notes and everyone the founder is talking to there.
// Both are side panels on desktop and full-screen sheets on a phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { STAGES, SOURCES, STAGE, cardDate, leadStatus, fmtStamp, toLocalInput, fromLocalInput, today } from './model';

const Field = ({ label, children, span }) => (
  <label className={`crm-f ${span ? 'span' : ''}`}><span className="crm-f-l">{label}</span>{children}</label>
);

export function Drawer({ title, eyebrow, onClose, children, footer, wide }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="crm-scrim" onClick={onClose}>
      <aside className={`crm-drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="crm-drawer-h">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="crm-eyebrow">{eyebrow}</div>}
            <h2 className="crm-drawer-t rl-serif">{title}</h2>
          </div>
          <button type="button" className="crm-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>
        <div className="crm-drawer-b">{children}</div>
        {footer && <footer className="crm-drawer-f">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Notes({ notes, onAdd, onDelete }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e?.preventDefault(); if (!text.trim() || busy) return; setBusy(true); const ok = await onAdd(text.trim()); setBusy(false); if (ok) setText(''); };
  return (
    <div className="crm-notes">
      <form onSubmit={submit} className="crm-note-form">
        <textarea className="crm-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note — what was said, what's next…" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e); }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 11.5, color: C.inkMute }}>Notes are kept in order — nothing is overwritten.</span>
          <button type="submit" className="crm-btn ink" disabled={!text.trim() || busy}>{busy ? 'Adding…' : 'Add note'}</button>
        </div>
      </form>
      {notes.length ? (
        <ol className="crm-note-list">
          {notes.map((n) => (
            <li key={n.id} className="crm-note">
              <div className="crm-note-meta"><span className="crm-tick" aria-hidden="true" />{fmtStamp(n.created_at)}
                <button type="button" className="crm-note-del" onClick={() => { if (confirm('Delete this note?')) onDelete(n.id); }} aria-label="Delete note"><Icon name="x" size={11} /></button>
              </div>
              <div className="crm-note-body">{n.body}</div>
            </li>
          ))}
        </ol>
      ) : <p className="crm-quiet">No notes yet. The first one usually follows the first call.</p>}
    </div>
  );
}

const blank = () => ({ name: '', brokerage: '', email: '', phone: '', instagram: '', source: 'other', referred_by: '', stage: 'new', demo_at: '', follow_up_at: '', follow_up_email_sent: false, follow_up_email_sent_at: '' });
const fromLead = (l, brokerage) => ({ name: l.name || '', brokerage: brokerage?.name || '', email: l.email || '', phone: l.phone || '', instagram: l.instagram || '', source: l.source || 'other', referred_by: l.referred_by || '', stage: l.stage, demo_at: toLocalInput(l.demo_at), follow_up_at: l.follow_up_at ? String(l.follow_up_at).slice(0, 10) : '', follow_up_email_sent: !!l.follow_up_email_sent, follow_up_email_sent_at: l.follow_up_email_sent_at ? String(l.follow_up_email_sent_at).slice(0, 10) : '' });

export function LeadDrawer({ lead, brokerages, brokeragesById, notes, initialStage, initialBrokerage, onSave, onDelete, onAddNote, onDeleteNote, onOpenBrokerage, onClose }) {
  const isNew = !lead;
  const brokerage = lead ? brokeragesById[lead.brokerage_id] : null;
  const [form, setForm] = useState(() => (lead ? fromLead(lead, brokerage) : { ...blank(), stage: initialStage || 'new', brokerage: initialBrokerage?.name || '' }));
  const [saved, setSaved] = useState(() => JSON.stringify(lead ? fromLead(lead, brokerage) : null));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dirty = JSON.stringify(form) !== saved;
  const nameRef = useRef(null);
  useEffect(() => { if (isNew) nameRef.current?.focus(); }, [isNew]);
  const set = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setForm((f) => { const n = { ...f, [k]: v }; if (k === 'follow_up_email_sent' && v && !f.follow_up_email_sent_at) n.follow_up_email_sent_at = today(); return n; }); };
  const save = async (e) => {
    e?.preventDefault(); if (busy) return; setBusy(true); setErr('');
    const body = { ...form, demo_at: fromLocalInput(form.demo_at), follow_up_at: form.follow_up_at || null, follow_up_email_sent_at: form.follow_up_email_sent ? form.follow_up_email_sent_at || today() : null };
    const r = await onSave(lead ? { id: lead.id, ...body } : body);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    setSaved(JSON.stringify(form));
  };
  const st = lead ? leadStatus(lead) : null; const d = lead ? cardDate(lead) : null;
  const brokerageNames = useMemo(() => brokerages.map((b) => b.name), [brokerages]);
  const linked = lead && brokerage && form.brokerage.trim().toLowerCase() === brokerage.name.toLowerCase() ? brokerage : null;

  return (
    <Drawer eyebrow={isNew ? 'New lead' : STAGE[lead.stage]?.label} title={isNew ? 'Who are you talking to?' : lead.name} onClose={() => { if (!dirty || confirm('Discard unsaved changes?')) onClose(); }}
      footer={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" form="crm-lead-form" className="crm-btn red" disabled={busy || (!isNew && !dirty) || !form.name.trim()}>{busy ? 'Saving…' : isNew ? 'Add lead' : dirty ? 'Save changes' : 'Saved'}</button>
          {err && <span role="alert" style={{ fontSize: 12.5, color: C.danger }}>{err}</span>}
          {!isNew && <button type="button" className="crm-btn ghost" style={{ marginLeft: 'auto', color: C.danger }} onClick={() => { if (confirm(`Delete ${lead.name} and their notes? This cannot be undone.`)) onDelete(lead.id); }}>Delete lead</button>}
        </div>
      )}>
      {!isNew && (
        <div className="crm-lead-top">
          {linked ? <button type="button" className="crm-link" onClick={() => onOpenBrokerage(linked.id)}>{linked.name} <Icon name="arrow" size={12} /></button> : <span style={{ color: C.inkMute, fontSize: 13 }}>No brokerage linked</span>}
          {d && <span className="crm-pill" style={{ color: st.overdue ? C.danger : C.inkSoft, borderColor: st.overdue ? C.danger : C.rule }}>{d.label} · {d.text}</span>}
        </div>
      )}
      <form id="crm-lead-form" onSubmit={save} className="crm-form">
        <Field label="Name" span><input ref={nameRef} className="crm-input" value={form.name} onChange={set('name')} required autoComplete="off" /></Field>
        <Field label="Brokerage" span>
          <input className="crm-input" list="crm-brokerages" value={form.brokerage} onChange={set('brokerage')} placeholder="Type to link or create" autoComplete="off" />
          <datalist id="crm-brokerages">{brokerageNames.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="Email"><input className="crm-input" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="off" /></Field>
        <Field label="Phone"><input className="crm-input" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="off" /></Field>
        <Field label="Instagram"><div className="crm-prefix"><span>@</span><input className="crm-input" value={form.instagram} onChange={set('instagram')} autoComplete="off" /></div></Field>
        <Field label="Source"><select className="crm-input" value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Referred by" span><input className="crm-input" value={form.referred_by} onChange={set('referred_by')} placeholder={form.source === 'referral' ? 'Who sent them' : 'Optional'} autoComplete="off" /></Field>
        <Field label="Stage" span>
          <select className="crm-input" value={form.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label} — {s.hint}</option>)}</select>
        </Field>
        <Field label="Demo date & time"><input className="crm-input" type="datetime-local" value={form.demo_at} onChange={set('demo_at')} /></Field>
        <Field label="Next follow-up"><input className="crm-input" type="date" value={form.follow_up_at} onChange={set('follow_up_at')} /></Field>
        <div className="crm-f span" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label className="crm-check"><input type="checkbox" checked={form.follow_up_email_sent} onChange={set('follow_up_email_sent')} /> Follow-up email sent</label>
          {form.follow_up_email_sent && <input className="crm-input" type="date" value={form.follow_up_email_sent_at} onChange={set('follow_up_email_sent_at')} aria-label="Follow-up email sent on" style={{ width: 'auto' }} />}
        </div>
      </form>
      {!isNew && (
        <section style={{ marginTop: 22 }}>
          <div className="crm-eyebrow">Notes</div>
          <Notes notes={notes} onAdd={(t) => onAddNote({ leadId: lead.id, body: t })} onDelete={onDeleteNote} />
        </section>
      )}
    </Drawer>
  );
}

export function BrokerageDrawer({ brokerage, leads, notes, onSave, onDelete, onAddNote, onDeleteNote, onOpenLead, onNewLead, onClose }) {
  const [name, setName] = useState(brokerage.name); const [website, setWebsite] = useState(brokerage.website || '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dirty = name !== brokerage.name || website !== (brokerage.website || '');
  const save = async (e) => { e.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setErr(''); const r = await onSave({ id: brokerage.id, name, website }); setBusy(false); if (r?.error) setErr(r.error); };
  const people = [...leads].sort((a, b) => STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage));
  return (
    <Drawer eyebrow="Brokerage" title={brokerage.name} onClose={onClose}
      footer={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button type="submit" form="crm-brk-form" className="crm-btn red" disabled={busy || !dirty || !name.trim()}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>{err && <span role="alert" style={{ fontSize: 12.5, color: C.danger }}>{err}</span>}<button type="button" className="crm-btn ghost" style={{ marginLeft: 'auto', color: C.danger }} onClick={() => { if (confirm(`Remove ${brokerage.name}? Its ${people.length} lead${people.length === 1 ? '' : 's'} stay, unlinked.`)) onDelete(brokerage.id); }}>Remove</button></div>}>
      <form id="crm-brk-form" onSubmit={save} className="crm-form">
        <Field label="Name" span><input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Website" span><input className="crm-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Optional" inputMode="url" /></Field>
      </form>
      <section style={{ marginTop: 22 }}>
        <div className="crm-eyebrow">People here · {people.length}</div>
        <p className="crm-quiet" style={{ marginTop: 0 }}>{people.length > 1 ? 'Several conversations at one firm — they may not know about each other.' : people.length === 1 ? 'One conversation so far.' : 'Nobody yet.'}</p>
        <ul className="crm-people">
          {people.map((l) => { const d = cardDate(l); const s = leadStatus(l); return (
            <li key={l.id}><button type="button" className="crm-person" onClick={() => onOpenLead(l.id)}>
              <span className="crm-tick" aria-hidden="true" />
              <span style={{ minWidth: 0, flex: 1 }}><span style={{ fontWeight: 700, color: C.ink }}>{l.name}</span><span className="crm-person-meta">{STAGE[l.stage]?.label}{d ? ` · ${d.label} ${d.text}` : ''}</span></span>
              {s.overdue && <span className="crm-flag">Overdue</span>}
              <Icon name="chevron" size={14} />
            </button></li>
          ); })}
        </ul>
        <button type="button" className="crm-btn ghost" onClick={() => onNewLead(brokerage)} style={{ marginTop: 8 }}><Icon name="plus" size={13} /> Add someone here</button>
      </section>
      <section style={{ marginTop: 22 }}>
        <div className="crm-eyebrow">Firm notes</div>
        <Notes notes={notes} onAdd={(t) => onAddNote({ brokerageId: brokerage.id, body: t })} onDelete={onDeleteNote} />
      </section>
    </Drawer>
  );
}
