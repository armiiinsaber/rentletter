// pages/my-application/[rl].js
// ONE submitted application — the SNAPSHOT a specific realtor received. Distinct from the
// unified profile (/my-application):
//   profile edit      → future applications only
//   application edit  → changes what THIS realtor sees, and is flagged to them as "edited after
//                       verification" (a deliberate, visible act). Optionally also copied to the
//                       profile ("also update my profile").
// Credentials: the signed-in profile session (the profile holds each application's owner token),
// or the legacy owner-token path (email deep link / device storage). Same /api/application/manage.
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { C, R } from '../../components/theme';
import { GlobalStyle, Wordmark, Icon, useReveal } from '../../components/ui';
import { formFromApplication } from '../../lib/tenantProfile';
import { ProfileStyles, FactSections, Eyebrow, Empty } from '../../components/tenant/ProfileFacts';

const LS_APP = 'rentletter_app_number';
const LS_TOKEN = 'rentletter_owner_token';
const dateLong = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return 'not set'; } };
function timeAgo(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now'; if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60); if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24); return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : dateLong(iso);
}

export default function ApplicationPage() {
  const router = useRouter();
  const rl = String(router.query.rl || '').toUpperCase();
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
      setToast(json.profileSynced ? 'Saved, this application and your profile' : 'Saved, this application only');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => { setToast(''); setJustSaved(null); }, 4500);
    } catch (e) { setSaveError(e.message); }
    setSaving(false);
  };

  const facts = data ? formFromApplication(data.profile) : null;
  const revoked = !!data?.revoked;
  const listingLabel = meta?.listingName || data?.profile?.apartment?.address || 'this listing';
  const realtorLabel = meta?.realtorName ? `${meta.realtorName}${meta.realtorBrokerage ? ` · ${meta.realtorBrokerage}` : ''}` : 'the listing realtor';

  const header = (
    <header className="mp-header">
      <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
      <a href="/my-application" className="mp-ghost"><span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><Icon name="arrow" size={13} /></span> {cred?.via === 'profile' ? 'My profile' : 'Profile'}</a>
    </header>
  );

  if (phase !== 'ready') {
    return (
      <>
        <Head><title>Application · Rentletter</title><meta name="robots" content="noindex" /></Head>
        <GlobalStyle /><ProfileStyles />
        <div style={{ minHeight: '100vh', background: C.paper }}>
          {header}
          <div className="mp-wrap">
            {phase === 'loading' ? (
              <p style={{ color: C.inkSoft, fontSize: 15 }}>Opening {rl || 'your application'}…</p>
            ) : (
              <div className="rl-card" style={{ padding: 'clamp(22px, 5vw, 32px)' }}>
                <Eyebrow>Application</Eyebrow>
                <h1 className="rl-serif" style={{ fontSize: 'clamp(26px, 5vw, 34px)', color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.08, marginBottom: 10, textWrap: 'balance' }}>We can’t open this one without your key</h1>
                <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 18 }}>{error || `Sign in to your profile with your email and ${rl || 'this application'} will be there, or use the link from its confirmation email.`}</p>
                <a href="/my-application" className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700 }}>Open my profile <Icon name="arrow" size={14} /></a>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>{rl} · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        {header}
        <div className="mp-wrap">
          {/* What this page IS, the snapshot framing */}
          <div className="rl-in" style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <Eyebrow>What you sent</Eyebrow>
              <span style={{ fontSize: 11.5, color: C.inkMute, fontFamily: 'monospace', letterSpacing: '0.04em', marginBottom: 12 }}>{rl}</span>
              <span style={{ marginBottom: 12, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: revoked ? C.paper : C.green, background: revoked ? C.danger : C.greenTint, border: `1px solid ${revoked ? C.danger : C.green}`, padding: '3px 9px', borderRadius: R.pill }}>{revoked ? 'Revoked' : (meta?.status?.label || 'Submitted')}</span>
            </div>
            <h1 className="rl-serif" style={{ fontSize: 'clamp(30px, 6vw, 46px)', color: C.ink, letterSpacing: '-0.03em', lineHeight: 1.04, marginBottom: 10, textWrap: 'balance', overflowWrap: 'anywhere' }}>{listingLabel}</h1>
            <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.55, maxWidth: 560 }}>
              Sent to <strong style={{ color: C.ink }}>{realtorLabel}</strong> on {data.createdAt ? dateLong(data.createdAt) : 'not set'}.
              {data.updatedAt && <> <span style={{ color: C.amber, fontWeight: 600 }}>Edited {timeAgo(data.updatedAt)}</span>.</>}
              {' '}This is the record that realtor sees, not your profile.
              {meta?.referral && <> It reached them through a referral from <strong style={{ color: C.ink }}>{meta.referral.fromName || 'your realtor'}</strong> that you approved{meta.referral.approvedAt ? ` on ${dateLong(meta.referral.approvedAt)}` : ''}. Revoking below withdraws their access.</>}
            </p>
          </div>

          <div className="rl-in mp-note" style={{ marginBottom: 18, borderLeft: `3px solid ${C.amber}`, background: C.amberTint, color: C.ink }}>
            <strong>Editing here changes what {meta?.realtorName || 'this realtor'} sees</strong> for {listingLabel}, and they’ll see it was edited after any document check. To change your details for <em>future</em> applications instead, edit <a href="/my-application" style={{ color: C.red, fontWeight: 700 }}>your profile</a>.
          </div>

          {error && <div role="alert" className="mp-alert" style={{ marginBottom: 14 }}>{error}</div>}
          {saveError && <div role="alert" className="mp-alert" style={{ marginBottom: 14 }}>{saveError}</div>}
          {revoked && <div role="status" className="mp-note" style={{ marginBottom: 18, borderLeft: `3px solid ${C.danger}`, color: C.ink }}><strong>This application is revoked</strong>{data.revokedAt ? ` (since ${dateLong(data.revokedAt)})` : ''}. The realtor sees a “revoked” notice instead of your details, and editing is paused.</div>}

          <FactSections
            facts={facts} draft={draft} editing={editing} setDraft={setDraft}
            canEdit={!revoked && !editing} saving={saving} justSaved={justSaved}
            onEdit={startEdit} onCancel={cancelEdit} onSave={saveEdit}
            saveLabel="Save to this application"
            editFooter={cred.via === 'profile' ? (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 18, padding: '12px 14px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 13, color: C.ink, lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={syncProfile} onChange={(e) => setSyncProfile(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: C.red }} />
                <span><strong>Also save these details to my profile</strong> so my next applications start from them. (Other applications you’ve already sent are never changed.)</span>
              </label>
            ) : null}
          />

          {/* Privacy, per application */}
          <div className="rl-in" style={{ marginTop: 30, marginBottom: 14 }}>
            <Eyebrow>Privacy</Eyebrow>
            <h2 style={{ fontSize: 'clamp(22px, 4.5vw, 28px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.15, textWrap: 'balance' }}>Who’s seen it, and the off switch</h2>
          </div>
          <div className="rl-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <div className="mp-stat"><div className="mp-stat-l">Lookups</div><div style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{data.lookupCount || 0}</div></div>
            <div className="mp-stat"><div className="mp-stat-l">Last viewed</div><div className="mp-stat-v">{data.lookups?.length ? timeAgo(data.lookups[data.lookups.length - 1].at) : 'Not yet'}</div></div>
            <div className="mp-stat"><div className="mp-stat-l">Last edited</div><div className="mp-stat-v">{data.updatedAt ? timeAgo(data.updatedAt) : 'Never'}</div></div>
          </div>
          <div className="rl-in mp-ink" style={{ marginBottom: 14, padding: 'clamp(18px, 4vw, 26px)' }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: revoked ? C.green : C.red }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{revoked ? 'Application is revoked' : 'Application is active'}</div>
                <div style={{ fontSize: 13, color: '#c8c2b3', lineHeight: 1.55 }}>{revoked ? 'Reactivate to restore the realtor’s access · and editing.' : 'Anyone with this application number can view it. Revoking affects only this application, not your profile or other applications.'}</div>
              </div>
              <button onClick={() => performAction(revoked ? 'unrevoke' : 'revoke')} disabled={actionLoading || !!editing} style={{ background: revoked ? C.green : C.danger, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading || editing ? 0.5 : 1, minHeight: 46, flex: '0 0 auto' }}>
                {actionLoading ? 'Working…' : (revoked ? 'Reactivate application' : 'Revoke application')}
              </button>
            </div>
          </div>
          <div className="rl-in rl-card" style={{ padding: 'clamp(16px, 4vw, 22px)' }}>
            <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, cursor: 'pointer', color: C.ink, minHeight: 36 }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Lookup history <span style={{ color: C.inkMute, fontWeight: 600 }}>· {data.lookupCount || 0}</span></span>
              <span style={{ display: 'inline-flex', transform: showLog ? 'rotate(180deg)' : 'none', color: C.inkSoft }}><Icon name="chevronD" size={16} /></span>
            </button>
            {showLog && (
              <div style={{ marginTop: 14 }}>
                {(data.lookups || []).length === 0 ? <Empty>No one has looked up this application yet. When the realtor pulls it up, it shows here.</Empty> : (
                  <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.ctrl, overflow: 'hidden' }}>
                    {[...data.lookups].reverse().map((entry, idx) => (
                      <div key={idx} style={{ padding: '12px 14px', borderTop: idx ? `1px solid ${C.rule}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: idx === 0 ? C.paperDeep : C.paper }}>
                        <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Viewer {entry.ipHash || 'unknown'}</div><div style={{ fontSize: 12, color: C.inkMute }}>{entry.uaShort ? entry.uaShort.split(' ').slice(0, 4).join(' ') : 'Unknown device'}</div></div>
                        <div style={{ fontSize: 12, color: C.inkSoft, textAlign: 'right' }}><div style={{ fontWeight: 700, color: C.ink }}>{timeAgo(entry.at)}</div><div style={{ color: C.inkMute, fontSize: 11 }}>{new Date(entry.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ marginTop: 12, fontSize: 12, color: C.inkMute, lineHeight: 1.55 }}>Viewer identifiers are hashed, we don’t store IP addresses.</p>
              </div>
            )}
          </div>
        </div>
        {toast && <div role="status" onClick={() => setToast('')} style={{ position: 'fixed', left: '50%', bottom: 'max(20px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 300, background: C.green, color: C.paper, padding: '12px 20px', borderRadius: R.pill, boxShadow: '0 8px 24px rgba(15,15,16,0.22)', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 9, maxWidth: '92vw', cursor: 'pointer' }}><Icon name="check" size={15} strokeWidth={2.5} /> {toast}</div>}
      </div>
    </>
  );
}
