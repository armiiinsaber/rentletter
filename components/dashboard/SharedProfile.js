// components/dashboard/SharedProfile.js
// The profile a tenant shared with this realtor by applying to their listing with it, on the
// applicant's card (components/dashboard/ListingView.js). Two routes, both a realtor's own
// (session, entitlement, ownership of the applicant, then the share):
//   /api/profile-shares/view  peek first (is there a share, has it ended: nothing read, nothing
//                             logged); then, on the realtor's tap, the read, which is written to
//                             the tenant's log and shown to the tenant;
//   /api/profile-shares/open  one stored document (proof of income or an employment letter,
//                             never an ID), a 60 second link, for 14 days from the share.
// What shows is the whitelist (lib/profileFacts.js) and the facts read from documents, each with
// its source and date. Never the Fit score, a rank, a note or household size: the route sends
// none and this component has nowhere to draw one. A share the tenant stopped says so, and
// nothing else shows. Nothing is drawn where nothing was shared, or in the sandbox.
// Values read as the rest of the realtor side writes them: money as "$118,000" (lib/typeset.js
// money), a date as "Dec 1, 2026" (the format of components/dashboard/CompareTenants.js), time
// as "4 yrs". Only what is drawn changes; the share payload and the stored values do not.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { StackedLines } from '../ui';
import { noWidow, dateLong, money } from '../../lib/typeset';
import { useAdapter } from '../../lib/dashboardAdapter';
import { checkText, KIND_LABEL } from '../../lib/tenantVaultRules';
import { Pending } from '../brand/Loader';

const line = { fontSize: 'var(--t-body-2)', lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'balance', margin: 0 };
const label = { fontSize: 'var(--t-eyebrow)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkMute, lineHeight: 1.2 };
const value = { fontSize: 'var(--t-body-2)', lineHeight: 1.4, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', textWrap: 'balance' };
const source = { fontSize: 13, lineHeight: 1.4, color: C.inkMute, textWrap: 'balance' };
const button = { minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const text = { ...button, minHeight: 44, padding: 0, border: 'none', textDecoration: 'underline', textAlign: 'left' };

// A date typed as 2026-12-01 is that calendar day, wherever the realtor is.
const shortDate = (v) => { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00` : v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); };
const years = (v) => { const n = Number(v); return String(v).trim() !== '' && Number.isFinite(n) ? `${n} ${n === 1 ? 'yr' : 'yrs'}` : String(v); };
// How one shared fact reads. Anything not listed is shown as typed.
export const readable = (key, v) => (
  key === 'annualIncome' ? (money(v) || String(v))
    : key === 'moveInDate' ? shortDate(v)
      : key === 'yearsAtJob' || key === 'yearsAtPrevious' ? years(v)
        : String(v ?? '')
);

export default function SharedProfile({ linkId }) {
  const adapter = useAdapter();
  const [state, setState] = useState(null);   // null | { shared, ended, message } | the read
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const post = async (url, body) => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || 'Something went wrong. Try again.'); return j; };
  useEffect(() => {
    if (adapter.kind !== 'real' || !linkId) return undefined;
    let live = true;
    (async () => { try { const j = await post('/api/profile-shares/view', { linkId, peek: true }); if (live) setState(j); } catch (e) { /* the section stays out of the card */ } })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, linkId]);
  if (!state || !state.shared) return null;
  const view = async () => { if (busy) return; setBusy('view'); setError(''); try { setState(await post('/api/profile-shares/view', { linkId })); } catch (e) { setError(e.message); } setBusy(''); };
  const open = async (id) => {
    if (busy) return; setBusy(`open:${id}`); setError('');
    try { const j = await post('/api/profile-shares/open', { linkId, documentId: id }); if (j.url) window.open(j.url, '_blank', 'noopener'); } catch (e) { setError(e.message); }
    setBusy('');
  };
  const read = Array.isArray(state.facts);
  return (
    <section data-shared-profile={state.ended || (read ? 'read' : 'shared')} aria-label="Shared profile" style={{ borderTop: `1px solid ${C.rule}`, marginTop: 'var(--gap-card)', paddingTop: 'var(--gap-card)', display: 'grid', gap: 'var(--gap-line)' }}>
      <h3 className="t-d3" style={{ color: C.ink, margin: 0 }}>Shared profile</h3>
      {state.ended && <p data-shared-ended="" style={line}>{noWidow(state.message || 'This share has ended.')}</p>}
      {!state.ended && !read && (
        <>
          <p style={line}>{noWidow('This tenant applied with their profile and shared it with you. They see each time you view it.')}</p>
          <button type="button" data-shared-view="" onClick={view} disabled={!!busy} style={button}><Pending busy={busy === 'view'} label="Opening">View shared profile</Pending></button>
        </>
      )}
      {!state.ended && read && (
        <>
          <p style={line}>{noWidow(`Shared with you on ${dateLong(state.sharedAt)}. The tenant sees this view in their log.`)}</p>
          <ul data-shared-facts="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {state.facts.map((f, i) => (
              <li key={f.key} data-shared-fact={f.key} style={{ padding: 'var(--s-2) 0', borderTop: i ? `1px solid ${C.rule}` : 'none', display: 'grid', gap: 2 }}>
                <div style={label}>{f.label}</div>
                <div className={f.key === 'email' ? 'rl-addr' : undefined} style={value}>{f.key === 'email' ? f.value : <StackedLines text={readable(f.key, f.value)} />}</div>
                <div style={source}>{noWidow(f.line)}</div>
              </li>
            ))}
            {state.checks.map((c) => { const t = checkText(c); return (
              <li key={c.kind} data-shared-check={c.kind} style={{ padding: 'var(--s-2) 0', borderTop: `1px solid ${C.rule}`, display: 'grid', gap: 2 }}>
                <div style={label}>{t.label}</div>
                <div style={value}>{noWidow(t.value.replace('your name', 'the name on the profile'))}</div>
                <div style={source}>{noWidow(c.line)}</div>
              </li>
            ); })}
          </ul>
          {state.documents.length > 0 && (
            <div data-shared-documents="" style={{ display: 'grid', gap: 2 }}>
              <div style={label}>Documents</div>
              <p style={source}>{noWidow(`You can open these until ${dateLong(state.documentsUntil)}. The tenant sees each open.`)}</p>
              {state.documents.map((d) => (
                <button key={d.id} type="button" data-shared-open={d.kind} onClick={() => open(d.id)} disabled={!!busy} style={text}><Pending busy={busy === `open:${d.id}`} label="Opening">{`Open ${String(KIND_LABEL[d.kind] || 'document').toLowerCase()}`}</Pending></button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" style={{ ...line, color: C.danger, fontWeight: 600 }}>{noWidow(error)}</p>}
    </section>
  );
}
