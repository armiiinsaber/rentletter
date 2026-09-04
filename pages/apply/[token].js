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
import { EMPTY_FORM, serializePets, ageFromDob } from '../../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../../lib/taxEstimate';
import { FormSection, Field, Textarea, SelectField, ToggleField } from '../../components/apply/fields';

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
  return `You must be at least ${min} (the age of majority in ${provinceName(province)}) to submit a rental application on your own. Applicants under ${min} need a guarantor, support for that is coming soon.`;
}

export default function ApplyPage() {
  const router = useRouter();
  // status: 'loading' | 'invalid' | 'ready' | 'submitting' | 'done'
  const [status, setStatus] = useState('loading');
  const [invalidMsg, setInvalidMsg] = useState('');
  const [rented, setRented] = useState(null);       // { realtorName, listingName } when the unit is gone
  const [keepEmail, setKeepEmail] = useState('');
  const [keep, setKeep] = useState({ state: 'idle', message: '' }); // idle | busy | done | error
  const [invite, setInvite] = useState(null); // { realtorName, realtorBrokerage, listingName, unit }
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { applicationNumber, ownerToken }
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [reviewing, setReviewing] = useState(false); // deliberate review-and-confirm step
  // ── Saved-profile reuse ─────────────────────────────────────────────────────────────────
  // /my-application stores the tenant's RL + owner token in localStorage on THIS device (the
  // token never travels in a URL we create). If present, offer to fill this form from that
  // profile via /api/application/manage `prefill`. The prefilled form still goes through the
  // same validation + review-and-confirm step — nothing is sent until they confirm.
  const [saved, setSaved] = useState(null);          // { source:'profile', email } | { source:'device', app, token }
  const [prefill, setPrefill] = useState({ state: 'idle', error: '', source: null, dismissed: false }); // state: idle|loading|applied|error
  // Reveal the form on load / scroll. Depends on `status` so sections that mount once the invite
  // resolves (status → 'ready') get observed. Presentation only — no effect on validation.
  useReveal(status);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Unified profile first (httpOnly session cookie set by the magic link — works on any device
  // the tenant signed in on); device-stored owner token as the legacy fallback.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (async () => {
      try {
        const r = await fetch('/api/tenant/prefill');
        if (r.ok) { const j = await r.json(); setSaved({ source: 'profile', email: j.email, app: j.lastApplicationNumber, form: j.form, lastAddress: j.lastListingAddress }); return; }
      } catch (e) { /* fall through */ }
      const app = localStorage.getItem('rentletter_app_number');
      const tok = localStorage.getItem('rentletter_owner_token');
      if (app && tok) setSaved({ source: 'device', app, token: tok });
    })();
  }, []);

  const applySavedProfile = async () => {
    if (!saved || prefill.state === 'loading') return;
    setPrefill((p) => ({ ...p, state: 'loading', error: '' }));
    try {
      let j;
      if (saved.source === 'profile') {
        j = { form: saved.form, sourceApplicationNumber: saved.app, sourceListingAddress: saved.lastAddress };
      } else {
        const r = await fetch('/api/application/manage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationNumber: saved.app, ownerToken: saved.token, action: 'prefill' }),
        });
        j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.form) throw new Error(j?.error || 'Could not load your saved profile.');
      }
      // Everything about the tenant comes from the profile; the UNIT facts stay from this invite.
      setForm((f) => ({ ...EMPTY_FORM, ...j.form, apartmentAddress: f.apartmentAddress, apartmentDescription: f.apartmentDescription }));
      setTouched({}); setTriedSubmit(false); setError('');
      setPrefill({ state: 'applied', error: '', source: { app: j.sourceApplicationNumber, address: j.sourceListingAddress }, dismissed: false });
    } catch (e) {
      setPrefill((p) => ({ ...p, state: 'error', error: e.message || 'Could not load your saved profile.' }));
    }
  };
  // Deep link from the profile page / confirmation email: /apply/{token}#profile auto-fills.
  useEffect(() => {
    if (status !== 'ready' || !saved || prefill.state !== 'idle') return;
    if (typeof window !== 'undefined' && (window.location.hash === '#profile' || new URLSearchParams(window.location.search).get('profile') === '1')) applySavedProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, saved]);
  const markTouched = (k) => setTouched((t) => ({ ...t, [k]: true }));
  const showErr = (k) => Boolean(touched[k] || triedSubmit);

  // DOB drives both the (now removed) age field and the legal-capacity gate. Keep the derived
  // age in the payload so generate.js still receives `age` — no API change needed.
  const derivedAge = ageFromDob(form.dateOfBirth);
  const updateDob = (v) => setForm((f) => ({ ...f, dateOfBirth: v, age: (ageFromDob(v) ?? '') === '' ? '' : String(ageFromDob(v)) }));

  // ── Tenancy Profile derived writes (same pattern as age/DOB): structured UI answers
  // serialize into the whitelisted storage keys, so no API change is needed. ──
  // CLEAN HOOK for the landlord-reference request flow: email and phone are captured as
  // separate keys and joined with ' · ' for storage. A future request-reference flow
  // (mirror of the document-request flow) can split previousLandlordContact on ' · '
  // — or read prevLandlordEmail once generate.js whitelists it — to email the reference
  // form to the previous landlord.
  const updateReference = (patch) => setForm((f) => {
    const n = { ...f, ...patch };
    n.previousLandlordContact = [String(n.prevLandlordEmail).trim(), String(n.prevLandlordPhone).trim()].filter(Boolean).join(' · ');
    return n;
  });
  // Tenure selects → decimal years in the stored yearsAtPrevious (numeric consumers —
  // compare, scoring — keep working: "2.5" parses).
  const updateTenure = (patch) => setForm((f) => {
    const n = { ...f, ...patch };
    const y = parseInt(n.tenureYears, 10);
    const m = parseInt(n.tenureMonths, 10);
    const total = (Number.isFinite(y) ? y : 0) + (Number.isFinite(m) ? m / 12 : 0);
    n.yearsAtPrevious = total > 0 ? String(Math.round(total * 10) / 10) : '';
    return n;
  });
  const updatePets = (patch) => setForm((f) => {
    const n = { ...f, ...patch };
    n.pets = serializePets(n);
    return n;
  });
  // ── Employment type + income (derived writes, same pattern) ──
  // Self-employed: the single required "employer" field IS the registered business name — it is
  // stored in `employer` (so every realtor/landlord surface that shows employer shows it) AND in
  // `businessName`. Same field, same requirement level as an employed applicant.
  const updateEmployment = (patch) => setForm((f) => {
    const n = { ...f, ...patch };
    n.businessName = n.employmentType === 'self-employed' ? n.employer : '';
    return n;
  });
  // annualIncome is GROSS (what the scorecard is calibrated on). The after-tax figure is an
  // estimate for the listing's province that tracks gross until the tenant overwrites it.
  const updateGross = (v) => setForm((f) => {
    const n = { ...f, annualIncome: v };
    if (n.netIncomeSource !== 'stated') n.netIncome = v ? String(estimateNetIncome(v, listingProvince).net || '') : '';
    return n;
  });
  const updateNet = (v) => setForm((f) => ({ ...f, netIncome: v, netIncomeSource: 'stated' }));
  const resetNetToEstimate = () => setForm((f) => ({ ...f, netIncomeSource: 'estimated', netIncome: f.annualIncome ? String(estimateNetIncome(f.annualIncome, listingProvince).net || '') : '' }));
  const selfEmployed = form.employmentType === 'self-employed';
  // Switching to "no previous rental" hides AND clears the reference fields so
  // half-entered data can never ride the submit.
  const updateRentalStatus = (v) => setForm((f) => {
    const n = { ...f, rentalStatus: v };
    if (v === 'none') {
      Object.assign(n, {
        previousAddress: '', yearsAtPrevious: '', previousLandlordName: '', previousLandlordContact: '',
        prevLandlordEmail: '', prevLandlordPhone: '', tenureYears: '', tenureMonths: '', currentRent: '',
      });
    }
    return n;
  });

  // Applicable minimum age from the listing's province (owning realtor's): ON 18, BC 19.
  // Before the invite resolves, province defaults to Ontario; the form isn't interactive until
  // status==='ready', by which point the resolved province is in effect.
  const listingProvince = normalizeProvince(invite?.province);
  const minAge = ageOfMajority(listingProvince);
  // Province arrives with the invite (and a prefilled profile may come from another province):
  // refresh an ESTIMATED after-tax figure; a tenant-stated one is never touched.
  useEffect(() => {
    setForm((f) => (f.netIncomeSource === 'stated' || !f.annualIncome) ? f : { ...f, netIncome: String(estimateNetIncome(f.annualIncome, listingProvince).net || '') });
  }, [listingProvince, prefill.state]);

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
    // Sandbox tokens (demo…) are answered by the resolver without an invite record.
    if (!/^[a-f0-9]{20}$/.test(token) && !/^demo\d{16}$/.test(token)) {
      setInvalidMsg('This application link doesn’t look right. Please use the exact link the listing realtor sent you.');
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
          setInvalidMsg(json?.error || 'This invite link has expired or is no longer active. Please contact the listing realtor for a new link.');
          setStatus('invalid');
          return;
        }
        // The unit has been rented (or the listing closed): the link answers, and offers to be kept in mind.
        if (json?.rented) { setRented({ realtorName: json.realtorName || '', listingName: json.listingName || '' }); setStatus('rented'); return; }
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
        setInvalidMsg('We couldn’t load this application link right now. Please try again in a moment, or contact the listing realtor.');
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
      setError('Please complete the required fields marked with *, some are missing or need fixing. They’re highlighted below.');
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
        body: JSON.stringify({ ...form, mode: 'application', inviteToken: token }),
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
      // Keep the profile on this device so the next invite link offers "use my saved profile".
      try {
        if (ownerToken) { localStorage.setItem('rentletter_app_number', applicationNumber); localStorage.setItem('rentletter_owner_token', ownerToken); }
      } catch (e) { /* private mode, the email carries the same keys */ }
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
        // 3b. Attach to the tenant's unified profile (by email) and refresh its facts. Owner token
        // proves ownership; no session needed. Best-effort.
        fetch('/api/tenant/sync-application', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationNumber, ownerToken }),
        }).catch(() => {});
        // 4. Best-effort: email the tenant their number + owner token — confirmation
        // only. No letter/resume fields: the legacy rent-letter PDF and tenant-résumé
        // attachments were removed from the product; /api/send now sends the lean
        // confirmation (the /my-application recovery path depends on this email).
        if (form.email) {
          fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email,
              fullName: form.fullName,
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
        <title>Apply · Rentletter</title>
        <meta name="description" content="Submit your rental application, no account needed." />
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

          {status === 'rented' && (
            <div className="rl-card" style={{ padding: 'clamp(28px, 6vw, 44px)' }}>
              <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', marginBottom: 10, textWrap: 'balance' }}>
                This unit has been rented.
              </h1>
              {keep.state === 'done' ? (
                <p style={{ fontSize: 16, color: C.ink, lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>{keep.message}</p>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!isValidEmail(keepEmail)) { setKeep({ state: 'error', message: 'Please enter a valid email.' }); return; }
                  setKeep({ state: 'busy', message: '' });
                  try {
                    const r = await fetch('/api/pipeline/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteToken: String(router.query.token || ''), email: keepEmail.trim() }) });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) { setKeep({ state: 'error', message: j?.error || 'Could not save that. Please try again.' }); return; }
                    setKeep({ state: 'done', message: j.message || 'Done.' });
                  } catch { setKeep({ state: 'error', message: 'Could not save that. Please try again.' }); }
                }}>
                  <p style={{ fontSize: 16, color: C.inkSoft, lineHeight: 1.6, margin: '0 0 16px', textWrap: 'pretty' }}>
                    Want {rented?.realtorName || 'the realtor'} to keep you in mind for similar units?
                  </p>
                  <label htmlFor="keep-email" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Your email</label>
                  <input id="keep-email" type="email" inputMode="email" autoComplete="email" value={keepEmail} onChange={(e) => setKeepEmail(e.target.value)} placeholder="you@example.com"
                    style={{ width: '100%', minHeight: 44, padding: '0 14px', fontSize: 16, borderRadius: R.ctrl, border: `1px solid ${C.rule}`, background: C.paper, color: C.ink, outline: 'none' }} />
                  {keep.state === 'error' && <div role="alert" style={{ marginTop: 10, fontSize: 14, color: C.danger }}>{keep.message}</div>}
                  <button type="submit" disabled={keep.state === 'busy'} className="rl-btn"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: 14, padding: '0 22px', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: R.ctrl, fontSize: 15, fontWeight: 700, cursor: keep.state === 'busy' ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    {keep.state === 'busy' ? 'Saving' : 'Yes, keep me in mind'}
                  </button>
                  <p style={{ fontSize: 13, color: C.inkMute, lineHeight: 1.5, margin: '14px 0 0', textWrap: 'pretty' }}>No account is created. Your email is kept for 60 days for this purpose only.</p>
                </form>
              )}
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
                {invite?.listingName ? <> for <strong style={{ color: C.ink }}>{invite.listingName}</strong></> : ''}. Save your application number below, it’s how the listing realtor pulls up your application.
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
                  <strong style={{ color: C.ink }}>Keep this private · </strong> your owner key opens your profile at{' '}
                  <a href="/my-application" style={{ color: C.red, textDecoration: 'underline', fontWeight: 600 }}>rentletter.ca/my application</a>, where you can see who viewed your application, update your details, revoke it, and apply to your next listing in seconds without retyping:
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
                      Goes to <strong style={{ color: C.paper }}>{invite.realtorName}</strong>
                      {invite.realtorBrokerage && ` · ${invite.realtorBrokerage}`}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#9a958a', marginTop: 10 }}>
                    The unit details above were entered by the listing realtor, you only need to tell us about yourself below.
                  </div>
                </div>
              )}

              {/* Saved-profile offer, the "apply in seconds" entry point. Shown only when this
                  device holds a saved profile (from /my-application) and it hasn't been applied. */}
              {saved && prefill.state !== 'applied' && !prefill.dismissed && (
                <div className="rl-in" style={{ position: 'relative', overflow: 'hidden', background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 'clamp(16px, 4vw, 22px) clamp(18px, 4vw, 24px)', marginBottom: 24 }}>
                  <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 3, background: C.red }} />
                  <div style={{ fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Apply in seconds</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em', lineHeight: 1.25, marginBottom: 6, textWrap: 'balance' }}>
                    Fill this application from your saved profile
                  </div>
                  <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
                    {saved.source === 'profile'
                      ? <>We’ll bring over the details saved on your profile (<span style={{ color: C.ink, overflowWrap: 'anywhere' }}>{saved.email}</span>), employment, income, rental history, household, your intro. You check it and confirm before anything is sent to this realtor.</>
                      : <>We’ll bring over what you entered for <span style={{ fontFamily: 'monospace', color: C.ink }}>{saved.app}</span>, employment, income, rental history, household, your intro. You check it and confirm before anything is sent to this realtor.</>}
                  </p>
                  {prefill.state === 'error' && (
                    <div role="alert" style={{ marginBottom: 12, padding: '10px 12px', background: C.redTint, borderLeft: `3px solid ${C.danger}`, borderRadius: R.ctrl, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
                      {prefill.error} {/revoked/i.test(prefill.error) && <a href="/my-application" style={{ color: C.red, fontWeight: 700 }}>Open my profile →</a>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={applySavedProfile} disabled={prefill.state === 'loading'} className="rl-btn"
                      style={{ background: C.red, color: C.paper, border: 'none', borderRadius: R.ctrl, padding: '12px 18px', fontSize: 14, fontWeight: 700, cursor: prefill.state === 'loading' ? 'wait' : 'pointer', minHeight: 44, opacity: prefill.state === 'loading' ? 0.75 : 1 }}>
                      {prefill.state === 'loading' ? 'Loading your profile…' : 'Use my saved profile'}
                    </button>
                    <button type="button" onClick={() => setPrefill((p) => ({ ...p, dismissed: true }))}
                      style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                      Start fresh
                    </button>
                  </div>
                </div>
              )}
              {prefill.state === 'applied' && (
                <div role="status" style={{ background: C.greenTint, border: `1px solid ${C.green}`, borderRadius: R.card, padding: '14px 18px', marginBottom: 24, fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.green, marginBottom: 4 }}>
                    <Icon name="check" size={15} color={C.green} strokeWidth={2.5} /> Filled from your saved profile
                  </div>
                  Check each section · especially <strong>income</strong> and your <strong>move in date</strong>, then review and submit. This creates a separate application for this listing. What you confirm here becomes your profile’s latest details.
                  {prefill.source?.address && form.apartmentAddress && prefill.source.address.trim().toLowerCase() === form.apartmentAddress.trim().toLowerCase() && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: C.amberTint, borderLeft: `3px solid ${C.gold}`, borderRadius: R.ctrl, color: C.ink }}>
                      <strong>Heads up:</strong> your saved profile was already submitted for this same address ({prefill.source.app}). Submitting again adds a second application to the realtor’s list, if you only want to update details, edit your profile instead.
                    </div>
                  )}
                </div>
              )}

              <h1 className="rl-serif rl-in" style={{ fontSize: 'clamp(30px, 5.5vw, 44px)', color: C.ink, marginBottom: 12, letterSpacing: '-0.025em', lineHeight: 1.05, '--rl-d': '80ms' }}>
                Tell us about you
              </h1>
              <p className="rl-in" style={{ fontSize: 16, color: C.inkSoft, marginBottom: 32, lineHeight: 1.55, '--rl-d': '120ms' }}>
                No account needed, the unit details are already filled in by the listing realtor, so just tell us about you. The more specific, the better; skip anything that doesn’t apply, though the optional sections help: landlords are more confident with a fuller picture.
              </p>

              {error && (
                <div style={{ background: C.redTint, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, padding: '14px 18px', marginBottom: 28, color: C.ink, fontSize: 14 }}>
                  {error}
                </div>
              )}

              {/* Privacy / human-rights-code note, province-aware (ON: OHRC, BC: BC code). */}
              <div style={{ marginBottom: 40, padding: '18px 22px', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Designed to be privacy-first
                </div>
                We collect what landlords need to make a good decision, not your SIN, bank info, or driver's license. Those come after an offer, not before. Aligned with {humanRightsCodeName(listingProvince)} best practices.
              </div>

              <FormSection num="01" title="Where to send it" required>
                <Field label="Email" required value={form.email} onChange={(v) => update('email', v)} onBlur={() => markTouched('email')} error={emailError} placeholder="you@example.com" type="email" inputMode="email" />
              </FormSection>

              {/* No "apartment" section, those details belong to the listing the realtor
                  created (shown read-only in the banner above), not to tenant input. */}

              <FormSection num="02" title="About you" required>
                <Field label="Full name" required value={form.fullName} onChange={(v) => update('fullName', v)} onBlur={() => markTouched('fullName')} error={showErr('fullName') && !vital.fullName ? 'Full name is required.' : ''} placeholder="Jane Doe" />
                <Field label="Date of birth" required value={form.dateOfBirth} onChange={updateDob} onBlur={() => markTouched('dateOfBirth')} error={dobError} type="date" hint={`You must be ${minAge}+ (${provinceName(listingProvince)} age of majority) to apply on your own.`} />
                <Field label="Phone" required value={form.phone} onChange={(v) => update('phone', formatPhone(v))} onBlur={() => markTouched('phone')} error={phoneError} placeholder="(416) 555-1234" type="tel" inputMode="tel" />
              </FormSection>

              <FormSection num="03" title="Employment" required>
                <SelectField label="Employment type" value={form.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[
                  { value: '', label: 'Select…' },
                  { value: 'full-time', label: 'Full-time' },
                  { value: 'part-time', label: 'Part-time' },
                  { value: 'contract', label: 'Contract' },
                  { value: 'self-employed', label: 'Self employed (own or family business)' },
                ]} />
                <Field label="Job title" required value={form.jobTitle} onChange={(v) => update('jobTitle', v)} onBlur={() => markTouched('jobTitle')} error={showErr('jobTitle') && !vital.jobTitle ? 'Job title is required.' : ''} placeholder={selfEmployed ? 'Owner / Electrician / Consultant' : 'Software engineer'} />
                {/* Self-employed: this is the registered business name, same field, same bar. */}
                <Field label={selfEmployed ? 'Registered business name' : 'Employer'} required value={form.employer} onChange={(v) => updateEmployment({ employer: v })} onBlur={() => markTouched('employer')}
                  error={showErr('employer') && !vital.employer ? (selfEmployed ? 'Business name is required.' : 'Employer is required.') : ''}
                  placeholder={selfEmployed ? 'Doe Electrical Ltd.' : 'Shopify'}
                  hint={selfEmployed ? 'The business as it’s registered, your own, or a family business you work for.' : undefined} />
                <Field label={selfEmployed ? 'Years in business' : 'Years at this job'} value={form.yearsAtJob} onChange={(v) => update('yearsAtJob', v)} placeholder="3" />
                <div>
                  <Field label="Annual income before tax (CAD)" required value={form.annualIncome} onChange={updateGross} onBlur={() => markTouched('annualIncome')} error={showErr('annualIncome') && !vital.annualIncome ? 'Annual income before tax is required.' : ''} placeholder="85,000" type="number" inputMode="numeric"
                    hint="Gross, your yearly pay before deductions (offer letter / T4 box 14)." />
                </div>
                {/* Editable estimate. Never scored; shown to the landlord alongside gross, clearly labelled. */}
                {String(form.annualIncome).trim() && (
                  <div>
                    <Field label="Estimated after tax income (CAD/yr)" value={form.netIncome} onChange={updateNet} type="number" inputMode="numeric" placeholder="63,000"
                      hint={form.netIncomeSource === 'stated'
                        ? 'You entered this yourself.'
                        : `Estimate for ${provinceName(listingProvince)} at ${TAX_YEAR} rates (federal + provincial tax, CPP, EI), please correct if yours is different.`} />
                    {form.netIncomeSource === 'stated' && (
                      <button type="button" onClick={resetNetToEstimate} style={{ marginTop: 6, background: 'transparent', border: 'none', padding: 0, color: C.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                        Use the {provinceName(listingProvince)} estimate instead
                      </button>
                    )}
                  </div>
                )}
              </FormSection>

              <FormSection num="04" title="Rental history">
                <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 4, lineHeight: 1.55 }}>
                  A landlord who can vouch for your tenancy is the strongest signal you can give, it carries more weight than anything else on this form.
                </p>
                <SelectField label="Your rental situation" value={form.rentalStatus} onChange={updateRentalStatus} options={[
                  { value: 'current', label: 'I’m renting now' },
                  { value: 'previous', label: 'I’ve rented before, but not right now' },
                  { value: 'none', label: 'No previous rental to list' },
                ]} />
                {form.rentalStatus !== 'none' ? (
                  <>
                    <Field label={form.rentalStatus === 'current' ? 'Current rental address' : 'Most recent rental address'} value={form.previousAddress} onChange={(v) => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                      <SelectField label="Time there · years" value={form.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[
                        { value: '', label: 'Select…' },
                        ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })),
                        { value: '10', label: '10+' },
                      ]} />
                      <SelectField label="… plus months" value={form.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[
                        { value: '', label: '0' },
                        ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
                      ]} />
                      <Field label={form.rentalStatus === 'current' ? 'Current rent (CAD/mo)' : 'Rent there (CAD/mo)'} value={form.currentRent} onChange={(v) => update('currentRent', v)} placeholder="2,200" type="number" />
                    </div>
                    <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.rule}`, display: 'flex', flexDirection: 'column', gap: 18 }}>
                      <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Landlord reference</div>
                      <Field label={form.rentalStatus === 'current' ? 'Current landlord’s name' : 'That landlord’s name'} value={form.previousLandlordName} onChange={(v) => update('previousLandlordName', v)} placeholder="John Smith" />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                        <Field label="Their email" value={form.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} placeholder="landlord@email.com" type="email" inputMode="email" />
                        <Field label="Their phone" value={form.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} placeholder="(416) 555-0142" type="tel" inputMode="tel" />
                      </div>
                      <p style={{ fontSize: 12, color: C.inkMute, lineHeight: 1.5, margin: 0 }}>
                        Either works, both is best. The listing realtor may contact them for a short reference about the tenancy itself (rent paid on time, condition of the unit), never about you personally.
                      </p>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55, margin: 0 }}>
                    No problem, plenty of strong applications start here. The rest of your application carries the weight.
                  </p>
                )}
              </FormSection>

              <FormSection num="05" title="Your move" required>
                <Field label="Desired move in date" required value={form.moveInDate} onChange={(v) => update('moveInDate', v)} onBlur={() => markTouched('moveInDate')} error={showErr('moveInDate') && !vital.moveInDate ? 'Move in date is required.' : ''} type="date" />
              </FormSection>

              <FormSection num="06" title="Household & pets">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                  <Field label="Total occupants" value={form.numberOfOccupants} onChange={(v) => update('numberOfOccupants', v)} placeholder="2" type="number" hint="Just the number of people who'll live in the unit." />
                  <SelectField label="Smoking or vaping?" value={form.smoker} onChange={(v) => update('smoker', v)} options={[
                    { value: 'no', label: 'No' },
                    { value: 'outdoor', label: 'Outdoor only' },
                    { value: 'yes', label: 'Yes' },
                  ]} />
                </div>
                <Textarea label="Other occupants (optional)" value={form.occupantsDetails} onChange={(v) => update('occupantsDetails', v)} placeholder="One roommate, also on this application." />

                {/* Structured pet capture, serialized into the stored `pets` string (see
                    serializePets), so every screen that displays pets today keeps working. */}
                <ToggleField label="Do you have pets?" value={form.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
                {form.hasPets && (
                  <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pets</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18 }}>
                      <SelectField label="Type" value={form.petType} onChange={(v) => updatePets({ petType: v })} options={[
                        { value: 'cat', label: 'Cat' },
                        { value: 'dog', label: 'Dog' },
                        { value: 'catdog', label: 'Cats & dogs' },
                        { value: 'other', label: 'Other' },
                      ]} />
                      <SelectField label="How many" value={form.petCount} onChange={(v) => updatePets({ petCount: v })} options={[
                        { value: '1', label: '1' },
                        { value: '2', label: '2' },
                        { value: '3+', label: '3 or more' },
                      ]} />
                      <SelectField label="Size of largest (optional)" value={form.petSize} onChange={(v) => updatePets({ petSize: v })} options={[
                        { value: '', label: 'Select…' },
                        { value: 'small', label: 'Small (under 25 lb)' },
                        { value: 'medium', label: 'Medium (25 to 60 lb)' },
                        { value: 'large', label: 'Large (60+ lb)' },
                      ]} />
                    </div>
                    <ToggleField label="Spayed / neutered" value={form.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
                    <ToggleField label="House-trained" value={form.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
                    <Field label="Anything else about your pet(s) (optional)" value={form.petNotes} onChange={(v) => updatePets({ petNotes: v })} placeholder="Breed, temperament, vet records available…" />
                  </div>
                )}

                {/* Co-tenant framing on purpose: the household-income function needs another adult
                    on the lease, never the nature of the relationship (marital status is a
                    protected ground). coApplicantRelationship stays in state as '' so the
                    payload shape is unchanged. */}
                <ToggleField label="Applying with a co tenant? (another adult who’ll be on the lease)" value={form.hasCoApplicant} onChange={(v) => update('hasCoApplicant', v)} />
                {form.hasCoApplicant && (
                  <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.red}`, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Co tenant</div>
                    <Field label="Full name" value={form.coApplicantName} onChange={(v) => update('coApplicantName', v)} placeholder="Alex Smith" />
                    <Field label="Age" value={form.coApplicantAge} onChange={(v) => update('coApplicantAge', v)} placeholder="30" type="number" />
                    <Field label="Job title" value={form.coApplicantJobTitle} onChange={(v) => update('coApplicantJobTitle', v)} placeholder="Designer" />
                    <Field label="Employer" value={form.coApplicantEmployer} onChange={(v) => update('coApplicantEmployer', v)} placeholder="Figma" />
                    <Field label="Annual income (CAD)" value={form.coApplicantIncome} onChange={(v) => update('coApplicantIncome', v)} placeholder="75,000" type="number" />
                  </div>
                )}
              </FormSection>

              <FormSection num="07" title="References (optional but recommended)">
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


              <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14, lineHeight: 1.55 }}>
                Fields marked <span style={{ color: C.red, fontWeight: 700 }}>*</span> are required. The listing realtor screens on these, so please double-check they’re accurate before you submit.
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
                {status === 'submitting' ? 'Submitting…' : 'Review & submit'}
              </button>
              {status === 'ready' && !allVitalValid && (() => {
                const labels = { fullName: 'Full name', dateOfBirth: `Date of birth (${minAge}+)`, email: 'Valid email', phone: '10-digit phone', annualIncome: 'Income before tax', employer: selfEmployed ? 'Business name' : 'Employer', jobTitle: 'Job title', moveInDate: 'Move in date', unit: 'Unit details' };
                const missing = Object.keys(vital).filter((k) => !vital[k]).map((k) => labels[k]);
                return (
                  <p style={{ fontSize: 12.5, color: C.inkMute, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                    Still needed before you can submit: <span style={{ color: C.inkSoft, fontWeight: 600 }}>{missing.join(', ')}</span>.
                  </p>
                );
              })()}
              <p style={{ fontSize: 12, color: C.inkMute, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
                Free for applicants. You’ll get an application number to share, the listing realtor sees it in their dashboard.
              </p>

              {/* REVIEW-AND-CONFIRM, the deliberate final checkpoint before submitting. */}
              {reviewing && (() => {
                const fmtDate = (v) => { try { return new Date(`${v}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return v; } };
                const incomeNum = Number(String(form.annualIncome).replace(/[^\d.]/g, '')) || 0;
                const rows = [
                  ['Full name', form.fullName.trim()],
                  ['Date of birth', form.dateOfBirth ? `${fmtDate(form.dateOfBirth)}${derivedAge != null ? ` (age ${derivedAge})` : ''}` : 'not set'],
                  ['Email', form.email.trim()],
                  ['Phone', form.phone.trim()],
                  ['Income before tax', incomeNum ? `$${incomeNum.toLocaleString()}/yr` : 'not set'],
                  ['After tax', Number(form.netIncome) ? `$${Number(form.netIncome).toLocaleString()}/yr ${form.netIncomeSource === 'stated' ? '(you entered)' : '(estimate)'}` : 'not set'],
                  [form.employmentType === 'self-employed' ? 'Business' : 'Employer', `${form.employer.trim()}${form.employmentType ? ` · ${({ 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', 'self-employed': 'Self-employed' })[form.employmentType]}` : ''}`],
                  ['Job title', form.jobTitle.trim()],
                  ['Move in date', form.moveInDate ? fmtDate(form.moveInDate) : 'not set'],
                  ['Rental history', form.rentalStatus === 'none'
                    ? 'No previous rental listed'
                    : [form.yearsAtPrevious ? `${form.yearsAtPrevious} yrs` : null, form.previousLandlordName.trim() ? `reference: ${form.previousLandlordName.trim()}` : null].filter(Boolean).join(' · ') || 'not set'],
                  ['Pets', form.pets || 'None'],
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
                      <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.5, marginBottom: 16 }}>The listing realtor and the landlord screen on this information, so make sure it’s accurate, you can go back and edit anything.</p>
                      <div style={{ background: C.paperDeep, borderRadius: R.ctrl, padding: '14px 16px', marginBottom: 18 }}>
                        {rows.map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '5px 0', fontSize: 13 }}>
                            <span style={{ color: C.inkMute, fontWeight: 600, minWidth: 0, flexShrink: 0 }}>{k}</span>
                            <span style={{ color: C.ink, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{v || 'not set'}</span>
                          </div>
                        ))}
                      </div>
                      {/* One-shot SUBMISSION: this creates the application for this listing once.
                          The tenant can later edit the facts on /my-application (the same record,
                          same RL), but resubmitting through the invite creates a second
                          application, so the warning stands. */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', background: C.paperDeep, borderLeft: `3px solid ${C.red}`, borderRadius: R.ctrl, marginBottom: 16, fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>
                        <span style={{ marginTop: 1, flexShrink: 0, color: C.red, display: 'inline-flex' }}><Icon name="shield" size={15} /></span>
                        <span>
                          Take a second to double-check everything above, <strong style={{ color: C.ink }}>once you submit, you can’t edit it here</strong>. Later changes go through your profile page, and submitting this form again would create a second application.
                        </span>
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
