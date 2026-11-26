// components/ReportBrand.js
// The realtor's brand at the top left of the landlord report (pages/r/[token].js): the logo, and
// beside it the name and the brokerage while they keep 200px; on a narrow phone they go under it.
// The realtor's Profile (components/dashboard/ProfileView.js) shows this same block as its live
// preview, so what the realtor sees there is what a landlord sees.
//   realtor   { name, brokerage, logoUrl }, the report payload's realtor (lib/reportSnapshot.js)
import { C } from './theme';

export default function ReportBrand({ realtor }) {
  return (
    <div data-report-brand="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
      {realtor.logoUrl ? <img src={realtor.logoUrl} className="rl-logo-plate" alt="" style={{ height: 40, width: 'auto', maxWidth: 140, objectFit: 'contain' }} /> : null}
      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: C.ink, overflowWrap: 'anywhere' }}>{realtor.name}</div>
        {realtor.brokerage ? <div style={{ fontSize: 'var(--t-body-2)', color: C.inkSoft, overflowWrap: 'anywhere' }}>{realtor.brokerage}</div> : null}
      </div>
    </div>
  );
}
