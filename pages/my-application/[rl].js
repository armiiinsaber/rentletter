// pages/my-application/[rl].js
// ONE submitted application: the snapshot a specific realtor received. Distinct from the unified
// profile (/my-application): a profile edit reaches future applications; an application edit changes
// what THIS realtor sees and is flagged to them as edited after any document check. Credentials: the
// signed in profile session (it holds each application's owner token) or the legacy owner token path
// (email deep link or device storage). Same /api/application/manage. The sandbox opens
// /my-application/DEMO from the fixture and writes nothing anywhere.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C } from '../../components/theme';
import { GlobalStyle, Wordmark, useReveal } from '../../components/ui';
import { formFromApplication, buildApplicationFromForm } from '../../lib/tenantProfile';
import { ProfileStyles, FactSections, Eyebrow, Dots, Chevron, noWidow, dateLong } from '../../components/tenant/ProfileFacts';

const LS_APP = 'rentletter_app_number';
const LS_TOKEN = 'rentletter_owner_token';
const DEMO_RL = 'DEMO';
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
// The sandbox record: Nadia's application from the fixture, three lookups, written nowhere.
async function demoRecord() {
  const { demoPrefillRow } = await import('../../lib/demoFixture');
  const { rowToForm } = await import('../../lib/pipelinePrefill');
  return {
    profile: buildApplicationFromForm(null, rowToForm(demoPrefillRow())), createdAt: ago(9), updatedAt: null, revoked: false, revokedAt: null, profileRevision: 1,
    lookups: [{ at: ago(6), ipHash: 'a91f2c', uaShort: 'Chrome macOS' }, { at: ago(3), ipHash: 'a91f2c', uaShort: 'Chrome macOS' }, { at: ago(1), ipHash: '7be04d', uaShort: 'Safari iPhone' }], lookupCount: 3,
  };
}

export default function ApplicationPage() {
  const router = useRouter();
  const rl = String(router.query.rl || '').toUpperCase();
  const sandbox = rl === DEMO_RL;
  const demoRef = useRef(null);
  const [cred, setCred] = useState(null);       // { token, via: 'profile' | 'legacy' }
  const [meta, setMeta] = useState(null);       // from the profile list (listing/realtor/status)
  const [data, setData] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | noaccess
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [syncProfile, setSyncProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  useReveal(phase + (data?.profileRevision || ''));

  // Resolve credentials: profile session first, then legacy token (URL once, then device).
  useEffect(() => {
    if (!router.isReady || !rl) return;
    if (sandbox) { setMeta({ listingName: '15 Logan Ave, Unit 2', realtorName: 'Sarah Chen', realtorBrokerage: 'Demo Realty (Sample)' }); setCred({ token: 'demo', via: 'legacy' }); return; }
    (async () => {
      try {
        const r = await fetch('/api/tenant/profile');
        if (r.ok) {
          const p = await r.json();
          const ref = (p.applications || []).find((a) => a.applicationNumber === rl);
          if (ref?.ownerToken) { setMeta(ref); setCred({ token: ref.ownerToken, via: 'profile' }); return; }
        }
      } catch (e) { /* fall through */ }
      const urlTok = router.query.token ? String(router.query.token) : null;
      const lsTok = typeof window !== 'undefined' && localStorage.getItem(LS_APP) === rl ? localStorage.getItem(LS_TOKEN) : null;
      const tok = urlTok || lsTok;
      if (urlTok) router.replace(`/my-application/${rl}`, undefined, { shallow: true });
      if (tok) { setCred({ token: tok, via: 'legacy' }); try { localStorage.setItem(LS_APP, rl); localStorage.setItem(LS_TOKEN, tok); } catch (e) { /* ignore */ } }
      else setPhase('noaccess');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, rl]);

  const call = async (body) => {
    if (sandbox) {
      if (!demoRef.current) demoRef.current = await demoRecord();
      const rec = demoRef.current;
      if (body.action === 'revoke') { rec.revoked = true; rec.revokedAt = new Date().toISOString(); }
      if (body.action === 'unrevoke') { rec.revoked = false; rec.revokedAt = null; }
      if (body.action === 'update') { rec.profile = buildApplicationFromForm(rec.profile, body.form); rec.updatedAt = new Date().toISOString(); rec.profileRevision += 1; return { ...rec, profileSynced: false }; }
      return { ...rec };
    }
    const res = await fetch('/api/application/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationNumber: rl, ownerToken: cred.token, ...body }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) { const e = new Error(json?.error || 'Something went wrong.'); e.code = json?.code; throw e; }
    return json;
  };
  useEffect(() => {
    if (!cred) return;
    (async () => {
      try { setData(await call({ action: 'view' })); setPhase('ready'); }
      catch (e) { setError(e.message); setPhase('noaccess'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cred]);

  const reload = async () => { try { setData(await call({ action: 'view' })); } catch (e) { setError(e.message); } };
  const performAction = async (action) => {
    if (action === 'revoke' && !confirm('Revoke this application? The realtor will no longer be able to view it. You can reactivate later.')) return;
    setActionLoading(true); setError('');
    try { await call({ action }); await reload(); } catch (e) { setError(e.message); }
    setActionLoading(false);
  };
  const startEdit = (id) => {
    setDraft(formFromApplication(data?.profile)); setSaveError(''); setEditing(id);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 20);
  };
  const cancelEdit = () => { setEditing(null); setDraft(null); setSaveError(''); };
  const saveEdit = async () => {
    if (!draft || saving) return;
    setSaving(true); setSaveError('');
    try {
      const json = await call({ action: 'update', form: draft, syncProfile: cred.via === 'profile' && syncProfile });
      setData((d) => ({ ...d, profile: json.profile, updatedAt: json.updatedAt, profileRevision: json.profileRevision }));
      const id = editing; setEditing(null); setDraft(null); setJustSaved(id);
      setToast(json.profileSynced ? 'Saved to this application and your profile' : 'Saved to this application only');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (e) { setSaveError(e.message); }
    setSaving(false);
  };

  const facts = data ? formFromApplication(data.profile) : null;
  const revoked = !!data?.revoked;
  const listingLabel = meta?.listingName || data?.profile?.apartment?.address || 'this listing';
  const realtorFirst = (meta?.realtorName || 'the realtor').trim().split(/\s+/)[0];
  const lastLookup = data?.lookups?.length ? data.lookups[data.lookups.length - 1].at : null;

  const header = (
    <header className="mp-header">
      <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
      <a href="/my-application" className="mp-link">{cred?.via === 'profile' ? 'My profile' : 'Profile'}</a>
    </header>
  );

  if (phase !== 'ready') {
    return (
      <>
        <Head><title>Application · Rentletter</title><meta name="robots" content="noindex" /></Head>
        <GlobalStyle /><ProfileStyles />
        <div className="mp-page">
          {header}
          <div className="mp-wrap">
            <div className="rl-card mp-card">
              {phase === 'loading' ? <p className="mp-p">{noWidow(`Opening ${rl || 'your application'}`)}</p> : (
                <>
                  <Eyebrow>Application</Eyebrow>
                  <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('We cannot open this one without your key')}</h1>
                  <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(error || `Sign in to your profile with your email and ${rl || 'this application'} will be there, or use the link from its confirmation email.`)}</p>
                  <a href="/my-application" className="mp-btn" style={{ marginTop: 'var(--gap-card)' }}>Open my profile</a>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>{rl} · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">
        {header}
        <div className="mp-wrap mp-sections">
          {/* Section one: what this page is, then the six fact cards. */}
          <div className="mp-stack">
            <div className="rl-card rl-in mp-card">
              <Eyebrow>What you sent <span className="mp-mono">{rl}</span> <span>{revoked ? 'Revoked' : 'Submitted'}</span></Eyebrow>
              <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{listingLabel}</h1>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`Edits change what ${realtorFirst} sees for ${listingLabel}.`)}</p>
              <a href="/my-application" className="mp-link">Edit your profile instead</a>
              {error && <p role="alert" className="mp-alert">{noWidow(error)}</p>}
              {saveError && <p role="alert" className="mp-alert">{noWidow(saveError)}</p>}
              {revoked && <p role="status" className="mp-note">{noWidow(`Revoked${data.revokedAt ? ` since ${dateLong(data.revokedAt)}` : ''}. The realtor sees a revoked notice instead of your details, and editing is paused.`)}</p>}
            </div>
            <FactSections
              facts={facts} draft={draft} editing={editing} setDraft={setDraft}
              canEdit={!revoked && !editing} saving={saving} justSaved={justSaved}
              onEdit={startEdit} onCancel={cancelEdit} onSave={saveEdit}
              saveLabel="Save to this application"
              editFooter={cred.via === 'profile' ? (
                <label className="mp-note" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', marginTop: 'var(--gap-card)', cursor: 'pointer', color: C.ink }}>
                  <input type="checkbox" checked={syncProfile} onChange={(e) => setSyncProfile(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: C.ink }} />
                  <span>{noWidow('Also save these details to my profile, so my next applications start from them. Applications you already sent never change.')}</span>
                </label>
              ) : null}
            />
          </div>

          {/* Section two: privacy. Three numbers, the sentence, the one red button, the fold. */}
          <section className="rl-card rl-in mp-card" aria-labelledby="privacy-h">
            <h2 id="privacy-h" className="mp-h2">Privacy</h2>
            <div className="mp-stats">
              <div><div className="mp-label">Lookups</div><div className="mp-stat-v">{data.lookupCount || 0}</div></div>
              <div><div className="mp-label">Last viewed</div><div className="mp-stat-v">{lastLookup ? dateLong(lastLookup) : 'Not yet'}</div></div>
              <div><div className="mp-label">Last edited</div><div className="mp-stat-v">{data.updatedAt ? dateLong(data.updatedAt) : 'Never'}</div></div>
            </div>
            <p className="mp-p" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(revoked ? 'The realtor sees a revoked notice instead of your details. Reactivate to restore their access and your editing.' : 'Anyone with this application number can view it. Revoking affects only this application, not your profile or other applications.')}</p>
            <button type="button" onClick={() => performAction(revoked ? 'unrevoke' : 'revoke')} disabled={actionLoading || !!editing} className={`mp-btn${revoked ? '' : ' mp-btn-red'}`} style={{ marginTop: 'var(--gap-card)' }}>
              {actionLoading ? 'Working' : revoked ? 'Reactivate application' : 'Revoke application'}
            </button>
            <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="mp-fold">
              <span><Dots items={['Lookup history', String(data.lookupCount || 0)]} /></span><Chevron open={showLog} />
            </button>
            {showLog && ((data.lookups || []).length === 0 ? <p className="mp-p">{noWidow('No one has looked up this application yet. When the realtor pulls it up, it shows here.')}</p> : (
              <ul className="mp-list">
                {[...data.lookups].reverse().map((entry, idx) => (
                  <li key={idx}>
                    <span style={{ minWidth: 0 }}>
                      <span className="mp-value" style={{ marginTop: 0, display: 'block' }}>{noWidow(`Viewer ${entry.ipHash || 'unknown'}`)}</span>
                      <span className="mp-note" style={{ display: 'block' }}>{noWidow(entry.uaShort ? entry.uaShort.split(' ').slice(0, 4).join(' ') : 'Unknown device')}</span>
                    </span>
                    <span className="mp-value" style={{ marginTop: 0, textAlign: 'right', flexShrink: 0 }}>{dateLong(entry.at)}</span>
                  </li>
                ))}
              </ul>
            ))}
            {showLog && <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Viewer identifiers are hashed. We do not store IP addresses.')}</p>}
          </section>
        </div>
        {toast && <div role="status" onClick={() => setToast('')} className="mp-toast">{toast}</div>}
      </div>
    </>
  );
}
