// components/dashboard/BoardSkeleton.js
// The shape of the Listings view while its data loads (components/dashboard/HomeView.js through
// components/brand/Loader.js Reveal, and the frame a tap shows first, components/nav/RouteLoader.js):
// the date line, the four tiles (two by two under 1024px), and three listing cards with their
// strips, in pale placeholders, so the page never stands blank. At 1280 and wider Needs you's column
// stands beside the cards. Decorative: one status line says it is loading. Still: nothing moves.
import { C } from '../theme';

const Bar = ({ w, h = 12, r = 999, style }) => <span className="bs-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;

export default function BoardSkeleton({ label }) {
  return (
    <div className="bs" data-board-skeleton="" data-screen-loading={label}>
      <p className="bs-sr" role="status">{label}</p>
      <div aria-hidden="true">
        <Bar w={176} h={14} style={{ marginBottom: 12 }} />
        <div className="bs-tiles">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`bs-tile${i === 0 ? ' bs-tile-dark' : ''}`}><Bar w="56%" /><Bar w={64} h={40} r={10} /><Bar w="44%" /></div>)}
        </div>
        <div className="bs-cols">
          <div className="bs-cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bs-card">
                <div className="bs-row"><div className="bs-id"><Bar w="62%" h={20} r={8} /><Bar w="34%" /></div><Bar w={140} h={44} /></div>
                <div className="bs-strip">{[0, 1, 2, 3, 4, 5].map((s) => <Bar key={s} w="100%" h={6} />)}</div>
                <Bar w="40%" />
              </div>
            ))}
          </div>
          <div className="bs-side"><Bar w="40%" h={18} r={8} />{[0, 1, 2].map((i) => <div key={i} className="bs-ny"><Bar w={40} h={40} /><div className="bs-id"><Bar w="80%" /><Bar w="50%" /></div></div>)}</div>
        </div>
      </div>
      <style jsx>{`
        .bs { padding-bottom: var(--s-6); }
        .bs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .bs :global(.bs-bar) { display: block; max-width: 100%; background: ${C.paperDeep}; }
        .bs-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); margin-bottom: var(--gap-section); }
        .bs-tile { display: flex; flex-direction: column; justify-content: space-between; gap: var(--s-3); min-height: 132px; padding: var(--s-4); border-radius: 24px; background: rgba(var(--c-card-rgb), 0.6); box-shadow: 0 0 0 1px rgba(var(--c-ink-rgb), 0.05); }
        .bs-tile-dark { background: rgba(var(--c-ink-rgb), 0.08); }
        .bs-cols { display: grid; gap: var(--s-4); }
        .bs-cards { display: grid; gap: var(--s-4); }
        .bs-card { display: grid; gap: var(--s-4); padding: var(--s-4); border-radius: 22px; background: ${C.card}; box-shadow: 0 1px 2px rgba(var(--c-shadow-rgb), 0.04), 0 10px 30px rgba(var(--c-shadow-rgb), 0.04); }
        .bs-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); }
        .bs-id { display: grid; gap: var(--s-2); flex: 1 1 auto; min-width: 0; }
        .bs-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
        .bs-side { display: none; }
        .bs-ny { display: flex; align-items: center; gap: var(--s-3); }
        @media (max-width: 1023.98px) { .bs-row :global(.bs-bar:last-child) { width: 44px !important; } }
        @media (min-width: 1024px) {
          .bs-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-4); }
          .bs-tile { min-height: 148px; padding: var(--s-5); }
          .bs-card { padding: var(--s-5); border-radius: 24px; }
        }
        @media (min-width: 1280px) {
          .bs-cols { grid-template-columns: minmax(0, 1fr) clamp(360px, calc(130px + 18vw), 420px); column-gap: var(--s-5); align-items: start; }
          .bs-side { display: grid; gap: var(--s-4); padding: var(--s-5) var(--s-4); border-radius: 28px; background: rgba(var(--c-card-rgb), 0.5); box-shadow: 0 0 0 1px rgba(var(--c-ink-rgb), 0.05); }
        }
      `}</style>
    </div>
  );
}
