// pages/apply/[token].js
// PUBLIC, UNAUTHENTICATED tenant application page reached from a realtor's
// listing-scoped invite link (https://rentletter.ca/apply/{token}).
//
// Flow (KV only — no Supabase, no realtor login):
//   1. Resolve the invite token via GET /api/invite/resolve (reads linvite:{token}).
//      Missing/expired -> friendly "link no longer active" message (NOT a 404).
//   2. Render the standard tenant application form (same fields generate.js expects).
//   3. On submit -> POST /api/generate (mode 'application' => app:{RL} in KV, free, no AI)
//      -> POST /api/invite/tag to link the RL to this invite
//      -> best-effort POST /api/send to email the tenant their number.
//   4. Show the tenant their RL number with a clear confirmation.
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { GlobalStyle, Wordmark, useReveal } from '../../components/ui';
import { C, R } from '../../components/theme';
import { isValidEmail } from '../../lib/validation';
import { normalizeProvince, ageOfMajority, provinceName, humanRightsCodeName } from '../../lib/provinces';
import { formatUnit } from '../../lib/unitType';
import { EMPTY_FORM, serializePets, ageFromDob } from '../../lib/tenantProfile';
import { estimateNetIncome, TAX_YEAR } from '../../lib/taxEstimate';
import { Field, Textarea, SelectField, ToggleField } from '../../components/apply/fields';
import { ProfileStyles, Eyebrow, Dots, DotText, EMP_LABEL, noWidow } from '../../components/tenant/ProfileFacts';
import DocumentUploader from '../../components/tenant/DocumentUploader';
import { RETENTION_DAYS } from '../../lib/documentRetention';
import { rowToForm } from '../../lib/pipelinePrefill';

// ?from={prefillToken}: the invite from Pipeline (pages/api/pipeline/invite.js). Resolved on the
// server through the service role (lib/pipeline.js readPrefill): the token maps to an application
// whose surviving fields fill every step, collapsed to one review card with one Submit. A wrong
// or expired token renders the ordinary empty form. The first open claims the token into a cookie
// scoped to this path (48 hours); it is deleted after the submission (/api/pipeline/prefill). The
// sandbox token demoprefill fills from the fixture.
export async function getServerSideProps(ctx) {
  const from = String(ctx.query?.from || '');
  if (!from) return { props: { invited: null } };
  try {
    if (from === 'demoprefill') { const { demoPrefillRow } = await import('../../lib/demoFixture'); return { props: { invited: { token: from, form: rowToForm(demoPrefillRow()) } } }; }
    const { isSupabaseConfigured } = await import('../../lib/supabase/server');
    if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { props: { invited: null } };
    const { readPrefill, PREFILL_COOKIE } = await import('../../lib/pipeline');
    const { getSupabaseAdminClient } = await import('../../lib/supabase/admin');
    // The first open claims the token; the claim rides in a cookie scoped to this apply path for
    // 48 hours, so the same browser can come back and anyone else sees the empty form.
    const cookieHeader = String(ctx.req?.headers?.cookie || '');
    const nonce = (cookieHeader.match(new RegExp(`(?:^|;\\s*)${PREFILL_COOKIE}=([^;]+)`)) || [])[1] || null;
    const r = await readPrefill(getSupabaseAdminClient(), from, { nonce: nonce ? decodeURIComponent(nonce) : null });
    if (r && r.nonce) ctx.res.setHeader('Set-Cookie', `${PREFILL_COOKIE}=${encodeURIComponent(r.nonce)}; Path=/apply/${encodeURIComponent(String(ctx.params?.token || ''))}; Max-Age=172800; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return { props: { invited: r ? { token: from, form: rowToForm(r.application) } : null } };
  } catch (e) {
    console.error('[apply] prefill failed:', e?.message || e);
    return { props: { invited: null } };
  }
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
  return `You must be at least ${min} (the age of majority in ${provinceName(province)}) to submit a rental application on your own. Applicants under ${min} need a guarantor, support for that is coming soon.`;
}

// The steps: seven cards of fields, then the review card. Each step's vital keys gate Continue.
const STEPS = [
  { id: 'send', title: 'Where to send it', keys: ['email'] },
  { id: 'you', title: 'About you', keys: ['fullName', 'dateOfBirth', 'phone'] },
  { id: 'work', title: 'Employment', keys: ['annualIncome', 'employer', 'jobTitle'] },
  { id: 'rental', title: 'Rental history', keys: [] },
  { id: 'move', title: 'Your move', keys: ['moveInDate'] },
  { id: 'household', title: 'Household and pets', keys: [] },
  { id: 'refs', title: 'References', keys: [] },
  { id: 'review', title: 'Review', keys: [] },
];

export default function ApplyPage({ invited = null }) {
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
  // The document request minted at submission (pages/api/applications/mirror.js): the upload token
  // only, never owner_token. docs: idle | skipped | done { received }.
  const [docRequest, setDocRequest] = useState(null); // { token, url }
  const [docs, setDocs] = useState({ state: 'idle', received: 0 });
  const [copied, setCopied] = useState(false);
  const [touched, setTouched] = useState({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  // One step at a time on the phone (all of them stacked from 720px up). Invited from Pipeline:
  // the form arrives filled and opens on the review card; Edit opens a step and Continue returns.
  const [step, setStep] = useState(invited && invited.form ? STEPS.length : 1);
  const [fromReview, setFromReview] = useState(false);
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 720px)');
    const on = () => setStacked(mq.matches); on();
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, []);
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
    dateOfBirth: form.ageConfirmed === true || (!!form.dateOfBirth && derivedAge != null && derivedAge >= minAge), // an invited applicant's stored answer counts
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
        const r = await fetch(`/api/invite/resolve?token=${encodeURIComponent(token)}`);
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
        setForm((f) => ({ ...(invited && invited.form ? { ...EMPTY_FORM, ...invited.form } : f), apartmentAddress: u.address || '', apartmentDescription: descBits.join(' · ') }));
        setStatus('ready');
        // The sandbox preview of the submitted state (?preview=done on a demo token): the confirmation
        // and the document card render from fixed values; nothing is created or sent.
        if (/^demo/.test(token) && new URLSearchParams(window.location.search).get('preview') === 'done') {
          setForm((f) => ({ ...f, fullName: 'Priya Sharma', email: 'priya.sharma@example.com' }));
          setResult({ applicationNumber: 'RL-2026-1A2B-3C4D', ownerToken: 'DEMO0000000000000000000000000000' });
          setStatus('done');
        }
      } catch (e) {
        if (cancelled) return;
        setInvalidMsg('We couldn’t load this application link right now. Please try again in a moment, or contact the listing realtor.');
        setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, router.query.token]);

  // The facts as the review shows them, by step (the number is the FormSection's).
  const reviewRows = () => {
    const fmtDate = (v) => { try { return new Date(`${v}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return v; } };
    const incomeNum = Number(String(form.annualIncome).replace(/[^\d.]/g, '')) || 0;
    const rows = [
      ['Full name', form.fullName.trim()],
      ['Age of majority', form.dateOfBirth ? (derivedAge != null && derivedAge >= minAge ? `Confirmed ${minAge} or over` : 'Under the age of majority') : form.ageConfirmed ? `Confirmed ${minAge} or over` : 'not set'],
      ['Email', form.email.trim()],
      ['Phone', form.phone.trim()],
      ['Income before tax', incomeNum ? `$${incomeNum.toLocaleString()}/yr` : 'not set'],
      ['After tax', Number(form.netIncome) ? `$${Number(form.netIncome).toLocaleString()}/yr · ${form.netIncomeSource === 'stated' ? 'you entered' : 'estimate'}` : 'not set'],
      [form.employmentType === 'self-employed' ? 'Business' : 'Employer', `${form.employer.trim()}${EMP_LABEL[form.employmentType] ? ` · ${EMP_LABEL[form.employmentType]}` : ''}`],
      ['Job title', form.jobTitle.trim()],
      ['Move in date', form.moveInDate ? fmtDate(form.moveInDate) : 'not set'],
      ['Rental history', form.rentalStatus === 'none'
        ? 'No previous rental listed'
        : [form.yearsAtPrevious ? `${form.yearsAtPrevious} yrs` : null, form.previousLandlordName.trim() ? `landlord ${form.previousLandlordName.trim()}` : null].filter(Boolean).join(' · ') || 'not set'],
      ['Pets', form.pets || 'None'],
    ];
    return rows;
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
        // The date of birth stays on this device: only the age of majority answer travels.
        body: JSON.stringify({ ...form, dateOfBirth: undefined, age: undefined, ageConfirmed: form.ageConfirmed === true || (derivedAge != null && derivedAge >= minAge), mode: 'application', inviteToken: token }),
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
      if (invited?.token) fetch('/api/pipeline/prefill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: invited.token }) }).catch(() => {});
      // Keep the profile on this device so the next invite link offers "use my saved profile".
      try {
        if (ownerToken) { localStorage.setItem('rentletter_app_number', applicationNumber); localStorage.setItem('rentletter_owner_token', ownerToken); }
      } catch (e) { /* private mode, the email carries the same keys */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Background: tag the invite (KV), then mirror into Supabase (the bridge —
      // mirror runs AFTER tag so the RL is present in invite_submissions:{token}),
      // then email the tenant. All non-blocking.
      (async () => {
        let minted = null;
        try {
          // 2. Tag this submission to the realtor's invite (KV).
          await fetch('/api/invite/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, applicationNumber }),
          });
          // 3. Mirror into Supabase so it appears under the listing in the dashboard. The mirror
          //    also mints the document request; its token drives the upload card and the email line.
          const mr = await fetch('/api/applications/mirror', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, applicationNumber }),
          });
          const mj = await mr.json().catch(() => ({}));
          if (mj?.docRequest?.token) { minted = { token: mj.docRequest.token, url: mj.docRequest.url }; setDocRequest(minted); }
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
              uploadUrl: minted?.url || null,
              signature: json.emailSig || null, // lib/sendSignature.js: the generate route signed this send
            }),
          }).catch((e) => console.error('[apply] email send failed', e));
        }
      })();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setStatus('ready');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const copyNumber = () => {
    if (!result?.applicationNumber) return;
    navigator.clipboard.writeText(result.applicationNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // ── the form as cards: one step at a time on the phone, all of them stacked on a wide screen ──
  const pad = (n) => String(n).padStart(2, '0');
  const stepValid = (n) => STEPS[n - 1].keys.every((k) => vital[k]);
  const scrollTop = () => { if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  const goNext = () => {
    const s = STEPS[step - 1];
    if (!stepValid(step)) { setTouched((t) => ({ ...t, ...Object.fromEntries(s.keys.map((k) => [k, true])) })); setError('Please complete the required fields.'); return; }
    setError(''); setStep(fromReview ? STEPS.length : Math.min(step + 1, STEPS.length)); setFromReview(false); scrollTop();
  };
  const goBack = () => { setError(''); setFromReview(false); setStep(Math.max(1, step - 1)); scrollTop(); };
  const editStep = (n) => { setError(''); setFromReview(true); setStep(n); scrollTop(); };
  const submitFromReview = () => {
    if (!allVitalValid) {
      setTriedSubmit(true);
      const first = STEPS.findIndex((s) => !s.keys.every((k) => vital[k]));
      setError('Please complete the required fields.');
      if (first >= 0) { setFromReview(true); setStep(first + 1); scrollTop(); }
      return;
    }
    submitApplication();
  };
  const submitting = status === 'submitting';

  const fieldsFor = (n) => {
    switch (STEPS[n - 1].id) {
      case 'send': return (
        <>
          <Field label="Email" required value={form.email} onChange={(v) => update('email', v)} onBlur={() => markTouched('email')} error={emailError} placeholder="you@example.com" type="email" inputMode="email" />
          <p className="mp-note">{noWidow(`We collect what landlords need to make a good decision, not your SIN, bank details or driver's licence. Those come after an offer, not before. Aligned with ${humanRightsCodeName(listingProvince)} best practices.`)}</p>
        </>
      );
      case 'you': return (
        <>
          <Field label="Full name" required value={form.fullName} onChange={(v) => update('fullName', v)} onBlur={() => markTouched('fullName')} error={showErr('fullName') && !vital.fullName ? 'Full name is required.' : ''} placeholder="Jane Doe" />
          <Field label="Date of birth" required value={form.dateOfBirth} onChange={updateDob} onBlur={() => markTouched('dateOfBirth')} error={dobError} type="date" hint={`You must be ${minAge} or over (${provinceName(listingProvince)} age of majority) to apply on your own. The date stays on this device.`} />
          <Field label="Phone" required value={form.phone} onChange={(v) => update('phone', formatPhone(v))} onBlur={() => markTouched('phone')} error={phoneError} placeholder="(416) 555-1234" type="tel" inputMode="tel" />
        </>
      );
      case 'work': return (
        <>
          <SelectField label="Employment type" value={form.employmentType} onChange={(v) => updateEmployment({ employmentType: v })} options={[
            { value: '', label: 'Select' }, { value: 'full-time', label: 'Full time' }, { value: 'part-time', label: 'Part time' }, { value: 'contract', label: 'Contract' }, { value: 'self-employed', label: 'Self employed (own or family business)' },
          ]} />
          <Field label="Job title" required value={form.jobTitle} onChange={(v) => update('jobTitle', v)} onBlur={() => markTouched('jobTitle')} error={showErr('jobTitle') && !vital.jobTitle ? 'Job title is required.' : ''} placeholder={selfEmployed ? 'Owner, electrician, consultant' : 'Software developer'} />
          <Field label={selfEmployed ? 'Registered business name' : 'Employer'} required value={form.employer} onChange={(v) => updateEmployment({ employer: v })} onBlur={() => markTouched('employer')}
            error={showErr('employer') && !vital.employer ? (selfEmployed ? 'Business name is required.' : 'Employer is required.') : ''}
            placeholder={selfEmployed ? 'Doe Electrical Ltd.' : 'Shopify'}
            hint={selfEmployed ? 'The business as it is registered: your own, or a family business you work for.' : undefined} />
          <Field label={selfEmployed ? 'Years in business' : 'Years at this job'} value={form.yearsAtJob} onChange={(v) => update('yearsAtJob', v)} placeholder="3" />
          <Field label="Annual income before tax (CAD)" required value={form.annualIncome} onChange={updateGross} onBlur={() => markTouched('annualIncome')} error={showErr('annualIncome') && !vital.annualIncome ? 'Annual income before tax is required.' : ''} placeholder="85,000" type="number" inputMode="numeric"
            hint="Gross: your yearly pay before deductions (offer letter or T4 box 14)." />
          {String(form.annualIncome).trim() && (
            <div>
              <Field label="Estimated after tax income (CAD per year)" value={form.netIncome} onChange={updateNet} type="number" inputMode="numeric" placeholder="63,000"
                hint={form.netIncomeSource === 'stated' ? 'You entered this yourself.' : `Estimate for ${provinceName(listingProvince)} at ${TAX_YEAR} rates (federal and provincial tax, CPP, EI). Correct it if yours is different.`} />
              {form.netIncomeSource === 'stated' && <button type="button" onClick={resetNetToEstimate} className="mp-link">Use the {provinceName(listingProvince)} estimate instead</button>}
            </div>
          )}
        </>
      );
      case 'rental': return (
        <>
          <p className="mp-note">{noWidow('A landlord who can vouch for your tenancy is the strongest signal you can give. It carries more weight than anything else on this form.')}</p>
          <SelectField label="Your rental situation" value={form.rentalStatus} onChange={updateRentalStatus} options={[
            { value: 'current', label: 'I am renting now' }, { value: 'previous', label: 'I have rented before, but not right now' }, { value: 'none', label: 'No previous rental to list' },
          ]} />
          {form.rentalStatus !== 'none' ? (
            <>
              <Field label={form.rentalStatus === 'current' ? 'Current rental address' : 'Most recent rental address'} value={form.previousAddress} onChange={(v) => update('previousAddress', v)} placeholder="456 Queen St, Toronto" />
              <div className="mp-grid2">
                <SelectField label="Time there, years" value={form.tenureYears} onChange={(v) => updateTenure({ tenureYears: v })} options={[{ value: '', label: 'Select' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: String(i) })), { value: '10', label: '10 or more' }]} />
                <SelectField label="Plus months" value={form.tenureMonths} onChange={(v) => updateTenure({ tenureMonths: v })} options={[{ value: '', label: '0' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
                <Field label={form.rentalStatus === 'current' ? 'Current rent (CAD per month)' : 'Rent there (CAD per month)'} value={form.currentRent} onChange={(v) => update('currentRent', v)} placeholder="2,200" type="number" inputMode="numeric" />
              </div>
              <div className="mp-sub">
                <div className="mp-label">Landlord reference</div>
                <Field label={form.rentalStatus === 'current' ? 'Current landlord’s name' : 'That landlord’s name'} value={form.previousLandlordName} onChange={(v) => update('previousLandlordName', v)} placeholder="John Smith" />
                <div className="mp-grid2">
                  <Field label="Their email" value={form.prevLandlordEmail} onChange={(v) => updateReference({ prevLandlordEmail: v })} placeholder="landlord@email.com" type="email" inputMode="email" />
                  <Field label="Their phone" value={form.prevLandlordPhone} onChange={(v) => updateReference({ prevLandlordPhone: formatPhone(v) })} placeholder="(416) 555-0142" type="tel" inputMode="tel" />
                </div>
                <p className="mp-note">{noWidow('Either works, both is best. The listing realtor may ask them about the tenancy itself (rent paid on time, condition of the unit), never about you personally.')}</p>
              </div>
            </>
          ) : (
            <p className="mp-note">{noWidow('No problem. Plenty of strong applications start here; the rest of your application carries the weight.')}</p>
          )}
        </>
      );
      case 'move': return (
        <Field label="Desired move in date" required value={form.moveInDate} onChange={(v) => update('moveInDate', v)} onBlur={() => markTouched('moveInDate')} error={showErr('moveInDate') && !vital.moveInDate ? 'Move in date is required.' : ''} type="date" />
      );
      case 'household': return (
        <>
          <div className="mp-grid2">
            <Field label="Total occupants" value={form.numberOfOccupants} onChange={(v) => update('numberOfOccupants', v)} placeholder="2" type="number" inputMode="numeric" hint="The number of people who will live in the unit." />
            <SelectField label="Smoking or vaping" value={form.smoker} onChange={(v) => update('smoker', v)} options={[{ value: 'no', label: 'No' }, { value: 'outdoor', label: 'Outdoor only' }, { value: 'yes', label: 'Yes' }]} />
          </div>
          <Textarea label="Other occupants (optional)" value={form.occupantsDetails} onChange={(v) => update('occupantsDetails', v)} placeholder="One roommate, also on this application." />
          {/* Structured pet capture, serialized into the stored pets string (serializePets). */}
          <ToggleField label="Do you have pets?" value={form.hasPets} onChange={(v) => updatePets({ hasPets: v })} />
          {form.hasPets && (
            <div className="mp-sub">
              <div className="mp-label">Pets</div>
              <div className="mp-grid2">
                <SelectField label="Type" value={form.petType} onChange={(v) => updatePets({ petType: v })} options={[{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }, { value: 'catdog', label: 'Cats and dogs' }, { value: 'other', label: 'Other' }]} />
                <SelectField label="How many" value={form.petCount} onChange={(v) => updatePets({ petCount: v })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3+', label: '3 or more' }]} />
                <SelectField label="Size of largest (optional)" value={form.petSize} onChange={(v) => updatePets({ petSize: v })} options={[{ value: '', label: 'Select' }, { value: 'small', label: 'Small (under 25 lb)' }, { value: 'medium', label: 'Medium (25 to 60 lb)' }, { value: 'large', label: 'Large (over 60 lb)' }]} />
              </div>
              <ToggleField label="Spayed or neutered" value={form.petSpayedNeutered} onChange={(v) => updatePets({ petSpayedNeutered: v })} />
              <ToggleField label="House trained" value={form.petTrained} onChange={(v) => updatePets({ petTrained: v })} />
              <Field label="Anything else about your pets (optional)" value={form.petNotes} onChange={(v) => updatePets({ petNotes: v })} placeholder="Breed, temperament, vet records available" />
            </div>
          )}
          {/* Co tenant framing on purpose: another adult on the lease, never the nature of the
              relationship (marital status is a protected ground). coApplicantRelationship stays ''. */}
          <ToggleField label="Applying with a co tenant, another adult on the lease?" value={form.hasCoApplicant} onChange={(v) => update('hasCoApplicant', v)} />
          {form.hasCoApplicant && (
            <div className="mp-sub">
              <div className="mp-label">Co tenant</div>
              <Field label="Full name" value={form.coApplicantName} onChange={(v) => update('coApplicantName', v)} placeholder="Alex Smith" />
              <Field label="Job title" value={form.coApplicantJobTitle} onChange={(v) => update('coApplicantJobTitle', v)} placeholder="Designer" />
              <Field label="Employer" value={form.coApplicantEmployer} onChange={(v) => update('coApplicantEmployer', v)} placeholder="Figma" />
              <Field label="Annual income (CAD)" value={form.coApplicantIncome} onChange={(v) => update('coApplicantIncome', v)} placeholder="75,000" type="number" inputMode="numeric" />
            </div>
          )}
        </>
      );
      case 'refs': return (
        <>
          <p className="mp-note">{noWidow('Two people who can vouch for you. Named references with a way to reach them persuade more than "references available".')}</p>
          {[1, 2].map((n) => (
            <div key={n} className="mp-sub">
              <div className="mp-label">Reference {n}</div>
              <Field label="Full name" value={form[`reference${n}Name`]} onChange={(v) => update(`reference${n}Name`, v)} placeholder={n === 1 ? 'Sarah Johnson' : 'David Chen'} />
              <div className="mp-grid2">
                <Field label="Relationship" value={form[`reference${n}Relationship`]} onChange={(v) => update(`reference${n}Relationship`, v)} placeholder={n === 1 ? 'Current manager' : 'Friend of 5 years'} />
                <Field label="Phone or email" value={form[`reference${n}Contact`]} onChange={(v) => update(`reference${n}Contact`, v)} placeholder={n === 1 ? '416-555-0142' : 'dchen@email.com'} />
              </div>
            </div>
          ))}
        </>
      );
      default: return null;
    }
  };

  // The review card: the facts by step, an Edit per step, the one red Submit.
  const reviewCard = () => {
    const rows = reviewRows();
    const groups = [
      [1, ['Email']], [2, ['Full name', 'Age of majority', 'Phone']], [3, ['Income before tax', 'After tax', 'Employer', 'Business', 'Job title']],
      [4, ['Rental history']], [5, ['Move in date']], [6, ['Pets']],
    ];
    return (
      <>
        {groups.map(([n, keys]) => {
          const mine = rows.filter(([k]) => keys.includes(k));
          if (!mine.length) return null;
          return (
            <div key={n}>
              <div className="mp-head" style={{ minHeight: 44 }}>
                <div className="mp-value" style={{ marginTop: 0 }}>{STEPS[n - 1].title}</div>
                <button type="button" onClick={() => editStep(n)} disabled={submitting} className="mp-link">Edit</button>
              </div>
              <div className="mp-facts" style={{ marginTop: 0 }}>
                {mine.map(([k, v]) => <div key={k} className="mp-fact"><div className="mp-label">{k}</div><div className="mp-value"><DotText text={v || 'not set'} /></div></div>)}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  const stepCard = (n) => {
    const last = n === STEPS.length;
    return (
      <div key={n} id={`step-${pad(n)}`} className="rl-card rl-in mp-card" data-invited-review={last && invited ? '' : undefined}>
        <div className="mp-step"><Dots items={[`Step ${n} of ${STEPS.length}`, STEPS[n - 1].title]} /></div>
        <div className="mp-progress" aria-hidden="true"><span style={{ width: `${Math.round((n / STEPS.length) * 100)}%` }} /></div>
        <div className="mp-form">{last ? reviewCard() : fieldsFor(n)}</div>
        {error && n === step && <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(error)}</p>}
        {last ? (
          <div className="mp-actions">
            <button type="button" onClick={submitFromReview} disabled={submitting} className="mp-btn mp-btn-red">{submitting ? 'Submitting' : 'Submit'}</button>
            {!stacked && <button type="button" onClick={goBack} disabled={submitting} className="mp-link">Back</button>}
          </div>
        ) : !stacked && (
          <div className="mp-actions">
            <button type="button" onClick={goNext} className="mp-btn">Continue</button>
            {(step > 1 || fromReview) && <button type="button" onClick={fromReview ? () => { setFromReview(false); setStep(STEPS.length); scrollTop(); } : goBack} className="mp-link">{fromReview ? 'Back to review' : 'Back'}</button>}
          </div>
        )}
        {last && <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(invited ? 'This creates a new application for this unit. Your earlier one is unchanged.' : 'This creates one application for this unit. Later changes go through your profile page.')}</p>}
      </div>
    );
  };

  const visibleSteps = stacked ? STEPS.map((_, i) => i + 1) : [step];
  const inkMute = '#8f8b81', inkText = '#c8c2b3';

  return (
    <>
      <Head>
        <title>Apply · Rentletter</title>
        <meta name="description" content="Submit your rental application, no account needed." />
      </Head>
      <GlobalStyle /><ProfileStyles />
      <div className="mp-page">
        <header className="mp-header">
          <a href="/" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark /></a>
          <span className="mp-note">Rental application</span>
        </header>

        <div className="mp-wrap mp-sections">
          {status === 'loading' && <div className="rl-card mp-card"><p className="mp-p">Loading your application</p></div>}

          {status === 'rented' && (
            <div className="rl-card mp-card">
              <h1 className="mp-h1">{noWidow('This unit has been rented.')}</h1>
              {keep.state === 'done' ? (
                <p className="mp-p" style={{ marginTop: 'var(--gap-line)', color: C.ink }}>{noWidow(keep.message)}</p>
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
                }} className="mp-form">
                  <p className="mp-p">{noWidow(`Want ${rented?.realtorName || 'the realtor'} to keep you in mind for similar units?`)}</p>
                  <div>
                    <label htmlFor="keep-email" className="mp-label" style={{ display: 'block' }}>Your email</label>
                    <input id="keep-email" type="email" inputMode="email" autoComplete="email" value={keepEmail} onChange={(e) => setKeepEmail(e.target.value)} placeholder="you@example.com" className="mp-input" style={{ marginTop: 'var(--gap-line)' }} />
                  </div>
                  {keep.state === 'error' && <p role="alert" className="mp-alert">{noWidow(keep.message)}</p>}
                  <button type="submit" disabled={keep.state === 'busy'} className="mp-btn">{keep.state === 'busy' ? 'Saving' : 'Yes, keep me in mind'}</button>
                  <p className="mp-note">{noWidow('No account is created. Your email is kept for 60 days for this purpose only.')}</p>
                </form>
              )}
            </div>
          )}

          {status === 'invalid' && (
            <div className="rl-card mp-card">
              <h1 className="mp-h1">{noWidow('This link is no longer active')}</h1>
              <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(invalidMsg)}</p>
              <a href="/" className="mp-btn" style={{ marginTop: 'var(--gap-card)' }}>Go to Rentletter</a>
            </div>
          )}

          {status === 'done' && result && (
            <div className="mp-stack">
              <div className="rl-card mp-card">
                <Eyebrow>Application submitted</Eyebrow>
                <h1 className="mp-h1" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`You are all set${form.fullName ? `, ${form.fullName.split(' ')[0]}` : ''}.`)}</h1>
                <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`Your application has been sent${invite?.realtorName ? ` to ${invite.realtorName}` : ''}${invite?.listingName ? ` for ${invite.listingName}` : ''}. Save your application number: it is how the listing realtor pulls up your application.`)}</p>
                <div className="mp-fact" style={{ marginTop: 'var(--gap-card)' }}>
                  <div className="mp-label">Your application number</div>
                  <div className="mp-h2 num" style={{ marginTop: 'var(--gap-line)' }}>{result.applicationNumber}</div>
                </div>
                <button type="button" onClick={copyNumber} className="mp-btn mp-btn-auto" style={{ marginTop: 'var(--gap-card)' }}>{copied ? 'Copied' : 'Copy the number'}</button>
                {result.ownerToken && (
                  <>
                    <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow('Keep this private. Your owner key opens your profile, where you can see who viewed your application, update your details, revoke it, and apply to your next listing without retyping.')}</p>
                    <a href="/my-application" className="mp-link">rentletter.ca/my-application</a>
                    <div className="mp-value mp-mono" style={{ wordBreak: 'break-all' }}>{result.ownerToken}</div>
                    {form.email && <p className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow(`We also emailed a copy to ${form.email}.`)}</p>}
                  </>
                )}
              </div>
              {/* THE LAST STEP: documents now, on the tenant's own per file path (components/tenant/
                  DocumentUploader.js, the same control as /upload/[token]). The request was minted at
                  submission; the token here is the document request token, never owner_token. */}
              <div className="rl-card mp-card">
                {docs.state === 'done' ? (
                  <p className="mp-p" style={{ color: C.ink }}>{noWidow(`Done. ${docs.received} document${docs.received === 1 ? '' : 's'} added.`)}</p>
                ) : docs.state === 'skipped' ? (
                  <p className="mp-p">{noWidow('You can add documents any time from your confirmation email.')}</p>
                ) : (
                  <>
                    <h2 className="mp-h2">Add your documents</h2>
                    <p className="mp-p" style={{ marginTop: 'var(--gap-line)', color: C.ink }}>{noWidow('Two minutes. Your realtor sees a matched application instead of a waiting one.')}</p>
                    {/* The set rows render inside the uploader (lib/documentSet.js); the retention line sits between them and the drop zone. */}
                    <div style={{ marginTop: 'var(--gap-card)' }}>
                      {docRequest?.token ? (
                        <DocumentUploader token={docRequest.token} onDone={({ received }) => setDocs({ state: 'done', received })}
                          before={<p className="mp-note" style={{ marginBottom: 'var(--gap-card)' }}>{noWidow(`Held for ${invite?.realtorName || 'the realtor'}'s review for ${RETENTION_DAYS} days, then deleted. Do not upload anything showing your SIN.`)}</p>} />
                      ) : (
                        <>
                          <p className="mp-note">{noWidow(`Held for ${invite?.realtorName || 'the realtor'}'s review for ${RETENTION_DAYS} days, then deleted. Do not upload anything showing your SIN.`)}</p>
                          <p className="mp-note" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Preparing your upload link. If it does not appear, the link is in your confirmation email.')}</p>
                        </>
                      )}
                    </div>
                    <button type="button" onClick={() => setDocs({ state: 'skipped', received: 0 })} className="mp-link">Skip for now</button>
                  </>
                )}
              </div>
            </div>
          )}

          {(status === 'ready' || status === 'submitting') && (
            <>
              {/* Applying for banner from the resolved invite: the one ink surface on the page. */}
              {invite && (
                <div className="mp-ink rl-in">
                  <Eyebrow style={{ color: inkMute }}>You are applying to</Eyebrow>
                  <div className="mp-h2" style={{ color: C.paper, marginTop: 'var(--gap-line)' }}>{noWidow(invite.listingName || invite.unit?.address || 'Rental unit')}</div>
                  {invite.unit && (() => {
                    const addr = invite.unit.address && invite.unit.address !== (invite.listingName || '') ? invite.unit.address : null;
                    const bits = [invite.unit.monthlyRent ? `$${Number(invite.unit.monthlyRent).toLocaleString('en-CA')}/mo` : null, formatUnit(invite.unit.bedrooms) || null, addr];
                    return bits.some(Boolean) ? <div className="mp-p" style={{ color: inkText, marginTop: 'var(--gap-line)' }}><Dots items={bits} /></div> : null;
                  })()}
                  {(invite.realtorName || invite.realtorBrokerage) && (
                    <div className="mp-p" style={{ color: inkText, marginTop: 'var(--gap-line)' }}><Dots items={[`Goes to ${invite.realtorName || ''}`.trim(), invite.realtorBrokerage]} /></div>
                  )}
                </div>
              )}

              <div className="mp-stack">
                {/* Saved profile offer: the apply in seconds entry point, when this device or session holds one. */}
                {saved && !invited && prefill.state !== 'applied' && !prefill.dismissed && (
                  <div className="rl-card rl-in mp-card">
                    <Eyebrow>Apply in seconds</Eyebrow>
                    <h2 className="mp-h2" style={{ marginTop: 'var(--gap-line)' }}>{noWidow('Fill this application from your saved profile')}</h2>
                    <p className="mp-p" style={{ marginTop: 'var(--gap-line)' }}>
                      {saved.source === 'profile'
                        ? <>{noWidow(`We bring over the details saved on your profile (${saved.email}): employment, income, rental history, household. You check it and confirm before anything is sent to this realtor.`)}</>
                        : <>{noWidow(`We bring over what you entered for ${saved.app}: employment, income, rental history, household. You check it and confirm before anything is sent to this realtor.`)}</>}
                    </p>
                    {prefill.state === 'error' && (
                      <p role="alert" className="mp-alert" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(prefill.error)} {/revoked/i.test(prefill.error) && <a href="/my-application" style={{ color: C.ink, fontWeight: 700 }}>Open my profile</a>}</p>
                    )}
                    <div className="mp-actions">
                      <button type="button" onClick={applySavedProfile} disabled={prefill.state === 'loading'} className="mp-btn">{prefill.state === 'loading' ? 'Loading your profile' : 'Use my saved profile'}</button>
                      <button type="button" onClick={() => setPrefill((p) => ({ ...p, dismissed: true }))} className="mp-link">Start fresh</button>
                    </div>
                  </div>
                )}
                {prefill.state === 'applied' && (
                  <div role="status" className="rl-card rl-in mp-card">
                    <p className="mp-p" style={{ color: C.ink }}>{noWidow('Filled from your saved profile. Check each step, especially income and your move in date, then submit. This creates a separate application for this listing; what you confirm here becomes your profile’s latest details.')}</p>
                    {prefill.source?.address && form.apartmentAddress && prefill.source.address.trim().toLowerCase() === form.apartmentAddress.trim().toLowerCase() && (
                      <p className="mp-note" style={{ marginTop: 'var(--gap-card)' }}>{noWidow(`Your saved profile was already submitted for this same address (${prefill.source.app}). Submitting again adds a second application to the realtor's list. If you only want to update details, edit your profile instead.`)}</p>
                    )}
                  </div>
                )}
                {visibleSteps.map(stepCard)}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
