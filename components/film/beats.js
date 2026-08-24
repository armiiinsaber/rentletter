// components/film/beats.js
// The screens the camera looks at, each driven by progress values from timeline.beats(t).
// Same cast, colours and layout language as components/mockups/scenes.js (CAST, Avatar,
// Eyebrow are reused from there); laptop screens are laid out at 560 × 350, the phone at 330
// wide, and ProductFilm scales them into the devices. transform/opacity only — nothing here
// changes layout over time.
import { C, R, SH } from '../theme';
import { Icon, TickMeter } from '../ui';
import { CAST, Avatar, Eyebrow, money } from '../mockups/scenes';

const fade = (k, dy = 6) => ({ opacity: k, transform: `translate(0, ${(1 - k) * dy}px)` });
// The product's default masthead — what a report wears before a brand is set. The report at
// 0:25 shows this; the report at 0:38 wears what the studio ends on (studioBrand, below).
const DEFAULT_BRAND = '#1f3a5f';
const pad = '16px 18px';

// A generated logo mark (the studio's output) — roofline + serif monogram.
export function LogoMark({ size = 28, color = DEFAULT_BRAND, paper = C.paper, variant = 0 }) {
  const s = size;
  if (variant === 1) return <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill={color} /><text x="20" y="26" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="600" fontSize="17" fill={paper}>SC</text></svg>;
  if (variant === 2) return <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="6" fill={color} /><path d="M11 27V15l9-6 9 6v12" fill="none" stroke={paper} strokeWidth="2.4" strokeLinejoin="round" /></svg>;
  return <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill={color} /><path d="M9 19l11-9 11 9" fill="none" stroke={paper} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><text x="20" y="32" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="600" fontSize="13" fill={paper}>SC</text></svg>;
}

const Screen = ({ children, dark }) => <div style={{ position: 'absolute', inset: 0, background: dark ? '#101012' : C.paper, color: dark ? '#e8e4d9' : C.ink, overflow: 'hidden' }}>{children}</div>;
const Chrome = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 3, height: 14, background: C.red }} /><span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em' }}>Rentletter</span></span>
    <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.ink, color: C.paper, fontSize: 8.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>SC</span>
  </div>
);

// 1 ── Listing + invite link ───────────────────────────────────────────────────────────────
export function ListingScreen({ b }) {
  return (
    <Screen>
      <Chrome />
      <div style={{ padding: pad, display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 14 }}>
        <div>
          <Eyebrow>Your listing</Eyebrow>
          <div className="rl-serif" style={{ fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 4 }}>88 Harbour St, Unit 2104</div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginBottom: 12 }}>$2,600/mo · 2 bed · Toronto</div>
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: '10px 12px', display: 'grid', gap: 6 }}>
            {[['Min annual income', '$75,000'], ['Max rent-to-income', '40%'], ['Min lease term', '12 mo'], ['Landlord reference', 'Required']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, borderBottom: `1px solid ${C.rule}`, paddingBottom: 5 }}><span style={{ color: C.inkMute }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span></div>
            ))}
            <div style={{ fontSize: 9.5, color: C.inkMute }}>Landlord client · Marco Rossi</div>
          </div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: '12px 14px', alignSelf: 'start' }}>
          <Eyebrow>Invite link</Eyebrow>
          <div style={{ fontSize: 10.5, color: C.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>One link for everyone who wants to apply. Applications land here, ranked.</div>
          <div style={{ position: 'relative', height: 36 }}>
            <div style={{ position: 'absolute', inset: 0, background: b.link > 0.4 ? C.ink : C.red, color: C.paper, borderRadius: R.ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, opacity: Math.max(0, 1 - b.link * 2.2) * b.linkBtn, transform: `scale(${1 - 0.04 * b.link})` }}><Icon name="link" size={13} color={C.paper} /> Get invite link</div>
            <div style={{ position: 'absolute', inset: 0, border: `1px solid ${C.ruleDark}`, background: C.paper, borderRadius: R.ctrl, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8, fontSize: 11.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', ...fade(b.link, 8) }}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>rentletter.ca/apply/a8f3k2</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.paper, background: C.ink, padding: '3px 8px', borderRadius: R.pill }}>{b.sent > 0.5 ? 'Copied' : 'Copy'}</span>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, ...fade(b.sent, 6) }}>
            <span style={{ display: 'inline-flex' }}>{CAST.map((a, i) => <span key={a.name} style={{ marginLeft: i ? -6 : 0, border: `2px solid ${C.card}`, borderRadius: '50%', display: 'inline-flex' }}><Avatar a={a} size={20} /></span>)}</span>
            <span style={{ fontSize: 10.5, color: C.green, fontWeight: 700 }}>Sent to 12 people</span>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// 2 ── The tenant applying on their phone ─────────────────────────────────────────────────
export function ApplyScreen({ b }) {
  const F = ({ label, value, k }) => (
    <div style={{ paddingBottom: 6, borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ fontSize: 9.5, color: C.inkSoft, marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>{label}<span style={{ color: C.green, opacity: k }}>✓</span></div>
      <div style={{ position: 'relative', height: 16, fontSize: 13 }}>
        <span style={{ position: 'absolute', left: 0, top: 0, color: C.inkMute, opacity: 1 - k }}>Tap to fill</span>
        <span style={{ position: 'absolute', left: 0, top: 0, color: C.ink, fontWeight: 500, ...fade(k, 5) }}>{value}</span>
      </div>
    </div>
  );
  return (
    <Screen>
      <div style={{ background: C.ink, color: C.paper, padding: '10px 14px', borderLeft: `4px solid ${C.red}` }}>
        <div style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8c2b3', marginBottom: 3 }}>You’re applying to</div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em' }}>88 Harbour St, Unit 2104</div>
        <div style={{ fontSize: 10, color: '#c8c2b3' }}>$2,600/mo · 2 bed · Goes to Sarah Chen, Royal LePage</div>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9, position: 'absolute', top: 66, bottom: 0, left: 0, right: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 10, color: C.inkMute }}>03</span><span style={{ fontSize: 14, fontWeight: 700 }}>Employment</span><span style={{ fontSize: 9, color: C.inkMute }}>Required</span></div>
        <F label="Employment type" value="Full-time" k={b.fields[0]} />
        <F label="Job title *" value="Senior UX Designer" k={b.fields[1]} />
        <F label="Employer *" value="CIBC" k={b.fields[2]} />
        <F label="Annual income before tax (CAD) *" value="$115,000" k={b.fields[3]} />
        <div style={{ padding: '7px 10px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 9.5, color: C.inkSoft, lineHeight: 1.45, ...fade(b.estimate, 6) }}>Estimated after-tax income: <strong style={{ color: C.ink }}>$84,400</strong> — Ontario, 2026 rates. You can edit it.</div>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.inkMute, marginBottom: 4 }}><span>Step 3 of 9</span><span>About 2 minutes</span></div>
          <div style={{ height: 3, background: C.rule, borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}><div style={{ width: '100%', height: '100%', background: C.red, borderRadius: 2, transformOrigin: 'left', transform: `scaleX(${b.progress})` }} /></div>
          <div style={{ background: b.cont > 0.5 ? C.ink : C.red, color: C.paper, borderRadius: R.ctrl, padding: 12, textAlign: 'center', fontSize: 13, fontWeight: 700, transform: `scale(${1 - 0.03 * b.cont})` }}>Continue</div>
          <div style={{ fontSize: 8.5, color: C.inkMute, textAlign: 'center', marginTop: 6 }}>No account. No SIN, no bank login, no documents yet.</div>
        </div>
      </div>
    </Screen>
  );
}

// 3 ── Applications arrive, then physically sort into rank ─────────────────────────────────
const ARRIVAL = ['Mei Tanaka', 'James Okafor', 'Priya Nair', 'David Tremblay', 'Amara Okonkwo'];
const RANKED = [...CAST].sort((a, b) => b.score - a.score).map((a) => a.name);
export function RankedScreen({ b }) {
  const rowH = 44; const top = 60;
  return (
    <Screen>
      <Chrome />
      <div style={{ padding: '10px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow>{b.sort > 0.5 ? 'Ranked · top 5' : '88 Harbour St · applications'}</Eyebrow>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: b.sort > 0.5 ? C.green : C.inkMute, border: `1px solid ${b.sort > 0.5 ? C.green : C.rule}`, borderRadius: R.pill, padding: '1px 7px' }}>{b.sort > 0.5 ? 'Ranked' : `${Math.round(b.arrive.reduce((s, k) => s + k, 0))} of 12 in`}</span>
      </div>
      <div style={{ position: 'absolute', left: 18, right: 18, top: top + 16, height: rowH * 5 }}>
        {CAST.map((a) => {
          const ai = ARRIVAL.indexOf(a.name), ri = RANKED.indexOf(a.name);
          const y = (ai + (ri - ai) * b.sort) * rowH; const k = b.arrive[ai];
          const isTop = ri === 0; const topK = isTop ? b.top : 0; const sel = isTop ? b.select : 0;
          return (
            <div key={a.name} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: rowH - 7, transform: `translate(${(1 - k) * 60}px, ${y}px) scale(${1 + sel * 0.02})`, opacity: k, background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, boxShadow: sel > 0 ? SH.raised : SH.rest, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px', zIndex: isTop ? 2 : 1 }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: C.red, borderRadius: '8px 0 0 8px', opacity: topK }} />
              <span className="rl-serif" style={{ fontSize: 13, color: C.inkMute, width: 14, opacity: b.sort }}>{ri + 1}</span>
              <Avatar a={a} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}<span style={{ color: C.red, fontWeight: 600, opacity: topK }}> · Top pick</span></div>
                <div style={{ fontSize: 10, color: C.inkMute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.role} · {money(a.income)}/yr · {a.tenure} tenure</div>
              </div>
              <TickMeter value={a.score} size={10} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: topK > 0.5 ? C.paper : C.ink, background: topK > 0.5 ? C.red : C.paperDeep, borderRadius: R.pill, padding: '2px 8px' }}>{a.score.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
      {/* action row for the selected top applicant */}
      <div style={{ position: 'absolute', left: 18, right: 18, top: top + 16 + rowH * 5 + 4, display: 'flex', alignItems: 'center', gap: 10, ...fade(b.askBtn, 8) }}>
        <span style={{ fontSize: 10.5, color: C.inkSoft, flex: 1 }}>Priya Nair · selected</span>
        <div style={{ position: 'relative', height: 32, minWidth: 200 }}>
          <div style={{ position: 'absolute', inset: 0, background: C.ink, color: C.paper, borderRadius: R.ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, opacity: 1 - b.asked, transform: `scale(${1 - 0.04 * b.press})` }}><Icon name="doc" size={13} color={C.paper} /> Request documents</div>
          <div style={{ position: 'absolute', inset: 0, border: `1px solid ${C.green}`, color: C.green, borderRadius: R.ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, fontWeight: 700, ...fade(b.asked, 6) }}><Icon name="check" size={13} color={C.green} strokeWidth={2.5} /> Secure link sent to Priya</div>
        </div>
      </div>
    </Screen>
  );
}

// 4 ── Verification: rows resolve, then the files are deleted ─────────────────────────────
export function VerifyScreen({ b }) {
  const rows = [['Income', '$115,000', '$114,600 (T4)'], ['Employer', 'CIBC', 'CIBC World Markets'], ['Job title', 'Senior UX', 'Senior UX Designer'], ['Pay frequency', '—', 'Semi-monthly']];
  const files = ['pay-stub-jul.pdf', 'employment-letter.pdf', 'credit-report.pdf'];
  return (
    <Screen dark>
      <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: 9, position: 'absolute', inset: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Eyebrow color="#ff4d55">Document verification</Eyebrow><span style={{ fontSize: 9, color: '#9a958a' }}>3 documents · read once</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar a={CAST[0]} size={30} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 800 }}>Priya Nair</div><div style={{ fontSize: 10, color: '#9a958a' }}>Name on documents matches the applicant</div></div>
          <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: '#101012', background: '#5fbf85', padding: '3px 8px', borderRadius: 999, ...fade(b.badge, 4) }}>VERIFIED</span>
        </div>
        <div style={{ border: '1px solid #2a2a2e', borderRadius: R.ctrl, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 86px', gap: 8, padding: '5px 10px', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9a958a', background: '#161618' }}><span>Field</span><span>Applicant said</span><span>Documents show</span><span /></div>
          {rows.map(([f, said, doc], i) => { const k = b.rows[i]; return (
            <div key={f} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 86px', gap: 8, padding: '7px 10px', borderTop: '1px solid #2a2a2e', fontSize: 11, alignItems: 'center' }}>
              <span style={{ color: '#c8c2b3' }}>{f}</span><span>{said}</span>
              <span style={{ fontWeight: 600, position: 'relative', height: 14 }}><span style={{ position: 'absolute', left: 0, opacity: 1 - k, color: '#6f6b63' }}>Reading…</span><span style={{ position: 'absolute', left: 0, ...fade(k, 4) }}>{doc}</span></span>
              <span style={{ position: 'relative', height: 18 }}>
                <span style={{ position: 'absolute', right: 0, fontSize: 9, color: '#6f6b63', opacity: 1 - k, padding: '2px 0' }}>pending</span>
                <span style={{ position: 'absolute', right: 0, fontSize: 9, fontWeight: 800, color: i === 3 ? '#c8c2b3' : C.green, background: i === 3 ? '#1c1c1e' : 'rgba(95,191,133,0.14)', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', ...fade(k, 3) }}>{i === 3 ? 'Found' : '✓ Verified'}</span>
              </span>
            </div>
          ); })}
        </div>
        <div style={{ position: 'relative', height: 24 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', gap: 8 }}>
            {files.map((n, i) => <span key={n} style={{ fontSize: 9.5, color: '#c8c2b3', background: '#1c1c1e', border: '1px solid #2a2a2e', padding: '3px 8px', borderRadius: 6, opacity: 1 - b.del[i], transform: `translate(0, ${-10 * b.del[i]}px) scale(${1 - 0.2 * b.del[i]})` }}>📄 {n}</span>)}
          </div>
          <div style={{ position: 'absolute', left: 0, top: 2, display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: '#e8e4d9', ...fade(b.deleted, 4) }}><span style={{ width: 3, height: 12, background: '#ff4d55' }} /><strong>3 files deleted.</strong><span style={{ color: '#9a958a' }}>Nothing is stored. Only the confirmed facts remain.</span></div>
        </div>
        <div style={{ marginTop: 'auto', padding: '8px 12px', background: '#161618', border: '1px solid #2a2a2e', borderLeft: '3px solid #ff4d55', borderRadius: R.ctrl, fontSize: 10, lineHeight: 1.5, color: '#c8c2b3', ...fade(b.badge, 4) }}>
          <strong style={{ color: '#e8e4d9' }}>Insight.</strong> Stated income is corroborated by a current T4 and pay stub from the same employer; tenure and title are consistent across documents.
        </div>
      </div>
    </Screen>
  );
}

// 5 ── The landlord report assembling — twice ─────────────────────────────────────────────
// brand = null  → the DEFAULT report (navy masthead, initials square, Inter): the "before", 0:25.
// brand = {…}   → HER report, wearing exactly what the studio set (colour, generated mark, font):
//                 the "after", 0:38. The real report does the same — the brand colour becomes its
//                 accent (lib/landlordReportPdf: guardAccent(brand_color, RED)) — so the accent
//                 follows too; Rentletter's red only remains where no brand is set.
export function ReportScreen({ b, brand = null, logo = 0 }) {
  const top = CAST.slice(0, 3);
  const mast = brand ? brand.color : DEFAULT_BRAND;
  const accent = brand ? brand.color : C.red;
  const nameStyle = brand
    ? { fontFamily: brand.font[1], fontWeight: brand.font[2], fontStyle: brand.font[3] ? 'italic' : 'normal', fontSize: 14.5, lineHeight: 1.1, letterSpacing: '-0.01em' }
    : { fontSize: 13, fontWeight: 800, lineHeight: 1.1 };
  return (
    <Screen>
      <div style={{ position: 'relative', height: 54, ...fade(b.mast, -10) }}>
        <div style={{ position: 'absolute', inset: 0, background: C.paperDeep }} />
        <div style={{ position: 'absolute', inset: 0, background: mast, opacity: b.brand }} />
        <div style={{ position: 'absolute', inset: 0, color: b.brand > 0.5 ? C.paper : C.ink, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ position: 'relative', width: 30, height: 30, display: 'inline-flex' }}>
              {brand
                ? <span style={{ position: 'absolute', inset: 0, display: 'inline-flex', opacity: logo, transform: `scale(${0.6 + 0.4 * logo})` }}><LogoMark size={30} color={C.paper} paper={brand.color} /></span>
                : <span style={{ position: 'absolute', inset: 0, borderRadius: 6, background: C.paper, color: DEFAULT_BRAND, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, opacity: b.logo }}>SC</span>}
            </span>
            <div><div style={nameStyle}>Sarah Chen · Royal LePage</div><div style={{ fontSize: 10, opacity: 0.8 }}>Shortlist for 88 Harbour St, Unit 2104</div></div>
          </div>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Prepared for <strong>M. Rossi</strong></div>
        </div>
      </div>
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...fade(b.mast) }}>
          <div className="rl-serif" style={{ fontSize: 18, letterSpacing: '-0.02em' }}>Top 3 of 12 applicants</div>
          <div style={{ fontSize: 9.5, color: C.inkMute }}>Ranked on income, tenure, history · Aug 20, 2026</div>
        </div>
        {top.map((a, i) => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.card, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${i === 0 ? accent : C.rule}`, borderRadius: R.ctrl, ...fade(b.rows[i], 10) }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? accent : C.inkMute, width: 12 }}>{i + 1}</span>
            <Avatar a={a} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{a.name}{i === 0 && <span style={{ color: accent, fontWeight: 600 }}> · Top pick</span>}</div>
              <div style={{ fontSize: 9.5, color: C.inkMute }}>{a.role} · {money(a.income)}/yr · {a.rent}% rent-to-income</div>
              <div style={{ fontSize: 9.5, color: C.green }}>✓ Documents verified · income & employer matched</div>
            </div>
            <TickMeter value={a.score} size={10} />
          </div>
        ))}
        <div style={{ padding: '7px 12px', background: C.paperDeep, borderRadius: R.ctrl, fontSize: 9.5, color: C.inkSoft, lineHeight: 1.45, ...fade(b.foot, 6) }}>Fit against your stated preferences: min income $75k ✓ · 12-month lease ✓ · move-in by Sept 1 ✓. Rentletter organizes applicants; run credit checks wherever you already do.</div>
      </div>
    </Screen>
  );
}

// 6 ── The brand studio: colours, concepts, a logo, fonts ─────────────────────────────────
export const SWATCHES = ['#1f3a5f', '#2d7d4a', '#b07818', '#6b4a8a', '#d72027'];
export const FONTS = [['Fraunces', "'Fraunces', Georgia, serif", 600, false], ['Inter', "'Inter', sans-serif", 800, false], ['Fraunces Italic', "'Fraunces', Georgia, serif", 500, true]]; // [name, family, weight, italic]
// What the studio ends on, read from the SAME beat values the studio renders from — so the final
// report wears exactly the colour, mark and font the viewer just watched being chosen.
export function studioBrand(s) {
  const fi = Math.max(0, Math.min(FONTS.length - 1, Math.round(s.font)));
  return { color: SWATCHES[Math.max(0, Math.min(SWATCHES.length - 1, Math.round(s.swatch)))], font: FONTS[fi] };
}
export function StudioScreen({ b }) {
  const fi = Math.max(0, Math.min(FONTS.length - 1, Math.round(b.font)));
  const [fname, ffam, fw, fitalic] = FONTS[fi];
  return (
    <Screen>
      <Chrome />
      <div style={{ padding: pad, display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 16 }}>
        <div>
          <Eyebrow>Brand studio</Eyebrow>
          <div className="rl-serif" style={{ fontSize: 19, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 10 }}>No logo yet? Make one.</div>
          <div style={{ fontSize: 9.5, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Colour</div>
          <div style={{ position: 'relative', display: 'flex', gap: 8, marginBottom: 12 }}>
            {SWATCHES.map((c) => <span key={c} style={{ width: 24, height: 24, borderRadius: '50%', background: c }} />)}
            <span aria-hidden="true" style={{ position: 'absolute', left: -3, top: -3, width: 30, height: 30, borderRadius: '50%', border: `2px solid ${C.ink}`, transform: `translate(${b.swatch * 32}px, 0)` }} />
          </div>
          <div style={{ fontSize: 9.5, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Fonts</div>
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ fontSize: 9.5, color: C.inkMute, marginBottom: 2 }}>Heading · {fname}</div>
            <div style={{ fontFamily: ffam, fontWeight: fw, fontStyle: fitalic ? 'italic' : 'normal', fontSize: 16, letterSpacing: '-0.01em' }}>Sarah Chen · Royal LePage</div>
          </div>
          <div style={{ fontSize: 10, color: C.inkSoft, lineHeight: 1.5 }}>Change it until it looks right. Every report picks it up.</div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 9.5, color: C.inkMute, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Concepts</div>
            <div style={{ fontSize: 10, color: C.red, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: b.gen }}><span style={{ width: 3, height: 12, background: C.red }} /> Generating…</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[0, 1, 2].map((v) => { const picked = v === 0 ? b.pick : 0; return (
              <div key={v} style={{ position: 'relative', aspectRatio: '1', background: C.card, border: `1px solid ${C.rule}`, borderRadius: R.ctrl, display: 'flex', alignItems: 'center', justifyContent: 'center', ...fade(b.concepts[v], 8), boxShadow: picked > 0 ? SH.raised : 'none' }}>
                <span style={{ position: 'absolute', inset: -2, borderRadius: R.ctrl + 2, border: `2px solid ${C.red}`, opacity: picked }} />
                <LogoMark size={44} color={SWATCHES[Math.round(b.swatch)]} variant={v} />
                <span style={{ position: 'absolute', right: 6, top: 6, fontSize: 8.5, fontWeight: 800, color: C.paper, background: C.red, padding: '1px 6px', borderRadius: R.pill, opacity: picked }}>Use</span>
              </div>
            ); })}
          </div>
          <div style={{ position: 'relative', height: 44, borderRadius: R.ctrl, overflow: 'hidden', ...fade(b.pick, 6) }}>
            <div style={{ position: 'absolute', inset: 0, background: SWATCHES[Math.round(b.swatch)] }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px', color: C.paper }}>
              <span style={{ display: 'inline-flex', transform: `scale(${0.5 + 0.5 * b.land}) rotate(${(1 - b.land) * -12}deg)`, opacity: b.land }}><LogoMark size={26} color={C.paper} paper={SWATCHES[Math.round(b.swatch)]} /></span>
              <div><div style={{ fontFamily: ffam, fontWeight: fw, fontStyle: fitalic ? 'italic' : 'normal', fontSize: 12 }}>Sarah Chen · Royal LePage</div><div style={{ fontSize: 9, opacity: 0.8 }}>Report masthead preview</div></div>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}
