// components/admin/partnerTiles.js  The words and numbers of the Lead Realtor Partner block in the
// founder office (components/admin/Commitment.js), as plain functions of what
// /api/admin/commitment answers (lib/kpiStore.js partnerSection). No markup here.
import { monthName } from '../../lib/kpis';

// The Lead Realtor Partner tiles (lib/kpis.js partnerKpis): the value is counted from the start
// date (KPI_PARTNER_START), or all time without one, with this month to date and the last
// complete month under it.
export const longDate = (day) => { const [y, m, d] = String(day).split('-'); return `${monthName(`${y}-${m}`)} ${Number(d)}, ${y}`; };
// The one line above the tiles that says where the counts begin.
export function partnerStartLine(p) {
  if (p.start) return `Counted from ${longDate(p.start)}, Toronto time.`;
  if (p.startSet && !p.startValid) return 'KPI_PARTNER_START is not a date (YYYY-MM-DD). These counts are all time.';
  return 'No start date is set (KPI_PARTNER_START). These counts are all time.';
}
export function partnerTiles(p) {
  const now = monthName(p.month); const last = monthName(p.lastMonth);
  const pairs = (r) => [[`${now} to date`, r.mtd], [last, r.last]];
  const r = p.rentals;
  const span = p.start ? 'since the start date' : 'all time';
  return [
    { key: 'partner', label: 'Closed by the partner', value: r.partner.toDate, note: `rentals, ${span}`, pairs: pairs(r.partner) },
    { key: 'invited', label: 'Closed by invited realtors', value: r.invited.toDate, note: `rentals, ${span}, one level only`, pairs: pairs(r.invited) },
    { key: 'total', label: 'Total', value: r.total.toDate, note: `rentals, ${span}`, pairs: pairs(r.total) },
    { key: 'others', label: 'From other realtors', value: r.others.toDate, note: 'of the total, not the partner’s own', pairs: pairs(r.others) },
    { key: 'active', label: 'Active invited realtors', value: p.activeInvited.count, note: `of ${p.invited} invited, with an application in each of ${p.activeInvited.months.map(monthName).join(', ').replace(/, ([^,]*)$/, ' and $1')}` },
  ];
}
