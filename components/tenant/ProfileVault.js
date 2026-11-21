// components/tenant/ProfileVault.js
// The vault on the tenant's profile page (pages/my-application.js): the facts read from their
// documents, the documents themselves with their expiry, who has viewed the profile, and what a
// realtor would see. One route, /api/tenant/vault (lib/tenantVault.js), under the tenant's own
// session. On the realtor tokens (components/tenant/ProfileFacts.js ProfileStyles): nothing here
// has a style of its own beyond the source line.
//   · every fact carries its source and its date: "Read from a document on DATE";
//   · every document carries the date it is kept until, Renew where it may be renewed (never an
//     ID), and Delete, which asks once, in the page, before it removes the file;
//   · before the first document, the tenant agrees to keeping documents in their profile;
//   · with the vault off (TENANT_VAULT_ENABLED=false) the page says documents are paused: what is
//     stored still shows and can still be deleted, nothing new is added;
//   · who can see the profile: every share (lib/profileShares.js), the realtor it is with, since
//     when, each view of it with its date, and Stop sharing, which asks once, in the page.
// "verified" is never said here: a fact is read from a document, on a date.
import { useCallback, useEffect, useRef, useState } from 'react';
import { noWidow, dateLong } from '../../lib/typeset';
import { sharePayload, sourceLine, SOURCE } from '../../lib/profileFacts';
import { KIND_LABEL, VAULT_MIME, checkText, agreesText } from '../../lib/tenantVaultRules';
import { Pending } from '../brand/Loader';
import { Chevron, LinesText } from './ProfileFacts';
import ShareWithAgent from './ShareWithAgent';

const MAX_CLIENT_BYTES = 3 * 1024 * 1024;
const readBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
  r.onerror = () => reject(new Error('That file could not be opened.'));
  r.readAsDataURL(file);
});
export const youLine = (source, at) => (source === SOURCE.DOCUMENT ? sourceLine(SOURCE.DOCUMENT, at) : (dateLong(at) ? `Typed by you on ${dateLong(at)}` : 'Typed by you'));

export default function ProfileVault({ profile }) {
  const [vault, setVault] = useState(null);
  const [busy, setBusy] = useState('');       // '', 'consent', 'upload', `renew:${id}`, `delete:${id}`, `check:${id}`
  const [asking, setAsking] = useState('');   // the id of the document or fact a delete was asked for
  const [message, setMessage] = useState(null); // { tone: 'ok' | 'warn', text }
  const [seeOpen, setSeeOpen] = useState(false);
  const input = useRef(null);

  const [shares, setShares] = useState([]);
  const [agents, setAgents] = useState(null); // sharing with a listing agent: the tenant's units and waiting invites
  const load = useCallback(async () => {
    try { const r = await fetch('/api/tenant/vault'); if (r.ok) setVault(await r.json()); else setVault({ failed: true }); } catch (e) { setVault({ failed: true }); }
    // Who can see the profile, and each realtor's views of it (pages/api/tenant/shares.js).
    try { const r = await fetch('/api/tenant/shares'); const j = r.ok ? await r.json() : null; setShares(j && Array.isArray(j.shares) ? j.shares : []); setAgents(j && j.agents ? j.agents : null); } catch (e) { setShares([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body) => {
    const r = await fetch('/api/tenant/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || 'Something went wrong. Please try again.');
    return j;
  };
  const act = async (key, body, done) => {
    if (busy) return;
    setBusy(key); setMessage(null);
    try { await post(body); setAsking(''); await load(); if (done) setMessage({ tone: 'ok', text: done }); }
    catch (e) { setMessage({ tone: 'warn', text: e.message }); }
    setBusy('');
  };
  const stop = async (id) => {
    if (busy) return;
    setBusy(`stop:${id}`); setMessage(null);
    try {
      const r = await fetch('/api/tenant/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop', id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || 'Something went wrong. Please try again.');
      setAsking(''); await load();
    } catch (e) { setMessage({ tone: 'warn', text: e.message }); }
    setBusy('');
  };
  const add = async (file) => {
    if (!file || busy) return;
    if (!VAULT_MIME.includes(String(file.type).toLowerCase())) { setMessage({ tone: 'warn', text: 'Add a PDF or an image (JPG or PNG).' }); return; }
    if (file.size > MAX_CLIENT_BYTES) { setMessage({ tone: 'warn', text: 'This file is too large. Add a version under 3MB.' }); return; }
    setBusy('upload'); setMessage(null);
    try {
      const data = await readBase64(file);
      await post({ action: 'upload', file: { name: file.name, type: file.type, data } });
      await load();
      setMessage({ tone: 'ok', text: 'Read and added to your profile.' });
    } catch (e) { setMessage({ tone: 'warn', text: e.message }); }
    setBusy('');
  };

  if (!vault || vault.failed) return null;
  const { enabled, available, consentAt, emailProved, documents = [], checks = [] } = vault;
  const canAdd = enabled && available && emailProved;
  const payload = sharePayload({ id: profile.id, facts: profile.facts || {}, factsUpdatedAt: profile.factsUpdatedAt }, checks.map((c) => ({ kind: c.kind, value: c.value, read_at: c.readAt })));

  return (
    <div className="mp-stack" data-vault="" data-vault-enabled={enabled ? 'yes' : 'no'}>
      {checks.length > 0 && (
        <section className="rl-card mp-card" data-vault-checks="" aria-labelledby="vault-checks-h">
          <h2 id="vault-checks-h" className="mp-h2">Read from your documents</h2>
          <ul className="mp-list" style={{ marginTop: 'var(--gap-line)' }}>
            {checks.map((c) => { const t = checkText(c); const agrees = agreesText(c); return (
              <li key={c.id} data-vault-check={c.kind} style={{ display: 'block' }}>
                <div className="mp-label">{t.label}</div>
                <div className="mp-value">{noWidow(t.value)}</div>
                <div className="mp-source" data-fact-source="">{noWidow(youLine(SOURCE.DOCUMENT, c.readAt))}</div>
                {agrees && <div className="mp-source">{noWidow(agrees)}</div>}
                {!c.documentHeld && <div className="mp-source">{noWidow('The document is no longer held.')}</div>}
                {asking === c.id ? (
                  <div className="mp-actions" data-vault-confirm="">
                    <p className="mp-p" style={{ flex: '1 1 100%' }}>{noWidow('Remove this fact from your profile? It is gone, not hidden.')}</p>
                    <button type="button" data-destructive="" className="mp-btn" disabled={!!busy} onClick={() => act(`check:${c.id}`, { action: 'remove-check', id: c.id }, 'Removed from your profile.')}><Pending busy={busy === `check:${c.id}`} label="Removing">Remove</Pending></button>
                    <button type="button" className="mp-link" disabled={!!busy} onClick={() => setAsking('')}>Keep it</button>
                  </div>
                ) : <button type="button" data-destructive="" className="mp-link" onClick={() => setAsking(c.id)} aria-label={`Remove ${t.label}`}>Remove</button>}
              </li>
            ); })}
          </ul>
        </section>
      )}

      <section className="rl-card mp-card" data-vault-documents="" aria-labelledby="vault-docs-h">
        <h2 id="vault-docs-h" className="mp-h2">Your documents</h2>
        {!enabled && <p role="status" data-vault-paused="" className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Documents are paused. Nothing new is stored for now. What you already stored stays until its date, and you can delete it.')}</p>}
        {enabled && !available && <p role="status" data-vault-absent="" className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Documents are not available yet.')}</p>}
        {enabled && available && <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Add your ID, a pay stub or an employment letter once. We read each one and keep the facts, so your next application needs no upload.')}</p>}
        {documents.length > 0 && (
          <ul className="mp-list" style={{ marginTop: 'var(--gap-card)' }}>
            {documents.map((d) => (
              <li key={d.id} data-vault-document={d.kind} style={{ display: 'block' }}>
                <div className="mp-value" style={{ marginTop: 0 }}>{KIND_LABEL[d.kind] || 'Document'}</div>
                <div className="mp-source" data-vault-expiry="">{noWidow(`Kept until ${dateLong(d.expiresAt)}`)}</div>
                <div className="mp-source">{noWidow(`Read on ${dateLong(d.readAt || d.uploadedAt)}`)}</div>
                {asking === d.id ? (
                  <div className="mp-actions" data-vault-confirm="">
                    <p className="mp-p" style={{ flex: '1 1 100%' }}>{noWidow('Delete this document? The file is removed now and cannot be brought back. The facts read from it stay until you remove them.')}</p>
                    <button type="button" data-destructive="" className="mp-btn" disabled={!!busy} onClick={() => act(`delete:${d.id}`, { action: 'delete', id: d.id }, 'Deleted. The file is gone.')}><Pending busy={busy === `delete:${d.id}`} label="Deleting">Delete</Pending></button>
                    <button type="button" className="mp-link" disabled={!!busy} onClick={() => setAsking('')}>Keep it</button>
                  </div>
                ) : (
                  <div className="mp-actions" style={{ marginTop: 0 }}>
                    {d.canRenew && enabled && <button type="button" className="mp-link" disabled={!!busy} onClick={() => act(`renew:${d.id}`, { action: 'renew', id: d.id }, 'Renewed for 90 days from today.')} aria-label={`Renew ${KIND_LABEL[d.kind] || 'document'}`}><Pending busy={busy === `renew:${d.id}`} label="Renewing">Renew</Pending></button>}
                    <button type="button" data-destructive="" className="mp-link" disabled={!!busy} onClick={() => setAsking(d.id)} aria-label={`Delete ${KIND_LABEL[d.kind] || 'document'}`}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {enabled && available && documents.length === 0 && <p data-vault-empty="" className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('No documents stored.')}</p>}
        {message && <p role="status" className={message.tone === 'ok' ? 'mp-note' : 'mp-alert'} style={{ marginTop: 'var(--gap-card)' }}>{noWidow(message.text)}</p>}
        {enabled && available && !emailProved && <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Sign in with the link we email you before adding documents.')}</p>}
        {canAdd && !consentAt && (
          <div data-vault-consent="" style={{ marginTop: 'var(--gap-card)', display: 'grid', gap: 'var(--gap-line)' }}>
            <p className="mp-p">{noWidow('Before your first document: Rentletter keeps it in your profile and reads it with AI, once. An ID is kept 14 days. A pay stub or an employment letter is kept 90 days, and you can renew it. The facts read from them stay until you remove them, or until your profile has been unused for 12 months.')}</p>
            <p className="mp-p">{noWidow('No realtor sees any of it unless you approve it. Delete removes a document at once.')}</p>
            <button type="button" className="mp-btn" disabled={!!busy} onClick={() => act('consent', { action: 'consent' })}><Pending busy={busy === 'consent'} label="Saving">Agree and continue</Pending></button>
          </div>
        )}
        {canAdd && consentAt && (
          <div style={{ marginTop: 'var(--gap-card)' }}>
            <input ref={input} type="file" accept={VAULT_MIME.join(',')} style={{ display: 'none' }} aria-label="Document file" onChange={(e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; add(file); }} />
            <button type="button" data-vault-add="" className="mp-btn" disabled={!!busy} onClick={() => input.current && input.current.click()}><Pending busy={busy === 'upload'} label="Reading your document">Add a document</Pending></button>
            <p className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('PDF, JPG or PNG, under 3MB. A credit report is never kept here.')}</p>
          </div>
        )}
      </section>

      <section className="rl-card mp-card" data-vault-views="" aria-labelledby="vault-views-h">
        <h2 id="vault-views-h" className="mp-h2">Who can see your profile</h2>
        {shares.length === 0 ? <p className="mp-p" data-shares-empty="" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('No one. A realtor sees your profile only when you apply with it or approve a share, and every view is listed here with its date.')}</p> : (
          <ul className="mp-list" style={{ marginTop: 'var(--gap-line)' }}>
            {shares.map((sh) => (
              <li key={sh.id} data-share={sh.live ? 'live' : sh.status} style={{ display: 'block' }}>
                {/* Which kind of share: with their realtor, or with the listing agent (db/024). */}
                <div className="mp-label" data-share-role={sh.role || 'realtor'}>{sh.roleLabel || 'Your realtor'}</div>
                <div className="mp-value">{noWidow(sh.realtorName)}</div>
                {sh.realtorBrokerage && <div className="mp-source">{noWidow(sh.realtorBrokerage)}</div>}
                {sh.listingName && <div className="mp-source">{noWidow(`For ${sh.listingName}`)}</div>}
                <div className="mp-source" data-share-since="">{noWidow(sh.live ? `Sharing since ${dateLong(sh.approvedAt)}` : sh.status === 'revoked' ? `You stopped sharing on ${dateLong(sh.endedAt)}` : `Ended on ${dateLong(sh.endedAt)}`)}</div>
                {sh.live && sh.documentsUntil && <div className="mp-source">{noWidow(`Can open your income and employment documents until ${dateLong(sh.documentsUntil)}. Never your ID.`)}</div>}
                {(sh.views || []).length === 0
                  ? <div className="mp-source" data-share-unviewed="">{noWidow('Not viewed yet.')}</div>
                  : sh.views.map((v) => <div key={v.id} className="mp-source" data-share-view="">{noWidow(`${v.action === 'document_opened' ? 'Opened a document' : 'Viewed your profile'} on ${dateLong(v.at)}`)}</div>)}
                {sh.live && (asking === sh.id ? (
                  <div className="mp-actions" data-vault-confirm="">
                    <p className="mp-p" style={{ flex: '1 1 100%' }}>{noWidow(`Stop sharing with ${sh.realtorName}? Their access to your profile ends now. The application you sent stays with them.`)}</p>
                    <button type="button" data-destructive="" className="mp-btn" disabled={!!busy} onClick={() => stop(sh.id)}><Pending busy={busy === `stop:${sh.id}`} label="Stopping">Stop sharing</Pending></button>
                    <button type="button" className="mp-link" disabled={!!busy} onClick={() => setAsking('')}>Keep sharing</button>
                  </div>
                ) : <button type="button" data-destructive="" className="mp-link" disabled={!!busy} onClick={() => setAsking(sh.id)} aria-label={`Stop sharing with ${sh.realtorName}`}>Stop sharing</button>)}
              </li>
            ))}
          </ul>
        )}
        {/* Share with the listing agent of a unit: the tenant's own choice (components/tenant/ShareWithAgent.js). */}
        <ShareWithAgent agents={agents} onChanged={load} />
        <button type="button" onClick={() => setSeeOpen((v) => !v)} aria-expanded={seeOpen} className="mp-fold">
          <span>{noWidow('What a realtor would see')}</span><Chevron open={seeOpen} />
        </button>
        {seeOpen && (
          <div data-vault-shareable="">
            <p className="mp-p">{noWidow('When you approve a share, a realtor sees exactly this and nothing else. Never a document, unless you send it with an application.')}</p>
            <ul className="mp-list" style={{ marginTop: 'var(--gap-line)' }}>
              {payload.facts.map((x) => <li key={x.key} style={{ display: 'block' }}><div className="mp-label">{x.label}</div><div className={`mp-value${x.key === 'email' ? ' mp-addr' : ''}`}>{x.key === 'email' ? x.value : <LinesText text={x.value} />}</div><div className="mp-source">{noWidow(youLine(SOURCE.TYPED, x.at))}</div></li>)}
              {payload.checks.map((x) => { const t = checkText(x); return <li key={x.kind} style={{ display: 'block' }}><div className="mp-label">{t.label}</div><div className="mp-value">{noWidow(t.value)}</div><div className="mp-source">{noWidow(x.line)}</div></li>; })}
            </ul>
            {payload.facts.length + payload.checks.length === 0 && <p className="mp-note">{noWidow('Nothing yet. Your details appear here after your first application.')}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
