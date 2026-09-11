// components/dashboard/ApplicantCardRest.js
// THE CARD AT REST: the collapsed applicant card as the listing page shows it (the header row with the
// name, the meter, the Fit number and the label; then the body for the applicant's state, their next
// action and nothing else). Extracted from components/dashboard/ListingView.js so the homepage frame
// renders the same card from the sandbox fixture, read only. readOnly: no action buttons, nothing to
// tap. The expanded body stays in ListingView.
import { C } from '../theme';
import { Icon, TickMeter } from '../ui';
import { AnimatedScore } from '../motion';
import { reasonLabel } from '../../lib/setAsideReasons';
import { synthesisLine } from '../../lib/applicantSynthesis';
import { applicantState, stateLabel } from '../../lib/applicantState';
import { duplicateLine } from '../../lib/duplicates.js';
import { answerLine } from '../../lib/reportSnapshot.js';

export default function ApplicantCardRest({ a, rank, isSetAside = false, listing, profile, tracking = false, fresh = false, open = false, isPrimary = false, readOnly = false, onToggle = () => {}, onVerify = () => {}, onRequestDocs = () => {}, onOpen = () => {}, onRestore = () => {} }) {
  const app = a.application || {};
  const fit = app.fit || null;
  const overall = fit ? fit.score : null;
  const missed = (fit?.criteria || []).filter((c) => c.status === 'missed').map((c) => c.detail);
  // Where this applicant is in the process (lib/applicantState.js).
  const st = applicantState({ application: app, junction: a, verification: a.docVerifications?.[0] || null, listing });
  // The meter's colour carries the confidence: muted grey while the Fit rests on stated facts, the
  // editorial red once documents match or the realtor verified.
  const meterMuted = !!fit && (fit.label === 'stated' || fit.label === 'check docs');
  const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const act = !open && !readOnly;
  const primaryBtn = { display: 'block', width: '100%', minHeight: 44, marginTop: 'var(--s-2)', background: isPrimary ? 'var(--action)' : 'transparent', color: isPrimary ? C.paper : C.ink, border: isPrimary ? 'none' : `1.5px solid ${C.ink}`, borderRadius: 12, fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const textBtn = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, marginTop: 'var(--s-1)', background: 'transparent', color: C.ink, border: 'none', fontSize: 'var(--t-body-2)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' };
  const stateLine = { fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-1)', lineHeight: 1.35, paddingLeft: tracking ? 18 : 0 };
  const confirmedBy = (by) => (!by || by === 'You' || by === String(profile?.full_name || '').trim() ? 'you' : by);
  // Two applications from one person (lib/duplicates.js): one muted line under the state line, nothing merged.
  const dup = duplicateLine(a) ? <div style={{ ...stateLine, color: C.inkMute }}>{duplicateLine(a)}</div> : null;
  return (
    <>
          {st.state === 'set_aside' ? (
            <div role="button" tabIndex={0} aria-expanded={open} aria-controls={`applicant-${a.linkId}-body`}
              onClick={onToggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-body-2)', color: C.inkMute, lineHeight: 1.35, overflowWrap: 'anywhere', textWrap: 'pretty' }}>
                <span style={{ fontWeight: 700, color: C.inkSoft }}>{app.full_name || 'Applicant'}</span>
                {a.decisionReasonCode ? ` · ${stateLabel('set_aside', 'line', { reason: reasonLabel(a.decisionReasonCode) })}` : ''}
              </div>
              {!readOnly && <button type="button" onClick={stop(onRestore)} style={{ ...textBtn, marginTop: 0, flexShrink: 0 }}>Restore</button>}
              <span className={`m-chev ${open ? 'open' : ''}`} aria-hidden="true" style={{ flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>
            </div>
          ) : (
          <div role="button" tabIndex={0} aria-expanded={open} aria-controls={`applicant-${a.linkId}-body`}
            onClick={onToggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
            style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            {/* Row one: the name alone, never wrapping; a name past the row truncates and carries the full name in title. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 26 }}>
              {tracking && <span aria-label={fresh ? 'Not yet reviewed' : undefined} title={fresh ? 'Not yet reviewed' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: fresh ? C.red : 'transparent', flexShrink: 0 }} />}
              <span title={app.full_name || 'Applicant'} style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-body)', fontWeight: 500, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.full_name || 'Applicant'}</span>
            </div>
            {/* Row two: the meter, the Fit number and the label as one group at the right, the chevron at the far right. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--s-2)', minHeight: 26, marginTop: 'var(--s-1)', paddingLeft: tracking ? 18 : 0 }}>
              {overall != null ? (
                <AnimatedScore value={overall} index={rank ? rank - 1 : 0} refill={meterMuted ? 'muted' : 'full'} renderValue={(shown, target) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)', flexShrink: 0 }} aria-label={`${Number(target).toFixed(1)} out of 5, ${fit.label}`}>
                    <TickMeter value={Math.round(shown * 10) / 10} size={11} showValue={false} muted={meterMuted} />
                    <span className="t-d3 num" style={{ color: C.ink, lineHeight: 1 }}>{Number(shown).toFixed(1)}</span>
                    <span style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{fit.label}</span>
                  </span>
                )} />
              ) : (
                <span style={{ fontSize: 'var(--t-eyebrow)', color: C.inkMute, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Rent share unknown</span>
              )}
              <span className={`m-chev ${open ? 'open' : ''}`} aria-hidden="true" style={{ flexShrink: 0 }}><Icon name="chevronD" size={16} /></span>
            </div>
            {st.state === 'matched' && (<>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-1)', lineHeight: 1.35, textWrap: 'balance', paddingLeft: tracking ? 18 : 0 }}>{synthesisLine(a)}</div>
              {missed.length > 0 && <div style={{ fontSize: 'var(--t-body-2)', color: C.inkMute, marginTop: 'var(--s-1)', lineHeight: 1.35, textWrap: 'pretty', paddingLeft: tracking ? 18 : 0 }}>{missed.join(' · ')}</div>}
              {dup}
              {act && <button type="button" onClick={stop(onVerify)} style={primaryBtn}>Verify</button>}
            </>)}
            {st.state === 'verified' && (<>
              <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, marginTop: 'var(--s-1)', lineHeight: 1.35, textWrap: 'balance', paddingLeft: tracking ? 18 : 0 }}>{synthesisLine(a)}</div>
              <div style={stateLine}>{stateLabel('verified', 'line', { who: confirmedBy(a.confirmations?.employer?.by) })}{st.since ? ` · ${shortDate(st.since)}` : ''}</div>
              {dup}
            </>)}
            {st.state === 'sent' && (<>
              <div style={stateLine}>{stateLabel('sent', 'line')}{st.since ? ` · ${shortDate(st.since)}` : ''}</div>
              {dup}
            </>)}
            {/* The landlord's answer on the latest report snapshot, one line in the collapsed state. */}
            {!open && a.landlordAnswer && a.landlordAnswer.answer && (
              <div style={{ ...stateLine, color: C.ink, fontWeight: 600 }}>Landlord: {answerLine(a.landlordAnswer.answer)}{a.landlordAnswer.at ? ` · ${shortDate(a.landlordAnswer.at)}` : ''}</div>
            )}
            {st.state === 'new' && (<>
              <div style={stateLine}>{stateLabel('new', 'line')}</div>
              {dup}
              {act && <button type="button" onClick={stop(onRequestDocs)} style={primaryBtn}>Request documents</button>}
            </>)}
            {st.state === 'requested' && (<>
              <div style={stateLine}>{stateLabel('requested', 'line')}{st.since ? ` · ${shortDate(st.since)}` : ''}{(() => { const n = a.docRequest?.nudgedAt; const last = Array.isArray(n) && n.length ? n[n.length - 1] : null; return last ? ` · nudged ${shortDate(last)}` : ''; })()}</div>
              {dup}
              {act && <div style={{ paddingLeft: tracking ? 18 : 0 }}><button type="button" onClick={stop(onRequestDocs)} style={textBtn}>Send again</button></div>}
            </>)}
            {st.state === 'checked' && (<>
              <div style={stateLine}>{stateLabel('checked', 'line')}</div>
              {dup}
              {act && <button type="button" onClick={stop(onOpen)} style={primaryBtn}>Review documents</button>}
            </>)}
            {st.state === 'mismatch' && (<>
              <div style={stateLine}>{stateLabel('mismatch', 'line')}</div>
              {dup}
              {act && <button type="button" onClick={stop(onOpen)} style={primaryBtn}>Review documents</button>}
            </>)}
            {st.state === 'edited' && (<>
              <div style={stateLine}>{stateLabel('edited', 'line', { date: st.since ? shortDate(st.since) : '' })}</div>
              {dup}
              {act && <button type="button" onClick={stop(onOpen)} style={primaryBtn}>Review documents</button>}
            </>)}
          </div>
          )}
    </>
  );
}
