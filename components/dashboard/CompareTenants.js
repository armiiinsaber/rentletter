// components/dashboard/CompareTenants.js
// A non-culling LENS on the ranked applicants: view 2-3 ACTIVE ranked tenants side by side
// across SCREENABLE categories only (never OHRC protected grounds). It changes nothing about
// ranking / set-aside / withdrawn — it just compares. Shared by the real dashboard and the
// demo so they match. Pure/presentational: it receives an already-normalized `pool` (the
// active ranked list, in rank order) and renders selection editing + comparison + category-
// leader highlighting. Desktop = side-by-side columns; mobile (<=640px) = stacked, fully
// labelled, no horizontal overflow.
import { useState } from 'react';
import { C, R } from '../theme';
import { DotLine } from '../ui';
import { noWidow } from '../../lib/typeset';
import { unitRulesApply, ruleLine } from '../../lib/unitRules';

// ── Normalization helpers (used by each page to build the `pool` items) ──
export const toNum = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
export const smokerLabel = (s) => (s ? ({ no: 'Non-smoker', outdoor: 'Outdoor only', yes: 'Smoker' }[s] || String(s)) : null);
// Best-effort, screenable: only surface an employment type the applicant themselves stated in
// their job title (e.g. "Designer (part-time)"). Never inferred from anything protected.
export function employmentTypeFromTitle(title) {
  const m = String(title || '').match(/\b(part[\s-]?time|full[\s-]?time|contract|seasonal|temporary|self[\s-]?employed|freelance)\b/i);
  if (!m) return null;
  const t = m[1].toLowerCase().replace(/[\s-]+/g, '-');
  return ({ 'part-time': 'Part time', 'full-time': 'Full time', contract: 'Contract', seasonal: 'Seasonal', temporary: 'Temporary', 'self-employed': 'Self employed', freelance: 'Freelance' }[t] || m[1]);
}

const money = (n) => `$${Number(n).toLocaleString()}`;
const yrs = (v) => `${v} yr${Number(v) === 1 ? '' : 's'}`;
const fmtDate = (v) => { const d = Date.parse(v); return Number.isNaN(d) ? String(v) : new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }); };
const firstName = (n) => String(n || 'Applicant').trim().split(/\s+/)[0];

// Categories (rows). SCREENABLE FACTS ONLY. `better` (high|low|early) flags the quantitative
// categories that get a category-leader highlight; rows without it are never highlighted.
const CATEGORIES = [
  { key: 'rank', label: 'Rank', kind: 'rank' },
  { key: 'overall', label: 'Overall grade', kind: 'grade' },
  { key: 'annualIncome', label: 'Income (before tax)', kind: 'num', better: 'high', fmt: money },
  { key: 'householdIncome', label: 'Household income (joint)', kind: 'num', better: 'high', fmt: money },
  { key: 'rentToIncome', label: 'Rent to income', kind: 'num', better: 'low', fmt: (v) => `${v}%` },
  { key: 'jobTenureYears', label: 'Job tenure', kind: 'num', better: 'high', fmt: yrs },
  { key: 'employer', label: 'Employer', kind: 'text' },
  { key: 'employmentType', label: 'Employment type', kind: 'text' },
  { key: 'yearsAtAddress', label: 'Years at address', kind: 'num', better: 'high', fmt: yrs },
  { key: 'currentRent', label: 'Current rent', kind: 'num', fmt: (v) => `${money(v)}/mo` },
  { key: 'references', label: 'References', kind: 'num', better: 'high', fmt: (v) => `${v} provided` },
  { key: 'moveInDate', label: 'Move in date', kind: 'date', fmt: fmtDate }, // no leader tick: an earlier date is not better
];
// Smoker and pets are unit rules, not a ranking (lib/unitRules.js): once under a "Unit rules" line at
// the bottom of the panel with no rank beside them, and not at all when the listing allows both.

function valueOf(cat, t) {
  if (cat.kind === 'rank') return `#${t.rank}`;
  if (cat.kind === 'grade') return t.overall != null ? `${Number(t.overall).toFixed(1)} / 5` : 'not set';
  const v = t[cat.key];
  if (v == null || v === '') return 'not set';
  return cat.fmt ? cat.fmt(v) : String(v);
}

// For each highlightable category, the set of leader ids (ties → all of them; <2 values
// present → no leader, so missing data is never falsely "best").
function computeLeaders(selected) {
  const leaders = {};
  for (const c of CATEGORIES) {
    if (!c.better) continue;
    const present = [];
    for (const t of selected) {
      let v = null;
      if (c.kind === 'date') { const d = Date.parse(t[c.key]); if (!Number.isNaN(d)) v = d; }
      else { const n = Number(t[c.key]); if (t[c.key] != null && t[c.key] !== '' && Number.isFinite(n)) v = n; }
      if (v != null) present.push({ id: t.id, v });
    }
    if (present.length < 2) continue;
    const best = (c.better === 'low' || c.better === 'early') ? Math.min(...present.map((p) => p.v)) : Math.max(...present.map((p) => p.v));
    leaders[c.key] = new Set(present.filter((p) => p.v === best).map((p) => p.id));
  }
  return leaders;
}

const selectStyle = { appearance: 'none', background: C.paper, border: `1px solid ${C.ruleDark}`, borderRadius: R.ctrl, color: C.ink, fontSize: 'var(--t-body)', fontWeight: 600, padding: '6px 26px 6px 10px', cursor: 'pointer', maxWidth: '100%' };

export default function CompareTenants({ pool, onClose, unitRules = null }) {
  const [selectedIds, setSelectedIds] = useState(() => pool.slice(0, 3).map((t) => t.id));
  const byId = (id) => pool.find((t) => t.id === id);
  const selected = selectedIds.map(byId).filter(Boolean);
  const available = pool.filter((t) => !selectedIds.includes(t.id));
  const leaders = computeLeaders(selected);

  const swapAt = (idx, newId) => setSelectedIds((ids) => ids.map((id, i) => (i === idx ? newId : id)));
  const removeAt = (idx) => setSelectedIds((ids) => (ids.length > 2 ? ids.filter((_, i) => i !== idx) : ids));
  const addId = (id) => setSelectedIds((ids) => (ids.length < 3 && !ids.includes(id) ? [...ids, id] : ids));

  const n = selected.length;
  // The leader mark is the red tick, the score language (no green status colour). It stays on the
  // line with the value's last two words, so it never wraps alone.
  const LeaderTick = () => <span aria-label="category leader" title="Best in this category" style={{ color: C.red, fontWeight: 800, marginLeft: 6 }}>✓</span>;
  const withTick = (text) => { const words = String(text).split(' '); const tail = words.splice(Math.max(0, words.length - 2)).join('\u00a0'); return <>{words.length ? `${words.join(' ')} ` : ''}<span style={{ whiteSpace: 'nowrap' }}>{tail}<LeaderTick /></span></>; };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 'clamp(16px,3.5vw,19px)', fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Compare tenants</div>
          <div style={{ fontSize: 'var(--t-body)', color: C.inkMute, marginTop: 2 }}>A side by side lens on screenable facts, your ranking is unchanged.</div>
        </div>
        <button onClick={onClose} className="rl-btn"
          style={{ background: 'transparent', color: C.inkSoft, border: `1px solid ${C.ruleDark}`, borderRadius: 'var(--btn-radius)', padding: '8px var(--gap-card)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ‹ Back to ranked list
        </button>
      </div>

      {/* Editing strip, swap any slot, remove (min 2), add (max 3) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 16px' }}>
        {selected.map((t, idx) => (
          <div key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', minWidth: 0, background: C.paperDeep, border: `1px solid ${C.rule}`, borderRadius: R.pill, padding: '0 0 0 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.inkMute }}>#{t.rank}</span>
            <select value={t.id} onChange={(e) => swapAt(idx, e.target.value)} aria-label={`Compared tenant ${idx + 1}`} style={{ ...selectStyle, background: 'transparent', border: 'none', padding: '0 4px', minHeight: 44, minWidth: 0, flex: '1 1 auto', textOverflow: 'ellipsis', fontWeight: 700 }}>
              {[t, ...available].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {n > 2 && (
              <button onClick={() => removeAt(idx)} aria-label={`Remove ${t.name}`}
                style={{ background: 'transparent', border: 'none', color: C.inkMute, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
            )}
          </div>
        ))}
        {n < 3 && available.length > 0 && (
          <select value="" onChange={(e) => e.target.value && addId(e.target.value)} aria-label="Add a tenant to compare" style={{ ...selectStyle, minHeight: 44 }}>
            <option value="">+ Add tenant…</option>
            {available.map((o) => <option key={o.id} value={o.id}>#{o.rank} {o.name}</option>)}
          </select>
        )}
      </div>

      {/* DESKTOP, side-by-side columns */}
      <div className="cmp-desktop">
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: R.card, overflow: 'hidden' }}>
          {/* header row */}
          <div style={{ display: 'grid', gridTemplateColumns: `minmax(130px,150px) repeat(${n}, minmax(0,1fr))`, background: C.paperDeep, borderBottom: `1px solid ${C.rule}` }}>
            <div style={{ padding: '11px 12px', fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Category</div>
            {selected.map((t) => (
              <div key={t.id} style={{ padding: '11px 12px', borderLeft: `1px solid ${C.rule}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, overflowWrap: 'anywhere' }}>{t.name}</div>
                <div style={{ fontSize: 10.5, color: C.inkMute, fontWeight: 700, marginTop: 1 }}>Ranked #{t.rank}</div>
              </div>
            ))}
          </div>
          {CATEGORIES.map((c, ri) => (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: `minmax(130px,150px) repeat(${n}, minmax(0,1fr))`, background: ri % 2 ? C.paper : C.card, borderBottom: ri === CATEGORIES.length - 1 ? 'none' : `1px solid ${C.rule}` }}>
              <div style={{ padding: '10px 12px', fontSize: 11.5, fontWeight: 600, color: C.inkMute }}>{c.label}</div>
              {selected.map((t) => {
                const lead = leaders[c.key]?.has(t.id);
                return (
                  <div key={t.id} style={{ padding: '10px 12px', borderLeft: `1px solid ${C.rule}`, background: 'transparent', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: lead ? 800 : 600, color: c.kind === 'rank' ? C.inkSoft : C.ink, overflowWrap: 'anywhere' }}>{valueOf(c, t)}</span>
                    {lead && <LeaderTick />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* PHONE · one card per category, one row per tenant: the name left, the value right on the
          same row (R3), so a value never breaks mid word in a narrow column. */}
      <div className="cmp-mobile">
        <div style={{ display: 'grid', gap: 'var(--s-2)' }}>
          {CATEGORIES.map((c) => (
            <div key={c.key} style={{ border: `1px solid ${C.rule}`, borderRadius: 'var(--card-radius)', padding: 'var(--s-3)', background: C.card }}>
              <div style={{ fontSize: 'var(--t-eyebrow)', fontWeight: 700, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 'var(--lh-body)' }}>{noWidow(c.label)}</div>
              {selected.map((t) => {
                const lead = leaders[c.key]?.has(t.id);
                const value = valueOf(c, t);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s-3)', marginTop: 'var(--s-1)' }}>
                    <span style={{ flexShrink: 0, fontSize: 'var(--t-body-2)', color: C.inkSoft }}><DotLine items={[firstName(t.name), `#${t.rank}`]} /></span>
                    <span style={{ minWidth: 0, textAlign: 'right', fontSize: 'var(--t-body)', fontWeight: lead ? 800 : 600, color: C.ink, lineHeight: 'var(--lh-body)' }}>{lead ? withTick(value) : noWidow(value)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {unitRulesApply(unitRules) && (
        <div style={{ marginTop: 14, border: `1px solid ${C.rule}`, borderRadius: R.card, padding: 12, background: C.card }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMute, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}><DotLine items={['Unit rules', ...String(ruleLine(unitRules)).split(' · ')]} /></div>
          <div style={{ display: 'grid', gap: 4 }}>
            {selected.map((t) => (
              <div key={t.id} style={{ fontSize: 'var(--t-body)', color: C.inkSoft, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                <DotLine items={[<><span style={{ fontWeight: 700, color: C.ink }}>{firstName(t.name)}</span>:{'\u00a0'}{t.smoker ? t.smoker.toLowerCase() : 'smoking not stated'}</>, t.pets ? `pets: ${t.pets}` : 'no pets stated']} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.inkMute, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: C.red, fontWeight: 800 }}>✓</span><span>{noWidow('marks the category leader on objective screenable facts only. Comparison never uses protected grounds.')}</span>
      </div>

      <style jsx>{`
        .cmp-desktop { display: block; }
        .cmp-mobile { display: none; }
        @media (max-width: 640px) {
          .cmp-desktop { display: none; }
          .cmp-mobile { display: block; }
        }
      `}</style>
    </div>
  );
}
