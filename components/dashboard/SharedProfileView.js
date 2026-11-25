// components/dashboard/SharedProfileView.js
// A tenant's shared profile as a realtor reads it: the photo and the name, the screening score a
// listing agent's share carries, the tenant's own words, their own offer, the facts with their
// dates, the facts read from documents, and the documents the share may open. Drawn from what the
// route answered and nothing else; it fetches nothing. Two places draw it:
//   components/dashboard/SharedProfile.js   the realtor's own view, on the applicant's card and in
//                                           Shared with you (intro: when it was shared; onOpen
//                                           opens a document through the realtor's route)
//   pages/my-application.js (Preview)       the tenant's own profile, as a realtor reads it once
//                                           it is shared: no documents and no onOpen, so nothing
//                                           here calls a realtor's route
// About me written in another language shows the English version the tenant approved, with their
// original under it (lib/aboutTranslation.js). Never the Fit score, a rank, a note or household
// size: the routes send none and this view has nowhere to draw one. Values read as the rest of
// the realtor side writes them: money as "$118,000" (lib/typeset.js money), a date as
// "Dec 1, 2026" (the format of components/dashboard/CompareTenants.js), time as "4 yrs".
import { C } from '../theme';
import { StackedLines } from '../ui';
import { noWidow, dateLong, money } from '../../lib/typeset';
import { checkText, KIND_LABEL } from '../../lib/tenantVaultRules';
import { prepayLine, PREPAY_LABEL } from '../../lib/profilePersonal';
import { translatedLabel, writtenLabel } from '../../lib/aboutTranslation';
import AboutText from '../AboutText';
import { Pending } from '../brand/Loader';

export const line = { fontSize: 'var(--t-body-2)', lineHeight: 'var(--lh-body)', color: C.inkSoft, textWrap: 'balance', margin: 0 };
const label = { fontSize: 'var(--t-eyebrow)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.inkMute, lineHeight: 1.2 };
const value = { fontSize: 'var(--t-body-2)', lineHeight: 1.4, color: C.ink, fontWeight: 600, overflowWrap: 'anywhere', textWrap: 'balance' };
const source = { fontSize: 13, lineHeight: 1.4, color: C.inkMute, textWrap: 'balance' };
export const button = { minHeight: 44, padding: '0 var(--gap-card)', background: 'transparent', color: C.ink, border: `1.5px solid ${C.ink}`, borderRadius: 'var(--btn-radius)', fontSize: 'var(--t-body-2)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const text = { ...button, minHeight: 44, padding: 0, border: 'none', textDecoration: 'underline', textAlign: 'left' };

// A date typed as 2026-12-01 is that calendar day, wherever the realtor is.
const shortDate = (v) => { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00` : v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); };
const years = (v) => { const n = Number(v); return String(v).trim() !== '' && Number.isFinite(n) ? `${n} ${n === 1 ? 'yr' : 'yrs'}` : String(v); };
// How one shared fact reads. Anything not listed is shown as typed.
export const readable = (key, v) => (
  key === 'annualIncome' ? (money(v) || String(v))
    : key === 'moveInDate' ? shortDate(v)
      : key === 'yearsAtJob' || key === 'yearsAtPrevious' ? years(v)
        : String(v ?? '')
);

// state: the read ({ facts, checks, documents, documentsUntil, photo, about, aboutEnglish,
// prepayMonths, screening }). intro: the line above it. onOpen(id): opens one document; busy: the
// key of the act in flight ('open:<id>').
export default function SharedProfileView({ state, intro, onOpen = null, busy = '' }) {
  const documents = state.documents || [];
  return (
    <>
      {intro}
      {/* A one page profile: the photo and the name, the tenant's own words, their own offer, then the facts with their dates and the document checks. */}
      <div data-shared-head="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-3)', minWidth: 0 }}>
        {state.photo ? <img data-shared-photo="" src={state.photo} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.rule}` }} /> : null}
        <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, lineHeight: 1.3, overflowWrap: 'anywhere', textWrap: 'balance' }}>{noWidow((state.facts.find((f) => f.key === 'fullName') || {}).value || 'Shared profile')}</div>
      </div>
      {/* A listing agent's share carries the screening score the application holds on that unit (lib/profileShares.js screeningForShare). */}
      {state.screening ? (
        <div data-shared-screening="" style={{ display: 'grid', gap: 2 }}>
          <div style={label}>Screening score</div>
          <div style={value}>{noWidow(`Fit ${Number(state.screening.score).toFixed(1)} out of 5${state.screening.label ? `, ${state.screening.label}` : ''}`)}</div>
          <p style={source}>{noWidow(`From their application${state.screening.listingName ? ` for ${state.screening.listingName}` : ''}${state.screening.assessed != null && state.screening.of != null ? `, on ${state.screening.assessed} of ${state.screening.of} assessed` : ''}.`)}</p>
        </div>
      ) : null}
      {/* Written in another language (db/026): the English version the tenant approved first, then
          their original under it; before they approve one, the original alone under the name of
          its language. Each paragraph reads in its own direction (components/AboutText.js). */}
      {state.about ? (
        <div data-shared-about={state.aboutEnglish && state.aboutEnglish.text ? 'translated' : 'original'} style={{ display: 'grid', gap: 2 }}>
          <div style={label}>About me, in the tenant’s words</div>
          {state.aboutEnglish && state.aboutEnglish.text ? (
            <>
              <AboutText data-shared-about-english="" text={state.aboutEnglish.text} style={line} />
              <p data-shared-about-label="" style={{ ...source, margin: 'var(--s-2) 0 0' }}>{noWidow(translatedLabel(state.aboutEnglish.language))}</p>
            </>
          ) : state.aboutEnglish && writtenLabel(state.aboutEnglish.language) ? <p data-shared-about-label="" style={{ ...source, margin: 0 }}>{noWidow(writtenLabel(state.aboutEnglish.language))}</p> : null}
          <AboutText data-shared-about-original="" text={state.about} style={line} />
        </div>
      ) : null}
      {prepayLine(state.prepayMonths) ? (
        <div data-shared-prepay="" style={{ display: 'grid', gap: 2 }}>
          <div style={label}>{PREPAY_LABEL}</div>
          <div style={value}>{noWidow(prepayLine(state.prepayMonths))}</div>
          <p style={source}>{noWidow('Their own offer. It cannot be required.')}</p>
        </div>
      ) : null}
      <ul data-shared-facts="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {state.facts.map((f, i) => (
          <li key={f.key} data-shared-fact={f.key} style={{ padding: 'var(--s-2) 0', borderTop: i ? `1px solid ${C.rule}` : 'none', display: 'grid', gap: 2 }}>
            <div style={label}>{f.label}</div>
            <div className={f.key === 'email' ? 'rl-addr' : undefined} style={value}>{f.key === 'email' ? f.value : <StackedLines text={readable(f.key, f.value)} />}</div>
            <div style={source}>{noWidow(f.line)}</div>
          </li>
        ))}
        {state.checks.map((c) => { const t = checkText(c); return (
          <li key={c.kind} data-shared-check={c.kind} style={{ padding: 'var(--s-2) 0', borderTop: `1px solid ${C.rule}`, display: 'grid', gap: 2 }}>
            <div style={label}>{t.label}</div>
            <div style={value}>{noWidow(t.value.replace('your name', 'the name on the profile'))}</div>
            <div style={source}>{noWidow(c.line)}</div>
          </li>
        ); })}
      </ul>
      {documents.length > 0 && onOpen && (
        <div data-shared-documents="" style={{ display: 'grid', gap: 2 }}>
          <div style={label}>Documents</div>
          <p style={source}>{noWidow(`You can open these until ${dateLong(state.documentsUntil)}. The tenant sees each open.`)}</p>
          {documents.map((d) => (
            <button key={d.id} type="button" data-shared-open={d.kind} onClick={() => onOpen(d.id)} disabled={!!busy} style={text}><Pending busy={busy === `open:${d.id}`} label="Opening">{`Open ${String(KIND_LABEL[d.kind] || 'document').toLowerCase()}`}</Pending></button>
          ))}
        </div>
      )}
    </>
  );
}
