// pages/admin/brokerages.js  FOUNDER ONLY. The office review of brokerage records
// (docs/design/profile-and-circle.md section 9.5): each record a realtor entered, whether its
// broker of record has confirmed it, and what to look at before confirming it (checked by hand
// against RECO's public register). Confirm is offered only once the broker of record has
// confirmed. Same admin session and shell as /admin/promos; every write goes through
// /api/admin/brokerages.
import { useCallback, useEffect, useState } from 'react';
import { isAdmin } from '../../lib/adminAuth';
import { adminFetch } from '../../components/admin/adminFetch';
import AdminShell from '../../components/admin/AdminShell';
import Loader from '../../components/brand/Loader';

export async function getServerSideProps({ req, res }) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (!(await isAdmin(req))) return { redirect: { destination: '/admin?next=/admin/brokerages', permanent: false } };
  return { props: {} };
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const STANDING = { sent: 'Waiting for the broker of record', review: 'Broker of record confirmed. Ready for review', confirmed: 'Confirmed', disputed: 'Broker of record: not our agent', suspended: 'Suspended' };

export default function Brokerages() {
  const [list, setList] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | migration | error | signedout
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const { r, j } = await adminFetch('/api/admin/brokerages');
    if (r && r.status === 401) { setState('signedout'); return; }
    if (!r || !r.ok) { setErr(j.error || 'Could not load.'); setState('error'); return; }
    if (!j.available) { setState('migration'); return; }
    setList(j.brokerages || []); setState('ready');
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action, id) => {
    setBusy(`${action}:${id}`); setErr('');
    const { r, j } = await adminFetch('/api/admin/brokerages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }) }, { retry5xx: 0 });
    setBusy('');
    if (r && r.status === 401) { setState('signedout'); return; }
    if (!r || !r.ok) { setErr(j.error || 'That did not save.'); return; }
    load();
  };
  const waiting = list.filter((b) => b.standing === 'review').length;
  return (
    <AdminShell page="brokerages" title="Brokerages">
      <main className="ad-wrap">
        <div className="ad-head">
          <div style={{ minWidth: 0 }}>
            <div className="ad-eyebrow">Brokerage records</div>
            <h1 className="ad-h1">{state === 'ready' ? <><span className="ad-num">{waiting}</span> to review.</> : 'Brokerages.'}</h1>
          </div>
          {state === 'ready' && <span className="ad-quiet ad-num">{list.length} in all</span>}
        </div>
        {state === 'loading' && <Loader label="Loading brokerages" tone="ink" />}
        {state === 'signedout' && <div className="ad-card bk-state"><div className="ad-eyebrow">Signed out</div><p>Your admin session ended.</p><a className="ad-btn primary" href="/admin?next=/admin/brokerages">Sign in again</a></div>}
        {state === 'error' && <div className="ad-card bk-state" role="alert"><p>{err}</p><button type="button" className="ad-btn secondary" onClick={load}>Try again</button></div>}
        {state === 'migration' && <div className="ad-card bk-state"><div className="ad-eyebrow">One step first</div><p>Run <code>db/021-realtor-circle.sql</code> in the Supabase SQL editor once, then reload.</p><button type="button" className="ad-btn secondary" onClick={load}>Reload</button></div>}
        {state === 'ready' && err ? <p className="ad-quiet" role="alert" style={{ marginBottom: 12 }}>{err}</p> : null}
        {state === 'ready' && (list.length ? (
          <ul className="bk-list">
            {list.map((b) => (
              <li key={b.id} className="ad-card bk-row" data-brokerage-row={b.standing}>
                <div className="bk-name">{b.legalName}</div>
                <div className="ad-quiet">{b.address}{b.phone ? `, ${b.phone}` : ''}</div>
                {/* A label, then each value on a line of its own: a long name never shares a line. */}
                <div className="bk-label">Broker of record</div>
                <div className="ad-quiet">{b.brokerName}</div>
                <div className="ad-quiet bk-mail">{b.brokerEmail}</div>
                <div className="bk-label">Entered by</div>
                <div className="ad-quiet">{b.realtorName || 'A realtor'}</div>
                {b.realtorEmail ? <div className="ad-quiet bk-mail">{b.realtorEmail}</div> : null}
                {fmt(b.createdAt) ? <div className="ad-quiet">{fmt(b.createdAt)}</div> : null}
                {b.hstNumber ? <div className="ad-quiet">HST {b.hstNumber}</div> : null}
                <div className="bk-standing">{STANDING[b.standing] || b.standing}{b.brokerConfirmedAt ? ` (${fmt(b.brokerConfirmedAt)})` : ''}</div>
                {b.flags.map((f) => <div key={f} className="bk-flag">{f}</div>)}
                <div className="bk-actions">
                  {b.standing === 'review' && <button type="button" className="ad-btn primary sm" disabled={!!busy} onClick={() => act('approve', b.id)}>{busy === `approve:${b.id}` ? 'Confirming' : 'Confirm'}</button>}
                  {b.status !== 'suspended' && <button type="button" className="ad-btn secondary sm" disabled={!!busy} onClick={() => act('suspend', b.id)}>{busy === `suspend:${b.id}` ? 'Suspending' : 'Suspend'}</button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <div className="ad-card bk-state"><p>No brokerage has been entered yet.</p></div>)}
      </main>
      <style jsx>{`
        .bk-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
        .bk-row { padding: 16px; }
        .bk-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; overflow-wrap: anywhere; }
        .bk-mail { overflow-wrap: anywhere; }
        .bk-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 10px; opacity: 0.7; }
        .bk-standing { font-size: 13px; font-weight: 700; margin-top: 10px; }
        .bk-flag { font-size: 13px; margin-top: 6px; padding: 6px 10px; border-left: 2px solid #d72027; }
        .bk-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        :global(.bk-state) { padding: 20px; }
        :global(.bk-state p) { margin: 0 0 12px; font-size: 14px; line-height: 1.55; }
      `}</style>
    </AdminShell>
  );
}
