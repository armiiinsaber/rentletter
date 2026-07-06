// pages/apply/[token].js
// PUBLIC, UNAUTHENTICATED tenant application page reached from a realtor's
// listing-scoped invite link (https://rentletter.ca/apply/{token}).
//
// Flow (KV only — no Supabase, no realtor login):
//   1. Resolve the invite token via GET /api/landlord/resolve-invite (reads linvite:{token}).
//      Missing/expired -> friendly "link no longer active" message (NOT a 404).
//   2. Render the standard tenant application form (same fields generate.js expects).
//   3. On submit -> POST /api/generate (mode 'application' => app:{RL} in KV, free, no AI)
//      -> POST /api/landlord/tag-invite-submission to link the RL to this invite
//      -> best-effort POST /api/send to email the tenant their number.
//   4. Show the tenant their RL number with a clear confirmation.
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Wordmark, Icon, useReveal } from '../../components/ui';
import { C, R } from '../../components/theme';
import { isValidEmail } from '../../lib/validation';
import { normalizeProvince, ageOfMajority, provinceName, humanRightsCodeName } from '../../lib/provinces';
import { formatUnit } from '../../lib/unitType';

// Age (whole years) from an ISO yyyy-mm-dd DOB, accounting for whether this year's
// birthday has already occurred. Returns null for an empty/unparseable date.
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// Phone helpers — validate on exactly 10 digits, display as (XXX) XXX-XXXX.
const phoneDigits = (v) => String(v || '').replace(/\D/g, '');
const isValidPhone = (v) => phoneDigits(v).length === 10;
function formatPhone(v) {
  const d = phoneDigits(v).slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Province-aware legal-capacity gate: Ontario 18, British Columbia 19. Threshold + wording both
// come from the listing's province (the owning realtor's), resolved from the invite.
function underAgeMsg(province) {
  const min = ageOfMajority(province);
  return `You must be at least ${min} (the age of majority in ${provinceName(province)}) to submit a rental application on your own. Applicants under ${min} need a guarantor — support for that is coming soon.`;
}

// Same application schema the homepage form + generate.js use. Do not rename keys.
const EMPTY_FORM = {
  email: '',
  apartmentAddress: '', apartmentDescription: '',
  fullName: '', age: '', dateOfBirth: '', phone: '',
  jobTitle: '', employer: '', yearsAtJob: '', annualIncome: '',
  previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
  currentRent: '',
  moveInDate: '', reasonForMoving: '',
  numberOfOccupants: '1', occupantsDetails: '', smoker: 'no', evParkingNeeded: 'no',
  hasCoApplicant: false,
  coApplicantName: '', coApplicantAge: '', coApplicantEmployer: '', coApplicantJobTitle: '',
  coApplicantIncome: '', coApplicantRelationship: '',
  personality: '', pets: '', redFlags: '',
  hasVehicle: false,
  vehicleMakeModel: '', vehicleYear: '',
  reference1Name: '', reference1Relationship: '', reference1Contact: '',
  reference2Name: '', reference2Relationship: '', reference2Contact: '',
};

export default function ApplyPage() {
  const router = useRouter();
  // status: 'loading' | 'invalid' | 'ready' | 'submitting' | 'done'
  const [status, setStatus] = useState('loading');
  const [invalidMsg, setInvalidMsg] = useState('');
  const [invite, setInvite] = useState(null); // { realtorName, realtorBrokerage, listingName, unit }
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { applicationNumber, ownerToken }
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [reviewing, setReviewing] = useState(false); // deliberate review-and-confirm step
  // Reveal the form on load / scroll. Depends on `status` so sections that mount once the invite
  // resolves (status → 'ready') get observed. Presentation only — no effect on validation.
  useReveal(status);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const markTouched = (k) => setTouched((t) => ({ ...t, [k]: true }));
  const showErr = (k) => Boolean(touched[k] || triedSubmit);

  // DOB drives both the (now removed) age field and the legal-capacity gate. Keep the derived
  // age in the payload so generate.js still receives `age` — no API change needed.
  const derivedAge = ageFromDob(form.dateOfBirth);
  const updateDob = (v) => setForm((f) => ({ ...f, dateOfBirth: v, age: (ageFromDob(v) ?? '') === '' ? '' : String(ageFromDob(v)) }));

  // Applicable minimum age from the listing's province (owning realtor's): ON 18, BC 19.
  // Before the invite resolves, province defaults to Ontario; the form isn't interactive until
  // status==='ready', by which point the resolved province is in effect.
  const listingProvince = normalizeProvince(invite?.province);
  const minAge = ageOfMajority(listingProvince);

  // Per-field validity for the VITAL fields the screening depends on.
  const vital = {
    fullName: !!form.fullName.trim(),
    dateOfBirth: !!form.dateOfBirth && derivedAge != null && derivedAge >= minAge,
    email: isValidEmail(form.email),
    phone: isValidPhone(form.phone),
    annualIncome: !!String(form.annualIncome).trim(),
    employer: !!form.employer.trim(),
    jobTitle: !!form.jobTitle.trim(),
    moveInDate: !!form.moveInDate,
    unit: !!String(form.apartmentDescription).trim(), // pre-filled from the invite's listing
  };
  const allVitalValid = Object.values(vital).every(Boolean);

  // Inline error messages (only surfaced once a field is touched or submit was attempted).
  const emailError = showErr('email') && !vital.email
    ? (form.email.trim() ? 'Enter a valid email address (name@example.com).' : 'Email is required.') : '';
  const phoneError = showErr('phone') && !vital.phone
    ? (phoneDigits(form.phone).length ? 'Enter a 10-digit phone number.' : 'Phone number is required.') : '';
  const dobError = showErr('dateOfBirth') && !vital.dateOfBirth
    ? (form.dateOfBirth ? underAgeMsg(listingProvince) : 'Date of birth is required.') : '';

  // Resolve the invite token once the router has the param.
  useEffect(() => {
    if (!router.isReady) return;
    const token = String(router.query.token || '');
    if (!/^[a-f0-9]{20}$/.test(token)) {
      setInvalidMsg('This application link doesn’t look right. Please use the exact link your realtor sent you.');
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/landlord/resolve-invite?token=${encodeURIComponent(token)}`);
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || json?.error) {
          setInvalidMsg(json?.error || 'This invite link has expired or is no longer active. Please contact your realtor for a new link.');
          setStatus('invalid');
          return;
        }
        setInvite(json);
        // Apartment/listing details come from the LISTING the realtor created — NEVER from
        // tenant input. Pre-fill the (now hidden) apartment fields from the invite's unit so
        // the submitted application still carries the correct address + rent. generate.js
        // parses the rent out of the description to compute the rent-to-income ratio used in
        // ranking, so the description must contain the listing's "$<rent>/mo".
        const u = (json && json.unit) || {};
        const rent = String(u.monthlyRent || '').trim();
        const bedsLabel = formatUnit(u.bedrooms);
        const descBits = [];
        if (bedsLabel) descBits.push(bedsLabel);
        if (rent) descBits.push(`$${rent}/mo`);
        setForm((f) => ({ ...f, apartmentAddress: u.address || '', apartmentDescription: descBits.join(' · ') }));
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setInvalidMsg('We couldn’t load this application link right now. Please try again in a moment, or contact your realtor.');
        setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, router.query.token]);

  // Tapping "Submit" opens the deliberate review step. Gating is unchanged — this is only
  // reachable when all required/vital fields are valid; otherwise surface the missing fields.
  const openReview = () => {
    if (!allVitalValid) {
      setTriedSubmit(true);
      setError('Please complete the required fields marked with * — some are missing or need fixing. They’re highlighted below.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError('');
    setReviewing(true);
  };

  // Final submission — only from the review step's "Confirm & submit". The successful-submit
  // flow (RL generation, KV tag, Supabase mirror, email, success screen) is unchanged.
  const submitApplication = async () => {
    if (status === 'submitting') return; // guard against double-submit
    setError('');
    setStatus('submitting');
    const token = String(router.query.token || '');
    try {
      // 1. Create the application (free application mode — no AI, no payment).
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, mode: 'application' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.error || !json?.applicationNumber) {
        throw new Error(json?.error || 'Could not submit your application. Please try again.');
      }
      const applicationNumber = json.applicationNumber;
      const ownerToken = json.ownerToken;

      // Show the tenant their RL immediately — the steps below are best-effort and
      // must never block or break the tenant's confirmation.
      setResult({ applicationNumber, ownerToken });
      setStatus('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Background: tag the invite (KV), then mirror into Supabase (the bridge —
      // mirror runs AFTER tag so the RL is present in invite_submissions:{token}),
      // then email the tenant. All non-blocking.
      (async () => {
        try {
          // 2. Tag this submission to the realtor's invite (KV).
          await fetch('/api/landlord/tag-invite-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, applicationNumber }),
          });
          // 3. Mirror into Supabase so it appears under the listing in the dashboard.
          await fetch('/api/applications/mirror', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, applicationNumber }),
          });
        } catch (e) {
          console.error('[apply] tag/mirror failed (non-fatal)', e);
        }
        // 4. Best-effort: email the tenant their number + owner token.
        if (form.email) {
          fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email,
              fullName: form.fullName,
              letter: '',
              resume: json.resume || '',
              applicationNumber,
              ownerToken,
            }),
          }).catch((e) => console.error('[apply] email send failed', e));
        }
      })();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setStatus('ready');
      setReviewing(false); // close the review so the form + error banner are visible
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const copyNumber = () => {
    if (!result?.applicationNumber) return;
    navigator.clipboard.writeText(result.applicationNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Head>
        <title>Apply — Rentletter</title>
        <meta name="description" content="Submit your rental application to your realtor — no account needed." />
      </Head>
      <GlobalStyle />
      <div style={{ minHeight: '100vh', background: C.paper }}>
        <header style={{ borderBottom: `1px solid ${C.rule}`, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 600 }}>Rental application</span>
        </header>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(28px, 6vw, 64px) clamp(16px, 4vw, 32px) 80px' }}>

          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: C.inkSoft, fontSize: 15 }}>
              Loading your application…
            </div>
          )}

          {status === 'invalid' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', marginBottom: 14, color: C.inkMute }}><Icon name="link" size={30} /></div>
              <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10 }}>
                This link is no longer active
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px' }}>
                {invalidMsg}
              </p>
              <a href="/" className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.ink, color: C.paper, textDecoration: 'none', borderRadius: R.ctrl, padding: '13px 22px', fontSize: 14, fontWeight: 700 }}>
                Go to Rentletter
              </a>
            </div>
          )}

          {status === 'done' && result && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)' }}>
              <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon name="check" size={15} color={C.green} strokeWidth={2.5} /> Application submitted
              </div>
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10 }}>
                You’re all set{form.fullName ? `, ${form.fullName.split(' ')[0]}` : ''}.
              </h1>
              <p style={{ fontSize: 15, color: C.inkSoft, lineHeight: 1.6, marginBottom: 24 }}>
                Your application has been sent{invite?.realtorName ? <> to <strong style={{ color: C.ink }}>{invite.realtorName}</strong></> : ''}
                {invite?.listingName ? <> for <strong style={{ color: C.ink }}>{invite.listingName}</strong></> : ''}. Save your application number below — it’s how your realtor pulls up your profile.
              </p>

              <div style={{ background: C.paperDeep, borderRadius: R.card, padding: 'clamp(18px, 4vw, 24px)', marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Your application number
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="rl-serif" style={{ fontSize: 'clamp(22px, 5vw, 30px)', color: C.ink, letterSpacing: '0.01em', fontWeight: 600 }}>
                    {result.applicationNumber}
                  </span>
                  <button onClick={copyNumber} className="rl-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.ink, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {result.ownerToken && (
                <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, padding: '14px 16px', fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>
                  <strong style={{ color: C.ink }}>Keep this private —</strong> your owner key lets you see who viewed your application and revoke it anytime at{' '}
                  <a href="/my-application" style={{ color: C.red, textDecoration: 'underline', fontWeight: 600 }}>rentletter.ca/my-application</a>:
                  <div className="rl-serif" style={{ marginTop: 8, color: C.ink, wordBreak: 'break-all', fontSize: 13 }}>{result.ownerToken}</div>
                  {form.email && <div style={{ marginTop: 8 }}>We also emailed a copy to {form.email}.</div>}
                </div>
              )}
            </div>
          )}

          {(status === 'ready' || status === 'submitting') && (
            <>
              {/* Applying-for banner from the resolved invite */}
              {invite && (
                <div className="rl-in" style={{ background: C.ink, color: C.paper, padding: 'clamp(16px, 4vw, 22px) clamp(18px, 4vw, 24px)', marginBottom: 28, borderRadius: R.card, borderLeft: `4px solid ${C.red}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8c2b3', marginBottom: 6 }}>You’re applying to</div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 4 }}>
                    {invite.listingName || invite.unit?.address || 'Rental unit'}
                  </div>
                  {invite.unit && (() => {
                    const addr = invite.unit.address && invite.unit.address !== (invite.listingName || '') ? invite.unit.address : null;
                    const bits = [
                      invite.unit.monthlyRent && `$${invite.unit.monthlyRent}/mo`,
                      formatUnit(invite.unit.bedrooms) || null,
                      addr,
                    ].filter(Boolean);
                    return bits.length ? (
                      <div style={{ fontSize: 13, color: '#c8c2b3', marginBottom: (invite.realtorName || invite.realtorBrokerage) ? 8 : 0 }}>
                        {bits.join('  ·  ')}
                      </div>
                    ) : null;
                  })()}
                  {(invite.realtorName || invite.realtorBrokerage) && (
                    <div style={{ fontSize: 13, color: '#c8c2b3' }}>
                      Submitted to: <strong style={{ color: C.paper }}>{invite.realtorName}</strong>
                      {invite.realtorBrokerage && ` · ${invite.realtorBrokerage}`}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#9a958a', marginTop: 10 }}>
                    Your realtor already entered these unit details — you only need to tell us about yourself below.
                  </div>
                </div>
              )}

              <h1 className="rl-serif rl-in" style={{ fontSize: 'clamp(30px, 5.5vw, 44px)', color: C.ink, marginBottom: 12, letterSpacing: '-0.025em', lineHeight: 1.05, '--rl-d': '80ms' }}>
                Tell us about you
              </h1>
              <p className="rl-in" style={{ fontSize: 16, color: C.inkSoft, marginBottom: 32, lineHeight: 1.55, '--rl-d': '120ms' }}>
                No account needed — the unit details are already filled in by your realtor, so just tell us about you. The more specific, the better; skip anything that doesn’t apply.
              </p>

              {error && (
                <div style={{ background: C.redTint, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, padding: '14px 18px', marginBottom: 28, color: C.ink, fontSize: 14 }}>
                  {error}
                </div>
              )}

              {/* Privacy / human-rights-code note — province-aware (ON: OHRC, BC: BC code). */}
              <div style={{ marginBottom: 40, padding: '18px 22px', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Designed to be privacy-first
                </div>
                We collect what landlords need to make a good decision — not your SIN, bank info, or driver's license. Those come after an offer, not before. Aligned with {humanRightsCodeName(listingProvince)} best practices.
              </div>

              <FormSection num="01" title="Where to send it" required>
                <Field label="Email" required value={form.email} onChange={(v) => update('email', v)} onBlur={() => markTouched('email')} error={emailError} placeholder="you@example.com" type="email" inputMode="email" />
              </FormSection>

              {/* No "apartment" section — those details belong to the listing the realtor
                  created (shown read-only in the banner above), not to tenant input. */}

              <FormSection num="02" title="About you" required>
                <Field label="Full name" required value={form.fullName} onChange={(v) => update('fullName', v)} onBlur={() => markTouched('fullName')} error={showErr('fullName') && !vital.fullName ? 'Full name is required.' : ''} placeholder="Jane Doe" />
                <Field label="Date of birth" required value={form.dateOfBirth} onChange={updateDob} onBlur={() => markTouched('dateOfBirth')} error={dobError} type="date" hint={`You must be ${minAge}+ (${provinceName(listingProvince)} age of majority) to apply on your own.`} />
                <Field label="Phone" required value={form.phone} onChange={(v) => update('phone', formatPhone(v))} onBlur={() => markTouched('phone')} error={phoneError} placeholder="(416) 555-1234" type="tel" inputMode="tel" />
              </FormSection>

              <FormSection num="03" title="Employment" required>
                <Field label="Job title" required value={form.jobTitle} onChange={(v) => update('jobTitle', v)} onBlur={() => markTouched('jobTitle')} error={showErr('jobTitle') && !vital.jobTitle ? 'Job title is required.' : ''} placeholder="Software engineer" />
                <Field label="Employer" required value={form.employer} onChange={(v) => update('employer', v)} onBlur={() => markTouched('employer')} error={showErr('employer') && !vital.employer ? 'Employer is required.' : ''} placeholder="Shopify" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Years at this job" value={form.yearsAtJob} onChange={(v) => update('yearsAtJob', v)} placeholder="3" />
                  <Field label="Annual income (CAD)" required value={form.annualIncome} onChange={(v) => update('annualIncome', v)} onBlur={() => markTouched('annualIncome')} error={showErr('annualIncome') && !vital.annualIncome ? 'Annual income is required.' : ''} placeholder="85,000" type="number" inputMode="numeric" />
                </div>
              </FormSection>

              <FormSection num="04" title="Current rental">
                <Field label="Current address" value={form.previousAddress} onChange={(v) => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Years there" value={form.yearsAtPrevious} onChange={(v) => update('yearsAtPrevious', v)} placeholder="2" />
                  <Field label="Current rent (CAD/mo)" value={form.currentRent} onChange={(v) => update('currentRent', v)} placeholder="2,200" type="number" />
                </div>
                <Field label="Current landlord name" value={form.previousLandlordName} onChange={(v) => update('previousLandlordName', v)} placeholder="John Smith" />
                <Field label="Landlord contact" value={form.previousLandlordContact} onChange={(v) => update('previousLandlordContact', v)} placeholder="phone or email" />
              </FormSection>

              <FormSection num="05" title="Your move" required>
                <Field label="Desired move-in date" required value={form.moveInDate} onChange={(v) => update('moveInDate', v)} onBlur={() => markTouched('moveInDate')} error={showErr('moveInDate') && !vital.moveInDate ? 'Move-in date is required.' : ''} type="date" />
                <Textarea label="Why are you moving?" value={form.reasonForMoving} onChange={(v) => update('reasonForMoving', v)} placeholder="New job, shorter commute, lease ending..." />
              </FormSection>

              <FormSection num="06" title="Household">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Total occupants" value={form.numberOfOccupants} onChange={(v) => update('numberOfOccupants', v)} placeholder="2" type="number" />
                  <SelectField label="Smoker?" value={form.smoker} onChange={(v) => update('smoker', v)} options={[
                    { value: 'no', label: 'Non-smoker' },
                    { value: 'outdoor', label: 'Outdoor only' },
                    { value: 'yes', label: 'Yes' },
                  ]} />
                </div>
                <Textarea label="Other occupants (optional)" value={form.occupantsDetails} onChange={(v) => update('occupantsDetails', v)} placeholder="One roommate (also on this application), no children." />

                <ToggleField label="Applying with a partner or roommate?" value={form.hasCoApplicant} onChange={(v) => update('hasCoApplicant', v)} />
                {form.hasCoApplicant && (
                  <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Co-applicant</div>
                    <Field label="Full name" value={form.coApplicantName} onChange={(v) => update('coApplicantName', v)} placeholder="Alex Smith" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                      <Field label="Age" value={form.coApplicantAge} onChange={(v) => update('coApplicantAge', v)} placeholder="30" type="number" />
                      <Field label="Relationship" value={form.coApplicantRelationship} onChange={(v) => update('coApplicantRelationship', v)} placeholder="Partner / Roommate" />
                    </div>
                    <Field label="Job title" value={form.coApplicantJobTitle} onChange={(v) => update('coApplicantJobTitle', v)} placeholder="Designer" />
                    <Field label="Employer" value={form.coApplicantEmployer} onChange={(v) => update('coApplicantEmployer', v)} placeholder="Figma" />
                    <Field label="Annual income (CAD)" value={form.coApplicantIncome} onChange={(v) => update('coApplicantIncome', v)} placeholder="75,000" type="number" />
                  </div>
                )}
              </FormSection>

              <FormSection num="07" title="Lifestyle">
                <Textarea label="Lifestyle and habits" value={form.personality} onChange={(v) => update('personality', v)} placeholder="Quiet, work from home most days, like to cook and read." />
                <Field label="Pets" value={form.pets} onChange={(v) => update('pets', v)} placeholder="One small cat, indoor only, vet records available" />
                <Textarea label="Anything to address? (gaps in history, credit, etc.)" value={form.redFlags} onChange={(v) => update('redFlags', v)} placeholder="Limited Canadian credit history due to recent move..." />
              </FormSection>

              <FormSection num="08" title="References (optional but recommended)">
                <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 4, lineHeight: 1.55 }}>
                  Two people who can vouch for you. Mentioning these by name is more persuasive than saying "references available."
                </p>
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Reference 1</div>
                  <Field label="Full name" value={form.reference1Name} onChange={(v) => update('reference1Name', v)} placeholder="Sarah Johnson" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                    <Field label="Relationship" value={form.reference1Relationship} onChange={(v) => update('reference1Relationship', v)} placeholder="Current manager" />
                    <Field label="Phone or email" value={form.reference1Contact} onChange={(v) => update('reference1Contact', v)} placeholder="416-555-0142" />
                  </div>
                </div>
                <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Reference 2</div>
                  <Field label="Full name" value={form.reference2Name} onChange={(v) => update('reference2Name', v)} placeholder="David Chen" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                    <Field label="Relationship" value={form.reference2Relationship} onChange={(v) => update('reference2Relationship', v)} placeholder="Friend of 5 years" />
                    <Field label="Phone or email" value={form.reference2Contact} onChange={(v) => update('reference2Contact', v)} placeholder="dchen@email.com" />
                  </div>
                </div>
              </FormSection>

              <FormSection num="09" title="Vehicle (if parking matters)">
                <ToggleField label="Do you have a vehicle?" value={form.hasVehicle} onChange={(v) => update('hasVehicle', v)} />
                {form.hasVehicle && (
                  <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Field label="Make and model" value={form.vehicleMakeModel} onChange={(v) => update('vehicleMakeModel', v)} placeholder="Honda Civic" />
                    <Field label="Year" value={form.vehicleYear} onChange={(v) => update('vehicleYear', v)} placeholder="2020" type="number" />
                  </div>
                )}
                <SelectField label="Do you need EV parking?" value={form.evParkingNeeded} onChange={(v) => update('evParkingNeeded', v)} options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]} />
              </FormSection>

              <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14, lineHeight: 1.55 }}>
                Fields marked <span style={{ color: C.red, fontWeight: 700 }}>*</span> are required. Your realtor screens on these, so please double-check they’re accurate before you submit.
              </p>
              <button
                onClick={openReview}
                disabled={status === 'submitting' || !allVitalValid}
                className="rl-btn"
                style={{
                  width: '100%', marginTop: 8,
                  background: (status === 'submitting' || !allVitalValid) ? C.ruleDark : C.red,
                  color: C.paper, border: 'none', borderRadius: R.ctrl,
                  padding: '17px', fontSize: 16, fontWeight: 700,
                  cursor: (status === 'submitting' || !allVitalValid) ? 'not-allowed' : 'pointer',
                  minHeight: 56,
                }}>
                {status === 'submitting' ? 'Submitting…' : 'Review &amp; submit'}
              </button>
              {status === 'ready' && !allVitalValid && (() => {
                const labels = { fullName: 'Full name', dateOfBirth: `Date of birth (${minAge}+)`, email: 'Valid email', phone: '10-digit phone', annualIncome: 'Annual income', employer: 'Employer', jobTitle: 'Job title', moveInDate: 'Move-in date', unit: 'Unit details' };
                const missing = Object.keys(vital).filter((k) => !vital[k]).map((k) => labels[k]);
                return (
                  <p style={{ fontSize: 12.5, color: C.inkMute, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                    Still needed before you can submit: <span style={{ color: C.inkSoft, fontWeight: 600 }}>{missing.join(', ')}</span>.
                  </p>
                );
              })()}
              <p style={{ fontSize: 12, color: C.inkMute, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
                Free for applicants. You’ll get an application number to share — your realtor sees it in their dashboard.
              </p>

              {/* REVIEW-AND-CONFIRM — the deliberate final checkpoint before submitting. */}
              {reviewing && (() => {
                const fmtDate = (v) => { try { return new Date(`${v}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return v; } };
                const incomeNum = Number(String(form.annualIncome).replace(/[^\d.]/g, '')) || 0;
                const rows = [
                  ['Full name', form.fullName.trim()],
                  ['Date of birth', form.dateOfBirth ? `${fmtDate(form.dateOfBirth)}${derivedAge != null ? ` (age ${derivedAge})` : ''}` : '—'],
                  ['Email', form.email.trim()],
                  ['Phone', form.phone.trim()],
                  ['Annual income', incomeNum ? `$${incomeNum.toLocaleString()}` : '—'],
                  ['Employer', form.employer.trim()],
                  ['Job title', form.jobTitle.trim()],
                  ['Move-in date', form.moveInDate ? fmtDate(form.moveInDate) : '—'],
                ];
                const submitting = status === 'submitting';
                return (
                  <div
                    onClick={() => { if (!submitting) setReviewing(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 15, 16, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(16px, 4vw, 32px)', zIndex: 120 }}>
                    <div onClick={(e) => e.stopPropagation()} className="rl-modal"
                      style={{ background: C.paper, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(20px, 4vw, 28px)' }}>
                      <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Review your application</div>
                      <h3 style={{ fontSize: 'clamp(18px, 4vw, 22px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>Please review before you submit</h3>
                      <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, marginBottom: 16 }}>Your realtor and the landlord screen on this information, so make sure it’s accurate — you can go back and edit anything.</p>
                      <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '14px 16px', marginBottom: 18 }}>
                        {rows.map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '5px 0', fontSize: 13 }}>
                            <span style={{ color: C.inkMute, fontWeight: 600, minWidth: 0, flexShrink: 0 }}>{k}</span>
                            <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v || '—'}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => setReviewing(false)} disabled={submitting}
                          style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 20px', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
                          Go back and edit
                        </button>
                        <button onClick={submitApplication} disabled={submitting}
                          style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 24px', fontSize: 13, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                          {submitting ? 'Submitting…' : 'Confirm & submit'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Form field components (match the homepage application form exactly) ──────
function FormSection({ num, title, required, children }) {
  return (
    <div className="rl-in" style={{ marginBottom: 40, paddingBottom: 40, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontSize: 13, color: C.inkMute, fontWeight: 500 }}>{num}</span>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h3>
        {required && <span style={{ fontSize: 11, color: C.inkMute, fontWeight: 500 }}>Required</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, placeholder, type = 'text', required, error, hint, inputMode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>
        {label}{required && <span aria-hidden="true" style={{ color: C.red, fontWeight: 700, marginLeft: 4 }}>*</span>}
      </label>
      <input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        aria-required={required || undefined} aria-invalid={error ? true : undefined}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${error ? C.red : C.rule}`, background: 'transparent', color: C.ink, outline: 'none', transition: 'border-color 0.2s' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => { e.target.style.borderBottomColor = error ? C.red : C.rule; onBlur && onBlur(); }} />
      {error
        ? <div style={{ fontSize: 12, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{error}</div>
        : hint ? <div style={{ fontSize: 12, color: C.inkMute, marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${C.rule}`, background: 'transparent', color: C.ink, outline: 'none', resize: 'vertical', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, transition: 'border-color 0.2s' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => (e.target.style.borderBottomColor = C.rule)} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: C.inkSoft, marginBottom: 8, fontWeight: 500 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '14px 0', fontSize: 16, border: 'none', borderBottom: `1px solid ${C.rule}`, background: 'transparent', color: C.ink, outline: 'none', appearance: 'none', fontFamily: "'Inter', sans-serif", cursor: 'pointer' }}
        onFocus={(e) => (e.target.style.borderBottomColor = C.ink)}
        onBlur={(e) => (e.target.style.borderBottomColor = C.rule)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
      <button type="button" onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, background: value ? C.red : C.rule, border: 'none', borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', padding: 0, flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: C.paper, transition: 'left 0.2s' }} />
      </button>
      <span style={{ fontSize: 14, color: C.ink, fontWeight: 500, cursor: 'pointer' }} onClick={() => onChange(!value)}>{label}</span>
    </div>
  );
}
