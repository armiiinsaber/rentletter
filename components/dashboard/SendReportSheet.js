// components/dashboard/SendReportSheet.js
// THE ONE PLACE A REPORT GOES TO THE LANDLORD FROM: the confirmation before it goes, and the send
// itself. Every way to send opens it: on the realtor's Listings view (components/dashboard/
// HomeView.js) Send report on a listing card, on the Ready to send tile and in Needs you; on the
// listing page (components/dashboard/ListingView.js) the Landlord section's Send. Nothing is sent
// until the realtor presses Send to the landlord, and nothing else in the app calls the send route
// (tests/sendConfirm.test.mjs). On the one sheet (components/Sheet.js): Cancel, Escape, a drag down
// or a tap on the dimmed page closes it and sends nothing (never while the report is going). It
// shows, from what the page already holds:
//   the listing's address, under the question;
//   Landlord: the landlord's name and email, or the line that the email is missing and a button
//     that asks the page for the listing's setup form (the form Edit listing opens), after which the
//     page opens the sheet again;
//   Signed by: the signing name (lib/reportSignature.js), or the line that it is missing and a
//     button that opens a field for it (prefilled with the display name and the brokerage,
//     lib/justInTime.js), saved to the profile from here;
//   In the report: the applicants the report carries, in its order, each with their Fit word
//     (components/dashboard/sendReport.js reportRows, the send route's own buildSnapshot), and
//     Preview, which opens the report the landlord gets (the PDF built from the same payload the
//     send freezes; in the installed app, the share sheet, as the listing page's Download PDF);
//   Send to the landlord, the one red action (grey and unavailable while the email or the signing
//     name is missing), and Cancel.
// The panel itself takes the focus when the sheet opens, never the red button, so no key sends.
import { useEffect, useRef, useState } from 'react';
import css from 'styled-jsx/css';
import Sheet from '../Sheet';
import { C, R } from '../theme';
import { Pending } from '../brand/Loader';
import { noWidow } from '../../lib/typeset.js';
import { SIGNATURE_MAX, signingName, cleanSignature } from '../../lib/reportSignature';
import { defaultSignature } from '../../lib/justInTime';
import { displayLabel } from '../../lib/listingAddress';
import { isStandalone } from '../../lib/standalone';
import { useAdapter } from '../../lib/dashboardAdapter';
import { NATIVE, prefersReducedMotion } from '../../lib/motion';
import { reportRows, fitWord, sendMissing } from './sendReport';

export const SEND_COPY = Object.freeze({
  title: 'Send the report?',
  landlord: 'Landlord',
  noEmail: 'No email yet',
  addEmail: 'Add the email',
  signed: 'Signed by',
  noSignature: 'No signing name yet',
  addSignature: 'Add a signing name',
  signAs: 'Sign the report as',
  save: 'Save',
  inReport: 'In the report',
  preview: 'Preview',
  previewLabel: 'Preview the report as the landlord will see it',
  send: 'Send to the landlord',
  cancel: 'Cancel',
  previewFailed: 'Could not open the preview.',
  signatureFailed: 'Could not save the signing name.',
});

// The sheet's content, on its own so it renders without the sheet (tests/sendConfirm.test.mjs).
//   rows      reportRows(...)                 missing  sendMissing(...)
//   busy      the report is going             note     what the send route answered, when it failed
//   onSend, onCancel, onAddEmail, onSaveSignature(value) -> error line | null, onPreview(event)
export function SendReportBody({ listing, rows = [], profile = null, missing = { email: false, signature: false }, busy = false, note = '', onSend, onCancel, onAddEmail, onSaveSignature, onPreview, previewHref = '#', previewBusy = false, previewNote = '' }) {
  const [sigOpen, setSigOpen] = useState(false);
  const [sigValue, setSigValue] = useState('');
  const [sigBusy, setSigBusy] = useState(false);
  const [sigNote, setSigNote] = useState('');
  const sigRef = useRef(null);
  // The field takes the focus a frame after it shows (the sheet noted the opener when it opened).
  useEffect(() => {
    if (!sigOpen) return undefined;
    const f = requestAnimationFrame(() => { if (sigRef.current) sigRef.current.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(f);
  }, [sigOpen]);
  const openSig = () => { setSigValue(defaultSignature(profile)); setSigNote(''); setSigOpen(true); };
  const saveSig = async () => {
    const v = cleanSignature(sigValue); if (!v || sigBusy) return;
    setSigBusy(true); setSigNote('');
    const failed = onSaveSignature ? await onSaveSignature(v) : null;
    setSigBusy(false);
    if (failed) { setSigNote(failed); return; }
    setSigOpen(false);
  };
  const blocked = missing.email || missing.signature;
  const name = String((listing && listing.landlord_name) || '').trim();
  const email = String((listing && listing.landlord_email) || '').trim();
  const why = [missing.email ? 'srs-miss-email' : null, missing.signature ? 'srs-miss-signature' : null].filter(Boolean).join(' ');
  return (
    <div className="srs" data-send-sheet={listing ? listing.id : ''}>
      <div className="srs-head" data-sheet-drag="">
        <h3 className="srs-title">{SEND_COPY.title}</h3>
        <p className="srs-addr" data-send-address="">{noWidow(displayLabel(listing))}</p>
      </div>
      <div className="srs-facts">
        <div className="srs-row" data-send-landlord="">
          <p className="srs-label">{SEND_COPY.landlord}</p>
          {name ? <p className="srs-strong" data-send-landlord-name="">{noWidow(name)}</p> : null}
          {missing.email ? (
            <div className="srs-missing-row" data-send-missing="email">
              <p className="srs-missing" id="srs-miss-email">{SEND_COPY.noEmail}</p>
              <button type="button" className="srs-add" onClick={onAddEmail} disabled={busy} data-send-add-email="">{SEND_COPY.addEmail}</button>
            </div>
          ) : <p className="srs-soft" data-send-landlord-email="">{email}</p>}
        </div>
        <div className="srs-row" data-send-signed="">
          <p className="srs-label">{SEND_COPY.signed}</p>
          {!missing.signature ? <p className="srs-strong" data-send-signature="">{noWidow(signingName(profile))}</p> : sigOpen ? (
            <div className="srs-sig" data-send-signature-field="">
              <input ref={sigRef} className="srs-input" value={sigValue} onChange={(e) => setSigValue(e.target.value)} maxLength={SIGNATURE_MAX} autoCapitalize="words" autoComplete="off" aria-label={SEND_COPY.signAs}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveSig(); } }} />
              <button type="button" className="srs-add" onClick={saveSig} disabled={sigBusy || !cleanSignature(sigValue)} data-send-signature-save=""><Pending busy={sigBusy} label="Saving your signature">{SEND_COPY.save}</Pending></button>
              {sigNote ? <p className="srs-note" role="alert">{sigNote}</p> : null}
            </div>
          ) : (
            <div className="srs-missing-row" data-send-missing="signature">
              <p className="srs-missing" id="srs-miss-signature">{SEND_COPY.noSignature}</p>
              <button type="button" className="srs-add" onClick={openSig} disabled={busy} data-send-add-signature="">{SEND_COPY.addSignature}</button>
            </div>
          )}
        </div>
      </div>
      <div className="srs-report">
        <div className="srs-list-head">
          <h4 className="srs-list-t">{SEND_COPY.inReport}<span className="srs-count" data-send-count="">{rows.length}</span></h4>
          <a href={previewHref} target="_blank" rel="noopener" className="srs-preview" onClick={onPreview} aria-label={SEND_COPY.previewLabel} aria-busy={previewBusy ? 'true' : undefined} data-send-preview=""><Pending busy={previewBusy} label="Opening the preview">{SEND_COPY.preview}</Pending></a>
        </div>
        {previewNote ? <p className="srs-note" role="alert" data-send-preview-note="">{previewNote}</p> : null}
        <ol className="srs-list" data-send-applicants="">
          {rows.map((r) => {
            const word = fitWord(r.fit);
            return (
              <li key={r.linkId || r.rank} className="srs-app" data-send-applicant={r.linkId || ''} data-send-rank={r.rank}>
                <span className="srs-rank" aria-hidden="true">{r.rank}</span>
                <span className="srs-who">
                  <span className="srs-name" data-send-name="">{noWidow(r.name)}</span>
                  <span className={`srs-fit${word === 'verified' ? ' srs-fit-on' : ''}`} data-send-fit="">{word}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="srs-actions">
        <button type="button" className="srs-btn srs-send" onClick={onSend} disabled={busy || blocked} aria-busy={busy ? 'true' : undefined} aria-describedby={why || undefined} data-send-confirm="">
          <Pending busy={busy} label="Sending the report" tone="red">{SEND_COPY.send}</Pending>
        </button>
        <button type="button" className="srs-btn srs-cancel" onClick={onCancel} disabled={busy} data-send-cancel="">{SEND_COPY.cancel}</button>
      </div>
      {note ? <p className="srs-note" role="alert" data-send-note="">{note}</p> : null}
      <style jsx global>{SRS_CSS}</style>
    </div>
  );
}

// The PDF the landlord gets, for the listing: in a new tab, opened on the press itself so no
// browser blocks it; in the installed app, the share sheet (it always comes back to the app); a
// download when neither can be had. Answers the line to show when it could not be made, or null.
async function openReportPdf(adapter, listingId) {
  const standalone = isStandalone();
  let win = null;
  if (!standalone) { try { win = window.open('', '_blank'); } catch (e) { win = null; } }
  try {
    const r = await adapter.fetch(`/api/listings/report-pdf?listingId=${encodeURIComponent(listingId)}`);
    if (!r.ok) { const j = await r.json().catch(() => ({})); if (win) win.close(); return j.error || SEND_COPY.previewFailed; }
    const raw = await r.blob();
    const blob = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' });
    const name = `report-preview-${new Date().toISOString().slice(0, 10)}.pdf`;
    if (win && !win.closed) { const url = URL.createObjectURL(blob); win.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); return null; }
    const FileCtor = typeof window !== 'undefined' ? window.File : null;
    const file = typeof FileCtor === 'function' ? new FileCtor([blob], name, { type: 'application/pdf' }) : null;
    if (standalone && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch (e) { /* the realtor closed the sheet */ }
      return null;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return null;
  } catch (e) {
    if (win && !win.closed) win.close();
    return SEND_COPY.previewFailed;
  }
}

// One sheet at a time: the next rises once the last has gone (components/Sheet.js gives the focus
// back to what opened it as it leaves). The pages open the listing's setup form this way when the
// email is missing, and the sheet again after it.
export const afterSheet = (fn) => setTimeout(fn, (prefersReducedMotion() ? NATIVE.fade : NATIVE.sheet) + 60);
export const SEND_FAILED = 'The report did not go. Try again.';

// listing: the listing whose report is asked for (the sheet closes when it is null). The page that
// opened it hears back:
//   onSent(listing, answer)  the route sent it (answer.preview in the sandbox: nothing went out);
//                            the page closes the sheet and shows it on its own screen
//   onProfile(profile)       the signing name was saved
//   onAddEmail()             the realtor asked to add the landlord's email
//   onClose()                Cancel, Escape, a drag down or a tap outside
// A refusal stays in the sheet, with the route's line, to try again or cancel.
export default function SendReportSheet({ listing = null, applicants = [], profile = null, onClose, onSent, onAddEmail, onProfile }) {
  const adapter = useAdapter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewNote, setPreviewNote] = useState('');
  const id = listing ? listing.id : null;
  useEffect(() => { setNote(''); setPreviewNote(''); }, [id]);
  const missing = listing ? sendMissing(listing, profile) : { email: true, signature: true };
  // Send to the landlord: the report goes, from here alone.
  const send = async () => {
    if (!listing || busy || missing.email || missing.signature) return;
    const l = listing;
    setBusy(true); setNote('');
    try {
      const r = await adapter.fetch('/api/listings/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: l.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j.error || SEND_FAILED); return; }
      if (onSent) onSent(l, j);
    } catch (e) { setNote(SEND_FAILED); } finally { setBusy(false); }
  };
  // The signing name, asked in the sheet, saved to the profile.
  const saveSignature = async (v) => {
    try {
      const r = await adapter.fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_signature: v }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) return j.error || SEND_COPY.signatureFailed;
      if (onProfile) onProfile({ ...(j.profile || profile || {}), report_signature: v });
      return null;
    } catch (e) { return SEND_COPY.signatureFailed; }
  };
  const onPreview = async (e) => {
    e.preventDefault();
    if (previewBusy || !listing) return;
    setPreviewBusy(true); setPreviewNote('');
    const failed = await openReportPdf(adapter, listing.id);
    setPreviewBusy(false);
    if (failed) setPreviewNote(failed);
  };
  const previewHref = !listing ? '#' : adapter.kind === 'real' ? `/api/listings/report-pdf?listingId=${encodeURIComponent(listing.id)}` : `${adapter.paths.listing(listing.id)}#report`;
  return (
    <Sheet open={!!listing} onClose={onClose} role="alertdialog" label={SEND_COPY.title} busy={busy} maxWidth={520} dialogWidth={680}>
      {listing ? (
        <SendReportBody key={listing.id} listing={listing} rows={reportRows({ listing, applicants, profile })} profile={profile} missing={missing}
          busy={busy} note={note} onSend={send} onCancel={onClose} onAddEmail={onAddEmail} onSaveSignature={saveSignature}
          onPreview={onPreview} previewHref={previewHref} previewBusy={previewBusy} previewNote={previewNote} />
      ) : null}
    </Sheet>
  );
}

// Global: the sheet renders on the body (components/Sheet.js). Every class is srs-, this sheet's own.
// Red is the one action, Send to the landlord; an error line is the danger red. A style kept in a
// constant is tagged with css.global (styled-jsx/css), which gives it its name at build time
// (tests/styleNames.test.mjs).
const SRS_CSS = css.global`
  .srs { display: grid; gap: var(--s-4); padding: 4px 20px 20px; }
  .srs p { margin: 0; }
  .srs-head { display: grid; gap: var(--s-1); }
  .srs-title { margin: 0; font-size: 18px; font-weight: 800; color: ${C.ink}; letter-spacing: -0.015em; line-height: 1.25; }
  .srs-addr { font-family: var(--f-display); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; color: ${C.ink}; overflow-wrap: anywhere; text-wrap: balance; }
  .srs-facts { display: grid; gap: var(--s-3); padding: var(--s-3) 0; border-top: 1px solid ${C.rule}; border-bottom: 1px solid ${C.rule}; }
  .srs-row { display: grid; gap: 2px; min-width: 0; }
  .srs-label { font-size: var(--t-eyebrow); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.inkMute}; line-height: var(--lh-eyebrow); }
  .srs-strong { font-size: var(--t-body-2); font-weight: 600; color: ${C.ink}; line-height: var(--lh-body); overflow-wrap: anywhere; text-wrap: balance; }
  .srs-soft { font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); overflow-wrap: anywhere; }
  .srs-missing-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--s-1) var(--s-3); min-width: 0; }
  .srs-missing { font-size: var(--t-body-2); font-weight: 600; color: ${C.ink}; line-height: var(--lh-body); }
  .srs-add { flex: none; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 var(--gap-card); border-radius: var(--btn-radius); border: 1.5px solid ${C.ink}; background: transparent; color: ${C.ink}; font-family: inherit; font-size: var(--t-body-2); font-weight: 700; white-space: nowrap; cursor: pointer; }
  .srs-add:disabled { border-color: ${C.ruleDark}; color: ${C.inkMute}; cursor: not-allowed; }
  .srs-sig { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); margin-top: var(--s-1); min-width: 0; }
  .srs-input { flex: 1 1 200px; min-width: 0; min-height: 44px; margin: 0; padding: 0 var(--s-3); border: 1px solid ${C.ruleDark}; border-radius: ${R.ctrl}px; background: ${C.card}; color: ${C.ink}; font-family: inherit; font-size: 16px; }
  .srs-input:focus { outline: none; border-color: ${C.ink}; box-shadow: 0 0 0 1px ${C.ink}; }
  .srs-sig .srs-note { flex: 1 1 100%; }
  .srs-report { display: grid; gap: var(--s-1); min-width: 0; }
  .srs-list-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0 var(--s-3); }
  .srs-list-t { margin: 0; font-size: var(--t-body-2); font-weight: 700; color: ${C.ink}; line-height: 1.3; }
  .srs-count { margin-left: var(--s-2); color: ${C.inkSoft}; font-variant-numeric: tabular-nums; }
  .srs-preview { display: inline-flex; align-items: center; min-height: 44px; color: ${C.ink}; font-size: var(--t-body-2); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .srs-list { list-style: none; margin: 0; padding: 0; display: grid; }
  .srs-app { display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: var(--s-2); align-items: baseline; padding: var(--s-2) 0; border-top: 1px solid ${C.rule}; }
  .srs-app:first-child { border-top: none; padding-top: 0; }
  .srs-rank { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; line-height: 1.35; font-variant-numeric: tabular-nums; }
  .srs-who { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--s-3); min-width: 0; }
  .srs-name { flex: 1 1 auto; min-width: 0; font-size: var(--t-body-2); font-weight: 600; color: ${C.ink}; line-height: 1.35; overflow-wrap: anywhere; text-wrap: balance; }
  .srs-fit { flex: none; font-size: var(--t-eyebrow); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${C.inkMute}; line-height: 1.35; white-space: nowrap; }
  .srs-fit-on { color: ${C.ink}; }
  .srs-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .srs-btn { flex: 1 1 180px; min-width: 0; min-height: 48px; margin: 0; padding: 0 var(--gap-card); border-radius: var(--btn-radius); font-family: inherit; font-size: 15px; font-weight: 700; line-height: 1.2; white-space: nowrap; cursor: pointer; }
  .srs-send { background: ${C.red}; color: ${C.paper}; border: 1px solid ${C.red}; }
  .srs-send:disabled { background: ${C.ruleDark}; border-color: ${C.ruleDark}; cursor: not-allowed; }
  .srs-send[aria-busy='true'] { cursor: wait; }
  .srs-cancel { background: transparent; color: ${C.inkSoft}; border: 1px solid ${C.ruleDark}; font-weight: 600; }
  .srs-cancel:disabled { cursor: not-allowed; }
  .srs-add:focus-visible, .srs-btn:focus-visible, .srs-preview:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.paper}, 0 0 0 4px ${C.ink}; }
  .srs-note { font-size: var(--t-body-2); font-weight: 600; color: ${C.danger}; line-height: var(--lh-body); text-wrap: balance; }
  @media (min-width: 1024px) { .srs { padding: 8px 28px 28px; } .srs-addr { font-size: 22px; } }
  @media (min-width: 1920px) { .srs-strong, .srs-soft, .srs-missing, .srs-name, .srs-list-t, .srs-preview { font-size: 15px; } }
`;
