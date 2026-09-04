// The landlord PDF is the /r/{token} page on paper: it builds from the sandbox payload, fits
// four applicants on one page and needs two from five, prints every name with its Fit and
// word, and carries none of the old layout's strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { demoSnapshot } = await import('../lib/demoReport.js');
const { buildLandlordReportPdf, reportLines } = await import('../lib/landlordReportPdf.js');
const { PDFDocument } = await import('pdf-lib');

const payload = demoSnapshot('demo-carlaw');
const withN = (n) => ({ ...payload, applicants: payload.applicants.slice(0, n), counts: { applicants: n, verified: payload.applicants.slice(0, n).filter((a) => a.fit?.label === 'verified').length } });
const flat = (lines) => [lines.header.name, lines.header.brokerage, lines.header.address, lines.header.unitLine, lines.header.prepared, ...lines.blocks.flatMap((b) => [b.rank, b.name, b.fit, b.word, b.sentence, b.confirmed, b.reason, ...b.numbers.flat()]), lines.footer.criteria, lines.footer.signature, lines.footer.sent].filter(Boolean).join('\n');

test('page count: one page for four applicants, two from five', async () => {
  assert.ok(payload.applicants.length >= 5, 'the sandbox listing has five applicants');
  const four = await PDFDocument.load(await buildLandlordReportPdf({ payload: withN(4) }));
  const five = await PDFDocument.load(await buildLandlordReportPdf({ payload: withN(5) }));
  assert.equal(four.getPageCount(), 1);
  assert.equal(five.getPageCount(), 2);
  const { width, height } = four.getPage(0).getSize(); assert.deepEqual([width, height], [612, 792], 'Letter');
});

test('every applicant prints with name, Fit and word; the old layout strings are gone', () => {
  const t = flat(reportLines(payload));
  for (const a of payload.applicants) { assert.match(t, new RegExp(`^${a.name}$`, 'm')); assert.match(t, new RegExp(`^${Number(a.fit.score).toFixed(1)}$`, 'm')); assert.match(t, new RegExp(`^${a.fit.label.toUpperCase()}$`, 'm')); }
  for (const banned of ['\n- ', 'Note:', 'RL-2026', 'Top', 'years with reference available', 'TOP MATCHES', 'ALSO RANKED', 'Powered by', 'Set aside', '/5']) assert.equal(t.includes(banned), false, `found ${JSON.stringify(banned)}`);
  assert.doesNotMatch(t, /[—–]/);
  assert.match(t, /^Ranked against Sarah Chen's criteria: min \$75k · max 40% rent share · 1 yr at job · landlord reference\.$/m);
  assert.match(t, /^Sent through Rentletter on behalf of Sarah Chen\.$/m);
  assert.match(t, /^Prepared .* for Marco Rossi$/m);
  assert.match(t, /^\$2,600 per month · 2 bed$/m);
});

test('the PDF embeds Inter and Fraunces and nothing else', async () => {
  const bytes = await buildLandlordReportPdf({ payload });
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /Inter/); assert.match(raw, /Fraunces/);
  assert.doesNotMatch(raw, /Helvetica/);
});
