// pages/party/[token].js
// A co applicant's or a guarantor's own page (lib/parties.js), reached from their invite email.
// Their token is the only thing in the URL and opens nothing but this page. The same design
// system as the apply form, the same steps minus the listing's own: about you, employment and
// income, review and consent; then their own documents (components/tenant/DocumentUploader.js,
// the credit report optional like everyone's). No motion. A guarantor's page says in one sentence
// what a guarantor is. Decline from the email (?decline=1) or withdraw from this page: the
// primary is told either way. Nothing of the primary's shows here beyond their first name.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Wordmark, StatusPills } from '../../components/ui';
import { C } from '../../components/theme';
import { Field, SelectField } from '../../components/apply/fields';
import { ProfileStyles, Eyebrow, LinesText, EMP_LABEL, noWidow } from '../../components/tenant/ProfileFacts';
import DocumentUploader from '../../components/tenant/DocumentUploader';
import { RETENTION_DAYS } from '../../lib/documentRetention';
import { PARTY_STATUS, GUARANTOR_SENTENCE, PARTY_CONSENT_LINE, DECLINE_LINE, WITHDRAW_LINE, INCOME_KIND_LABEL, partyFormErrors, STATUS_LABEL } from '../../lib/parties';
import { PARTY_ROLE, INCOME_KIND } from '../../lib/application-state';

const STEPS = [{ id: 'you', title: 'About you' }, { id: 'work', title: 'Employment and income' }, { id: 'review', title: 'Review and consent' }];
const EMPTY = { fullName: '', phone: '', address: '', employmentType: 'full-time', jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '', incomeKind: INCOME_KIND.EMPLOYMENT };
const money = (v) => (v ? `$${Number(String(v).replace(/[^0-9.]/g, '')).toLocaleString('en-CA')}` : '');

export default function PartyPage() {
  const router = useRouter();
  const token = String(router.query.token || '').toUpperCase();
  const declining = router.query.decline === '1';
  const [phase, setPhase] = useState('loading'); // loading | invalid | form | submitted | declined | withdrawn | documents
  const [ctx, setCtx] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [docRequest, setDocRequest] = useState(null);
  const [docs, setDocs] = useState({ state: 'idle', received: 0 });
  const [consent, setConsent] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const post = async (body) => {
    const r = await fetch('/api/party/self', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not do that.');
    return j;
  };

  useEffect(() => {
    if (!router.isReady) return;
    if (!/^[A-Z2-9]{32}$/.test(token)) { setPhase('invalid'); return; }
    let gone = false;
    (async () => {
      try {
        const r = await fetch(`/api/party/self?token=${encodeURIComponent(token)}`);
        const j = await r.json().catch(() => ({}));
        if (gone) return;
        if (!r.ok) { setPhase('invalid'); return; }
        setCtx(j);
        setForm({ ...EMPTY, ...(j.form || {}), incomeKind: (j.form && j.form.employmentType) === 'self-employed' ? INCOME_KIND.SELF_EMPLOYED : INCOME_KIND.EMPLOYMENT });
        if (j.docRequest && j.docRequest.token) setDocRequest(j.docRequest);
        setPhase(j.status === PARTY_STATUS.DECLINED ? 'declined' : j.status === PARTY_STATUS.WITHDRAWN ? 'withdrawn' : j.status === PARTY_STATUS.SUBMITTED ? 'submitted' : 'form');
      } catch (e) { if (!gone) setPhase('invalid'); }
    })();
    return () => { gone = true; };
  }, [router.isReady, token]);
  useEffect(() => { document.getElementById(`party-step-${step}`)?.scrollIntoView({ block: 'start' }); }, [step]);

  const isGuarantor = ctx && ctx.role === PARTY_ROLE.GUARANTOR;
  const roleWord = isGuarantor ? 'guarantor' : 'co applicant';
  const leave = async (action) => {
    if (busy) return;
    setBusy(true); setError('');
    try { const j = await post({ action }); setPhase(j.status === PARTY_STATUS.DECLINED ? 'declined' : 'withdrawn'); window.scrollTo(0, 0); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); setConfirmLeave(false); }
  };
  const next = () => {
    setError('');
    const e = partyFormErrors(form, ctx.role);
    const mine = step === 1 ? ['fullName', 'address'] : step === 2 ? ['annualIncome'] : [];
    const here = Object.fromEntries(Object.entries(e).filter(([k]) => mine.includes(k)));
    setErrors(here);
    if (Object.keys(here).length) return;
    setStep(Math.min(step + 1, STEPS.length));
  };
  const submit = async () => {
    if (busy) return;
    if (!consent) { setError('Tick the consent line to send your form.'); return; }
    setBusy(true); setError('');
    try {
      const j = await post({ action: 'submit', form });
      if (j.docRequest) setDocRequest(j.docRequest);
      setPhase('submitted'); window.scrollTo(0, 0);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const header = (
    <header className="mp-header">
      <a href="/" className="rl-mark" aria-label="Rentletter home"><Wordmark /></a>
      <span className="mp-note">{isGuarantor ? 'Guarantor form' : 'Co applicant form'}</span>
    </header>
  );
  const shell = (inner) => (
    <>
      <Head><title>{isGuarantor ? 'Guarantor' : 'Co applicant'} · Rentletter</title><meta name="robots" content="noindex" /></Head>
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">{header}<div className="mp-wrap mp-sections"><div className="mp-stack">{inner}</div></div></div>
    </>
  );

  if (phase === 'loading') return shell(<div className="rl-card mp-card"><p className="mp-p">Loading</p></div>);
  if (phase === 'invalid') return shell(
    <div className="rl-card mp-card">
      <Eyebrow>Invite</Eyebrow>
      <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('This link is not valid')}</h1>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Ask the person who invited you for a new one.')}</p>
    </div>,
  );
  const unit = ctx.listingName || 'the unit';
  const banner = (
    <div className="mp-ink">
      <Eyebrow style={{ color: '#8f8b81' }}>{isGuarantor ? 'You were named as guarantor' : 'You were named as co applicant'}</Eyebrow>
      <div className="mp-h2" style={{ color: C.paper, marginTop: 'var(--gap-line)' }}>{noWidow(unit)}</div>
      <div className="mp-p" style={{ color: '#c8c2b3', marginTop: 'var(--gap-line)' }}>{noWidow(`${ctx.primaryFirst || 'The applicant'} is applying${ctx.realtorName ? `, through ${ctx.realtorName}` : ''}.`)}</div>
      {isGuarantor && <div className="mp-p" style={{ color: C.paper, marginTop: 'var(--gap-line)' }}>{noWidow(GUARANTOR_SENTENCE)}</div>}
    </div>
  );
  if (phase === 'declined' || phase === 'withdrawn') return shell(<>
    {banner}
    <div className="rl-card mp-card">
      <Eyebrow>Your part</Eyebrow>
      <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(phase === 'declined' ? 'You declined.' : 'You withdrew.')}</h1>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`${ctx.primaryFirst || 'The applicant'} has been told. ${phase === 'declined' ? 'Nothing of yours was kept.' : 'Your details stay on the application until it closes.'}`)}</p>
    </div>
  </>);
  if (declining && phase === 'form') return shell(<>
    {banner}
    <div className="rl-card mp-card">
      <Eyebrow>Decline</Eyebrow>
      <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`Decline being ${roleWord}?`)}</h1>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(DECLINE_LINE)}</p>
      {error && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(error)}</p>}
      <div className="rl-ctrl-row" style={{ marginTop: 'var(--gap-card)' }}>
        <button type="button" onClick={() => leave('decline')} disabled={busy} className="mp-btn mp-btn-red">{busy ? 'Declining' : 'Decline'}</button>
        <a href={`/party/${encodeURIComponent(token)}`} className="mp-btn">Fill the form instead</a>
      </div>
    </div>
  </>);
  if (phase === 'submitted') return shell(<>
    {banner}
    <div className="rl-card mp-card">
      <Eyebrow>Your part</Eyebrow>
      <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Your form is in.')}</h1>
      <StatusPills label="Your standing" items={[isGuarantor ? 'Guarantor' : 'Co applicant', STATUS_LABEL.submitted]} style={{ marginTop: 'var(--gap-line)' }} />
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`${ctx.realtorName || 'The listing realtor'} sees your details beside the application. ${ctx.primaryFirst || 'The applicant'} does not.`)}</p>
    </div>
    <div className="rl-card mp-card">
      {docs.state === 'done' ? (
        <p className="mp-p" style={{ color: C.ink }}>{noWidow(`Done. ${docs.received} document${docs.received === 1 ? '' : 's'} added.`)}</p>
      ) : docs.state === 'skipped' ? (
        <p className="mp-p">{noWidow('You can add documents later from this page.')}</p>
      ) : (
        <>
          <h2 className="mp-h2">Add your documents</h2>
          <p className="mp-p" style={{ marginTop: 'var(--gap-line)', color: C.ink }}>{noWidow('Your own pay stubs and employment letter, and a credit report if you have one. Only yours.')}</p>
          <div style={{ marginTop: 'var(--gap-card)' }}>
            {docRequest && docRequest.token ? (
              <DocumentUploader token={docRequest.token} creditFirst={!!docRequest.askCreditReport} onDone={({ received }) => setDocs({ state: 'done', received })}
                before={<p className="mp-note" style={{ marginBottom: 'var(--gap-card)' }}>{noWidow(`Held for ${ctx.realtorName || 'the realtor'}'s review for ${RETENTION_DAYS} days, then deleted. Do not upload anything showing your SIN.`)}</p>} />
            ) : <p className="mp-note">{noWidow('Your upload link is being prepared. Reload this page in a moment.')}</p>}
          </div>
          <button type="button" onClick={() => setDocs({ state: 'skipped', received: 0 })} className="mp-link">Skip for now</button>
        </>
      )}
    </div>
    <div className="rl-card mp-card">
      <h2 className="mp-h2">Withdraw</h2>
      <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(WITHDRAW_LINE)}</p>
      {error && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(error)}</p>}
      {confirmLeave ? (
        <div className="rl-ctrl-row" style={{ marginTop: 'var(--gap-card)' }}>
          <button data-destructive="" type="button" onClick={() => leave('withdraw')} disabled={busy} className="mp-btn mp-btn-red">{busy ? 'Withdrawing' : 'Withdraw'}</button>
          <button type="button" onClick={() => setConfirmLeave(false)} disabled={busy} className="mp-btn">Keep my part</button>
        </div>
      ) : <button data-destructive="" type="button" onClick={() => setConfirmLeave(true)} className="mp-btn mp-btn-auto" style={{ marginTop: 'var(--gap-card)' }}>Withdraw from this application</button>}
    </div>
  </>);

  // The form: one step at a time, the same card as the apply form.
  const fields = step === 1 ? (
    <>
      <Field label="Full name" value={form.fullName} onChange={(v) => update('fullName', v)} placeholder="Alex Smith" required error={errors.fullName} />
      <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} placeholder="416 555 0142" type="tel" inputMode="tel" />
      {isGuarantor && <Field label="Address" value={form.address} onChange={(v) => update('address', v)} placeholder="12 Sample St, Toronto" required error={errors.address} hint="Kept for the lease and used nowhere else." />}
    </>
  ) : step === 2 ? (
    <>
      <SelectField label="Employment type" value={form.employmentType} onChange={(v) => { update('employmentType', v); if (v === 'self-employed') update('incomeKind', INCOME_KIND.SELF_EMPLOYED); else if (form.incomeKind === INCOME_KIND.SELF_EMPLOYED) update('incomeKind', INCOME_KIND.EMPLOYMENT); }} options={Object.entries(EMP_LABEL).map(([value, label]) => ({ value, label }))} />
      <Field label="Job title" value={form.jobTitle} onChange={(v) => update('jobTitle', v)} placeholder="Registered Nurse" />
      <Field label={form.employmentType === 'self-employed' ? 'Business name' : 'Employer'} value={form.employer} onChange={(v) => update('employer', v)} placeholder={form.employmentType === 'self-employed' ? 'Smith Design' : 'Sunnybrook Health Sciences Centre'} />
      <Field label="Years at job" value={form.yearsAtJob} onChange={(v) => update('yearsAtJob', v)} placeholder="3" inputMode="decimal" />
      <Field label="Annual income before tax (CAD)" value={form.annualIncome} onChange={(v) => update('annualIncome', v)} placeholder="75,000" type="number" inputMode="numeric" required error={errors.annualIncome} hint="Shown to the realtor beside the application. Not scored." />
      <SelectField label="This income is from" value={form.incomeKind} onChange={(v) => update('incomeKind', v)} options={Object.entries(INCOME_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
    </>
  ) : (
    <>
      <div className="mp-facts" style={{ marginTop: 0 }}>
        {[['Name', form.fullName], ['Phone', form.phone], ...(isGuarantor ? [['Address', form.address]] : []), ['Employment', [EMP_LABEL[form.employmentType], form.jobTitle, form.employer].filter(Boolean).join(' · ')], ['Years at job', form.yearsAtJob], ['Income', `${money(form.annualIncome)} a year · ${INCOME_KIND_LABEL[form.incomeKind]}`]].map(([k, v]) => (
          <div key={k} className="mp-fact"><div className="mp-label">{k}</div><div className="mp-value"><LinesText text={v || 'not set'} /></div></div>
        ))}
      </div>
      <label className="mp-note" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', cursor: 'pointer', color: C.ink, minHeight: 44 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: C.ink, flexShrink: 0 }} />
        <span>{noWidow(PARTY_CONSENT_LINE)}</span>
      </label>
    </>
  );
  return shell(<>
    {banner}
    <div id={`party-step-${step}`} className="rl-card mp-card" style={{ scrollMarginTop: 'var(--s-4)' }}>
      <div className="mp-step">{`Step ${step} of ${STEPS.length}: ${STEPS[step - 1].title}`}</div>
      <div className="mp-progress" aria-hidden="true"><span style={{ width: `${Math.round((step / STEPS.length) * 100)}%` }} /></div>
      <div className="mp-form">{fields}</div>
      {error && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(error)}</p>}
      <div className="mp-actions">
        {step < STEPS.length
          ? <button type="button" onClick={next} className="mp-btn">Continue</button>
          : <button type="button" onClick={submit} disabled={busy} className="mp-btn mp-btn-red">{busy ? 'Sending' : 'Send my form'}</button>}
        {step > 1 && <button type="button" onClick={() => { setError(''); setStep(step - 1); }} disabled={busy} className="mp-link">Back</button>}
        {step === 1 && <a href={`/party/${encodeURIComponent(token)}?decline=1`} className="mp-link">Decline</a>}
      </div>
    </div>
  </>);
}
