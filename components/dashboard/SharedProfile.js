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
// its source and date, drawn by components/dashboard/SharedProfileView.js, the one view of a
// shared profile (the tenant's own Preview draws it too). Never the Fit score, a rank, a note or
// household size: the route sends none and the view has nowhere to draw one. A share the tenant
// stopped says so, and nothing else shows. Nothing is drawn where nothing was shared, or in the
// sandbox. Only what is drawn changes; the share payload and the stored values do not.
import { useEffect, useState } from 'react';
import { C } from '../theme';
import { noWidow, dateLong } from '../../lib/typeset';
import { useAdapter } from '../../lib/dashboardAdapter';
import { Pending } from '../brand/Loader';
import SharedProfileView, { line, button, readable } from './SharedProfileView';

export { readable };

// linkId: the realtor's own applicant (a share with them as the tenant's realtor).
// shareId: a share a tenant gave this realtor as listing agent (components/dashboard/SharedWithMe.js);
// the same view, read through /api/profile-shares/shared-with-me, with the screening score the
// application holds on that unit. initial: what the list already said of that share.
export default function SharedProfile({ linkId, shareId = null, initial = null }) {
  const adapter = useAdapter();
  const [state, setState] = useState(shareId ? (initial || { shared: true, ended: null }) : null);   // null | { shared, ended, message } | the read
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const post = async (url, body) => { const r = await adapter.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || 'Something went wrong. Try again.'); return j; };
  useEffect(() => {
    if (adapter.kind !== 'real' || !linkId || shareId) return undefined;
    let live = true;
    (async () => { try { const j = await post('/api/profile-shares/view', { linkId, peek: true }); if (live) setState(j); } catch (e) { /* the section stays out of the card */ } })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, linkId]);
  if (!state || !state.shared) return null;
  const view = async () => { if (busy) return; setBusy('view'); setError(''); try { setState(shareId ? await post('/api/profile-shares/shared-with-me', { action: 'view', shareId }) : await post('/api/profile-shares/view', { linkId })); } catch (e) { setError(e.message); } setBusy(''); };
  const open = async (id) => {
    if (busy) return; setBusy(`open:${id}`); setError('');
    try { const j = shareId ? await post('/api/profile-shares/shared-with-me', { action: 'open', shareId, documentId: id }) : await post('/api/profile-shares/open', { linkId, documentId: id }); if (j.url) window.open(j.url, '_blank', 'noopener'); } catch (e) { setError(e.message); }
    setBusy('');
  };
  const read = Array.isArray(state.facts);
  return (
    <section data-shared-profile={state.ended || (read ? 'read' : 'shared')} aria-label="Shared profile" style={{ borderTop: `1px solid ${C.rule}`, marginTop: 'var(--gap-card)', paddingTop: 'var(--gap-card)', display: 'grid', gap: 'var(--gap-line)' }}>
      <h3 className="t-d3" style={{ color: C.ink, margin: 0 }}>Shared profile</h3>
      {state.ended && <p data-shared-ended="" style={line}>{noWidow(state.message || 'This share has ended.')}</p>}
      {!state.ended && !read && (
        <>
          <p style={line}>{noWidow(shareId ? 'A tenant shared their profile with you as listing agent. They see each time you view it.' : 'This tenant applied with their profile and shared it with you. They see each time you view it.')}</p>
          <button type="button" data-shared-view="" onClick={view} disabled={!!busy} style={button}><Pending busy={busy === 'view'} label="Opening">View shared profile</Pending></button>
        </>
      )}
      {!state.ended && read && <SharedProfileView state={state} onOpen={open} busy={busy} intro={<p style={line}>{noWidow(`Shared with you on ${dateLong(state.sharedAt)}. The tenant sees this view in their log.`)}</p>} />}
      {error && <p role="alert" style={{ ...line, color: C.danger, fontWeight: 600 }}>{noWidow(error)}</p>}
    </section>
  );
}
