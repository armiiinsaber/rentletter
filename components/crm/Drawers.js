// components/crm/Drawers.js
// QuickAdd — the fast path: a name and one way to reach them; stage defaults to New. "More"
//            unfolds the rest of the record for anyone who wants to back-fill on the spot.
// LeadDrawer — the lead record: every field editable (dates and stage included), brokerage as
//              a linked entity, append-only timestamped notes. Opens on the notes when asked.
// BrokerageDrawer — the firm: its notes and everyone the founder is talking to there.
// All three are bottom sheets on a phone and centred dialogs on desktop (AdminShell's Sheet).
// Every input is 16px so iOS Safari never auto-zooms; keyboard types match the field.
import { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme';
import { Icon } from '../ui';
import { Sheet } from '../admin/AdminShell';
import { STAGES, SOURCES, STAGE, cardDate, leadStatus, fmtStamp, toLocalInput, fromLocalInput, today } from './model';

const Field = ({ label, children, span }) => (
  <label className={`ad-f ${span ? 'span' : ''}`}><span className="ad-f-l">{label}</span>{children}</label>
);
const CONTACT = [
  { key: 'email', label: 'Email', type: 'email', inputMode: 'email', autoCapitalize: 'none', placeholder: 'name@brokerage.ca' },
  { key: 'phone', label: 'Phone', type: 'tel', inputMode: 'tel', autoCapitalize: 'none', placeholder: '(416) 555-0100' },
  { key: 'instagram', label: 'Instagram', type: 'text', inputMode: 'text', autoCapitalize: 'none', placeholder: 'handle' },
];

export function Notes({ notes, onAdd, onDelete, autoFocus }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  const submit = async (e) => { e?.preventDefault(); if (!text.trim() || busy) return; setBusy(true); const ok = await onAdd(text.trim()); setBusy(false); if (ok) setText(''); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <form onSubmit={submit}>
        <textarea ref={ref} className="ad-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was said, what’s next" autoCapitalize="sentences" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e); }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="submit" className="ad-btn secondary sm" disabled={!text.trim() || busy}>{busy ? 'Adding…' : 'Add note'}</button>
        </div>
      </form>
      {notes.length ? (
        <ol className="crm-note-list">
          {notes.map((n) => (
            <li key={n.id} className="crm-note">
              <div className="crm-note-meta"><span className="ad-tick" aria-hidden="true" /><span className="ad-num">{fmtStamp(n.created_at)}</span>
                <button type="button" className="crm-note-del" onClick={() => { if (confirm('Delete this note?')) onDelete(n.id); }} aria-label="Delete note"><Icon name="x" size={12} /></button>
              </div>
              <div className="crm-note-body">{n.body}</div>
            </li>
          ))}
        </ol>
      ) : <p className="ad-quiet">No notes yet.</p>}
    </div>
  );
}

const blank = () => ({ name: '', brokerage: '', email: '', phone: '', instagram: '', source: 'other', referred_by: '', stage: 'new', demo_at: '', follow_up_at: '', follow_up_email_sent: false, follow_up_email_sent_at: '' });
const fromLead = (l, brokerage) => ({ name: l.name || '', brokerage: brokerage?.name || '', email: l.email || '', phone: l.phone || '', instagram: l.instagram || '', source: l.source || 'other', referred_by: l.referred_by || '', stage: l.stage || 'new', demo_at: toLocalInput(l.demo_at), follow_up_at: l.follow_up_at ? String(l.follow_up_at).slice(0, 10) : '', follow_up_email_sent: !!l.follow_up_email_sent, follow_up_email_sent_at: l.follow_up_email_sent_at ? String(l.follow_up_email_sent_at).slice(0, 10) : '' });
const toBody = (form) => ({ ...form, demo_at: fromLocalInput(form.demo_at), follow_up_at: form.follow_up_at || null, follow_up_email_sent_at: form.follow_up_email_sent ? form.follow_up_email_sent_at || today() : null });

// The full field set, shared by QuickAdd's "More" and the lead record.
function LeadFields({ form, set, brokerageNames, nameRef, hideName, hideContacts }) {
  return (
    <>
      {!hideName && <Field label="Name" span><input ref={nameRef} className="ad-input" value={form.name} onChange={set('name')} required autoComplete="off" autoCapitalize="words" enterKeyHint="next" /></Field>}
      <Field label="Brokerage" span>
        <input className="ad-input" list="crm-brokerages" value={form.brokerage} onChange={set('brokerage')} placeholder="Type to link or create" autoComplete="off" autoCapitalize="words" />
        <datalist id="crm-brokerages">{brokerageNames.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      {!hideContacts && CONTACT.map((c) => (
        <Field key={c.key} label={c.label}>{c.key === 'instagram'
          ? <div className="crm-prefix"><span>@</span><input className="ad-input" type={c.type} inputMode={c.inputMode} autoCapitalize={c.autoCapitalize} autoCorrect="off" value={form[c.key]} onChange={set(c.key)} autoComplete="off" /></div>
          : <input className="ad-input" type={c.type} inputMode={c.inputMode} autoCapitalize={c.autoCapitalize} autoCorrect="off" value={form[c.key]} onChange={set(c.key)} autoComplete="off" />}
        </Field>
      ))}
      <Field label="Source"><select className="ad-input" value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      <Field label="Referred by"><input className="ad-input" value={form.referred_by} onChange={set('referred_by')} placeholder={form.source === 'referral' ? 'Who sent them' : 'Optional'} autoComplete="off" autoCapitalize="words" /></Field>
      <Field label="Stage" span><select className="ad-input" value={form.stage} onChange={set('stage')}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label} — {s.hint}</option>)}</select></Field>
      <Field label="Demo"><input className="ad-input" type="datetime-local" value={form.demo_at} onChange={set('demo_at')} /></Field>
      <Field label="Next follow-up"><input className="ad-input" type="date" value={form.follow_up_at} onChange={set('follow_up_at')} /></Field>
      <div className="ad-f span" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label className="ad-check"><input type="checkbox" checked={form.follow_up_email_sent} onChange={set('follow_up_email_sent')} /> Follow-up email sent</label>
        {form.follow_up_email_sent && <input className="ad-input" type="date" value={form.follow_up_email_sent_at} onChange={set('follow_up_email_sent_at')} aria-label="Follow-up email sent on" style={{ width: 'auto' }} />}
      </div>
    </>
  );
}

const useForm = (initial) => {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setForm((f) => { const n = { ...f, [k]: v }; if (k === 'follow_up_email_sent' && v && !f.follow_up_email_sent_at) n.follow_up_email_sent_at = today(); return n; }); };
  return [form, set];
};

// FAST ADD: name + one contact. Everything else later, from the record — or under "More" now.
export function QuickAdd({ brokerages, initialStage, initialBrokerage, onSave, onClose }) {
  const [form, set] = useForm({ ...blank(), stage: initialStage || 'new', brokerage: initialBrokerage?.name || '' });
  const [via, setVia] = useState('email');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const nameRef = useRef(null);
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 60); }, []);
  const brokerageNames = useMemo(() => brokerages.map((b) => b.name), [brokerages]);
  const c = CONTACT.find((x) => x.key === via);
  const save = async (e) => { e?.preventDefault(); if (busy || !form.name.trim()) return; setBusy(true); setErr(''); const r = await onSave(toBody(form)); setBusy(false); if (r?.error) setErr(r.error); };
  return (
    <Sheet eyebrow="New lead" title="Who are you talking to?" onClose={onClose}
      footer={<><button type="submit" form="crm-quick" className="ad-btn primary" disabled={busy || !form.name.trim()}>{busy ? 'Adding…' : 'Add lead'}</button>{err && <span role="alert" style={{ fontSize: 13, color: C.instDangerText }}>{err}</span>}<button type="button" className="ad-btn ghost" onClick={() => setMore((m) => !m)} style={{ marginLeft: 'auto' }} aria-expanded={more}>{more ? 'Less' : 'More fields'}</button></>}>
      <form id="crm-quick" onSubmit={save} className="crm-form">
        <Field label="Name" span><input ref={nameRef} className="ad-input" value={form.name} onChange={set('name')} required autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="First and last" /></Field>
        <div className="ad-f span">
          <div className="ad-seg" role="tablist" aria-label="How to reach them" style={{ alignSelf: 'flex-start' }}>
            {CONTACT.map((x) => <button key={x.key} type="button" role="tab" aria-selected={via === x.key} className={via === x.key ? 'on' : ''} onClick={() => setVia(x.key)}>{x.label}</button>)}
          </div>
          {via === 'instagram'
            ? <div className="crm-prefix"><span>@</span><input className="ad-input" type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" value={form.instagram} onChange={set('instagram')} placeholder={c.placeholder} autoComplete="off" aria-label="Instagram" enterKeyHint="done" /></div>
            : <input key={via} className="ad-input" type={c.type} inputMode={c.inputMode} autoCapitalize="none" autoCorrect="off" value={form[via]} onChange={set(via)} placeholder={c.placeholder} autoComplete="off" aria-label={c.label} enterKeyHint="done" />}
        </div>
        {more && <LeadFields form={form} set={set} brokerageNames={brokerageNames} hideName hideContacts />}
      </form>
      {!more && <p className="ad-quiet" style={{ marginTop: 12, fontSize: 12.5 }}>Lands in {STAGE[form.stage]?.label}. Brokerage, dates and the rest can be added from the record.</p>}
    </Sheet>
  );
}

export function LeadDrawer({ lead, brokerages, brokeragesById, notes, focusNotes, onSave, onDelete, onAddNote, onDeleteNote, onOpenBrokerage, onClose }) {
  const brokerage = brokeragesById[lead.brokerage_id];
  const [form, set] = useForm(fromLead(lead, brokerage));
  const [saved, setSaved] = useState(() => JSON.stringify(fromLead(lead, brokerage)));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dirty = JSON.stringify(form) !== saved;
  const save = async (e) => { e?.preventDefault(); if (busy) return; setBusy(true); setErr(''); const r = await onSave({ id: lead.id, ...toBody(form) }); setBusy(false); if (r?.error) { setErr(r.error); return; } setSaved(JSON.stringify(form)); setEditing(false); };
  const st = leadStatus(lead); const d = cardDate(lead);
  const brokerageNames = useMemo(() => brokerages.map((b) => b.name), [brokerages]);
  const linked = brokerage && form.brokerage.trim().toLowerCase() === brokerage.name.toLowerCase() ? brokerage : null;
  const contacts = CONTACT.map((c) => ({ ...c, v: lead[c.key] })).filter((c) => c.v);
  return (
    <Sheet eyebrow={STAGE[lead.stage]?.label} title={lead.name} wide onClose={() => { if (!dirty || confirm('Discard unsaved changes?')) onClose(); }}
      footer={editing ? (
        <><button type="submit" form="crm-lead-form" className="ad-btn primary" disabled={busy || !dirty || !form.name.trim()}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="ad-btn ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>{err && <span role="alert" style={{ fontSize: 13, color: C.instDangerText }}>{err}</span>}<button type="button" className="ad-btn ghost" style={{ marginLeft: 'auto', color: C.instDangerText }} onClick={() => { if (confirm(`Delete ${lead.name} and their notes? This cannot be undone.`)) onDelete(lead.id); }}>Delete</button></>
      ) : (
        <><button type="button" className="ad-btn secondary" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Edit details</button>{d && <span className="ad-pill" style={{ marginLeft: 'auto', color: st.overdue ? C.instDangerText : C.instMute, borderColor: st.overdue ? C.instDangerText : C.instRule }}>{d.label} · {d.text}</span>}</>
      )}>
      {!editing ? (
        <>
          <div className="crm-facts">
            {linked ? <button type="button" className="ad-link" onClick={() => onOpenBrokerage(linked.id)}>{linked.name} <Icon name="arrow" size={12} /></button> : <span className="ad-quiet">No brokerage</span>}
            {contacts.map((c) => (
              <a key={c.key} className="crm-fact" href={c.key === 'email' ? `mailto:${c.v}` : c.key === 'phone' ? `tel:${c.v}` : `https://instagram.com/${String(c.v).replace(/^@/, '')}`} target={c.key === 'instagram' ? '_blank' : undefined} rel="noreferrer">
                <Icon name={c.key === 'email' ? 'mail' : c.key === 'phone' ? 'phone' : 'link'} size={14} color={C.instMute} /><span style={{ overflowWrap: 'anywhere' }}>{c.key === 'instagram' ? `@${String(c.v).replace(/^@/, '')}` : c.v}</span>
              </a>
            ))}
            {!contacts.length && <span className="ad-quiet">No contact details yet.</span>}
            {(lead.source && lead.source !== 'other') || lead.referred_by ? <span className="ad-quiet">{SOURCES.find((s) => s.key === lead.source)?.label}{lead.referred_by ? ` · via ${lead.referred_by}` : ''}</span> : null}
          </div>
          <section style={{ marginTop: 18 }}>
            <div className="ad-eyebrow">Notes</div>
            <Notes notes={notes} autoFocus={focusNotes} onAdd={(t) => onAddNote({ leadId: lead.id, body: t })} onDelete={onDeleteNote} />
          </section>
        </>
      ) : (
        <form id="crm-lead-form" onSubmit={save} className="crm-form">
          <LeadFields form={form} set={set} brokerageNames={brokerageNames} />
        </form>
      )}
    </Sheet>
  );
}

export function BrokerageDrawer({ brokerage, leads, notes, onSave, onDelete, onAddNote, onDeleteNote, onOpenLead, onNewLead, onClose }) {
  const [name, setName] = useState(brokerage.name); const [website, setWebsite] = useState(brokerage.website || '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const dirty = name !== brokerage.name || website !== (brokerage.website || '');
  const save = async (e) => { e.preventDefault(); if (busy || !name.trim()) return; setBusy(true); setErr(''); const r = await onSave({ id: brokerage.id, name, website }); setBusy(false); if (r?.error) setErr(r.error); };
  const people = [...leads].sort((a, b) => STAGES.findIndex((s) => s.key === a.stage) - STAGES.findIndex((s) => s.key === b.stage));
  return (
    <Sheet eyebrow="Brokerage" title={brokerage.name} wide onClose={onClose}
      footer={<><button type="submit" form="crm-brk-form" className="ad-btn primary" disabled={busy || !dirty || !name.trim()}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>{err && <span role="alert" style={{ fontSize: 13, color: C.instDangerText }}>{err}</span>}<button type="button" className="ad-btn ghost" style={{ marginLeft: 'auto', color: C.instDangerText }} onClick={() => { if (confirm(`Delete ${brokerage.name}? Its people stay, unlinked.`)) onDelete(brokerage.id); }}>Delete</button></>}>
      <form id="crm-brk-form" onSubmit={save} className="crm-form">
        <Field label="Name" span><input className="ad-input" value={name} onChange={(e) => setName(e.target.value)} required autoCapitalize="words" /></Field>
        <Field label="Website" span><input className="ad-input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Optional" inputMode="url" autoCapitalize="none" autoCorrect="off" /></Field>
      </form>
      <section style={{ marginTop: 18 }}>
        <div className="ad-eyebrow">People here · <span className="ad-num">{people.length}</span></div>
        <ul className="crm-people">
          {people.map((l) => { const d = cardDate(l); const s = leadStatus(l); return (
            <li key={l.id}><button type="button" className="crm-person" onClick={() => onOpenLead(l.id)}>
              <span className="ad-tick" aria-hidden="true" />
              <span style={{ minWidth: 0, flex: 1 }}><span style={{ fontWeight: 700 }}>{l.name}</span><span className="crm-person-meta">{STAGE[l.stage]?.label}{d ? ` · ${d.label} ${d.text}` : ''}</span></span>
              {s.overdue && <span className="ad-pill danger">Overdue</span>}
              <Icon name="chevron" size={14} color={C.instMute} />
            </button></li>
          ); })}
        </ul>
        <button type="button" className="ad-btn secondary sm" onClick={() => onNewLead(brokerage)} style={{ marginTop: 8 }}><Icon name="plus" size={13} /> Add someone here</button>
      </section>
      <section style={{ marginTop: 18 }}>
        <div className="ad-eyebrow">Firm notes</div>
        <Notes notes={notes} onAdd={(t) => onAddNote({ brokerageId: brokerage.id, body: t })} onDelete={onDeleteNote} />
      </section>
    </Sheet>
  );
}
