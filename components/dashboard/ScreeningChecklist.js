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
import React, { useState, useEffect } from 'react';
import { C, R } from '../theme';
import { Icon } from '../ui';
import { useAdapter } from '../../lib/dashboardAdapter';
import { readVerification } from '../../lib/fitScore';
import { isIdKind } from '../../lib/documentRetention';

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
const money = (n) => (n != null && n !== '' && Number.isFinite(Number(n)) ? `$${Number(n).toLocaleString('en-CA')}` : null);
const kShort = (n) => (Number(n) >= 1000 ? `$${Math.round(Number(n) / 1000)}k` : `$${Number(n)}`);

export default function ScreeningChecklist({ applicant, listing, profile, onChange, heldDocuments, onViewDocument }) {
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

  const report = applicant.docVerifications?.[0] || null;
  const v = readVerification(report);
  const hasDocs = v.state !== 'none';
  const nameFact = !hasDocs ? 'none' : v.state === 'ok' ? 'name matches' : 'did not match';
  const incomeFact = !hasDocs ? 'none' : v.incomeMatched ? `${v.incomeFound != null ? money(v.incomeFound) : 'income'} matches` : 'did not match';
  const employerFact = !hasDocs ? 'none' : v.employerMatched ? 'matched' : 'not matched';
  const minIncome = Number(listing?.pref_min_annual_income) > 0 ? Number(listing.pref_min_annual_income) : null;
  const incomeMiss = fit && minIncome && fit.incomeUsed != null && fit.incomeUsed < minIncome ? ` · your min ${kShort(minIncome)}` : '';
  const maxPct = Number(listing?.pref_rent_to_income_max_pct) > 0 ? Number(listing.pref_rent_to_income_max_pct) : 40;
  const refs = Array.isArray(app.references) ? app.references.filter((r) => r && (r.name || r.contact || r.phone || r.email)).length : 0;
  const said = (parts) => parts.filter(Boolean).join(', ');

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
    { key: 'employer', title: 'Income', said: app.annual_income ? `${money(app.annual_income)} a year` : 'no income given', docs: incomeFact + incomeMiss, verb: 'Called employer' },
    { key: 'employer', title: 'Employer', said: said([app.employer, app.job_title]) || 'no employer given', docs: employerFact, verb: 'Called employer', sameAsAbove: true },
    { key: 'landlord', title: 'Previous landlord', said: app.prev_landlord_name || 'none given', second: app.prev_landlord_name && app.prev_landlord_contact ? `Contact: ${app.prev_landlord_contact}` : null, docs: null, verb: 'Called landlord' },
    { key: 'reference', title: 'References', said: refs ? `${refs} on file` : 'none', docs: null, verb: 'Called a reference' },
    { key: null, title: 'Rent share', said: fit ? `${fit.ratio}% of income · your max ${maxPct}%` : 'unknown, no income or rent', docs: null },
  ];

  const btn = (on) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, minWidth: 156, padding: '0 14px',
    borderRadius: R.ctrl, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    background: on ? C.red : 'transparent', color: on ? C.paper : C.ink, border: on ? `1.5px solid ${C.red}` : `1.5px solid ${C.ink}`,
  });

  return (
    <div id={`checklist-${applicant.linkId}`} style={{ marginTop: 18, scrollMarginTop: 72 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkMute }}>Screening checklist</div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>You verify. Documents only match.</div>
      </div>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, background: C.paper, overflow: 'hidden' }}>
        {rows.map((row, i) => {
          const c = row.key ? conf[row.key] : null;
          const on = !!c;
          const shared = row.sameAsAbove;
          return (
            <div key={row.title} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', padding: '12px 14px', borderTop: i ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{row.title}</div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.4, marginTop: 2, overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                  Said: {row.said}{row.docs != null ? <> · Docs: {row.docs}</> : null}
                </div>
                {row.second ? <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{row.second}</div> : null}
              </div>
              {row.key && !shared ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <button type="button" onClick={() => toggle(row.key)} disabled={busy === row.key} aria-pressed={on}
                    aria-label={on ? `${row.verb}, confirmed ${shortDate(c.at)} by ${c.by}. Tap to undo.` : row.verb}
                    style={{ ...btn(on), opacity: busy === row.key ? 0.7 : 1 }}>
                    {on ? <><Icon name="check" size={14} /><span>{shortDate(c.at)} · {c.by}</span></> : row.verb}
                  </button>
                  {row.key === 'id' && idDoc ? (
                    <button type="button" onClick={viewId} disabled={viewBusy} style={{ minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: C.ink, fontSize: 13, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', opacity: viewBusy ? 0.6 : 1 }}>{viewBusy ? 'Opening' : 'View ID'}</button>
                  ) : null}
                </div>
              ) : row.key && shared ? (
                <div style={{ fontSize: 12, color: C.inkMute, flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>{on ? `Confirmed · ${shortDate(c.at)}` : 'One call, with the income row'}</div>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <div role="alert" style={{ fontSize: 12.5, color: C.danger, marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}
