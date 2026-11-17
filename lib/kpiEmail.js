// lib/kpiEmail.js  PURE. The founder's daily email (pages/api/cron/kpi-email.js): the six numbers
// of the commitment and their targets, with a link to the office. Plain text and a simple HTML
// that fits a 320px screen: one column, width 100% up to a readable measure, no fixed width table.
import { sharePct } from './kpis.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The six rows: [label, value, target].
export function kpiRows(kpis) {
  const r = kpis.referralShare.mtd;
  return [
    ['Active realtors, this month', String(kpis.activeRealtors.mtd), String(kpis.activeRealtors.target)],
    ['Rentals closed, this month', String(kpis.rentalsClosed.mtd), String(kpis.rentalsClosed.target)],
    ['Streak, complete months', String(kpis.streak.months), String(kpis.streak.target)],
    [kpis.profileReuse.tracked ? 'Tenants who reused their profile' : `Tenants who ${kpis.profileReuse.label}`, String(kpis.profileReuse.count), String(kpis.profileReuse.target)],
    ['Referral share, this month', r.share == null ? `not known yet (${r.signups} signed up, first touch unknown)` : `${sharePct(r.share)} (${r.referral} of ${r.known})`, 'one third'],
    ['Days left', String(kpis.daysLeft), 'November 17, 2027'],
  ];
}

export function kpiEmail({ kpis, officeUrl }) {
  const rows = kpiRows(kpis);
  const subject = `Rentletter, day ${kpis.dayNumber} of 365`;
  const text = [
    `Day ${kpis.dayNumber} of 365.`, '',
    ...rows.map(([label, value, target]) => `${label}: ${value} (target ${target})`), '',
    `The office: ${officeUrl}`,
  ].join('\n');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"></head>`
    + `<body style="margin:0;padding:0;background:#faf8f3;color:#0f0f10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">`
    + `<div style="width:100%;max-width:100%;box-sizing:border-box;padding:24px 16px;">`
    + `<div style="max-width:480px;margin:0 auto;">`
    + `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;font-weight:700;">Day ${esc(kpis.dayNumber)} of 365.</p>`
    + rows.map(([label, value, target]) => `<div style="padding:12px 0;border-top:1px solid #e3ddd0;">`
      + `<div style="font-size:13px;line-height:1.4;color:#3a3a3c;">${esc(label)}</div>`
      + `<div style="font-size:22px;line-height:1.3;font-weight:700;overflow-wrap:anywhere;">${esc(value)}</div>`
      + `<div style="font-size:13px;line-height:1.4;color:#86868b;">Target ${esc(target)}</div></div>`).join('')
    + `<p style="margin:20px 0 0;font-size:16px;line-height:1.5;"><a href="${esc(officeUrl)}" style="color:#d72027;font-weight:700;">Open the office</a></p>`
    + `</div></div></body></html>`;
  return { subject, text, html };
}
