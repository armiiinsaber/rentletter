// components/dashboard/PipelineSoon.js
// The desktop dashboard's Pipeline section, under the listings (components/dashboard/HomeView.js,
// 1024px and wider): the same people as the Pipeline view (components/dashboard/PeopleList.js),
// the hold that ends soonest first (components/dashboard/homeData.js pipelineSoonest), the first
// five, each with the facts the Pipeline view shows on a closed row: the score, the date the hold
// lasts until, applied or invited, and the listing it was scored for. Open Pipeline goes to the
// full view, in place. The people come with the dashboard's signals; nothing is read here. With
// nobody in it, it is one quiet line under the cards, not a box, with the way to the view.
import { C } from '../theme';
import { StatusPills, Icon } from '../ui';
import { pipelineSoonest, pipelinePills, pipelinePlace, PIPELINE_SOON_LIMIT } from './homeData';

export default function PipelineSoon({ people = [], href, onOpen }) {
  const rows = pipelineSoonest(people);
  const shown = rows.slice(0, PIPELINE_SOON_LIMIT);
  const open = (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); if (onOpen) onOpen();
  };
  if (rows.length === 0) {
    return (
      <p className="ps-quiet" data-pipeline-soon="" data-pipeline-soon-empty="">
        <span>Nobody in your Pipeline yet.</span>{' '}
        <a href={href} onClick={open} className="ps-quiet-open" data-pipeline-open="">Open Pipeline</a>
        <style jsx>{`
          .ps-quiet { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--s-2); font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: var(--lh-body); }
          .ps-quiet-open { display: inline-flex; align-items: center; min-height: 44px; color: ${C.ink}; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
          .ps-quiet-open:focus-visible { outline: none; box-shadow: 0 0 0 2px ${C.ink}; border-radius: 4px; }
          @media (min-width: 1920px) { .ps-quiet { font-size: 15px; } }
        `}</style>
      </p>
    );
  }
  return (
    <section className="ps" aria-labelledby="ps-title" data-pipeline-soon="">
      <div className="ps-head">
        <h2 id="ps-title" className="ps-title">Pipeline</h2>
        <span className="ps-count" aria-label={`${rows.length} in Pipeline`}>{rows.length}</span>
        <a href={href} onClick={open} className="ds-btn ds-btn-quiet ps-open" data-pipeline-open="">
          Open Pipeline <span className="rl-arrow" style={{ display: 'inline-flex' }}><Icon name="arrow" size={15} /></span>
        </a>
      </div>
      <div className="ps-card">
        {(
          <ul className="ps-list">
            {shown.map((p) => (
              <li key={p.id} className="ps-item" data-pipeline-soon-item={p.id}>
                <span className={`ps-name${p.status === 'pending' ? ' ps-waiting' : ''}`}>{p.display}</span>
                <StatusPills label="Status" items={pipelinePills(p)} className="rl-pills-wrap" />
                {pipelinePlace(p) ? <span className="ps-place">{pipelinePlace(p)}</span> : null}
              </li>
            ))}
          </ul>
        )}
        {rows.length > PIPELINE_SOON_LIMIT ? <p className="ps-more">{`${rows.length - PIPELINE_SOON_LIMIT} more in Pipeline.`}</p> : null}
      </div>
      <style jsx>{`
        .ps-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-3); margin-bottom: var(--s-3); }
        .ps-title { font-family: var(--f-display); font-size: var(--t-d3); font-weight: 600; letter-spacing: -0.01em; line-height: var(--lh-display); color: ${C.ink}; margin: 0; }
        .ps-count { font-size: var(--t-body-2); font-weight: 700; color: ${C.inkMute}; font-variant-numeric: tabular-nums; }
        .ps-open { margin-left: auto; padding-right: var(--s-2); }
        .ps-card { background: ${C.card}; border-radius: 24px; overflow: hidden; box-shadow: 0 1px 2px rgba(15, 15, 16, 0.05), 0 10px 30px rgba(15, 15, 16, 0.06); }
        .ps-list { list-style: none; margin: 0; padding: 0; }
        /* A row: the name, the pills, the listing. They share one line while it holds them and wrap
           under each other when it does not; the name keeps a column of its own while it fits. */
        .ps-item { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-5); min-height: 64px; padding: var(--s-3) var(--s-4); border-top: 1px solid ${C.rule}; }
        .ps-item:first-child { border-top: none; }
        .ps-name { flex: 0 0 auto; min-width: 14em; font-size: var(--t-body); font-weight: 700; color: ${C.ink}; line-height: 1.35; white-space: nowrap; }
        .ps-waiting { color: ${C.inkMute}; }
        .ps-item :global(.rl-pills) { flex: 0 1 auto; min-width: 0; }
        .ps-place { flex: 1 1 14em; min-width: 0; font-size: var(--t-body-2); color: ${C.inkSoft}; line-height: 1.35; overflow-wrap: anywhere; text-wrap: balance; }
        .ps-empty, .ps-more { font-size: var(--t-body-2); color: ${C.inkMute}; line-height: var(--lh-body); margin: 0; padding: var(--s-4); text-wrap: balance; }
        .ps-more { border-top: 1px solid ${C.rule}; padding-top: var(--s-3); padding-bottom: var(--s-3); }
        @media (min-width: 1600px) { .ps-item { padding: var(--s-3) var(--s-5); } .ps-empty, .ps-more { padding-left: var(--s-5); padding-right: var(--s-5); } }
        @media (min-width: 1920px) {
          .ps-title { font-size: 20px; }
          .ps-item { min-height: 72px; }
          .ps-name { font-size: 17px; }
          .ps-place, .ps-empty, .ps-more { font-size: 15px; }
        }
      `}</style>
    </section>
  );
}
