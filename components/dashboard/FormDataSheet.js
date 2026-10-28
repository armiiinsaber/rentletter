// components/dashboard/FormDataSheet.js
// The Form data view (lib/formData.js, docs/form-data.md): a tall paper sheet on the listing page,
// offered once an applicant holds the listing. It reads POST /api/listings/form-data (session,
// entitlement, ownership on the server, one form_data_opened event per open) and lays every value
// out in the order an agreement to lease is organized: Copy all at the top, Copy group on each
// group, Copy on each value. Empty values read Not entered and are skipped by every copy. Nothing
// here is a document, a credit fact, a Fit number or a check docs item.
import { useEffect, useRef, useState } from 'react';
import Sheet from '../Sheet';
import { C } from '../theme';
import { useAdapter } from '../../lib/dashboardAdapter';
import { formDataText, groupText } from '../../lib/formData';
import { noWidow } from '../../lib/typeset';
import Loader from '../brand/Loader';

export const NOT_ENTERED = 'Not entered';
const copyBtn = (on) => ({ minHeight: 44, minWidth: 84, padding: '0 var(--gap-card)', background: 'transparent', color: on ? C.ink : C.inkMute, border: `1.5px solid ${on ? C.ink : C.rule}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: on ? 'pointer' : 'default', fontFamily: 'inherit', flexShrink: 0 });

// The clipboard, with the one fallback every browser still has.
async function writeClipboard(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* the fallback below */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
  } catch (e) { return false; }
}

export default function FormDataSheet({ open, listingId, onClose }) {
  const adapter = useAdapter();
  const [state, setState] = useState({ loading: false, error: '', data: null });
  const [copied, setCopied] = useState(null); // the key of the last copy, two seconds
  const timer = useRef(null);
  useEffect(() => {
    if (!open || !listingId) return;
    let gone = false;
    setState({ loading: true, error: '', data: null });
    (async () => {
      try {
        const r = await adapter.fetch('/api/listings/form-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId }) });
        const j = await r.json().catch(() => ({}));
        if (gone) return;
        if (!r.ok) { setState({ loading: false, error: j.error || 'Could not load the form data.', data: null }); return; }
        setState({ loading: false, error: '', data: j });
      } catch (e) { if (!gone) setState({ loading: false, error: 'Could not load the form data.', data: null }); }
    })();
    return () => { gone = true; };
  }, [open, listingId, adapter]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (key, text) => {
    if (!text) return;
    const ok = await writeClipboard(text);
    setCopied(ok ? key : null);
    clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(null), 2000);
  };
  const groups = state.data ? state.data.groups || [] : [];
  const all = formDataText(groups);
  return (
    <Sheet open={open} onClose={onClose} label="Form data" tall maxWidth={640} panelClassName="rl-modal">
      <div data-form-data="" style={{ padding: '4px var(--s-4) var(--s-5)' }}>
        <div data-sheet-drag="" style={{ fontSize: 'var(--t-eyebrow)', color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'var(--s-2)' }}>Form data</div>
        <h3 data-sheet-drag="" style={{ fontSize: 'var(--t-d3)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 'var(--s-2)', textWrap: 'balance' }}>{state.data ? noWidow(state.data.listingName || 'This listing') : 'This listing'}</h3>
        <p style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 'var(--lh-body)', marginBottom: 'var(--s-4)', textWrap: 'pretty' }}>{noWidow('Every value an agreement to lease asks for, in its order. Copy and paste into the forms tool you already use.')}</p>
        {state.loading ? <Loader label="Loading the form data" /> : null}
        {state.error ? <p role="alert" style={{ fontSize: 'var(--t-body-2)', color: C.danger, lineHeight: 'var(--lh-body)' }}>{noWidow(state.error)}</p> : null}
        {state.data ? (
          <>
            <div className="rl-ctrl-row" style={{ marginBottom: 'var(--s-4)' }}>
              <button type="button" onClick={() => copy('all', all)} disabled={!all} aria-label="Copy all" style={{ ...copyBtn(!!all), width: '100%' }}>{copied === 'all' ? 'Copied' : 'Copy all'}</button>
            </div>
            {groups.map((g) => {
              const text = groupText(g);
              return (
                <section key={g.key} data-form-group={g.key} style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', marginBottom: 'var(--s-2)' }}>
                    <h4 style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, margin: 0, minWidth: 0 }}>{g.title}</h4>
                    <button type="button" onClick={() => copy(g.key, text)} disabled={!text} aria-label={`Copy group ${g.title}`} style={copyBtn(!!text)}>{copied === g.key ? 'Copied' : 'Copy group'}</button>
                  </div>
                  {g.items.map((it) => (
                    <div key={it.key} data-form-item={it.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minHeight: 44, borderBottom: `1px solid ${C.rule}` }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 var(--s-3)', padding: 'var(--s-1) 0' }}>
                        <span style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, fontWeight: 600 }}>{it.label}</span>
                        <span data-form-value="" style={{ fontSize: 'var(--t-body-2)', color: it.value != null ? C.ink : C.inkMute, fontWeight: it.value != null ? 600 : 500, minWidth: 0, overflowWrap: 'anywhere' }}>{it.value != null ? it.value : NOT_ENTERED}</span>
                      </div>
                      <button type="button" onClick={() => copy(it.key, it.value)} disabled={it.value == null} aria-label={`Copy ${it.label}`} style={{ ...copyBtn(it.value != null), minWidth: 72 }}>{copied === it.key ? 'Copied' : 'Copy'}</button>
                    </div>
                  ))}
                </section>
              );
            })}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
