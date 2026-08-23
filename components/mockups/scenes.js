// components/mockups/scenes.js
// The mockup CONTENT LIBRARY — product scenes built in code with FAKE sample data (the demo
// cast: Priya Nair, James Okafor, Sarah Chen, David Tremblay, Amara Okonkwo — never real
// tenants). Each scene fills whatever DeviceFrame it's placed in (fluid sizes via clamp /
// percentages) and is self-explanatory standalone. No animation except HeroDemo (which is
// reduced-motion gated); everything here is static so it screenshots identically every time.
//
// Imported ONLY by /admin/mockups — never by the landing page (keeps the hero bundle light).
import { C, R } from '../theme';
import { Icon, TickMeter } from '../ui';
import HeroDemo from './HeroDemo';

export const CAST = [
  { initials: 'PN', color: '#2d7d4a', name: 'Priya Nair', role: 'Senior UX · CIBC', income: 115000, net: 84400, score: 4.6, tenure: '5 yrs', rent: 31 },
  { initials: 'JO', color: '#3a6ea5', name: 'James Okafor', role: 'Software Eng · Shopify', income: 95000, net: 70300, score: 4.2, tenure: '1.5 yrs', rent: 37 },
  { initials: 'SC', color: '#b07818', name: 'Sarah Chen', role: 'Marketing Mgr · Loblaw', income: 87000, net: 64900, score: 3.9, tenure: '3 yrs', rent: 41 },
  { initials: 'DT', color: '#8a5a2b', name: 'David Tremblay', role: 'Registered Nurse · Sunnybrook', income: 78000, net: 59100, score: 3.6, tenure: '4 yrs', rent: 45 },
  { initials: 'AO', color: '#6b4a8a', name: 'Amara Okonkwo', role: 'Teacher · TDSB', income: 71000, net: 54500, score: 3.3, tenure: '8 mo', rent: 49 },
];
export const money = (n) => `$${Number(n).toLocaleString('en-CA')}`;
export const Avatar = ({ a, size = 28 }) => <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', background: a.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700 }}>{a.initials}</span>;
export const Eyebrow = ({ children, color = C.red, size = 9.5 }) => <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}><span style={{ width: 16, height: 2, background: color, borderRadius: 1 }} /><span style={{ fontSize: size, color, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{children}</span></div>;
const pad = 'clamp(12px, 4%, 22px)';

// 1 ── Ranked applicants (the live hero) ────────────────────────────────────────────────────
export function RankedListScene({ demoStep = null }) { return <HeroDemo step={demoStep} />; }

// 2 ── The branded landlord report, as the landlord receives it ─────────────────────────────
export function LandlordReportScene() {
  const top = CAST.slice(0, 3);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* co-branded masthead: realtor brand accent + Rentletter tick */}
      <div style={{ background: '#1f3a5f', color: C.paper, padding: `clamp(10px, 3%, 16px) ${pad}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 6, background: C.paper, color: '#1f3a5f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, flexShrink: 0 }}>SC</span>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontWeight: 800, lineHeight: 1.1 }}>Sarah Chen · Royal LePage</div><div style={{ fontSize: 'clamp(9px, 2.2vw, 10.5px)', opacity: 0.8 }}>Shortlist for 88 Harbour St, Unit 2104 · $2,600/mo</div></div>
        </div>
        <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.75, whiteSpace: 'nowrap' }}>Prepared for <strong style={{ opacity: 1 }}>M. Rossi</strong></div>
      </div>
      <div style={{ padding: `clamp(10px, 3%, 16px) ${pad}`, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1.6%, 10px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div className="rl-serif" style={{ fontSize: 'clamp(14px, 3.6vw, 19px)', color: C.ink, letterSpacing: '-0.02em' }}>Top 3 of 12 applicants</div>
          <div style={{ fontSize: 'clamp(8.5px, 2vw, 10px)', color: C.inkMute }}>Ranked on income, tenure, history · Aug 20, 2026</div>
        </div>
        {top.map((a, i) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'clamp(7px, 2%, 11px) clamp(9px, 2.4%, 13px)', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${i === 0 ? C.red : C.rule}`, borderRadius: R.ctrl }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? C.red : C.inkMute, width: 14, flexShrink: 0 }}>{i + 1}</span>
            <Avatar a={a} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}{i === 0 && <span style={{ color: C.red, fontWeight: 600 }}> · Top pick</span>}</div>
              <div style={{ fontSize: 'clamp(9px, 2.3vw, 10.5px)', color: C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role} · {money(a.income)}/yr before tax · {a.rent}% rent-to-income</div>
              <div style={{ fontSize: 'clamp(9px, 2.3vw, 10.5px)', color: C.green, marginTop: 2 }}>✓ Documents verified Aug 18 · income & employer matched</div>
            </div>
            <TickMeter value={a.score} size={11} />
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: 'clamp(7px, 2%, 10px) clamp(9px, 2.4%, 13px)', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 'clamp(8.5px, 2vw, 10px)', color: C.inkSoft, lineHeight: 1.45 }}>
          Fit against your stated preferences: min income $75k ✓ · non-smoker ✓ · move-in by Sept 1 ✓. Rentletter organizes applicants; run credit checks wherever you already do.
        </div>
      </div>
    </div>
  );
}

// 3 ── Document verification result (the AI / instrument surface) ──────────────────────────
export function VerificationScene({ phone = false }) {
  const rows = [
    ['Income', '$115,000', '$114,600 (T4)', 'match'], ['Employer', 'CIBC', 'CIBC World Markets', 'match'], ['Job title', 'Senior UX', 'Senior UX Designer', 'match'], ['Pay frequency', '—', 'Semi-monthly', 'found'],
  ];
  const tone = { match: [C.green, C.greenTint, '✓ Verified'], found: [C.inkSoft, C.paperDeep, 'Found'], close: [C.amber, C.amberTint, '≈ Close'] };
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#101012', color: '#e8e4d9', overflow: 'hidden', padding: pad, display: 'flex', flexDirection: 'column', gap: 'clamp(6px, 1.6%, 10px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Eyebrow color="#ff4d55">Document verification</Eyebrow>
        <span style={{ fontSize: 9, color: '#9a958a', whiteSpace: 'nowrap' }}>3 documents · read once, discarded</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar a={CAST[0]} size={30} />
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 'clamp(12px, 3vw, 14px)', fontWeight: 800 }}>Priya Nair</div><div style={{ fontSize: 'clamp(9px, 2.3vw, 10.5px)', color: '#9a958a' }}>Name on documents matches the applicant · high confidence</div></div>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: '#101012', background: '#5fbf85', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>VERIFIED</span>
      </div>
      <div style={{ border: '1px solid #2a2a2e', borderRadius: R.ctrl, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1.2fr auto' : '1fr 1fr 1.2fr auto', gap: 8, padding: '6px 10px', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9a958a', background: '#161618' }}>
          <span>Field</span>{!phone && <span>Applicant said</span>}<span>Documents show</span><span />
        </div>
        {rows.map(([f, said, doc, st]) => (
          <div key={f} style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1.2fr auto' : '1fr 1fr 1.2fr auto', gap: 8, padding: 'clamp(6px, 1.8%, 9px) 10px', borderTop: '1px solid #2a2a2e', fontSize: 'clamp(9.5px, 2.4vw, 11.5px)', alignItems: 'center' }}>
            <span style={{ color: '#c8c2b3' }}>{f}</span>{!phone && <span>{said}</span>}<span style={{ fontWeight: 600 }}>{doc}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: tone[st][0] === C.inkSoft ? '#c8c2b3' : tone[st][0], background: st === 'match' ? 'rgba(95,191,133,0.14)' : '#1c1c1e', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>{tone[st][2]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['pay-stub-jul.pdf', 'employment-letter.pdf', 'credit-report.pdf'].map((n) => <span key={n} style={{ fontSize: 9.5, color: '#c8c2b3', background: '#1c1c1e', border: '1px solid #2a2a2e', padding: '3px 8px', borderRadius: 6 }}>📄 {n}</span>)}
      </div>
      <div style={{ marginTop: 'auto', padding: 'clamp(7px, 2%, 10px) clamp(9px, 2.4%, 12px)', background: '#161618', border: '1px solid #2a2a2e', borderLeft: '3px solid #ff4d55', borderRadius: R.ctrl, fontSize: 'clamp(9px, 2.3vw, 10.5px)', lineHeight: 1.5, color: '#c8c2b3' }}>
        <strong style={{ color: '#e8e4d9' }}>Insight.</strong> Stated income is corroborated by a current T4 and pay stub from the same employer; tenure and title are consistent across documents. Credit report shows no collections. Nothing here considers background, family status, or source of income.
      </div>
    </div>
  );
}

// 4 ── The tenant application on a phone — how simple it is to apply ──────────────────────
export function TenantApplyScene() {
  const F = ({ label, value, done }) => (
    <div style={{ paddingBottom: 6, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ fontSize: 9.5, color: C.inkSoft, fontWeight: 500, marginBottom: 2 }}>{label}{done && <span style={{ color: C.green, marginLeft: 6 }}>✓</span>}</div>
      <div style={{ fontSize: 'clamp(11px, 3vw, 13px)', color: value ? C.ink : C.inkMute, fontWeight: value ? 500 : 400 }}>{value || 'Tap to fill'}</div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: C.ink, color: C.paper, padding: '10px 14px', borderLeft: `4px solid ${C.red}` }}>
        <div style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8c2b3', marginBottom: 3 }}>You’re applying to</div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em' }}>88 Harbour St, Unit 2104</div>
        <div style={{ fontSize: 10, color: '#c8c2b3' }}>$2,600/mo · 2 bed · Goes to Sarah Chen, Royal LePage</div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 10, color: C.inkMute }}>03</span><span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>Employment</span><span style={{ fontSize: 9, color: C.inkMute }}>Required</span></div>
        <F label="Employment type" value="Full-time" done />
        <F label="Job title *" value="Senior UX Designer" done />
        <F label="Employer *" value="CIBC" done />
        <F label="Annual income before tax (CAD) *" value="$115,000" done />
        <div style={{ padding: '7px 10px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 9.5, color: C.inkSoft, lineHeight: 1.45 }}>Estimated after-tax income: <strong style={{ color: C.ink }}>$84,400</strong> — Ontario, 2026 rates. Correct it if yours differs.</div>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.inkMute, marginBottom: 4 }}><span>Step 3 of 9</span><span>About 4 minutes left</span></div>
          <div style={{ height: 3, background: C.rule, borderRadius: 2, marginBottom: 10 }}><div style={{ width: '33%', height: '100%', background: C.red, borderRadius: 2 }} /></div>
          <div style={{ background: C.red, color: C.paper, borderRadius: R.ctrl, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Continue</div>
          <div style={{ fontSize: 8.5, color: C.inkMute, textAlign: 'center', marginTop: 6 }}>No account. No SIN, no bank login, no documents yet.</div>
        </div>
      </div>
    </div>
  );
}

// 5 ── Tenant document upload — the secure link experience ────────────────────────────────
export function TenantUploadScene() {
  const Doc = ({ name, state }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
      <span style={{ width: 26, height: 26, borderRadius: 6, background: C.paperDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>📄</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div><div style={{ fontSize: 9.5, color: state === 'done' ? C.green : C.inkMute }}>{state === 'done' ? 'Read and discarded — facts kept' : 'Reading…'}</div></div>
      {state === 'done' ? <Icon name="check" size={14} color={C.green} strokeWidth={2.5} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${C.rule}`, borderTopColor: C.red, display: 'inline-block' }} />}
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px' }}>
      <Eyebrow>Secure document request</Eyebrow>
      <div className="rl-serif" style={{ fontSize: 'clamp(16px, 4.4vw, 20px)', color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 6 }}>Sarah Chen asked for two documents.</div>
      <div style={{ fontSize: 10.5, color: C.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>For 88 Harbour St. Each file is read once by Rentletter to confirm the facts on your application, then deleted. Nothing is stored or forwarded.</div>
      <div style={{ border: `1.5px dashed ${C.ruleDark}`, borderRadius: R.card, padding: '14px 10px', textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>Tap to add a document</div>
        <div style={{ fontSize: 9.5, color: C.inkMute, marginTop: 2 }}>Pay stub, employment letter, or credit report · PDF or photo</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Doc name="pay-stub-july.pdf" state="done" />
        <Doc name="IMG_4821.jpg (employment letter)" state="reading" />
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 9.5, color: C.inkSoft, lineHeight: 1.45, marginBottom: 10 }}>
          <Icon name="shield" size={14} color={C.red} /> This link is yours alone and expires in 7 days. No SIN, no ID, no bank login.
        </div>
        <div style={{ background: C.ink, color: C.paper, borderRadius: R.ctrl, padding: '12px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Send to Sarah</div>
      </div>
    </div>
  );
}

// 6 ── The dashboard home on a phone — mobile-native ────────────────────────────────────────
export function DashboardHomeScene() {
  const listings = [['88 Harbour St, Unit 2104', '$2,600', 12, 3], ['210 Carlaw Ave, Unit 4', '$2,150', 7, 1], ['15 Fort York Blvd, 2210', '$2,900', 4, 0]];
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 3, height: 14, background: C.red, display: 'inline-block' }} /><span style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>Rentletter</span></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ position: 'relative', display: 'inline-flex' }}><Icon name="bell" size={15} color={C.ink} /><span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: C.red }} /></span></span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        <div><div className="rl-serif" style={{ fontSize: 'clamp(17px, 4.6vw, 21px)', color: C.ink, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Welcome back, Sarah</div><div style={{ fontSize: 10, color: C.inkSoft, marginTop: 2 }}>3 listings · 23 applicants · 2 new today</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {[['23', 'Applicants'], ['4', 'Shortlisted'], ['2', 'Reports sent']].map(([n, l]) => <div key={l} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '8px 9px' }}><div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em', lineHeight: 1 }}>{n}</div><div style={{ fontSize: 8.5, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 3 }}>{l}</div></div>)}
        </div>
        <div style={{ fontSize: 9, color: C.red, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Listings</div>
        {listings.map(([n, rent, apps, newc]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, background: C.ink, color: C.paper, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="home" size={13} color={C.paper} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div><div style={{ fontSize: 9.5, color: C.inkMute }}>{rent}/mo · {apps} applicants{newc ? ` · ${newc} new` : ''}</div></div>
            {newc ? <span style={{ fontSize: 9, fontWeight: 800, color: C.paper, background: C.red, padding: '2px 6px', borderRadius: 999 }}>{newc}</span> : <Icon name="chevron" size={14} color={C.inkMute} />}
          </div>
        ))}
        <div style={{ marginTop: 'auto', background: C.red, color: C.paper, borderRadius: R.ctrl, padding: '11px', textAlign: 'center', fontSize: 12.5, fontWeight: 700 }}>+ New listing</div>
      </div>
    </div>
  );
}

export const SCENES = [
  { key: 'film', title: 'Product film', blurb: 'The 43-second camera move through the product, synced to the narration timeline. Hover for the scrubber.', film: true, animated: true },
  { key: 'ranked', title: 'Ranked applicants', blurb: 'The live hero — applicants ranked, top pick rises, send to landlord.', device: 'laptop', url: 'rentletter.ca/dashboard', Scene: RankedListScene, aspect: '4 / 3', animated: true, stillStep: 3 },
  { key: 'report', title: 'Branded landlord report', blurb: 'What the landlord receives — co-branded, top 3 of 12, fit against their preferences.', device: 'laptop', url: 'rentletter.ca/shortlist/…', Scene: LandlordReportScene, aspect: '4 / 3' },
  { key: 'verify', title: 'Document verification', blurb: 'The instrument surface: documents read once, facts matched, an OHRC-safe insight.', device: 'laptop', url: 'rentletter.ca/dashboard/88-harbour', Scene: VerificationScene, aspect: '4 / 3', dark: true },
  { key: 'apply', title: 'Tenant application', blurb: 'How simple it is to apply — one step at a time, no account.', device: 'phone', Scene: TenantApplyScene },
  { key: 'upload', title: 'Secure document upload', blurb: 'The tenant’s secure-link experience: read once, discarded.', device: 'phone', Scene: TenantUploadScene },
  { key: 'home', title: 'Dashboard on a phone', blurb: 'Mobile-native: listings, applicants and new activity at a glance.', device: 'phone', Scene: DashboardHomeScene },
];
