// components/admin/Commitment.js
// The Commitment section: first thing in the founder office (pages/admin.js). The trigger
// sentence, six tiles, one chart and a small preview of the poster (pages/admin/commitment.js).
// Every number is counted (lib/kpis.js, through /api/admin/commitment), never typed. The tiles are
// counted when the page loads; the chart reads the daily snapshots (public.kpi_daily, db/013) and,
// before that table exists, says so instead of drawing. The office's own type, colours and
// classes (components/admin/AdminShell.js .ad-*): no new font, no colour outside the instrument
// tokens. Every block of text holds one line or wraps balanced at 390 and 320.
import { useEffect, useState } from 'react';
import { C, R, FONT } from '../theme';
import { adminFetch } from './adminFetch';
import Loader from '../brand/Loader';
import { TRIGGER_SENTENCE, TARGETS, monthName, monthShort, sharePct } from '../../lib/kpis';

const nb = (s) => String(s).replace(/ /g, ' ');

// The six tiles: [label, value, target line, this month, last month]. A pair is [label, value].
export function tiles(k) {
  const now = monthName(k.month); const last = monthName(k.lastMonth);
  const share = k.referralShare;
  return [
    { key: 'realtors', label: 'Active realtors', value: k.activeRealtors.mtd, target: `Target ${k.activeRealtors.target}`, pairs: [[`${now} to date`, k.activeRealtors.mtd], [last, k.activeRealtors.last]], met: k.activeRealtors.mtd >= k.activeRealtors.target },
    { key: 'rentals', label: 'Rentals closed', value: k.rentalsClosed.mtd, target: `Target ${k.rentalsClosed.target}`, pairs: [[`${now} to date`, k.rentalsClosed.mtd], [last, k.rentalsClosed.last]], met: k.rentalsClosed.mtd >= k.rentalsClosed.target },
    { key: 'streak', label: 'Streak', value: k.streak.months, unit: k.streak.months === 1 ? 'month' : 'months', target: `Target ${k.streak.target} months`, pairs: [[now, 'in progress'], [last, k.streak.months > 0 ? 'met' : 'not met']], met: k.streak.months >= k.streak.target },
    { key: 'reuse', label: 'Profile reuse', value: k.profileReuse.count, target: `Target ${k.profileReuse.target}`, note: k.profileReuse.tracked ? 'tenants, all time' : k.profileReuse.label, pairs: k.profileReuse.tracked ? [['With documents', k.profileReuse.withDocuments ?? 0]] : undefined, met: k.profileReuse.count >= k.profileReuse.target },
    { key: 'referral', label: 'Referral share', value: sharePct(share.mtd.share), target: 'Target one third', pairs: [[`${now} to date`, share.mtd.known ? `${share.mtd.referral} of ${share.mtd.known}` : '—'], [last, sharePct(share.last.share)]], met: share.mtd.share != null && share.mtd.share >= TARGETS.referralShare },
    { key: 'days', label: 'Days left', value: k.daysLeft, plain: true },
  ];
}

// The chart: two lines over twelve months, each against its own dashed target. Drawn in a unit
// square stretched to the box (strokes keep their width), with every label in HTML beside it, so
// the type stays the office's size at any width. A month with no snapshot is a gap, not a zero.
const SERIES = [
  { key: 'activeRealtors', name: 'Active realtors', target: TARGETS.activeRealtors, color: C.instText },
  { key: 'rentalsClosed', name: 'Rentals closed', target: TARGETS.rentalsClosed, color: C.redBright },
];
function Chart({ series }) {
  const top = Math.max(60, ...series.flatMap((p) => [p.activeRealtors || 0, p.rentalsClosed || 0])) * 1.1;
  const x = (i) => ((i + 0.5) / series.length) * 100;
  const y = (v) => 100 - (v / top) * 100;
  const runs = (key) => { const out = []; let run = []; series.forEach((p, i) => { if (p[key] == null) { if (run.length) out.push(run); run = []; } else run.push([x(i), y(p[key])]); }); if (run.length) out.push(run); return out; };
  const summary = series.filter((p) => p.activeRealtors != null).map((p) => `${monthName(p.month)}: ${p.activeRealtors} active realtors, ${p.rentalsClosed} rentals closed`).join('. ');
  return (
    <div className="cm-chart">
      <div className="cm-legend">
        {SERIES.map((s) => <span key={s.key} className="cm-key"><span className="cm-swatch" style={{ background: s.color }} aria-hidden="true" />{nb(`${s.name}, target ${s.target}`)}</span>)}
      </div>
      <div className="cm-plot">
        <div className="cm-axis" aria-hidden="true">
          {SERIES.map((s) => <span key={s.key} className="cm-tick ad-num" style={{ top: `${y(s.target)}%`, color: s.color }}>{s.target}</span>)}
          <span className="cm-tick ad-num" style={{ top: '100%' }}>0</span>
        </div>
        <div className="cm-area"><svg className="cm-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={summary ? `The last 12 months. ${summary}.` : 'The last 12 months: no snapshot yet.'}>
          <line x1="0" x2="100" y1="100" y2="100" stroke={C.instRule} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {SERIES.map((s) => <line key={`t-${s.key}`} x1="0" x2="100" y1={y(s.target)} y2={y(s.target)} stroke={s.color} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
          {SERIES.map((s) => runs(s.key).map((run, i) => <polyline key={`l-${s.key}-${i}`} points={run.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />))}
          {SERIES.map((s) => series.map((p, i) => (p[s.key] == null ? null : <line key={`d-${s.key}-${i}`} x1={x(i)} x2={x(i)} y1={y(p[s.key])} y2={y(p[s.key])} stroke={s.color} strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)))}
        </svg></div>
      </div>
      <div className="cm-months" aria-hidden="true">
        {series.map((p) => <span key={p.month} className="cm-month"><span className="cm-month-long">{monthShort(p.month)}</span><span className="cm-month-short">{monthShort(p.month).slice(0, 1)}</span></span>)}
      </div>
    </div>
  );
}

// The poster in miniature: the sheet, its two rules and the four numbers, as a drawing. The words
// are bars; the real ones are on the poster this opens.
function PosterPreview() {
  const bar = (x, yy, w, h = 5, fill = '#cfcfcf') => <rect x={x} y={yy} width={w} height={h} rx="1" fill={fill} />;
  const cell = (n, cx, cy) => <g key={n}><text x={cx} y={cy} fontFamily={FONT.sans} fontWeight="800" fontSize="34" fill="#c8321e" letterSpacing="-1.5">{n}</text>{bar(cx, cy + 8, 62, 4)}</g>;
  return (
    <a className="cm-poster" href="/admin/commitment" aria-label="Open the commitment poster">
      <svg viewBox="0 0 204 264" width="102" height="132" aria-hidden="true">
        <rect x="0.5" y="0.5" width="203" height="263" fill="#ffffff" stroke={C.instRule} />
        {bar(18, 19, 44, 4, '#111111')}{bar(128, 19, 58, 4, '#8a8a8a')}
        <rect x="18" y="30" width="168" height="1.5" fill="#111111" />
        {bar(18, 46, 104, 6, '#8a8a8a')}
        {cell('30', 18, 92)}{cell('50', 108, 92)}{cell('100', 18, 144)}{cell('1/3', 108, 144)}
        {bar(18, 172, 150, 11, '#111111')}{bar(18, 190, 132, 4)}
        <rect x="18" y="226" width="168" height="0.75" fill="#111111" />
        {bar(18, 234, 88, 5, '#8a8a8a')}{bar(18, 243, 60, 5, '#8a8a8a')}
        <rect x="132" y="240" width="54" height="0.75" fill="#111111" />
      </svg>
      <span className="cm-poster-t">
        <span className="cm-poster-h">The poster</span>
        <span className="ad-quiet">One Letter page, ready to print.</span>
        <span className="ad-link" style={{ minHeight: 0 }}>Open the poster</span>
      </span>
    </a>
  );
}

export default function Commitment() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = async () => {
    setErr('');
    const { r, j } = await adminFetch('/api/admin/commitment');
    if (!r || !r.ok) { if (!r || r.status !== 401) setErr(j.error || 'The commitment could not be counted.'); return; }
    setData(j);
  };
  useEffect(() => { load(); }, []);
  const k = data?.kpis;
  return (
    <section className="cm" aria-label="Commitment" data-commitment="">
      <div className="ad-eyebrow">Commitment</div>
      <p className="cm-trigger">{TRIGGER_SENTENCE}</p>
      {err && <div role="alert" className="ad-alert" style={{ marginBottom: 14 }}><span>{err}</span><button type="button" className="ad-btn secondary sm" onClick={load}>Try again</button></div>}
      {!k && !err && <div className="ad-quiet" style={{ marginBottom: 14 }}><Loader label="Counting the commitment" tone="ink" /></div>}
      {k && (
        <div className="cm-tiles">
          {tiles(k).map((t) => (
            <div className="cm-tile" key={t.key} data-tile={t.key}>
              <div className="cm-tile-l">{nb(t.label)}</div>
              <div className="cm-tile-v ad-num"><span>{t.value}</span>{t.unit ? <>{' '}<span className="cm-tile-u">{t.unit}</span></> : null}</div>
              {!t.plain && <div className="cm-tile-t">{nb(t.target)}</div>}
              {t.note && <div className="cm-tile-n">{t.note}</div>}
              {t.pairs && (
                <div className="cm-pairs">
                  {t.pairs.map(([label, value]) => <div className="cm-pair" key={label}><span className="cm-pair-l">{nb(label)}</span><span className="cm-pair-v ad-num">{nb(value)}</span></div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="cm-lower">
        <div className="ad-card cm-card">
          <div className="cm-card-h">The last 12 months</div>
          {data?.history?.series ? <Chart series={data.history.series} /> : null}
          {data && !data.history?.exists && <p className="ad-quiet cm-note">The numbers above are counted live. The history starts once the kpi_daily table exists (db/013).</p>}
          {data?.history?.exists && data.history.days === 0 && <p className="ad-quiet cm-note">No snapshot yet. The first one is written at 6 in the morning, Toronto time.</p>}
        </div>
        <div className="ad-card cm-card"><PosterPreview /></div>
      </div>
      <style jsx global>{`
        .cm { margin-bottom: 34px; padding-bottom: 30px; border-bottom: 1px solid ${C.instRule}; }
        .cm-trigger { font-family: ${FONT.serif}; font-weight: 500; font-size: clamp(19px, 2.5vw, 27px); line-height: 1.3; letter-spacing: -0.015em; color: ${C.instText}; margin: 0 0 20px; max-width: 980px; text-wrap: balance; }
        .cm-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
        @media (max-width: 899px) { .cm-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 599px) { .cm-tiles { grid-template-columns: minmax(0, 1fr); } }
        .cm-tile { background: ${C.instRaise}; border: 1px solid ${C.instRule}; border-radius: ${R.card}px; padding: 14px 16px; min-width: 0; }
        .cm-tile-l { font-size: 10.5px; color: ${C.instMute}; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
        .cm-tile-v { display: flex; align-items: baseline; gap: 7px; font-size: clamp(30px, 5vw, 40px); font-weight: 800; color: ${C.instText}; letter-spacing: -0.02em; line-height: 1; }
        .cm-tile-u { font-size: 14px; font-weight: 600; letter-spacing: 0; color: ${C.instMute}; }
        .cm-tile-t { font-size: 13px; color: ${C.instMute}; margin-top: 6px; }
        .cm-tile-n { font-size: 12.5px; color: ${C.instMute}; margin-top: 10px; padding-top: 10px; border-top: 1px solid ${C.instRule}; line-height: 1.45; text-wrap: balance; }
        .cm-pairs { margin-top: 10px; padding-top: 10px; border-top: 1px solid ${C.instRule}; display: grid; gap: 4px; }
        .cm-pair { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 12.5px; }
        .cm-pair-l { color: ${C.instMute}; }
        .cm-pair-v { color: ${C.instText}; font-weight: 700; }
        .cm-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 8px; align-items: stretch; }
        @media (max-width: 899px) { .cm-lower { grid-template-columns: minmax(0, 1fr); } }
        .cm-card { padding: 14px 16px; }
        .cm-card-h { font-size: 10.5px; color: ${C.instMute}; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
        .cm-note { margin: 0; max-width: 520px; text-wrap: balance; }
        .cm-chart + .cm-note { margin-top: 12px; }
        .cm-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 12px; }
        .cm-key { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: ${C.instText}; }
        .cm-swatch { width: 14px; height: 2px; border-radius: 1px; flex-shrink: 0; }
        .cm-plot { display: grid; grid-template-columns: 22px minmax(0, 1fr); grid-template-rows: 180px; margin-top: 6px; }
        .cm-axis { position: relative; }
        .cm-tick { position: absolute; right: 6px; transform: translateY(-50%); font-size: 10.5px; color: ${C.instMute}; line-height: 1; }
        .cm-area { position: relative; min-width: 0; }
        .cm-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
        .cm-months { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 8px 0 0 22px; }
        .cm-month { font-size: 10.5px; color: ${C.instMute}; text-align: center; }
        .cm-month-short { display: none; }
        @media (max-width: 479px) { .cm-month-long { display: none; } .cm-month-short { display: inline; } }
        .cm-poster { display: flex; align-items: center; gap: 16px; text-decoration: none; color: inherit; min-height: 132px; }
        .cm-poster svg { flex-shrink: 0; border-radius: 2px; }
        .cm-poster-t { display: grid; gap: 4px; min-width: 0; }
        .cm-poster-h { font-size: 15px; font-weight: 700; color: ${C.instText}; }
      `}</style>
    </section>
  );
}
