// The screening checklist. Six rows, one per screenable tenancy fact: what the applicant said,
// what the documents said (the same reading Fit uses, lib/fitScore.js readVerification), and
// the realtor's own confirmation. The realtor verifies; the product makes it quick.
//
// Confirmations are written through POST /api/applicants/confirm (entitlement gated, ownership
// checked) into listing_applicants.confirmations (db/screening.sql). The tap is optimistic and
// reverts on error; `onChange` hands the new object up so the card recomputes Fit at once.
//
// OHRC and BC Code: every row is a screenable fact (identity, income, employer, previous
// landlord, references, rent share). No occupants, no household, no reason for moving, no free text.
// The previous landlord can also answer six closed questions by email (Ask by email, /ref/{token});
// the answers show under the row and count as a confirmation, never as a number.
import React, { useState, useEffect } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { readVerification, incomeIsJoint, householdIncomeOf } from '../../lib/fitScore';
import { applicantState, stateLabel } from '../../lib/applicantState';
import { isIdKind } from '../../lib/documentRetention';
import { answerSummary, emailIn, RESEND_AFTER_DAYS } from '../../lib/referenceQuestions';

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
const money = (n) => (n != null && n !== '' && Number.isFinite(Number(n)) ? `$${Number(n).toLocaleString('en-CA')}` : null);
// The one line of guidance under the rows a realtor phones: the number must be the realtor's own.
const GUIDANCE = 'Use a number you find yourself, not one the applicant gave.';
const kShort = (n) => (Number(n) >= 1000 ? `$${Math.round(Number(n) / 1000)}k` : `$${Number(n)}`);

export default function ScreeningChecklist({ applicant, listing, profile, onChange, onReference, heldDocuments, onViewDocument }) {
  const adapter = useAdapter();
  const app = applicant.application || {};
  const fit = app.fit || null;
  const [conf, setConf] = useState(applicant.confirmations || {});
  useEffect(() => { setConf(applicant.confirmations || {}); }, [applicant.confirmations]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  // A held ID document (government id, passport, licence) puts "View ID" beside Saw ID.
  const idDoc = (Array.isArray(heldDocuments) ? heldDocuments : []).find((d) => d && !d.deletedAt && isIdKind(d.kind)) || null;
  const [viewBusy, setViewBusy] = useState(false);
  const viewId = async () => { if (viewBusy || !idDoc) return; setViewBusy(true); setError(''); const e = await onViewDocument?.(idDoc); if (e) setError(e); setViewBusy(false); };
  const myName = String(profile?.full_name || '').trim() || 'You';
  // The previous landlord's six questions by email (lib/referenceQuestions.js): the request row
  // rides on the applicant as referenceResponse (pending or answered), written by the routes.
  const [refResp, setRefResp] = useState(applicant.referenceResponse || null);
  useEffect(() => { setRefResp(applicant.referenceResponse || null); }, [applicant.referenceResponse]);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const landlordEmail = emailIn(app.prev_landlord_contact);
  const pendingAge = refResp && refResp.status === 'pending' && refResp.sentAt ? (Date.now() - new Date(refResp.sentAt).getTime()) / 86400000 : null;
  const canAsk = !!landlordEmail && (!refResp || refResp.status !== 'pending' || (pendingAge != null && pendingAge >= RESEND_AFTER_DAYS));
  const sendAsk = async () => {
    if (sending) return;
    setSending(true); setError('');
    try {
      const r = await adapter.fetch('/api/references/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: applicant.linkId }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send that.');
      const next = j.response || { status: 'pending', sentTo: landlordEmail, sentAt: new Date().toISOString() };
      setRefResp(next); onReference?.(next); setAsking(false);
    } catch (e) { setError(e?.message || 'Could not send that.'); }
    finally { setSending(false); }
  };

  const report = applicant.docVerifications?.[0] || null;
  const v = readVerification(report);
  const hasDocs = v.state !== 'none';
  // The Identity Docs fact comes from the one label map (lib/applicantState.js STATE_LABELS.*.docs).
  const docsState = applicantState({ junction: applicant, verification: report }).state;
  const nameFact = !hasDocs ? stateLabel('new', 'docs') : (v.state === 'ok' ? (stateLabel(docsState, 'docs') || stateLabel('checked', 'docs')) : stateLabel('mismatch', 'docs'));
  // The found string is the arithmetic, not a bare number: "$3,541.67 semi monthly × 24 from 2 of 3 stubs".
  // A close figure (within 15%) is shown with both figures and the explanation; it is not a contradiction.
  const incomeFact = !hasDocs ? 'none' : v.incomeMatched ? `${v.incomeExplanation || (v.incomeFound != null ? money(v.incomeFound) : 'income')} matches` : v.incomeClose ? `${v.incomeExplanation}, close to stated` : v.incomeExplanation ? `${v.incomeExplanation}, did not match` : 'did not match';
  // The Employer row: matched or not, the letter's start date, and what lower sources list (a credit
  // report's employer line is historical and never compared, lib/documentAuthority.js).
  const employerFact = !hasDocs ? 'none' : `${v.employerMatched ? 'matched' : 'not matched'}${v.employerSince ? ` · ${v.employerSince}` : ''}`;
  const alsoSeen = hasDocs && Array.isArray(v.employerAlsoSeen) ? v.employerAlsoSeen : [];
  const minIncome = Number(listing?.pref_min_annual_income) > 0 ? Number(listing.pref_min_annual_income) : null;
  const incomeMiss = fit && minIncome && fit.incomeUsed != null && fit.incomeUsed < minIncome ? ` · your min ${kShort(minIncome)}` : '';
  const maxPct = Number(listing?.pref_rent_to_income_max_pct) > 0 ? Number(listing.pref_rent_to_income_max_pct) : 40;
  const refs = Array.isArray(app.references) ? app.references.filter((r) => r && (r.name || r.contact || r.phone || r.email)).length : 0;
  const said = (parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');
  // The previous landlord's contact: an email and a phone go on separate lines, so a number never
  // wraps in the middle.
  const contactLines = (raw) => { const t = String(raw || '').trim(); if (!t) return []; const email = (t.match(/\S+@\S+/) || [])[0]; const rest = email ? t.replace(email, '').replace(/^[\s·,;|]+|[\s·,;|]+$/g, '') : t; return [email, rest].filter(Boolean); };

  const toggle = async (key) => {
    if (busy) return;
    const prev = conf;
    const on = !conf[key];
    const next = { ...conf };
    if (on) next[key] = { at: new Date().toISOString(), by: myName }; else delete next[key];
    setConf(next); onChange?.(next); setBusy(key); setError('');
    try {
      const r = await adapter.fetch('/api/applicants/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkId: applicant.linkId, key, on }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save that.');
      const saved = j.confirmations && typeof j.confirmations === 'object' ? j.confirmations : next;
      setConf(saved); onChange?.(saved);
    } catch (e) {
      setConf(prev); onChange?.(prev); setError(e?.message || 'Could not save that.');
    } finally { setBusy(null); }
  };

  const rows = [
    { key: 'id', title: 'Identity', said: app.full_name || 'no name given', docs: nameFact, verb: 'Saw ID' },
    { key: 'employer', title: 'Income', said: app.annual_income ? `${money(householdIncomeOf(app))} a year${incomeIsJoint(app) ? ' (joint)' : ''}` : 'no income given', docs: incomeFact + incomeMiss, verb: 'Called employer' },
    { key: 'employer', title: 'Employer', said: said([app.employer, app.job_title]) || 'no employer given', docs: employerFact, verb: 'Called employer', sameAsAbove: true, also: alsoSeen, note: GUIDANCE },
    { key: 'landlord', title: 'Previous landlord', said: app.prev_landlord_name || 'none given', second: app.prev_landlord_name && app.prev_landlord_contact ? contactLines(app.prev_landlord_contact) : null, docs: null, verb: 'Called landlord' , note: GUIDANCE },
    { key: 'reference', title: 'References', said: refs ? `${refs} on file` : 'none', docs: null, verb: 'Called a reference' },
    { key: null, title: 'Rent share', said: fit ? `${fit.ratio}% of income · your max ${maxPct}%` : 'unknown, no income or rent', docs: null },
  ];

  const btn = (on) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-1)', minHeight: 44, minWidth: 156, padding: '0 var(--s-3)',
    borderRadius: R.ctrl, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: on ? 999 : R.ctrl,
  });

  return (
    <div id={`checklist-${applicant.linkId}`} style={{ marginTop: 'var(--s-4)', scrollMarginTop: 72 }}>
      <div style={{ marginBottom: 'var(--s-2)' }}>
        <div style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkMute }}>Screening checklist</div>
        <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-1)' }}>You verify. Documents only match.</div>
      </div>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, background: C.paper, overflow: 'hidden' }}>
        {rows.map((row, i) => {
          const c = row.key ? conf[row.key] : null;
          const on = !!c;
          const shared = row.sameAsAbove;
          return (
            <div key={row.title} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-1) var(--s-3)', padding: 'var(--s-3) var(--s-3)', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-body-2)', fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{row.title}</div>
                <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.4, marginTop: 'var(--s-1)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                  Said: {row.said}{row.docs != null ? <> · Docs: {row.docs}</> : null}
                </div>
                {Array.isArray(row.also) && row.also.length ? row.also.map((line) => <div key={line} style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.4, marginTop: 'var(--s-1)', overflowWrap: 'anywhere', textWrap: 'pretty' }}>Also seen: {line}</div>) : null}
                {row.note ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 1.4, marginTop: 'var(--s-1)', textWrap: 'pretty' }}>{row.note}</div> : null}
                {row.key === 'landlord' && refResp && refResp.status === 'pending' ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 1.4, marginTop: 'var(--s-1)' }}>Asked {shortDate(refResp.sentAt)} · no answer yet</div> : null}
                {row.key === 'landlord' && refResp && refResp.status === 'answered' ? (
                  <div style={{ marginTop: 'var(--s-1)' }}>
                    <div style={{ fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 1.4, overflowWrap: 'anywhere', textWrap: 'pretty' }}>{answerSummary(refResp.answers)}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)', fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.4, marginTop: 2 }}><Icon name="check" size={14} color={C.red} strokeWidth={2.5} /><span>Answered {shortDate(refResp.answeredAt)}</span></div>
                  </div>
                ) : null}
                {row.key === 'landlord' && asking ? (
                  <div style={{ marginTop: 'var(--s-2)', padding: 'var(--s-2) var(--s-3)', background: C.paperDeep, borderRadius: R.ctrl }}>
                    <div style={{ fontSize: 'var(--t-body-2)', color: C.ink, lineHeight: 1.4, overflowWrap: 'anywhere', textWrap: 'pretty' }}>Six closed questions go to <span style={{ fontWeight: 700 }}>{landlordEmail}</span>. Nothing goes to {String(app.full_name || 'the applicant').split(/\s+/)[0]}.</div>
                    <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', marginTop: 'var(--s-2)', flexWrap: 'wrap' }}>
                      <button type="button" onClick={sendAsk} disabled={sending} style={{ ...btn(false), minWidth: 0, opacity: sending ? 0.7 : 1 }}>{sending ? 'Sending' : 'Send'}</button>
                      <button type="button" onClick={() => setAsking(false)} disabled={sending} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                ) : null}
                {Array.isArray(row.second) && row.second.length ? row.second.map((line) => <div key={line} style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, lineHeight: 1.4, overflowWrap: 'anywhere', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>) : null}
              </div>
              {row.key && !shared ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2) var(--s-3)', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
                  <button type="button" onClick={() => toggle(row.key)} disabled={busy === row.key} aria-pressed={on}
                    aria-label={on ? `${row.verb}, confirmed ${shortDate(c.at)}. Tap to undo.` : row.verb}
                    style={{ ...btn(on), opacity: busy === row.key ? 0.7 : 1 }}>
                    {on ? <><Icon name="check" size={14} color={C.red} strokeWidth={2.5} /><span>Confirmed · {shortDate(c.at)}</span></> : row.verb}
                  </button>
                  {row.key === 'landlord' && landlordEmail && !asking && (!refResp || refResp.status !== 'pending') ? (
                    <button type="button" onClick={() => setAsking(true)} style={{ ...btn(false), minWidth: 0 }}>Ask by email</button>
                  ) : null}
                  {row.key === 'landlord' && refResp && refResp.status === 'pending' && canAsk && !asking ? (
                    <button type="button" onClick={() => setAsking(true)} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>Send again</button>
                  ) : null}
                  {row.key === 'id' && idDoc ? (
                    <button type="button" onClick={viewId} disabled={viewBusy} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', opacity: viewBusy ? 0.6 : 1 }}>{viewBusy ? 'Opening' : 'View ID'}</button>
                  ) : null}
                </div>
              ) : row.key && shared ? (
                <button type="button" onClick={() => toggle(row.key)} disabled={busy === row.key} aria-pressed={on}
                  aria-label={on ? `${row.verb}, confirmed ${shortDate(c.at)}. Tap to undo.` : row.verb}
                  style={{ ...btn(on), opacity: busy === row.key ? 0.7 : 1 }}>
                  {on ? <><Icon name="check" size={14} color={C.red} strokeWidth={2.5} /><span>Confirmed · {shortDate(c.at)}</span></> : row.verb}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <div role="alert" style={{ fontSize: 'var(--t-body-2)', color: C.danger, marginTop: 'var(--s-1)' }}>{error}</div> : null}
    </div>
  );
}
