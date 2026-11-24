// The kind of income never reaches a landlord (OHRC, BC Human Rights Code: a landlord may not
// decide on the source of a person's income). A party's facts name the kind beside the amount on
// the realtor's own card (lib/parties.js partyFacts) and nowhere a landlord reads:
//   the snapshot a send freezes (lib/reportSnapshot.js buildSnapshot) carries the amount alone;
//   the page's copy (forLandlordPage), the pasted text (lib/reportText.js) and the PDF
//   (lib/landlordReportPdf.js) are the same for every kind, apart from the amount;
//   a report frozen before this, which holds the kind in its income line, is shown without it and
//   the stored payload is not changed;
//   no file Fit is computed from names the kind, and Fit is the same for every kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const P = await import('../lib/parties.js');
const S = await import('../lib/application-state.js');
const { computeFit } = await import('../lib/fitScore.js');
const { buildSnapshot, forLandlordPage } = await import('../lib/reportSnapshot.js');
const { reportText } = await import('../lib/reportText.js');
const { reportLines, buildLandlordReportPdf } = await import('../lib/landlordReportPdf.js');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const textOf = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) out += `${(await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ')} `;
  return out.replace(/\s+/g, ' ');
};

// Every kind the table allows, no kind at all, and a value the table would refuse: whatever is
// stored, nothing of it is printed.
const KINDS = [...S.INCOME_KINDS, null, 'assistance'];
const KIND_WORDS = /\((Employment|Self employment|Other|employment|self_employed|other|assistance)\)|incomeKind|incomeSources|income_sources|self_employed/;
const NOW = new Date('2026-11-24T12:00:00Z');
const application = { id: 'A1', full_name: 'Test Person', annual_income: 85000, employer: 'Northwind', job_title: 'Analyst', years_at_job: '3', prev_landlord_name: 'A. Patel', years_at_previous: '4', references: [{ name: 'R' }] };
const listing = { id: 'L1', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, pref_requires_employer_verification: true };
const profile = { id: 'P1', full_name: 'Sarah Chen' };
const partyOf = (role, kind, amount) => ({ id: `${role}-1`, role, roleLabel: P.ROLE_LABEL[role], name: role === 'guarantor' ? 'Pat Guarantor' : 'Jordan Lee', status: 'submitted', statusLabel: 'Submitted', employer: 'Acme', jobTitle: 'Clerk', yearsAtJob: '2', annualIncome: amount, incomeKind: kind, incomeSources: kind ? [{ kind, amount, payer: 'Acme' }] : [], docVerifications: [] });
const snapshotFor = (kind, amount = 200000) => {
  const parties = [partyOf('co_applicant', kind, amount), partyOf('guarantor', kind, amount)];
  const fit = computeFit({ application: { ...application, parties }, listing, verification: null, confirmations: {} });
  return buildSnapshot({ listing, profile, now: NOW, applicants: [{ linkId: 'J1', decisionStatus: 'none', confirmations: {}, docVerifications: [], parties, application: { ...application, fit } }] });
};
const outputs = async (payload) => ({
  snapshot: JSON.stringify(payload),
  page: JSON.stringify(forLandlordPage(payload)),
  text: reportText(payload, { pageUrl: 'https://rentletter.ca/r/x' }),
  pdfLines: JSON.stringify(reportLines(payload)),
  pdf: await textOf(await buildLandlordReportPdf({ payload })),
});

test('the files Fit is computed from, and every file they import, name no kind of income and read no party', () => {
  const seen = new Set(); const queue = ['lib/fitScore.js', 'lib/deriveScorecard.js'];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = src(file);
    assert.doesNotMatch(text, /INCOME_KINDS?|INCOME_KIND_LABEL|income_?source_?kind|incomeKind|income_kind/i, `${file}: no kind of income`);
    assert.doesNotMatch(text, /income_sources?\b|incomeSources\b|from\('income/, `${file}: no income_sources`);
    assert.doesNotMatch(text, /from '\.\/(parties|partyStore|application-state)(\.js)?'/, `${file}: imports no party module`);
    for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) { const next = join(dirname(file), m[1]); queue.push(/\.js$/.test(next) ? next : `${next}.js`); }
  }
  assert.ok(seen.has('lib/fitScore.js') && seen.has('lib/deriveScorecard.js') && seen.size > 2, [...seen].join(', '));
});

test('Fit is the same whatever the kind of income of the people on the application', () => {
  const base = JSON.stringify(computeFit({ application, listing, verification: null, confirmations: {} }));
  for (const kind of KINDS) {
    const fit = computeFit({ application: { ...application, parties: [partyOf('co_applicant', kind, 200000), partyOf('guarantor', kind, 200000)] }, listing, verification: null, confirmations: {} });
    assert.equal(JSON.stringify(fit), base, `kind ${kind}`);
  }
});

test('a new snapshot carries the amount and never the kind, and the realtor\'s own card keeps the kind', () => {
  for (const kind of KINDS) {
    const p = snapshotFor(kind);
    for (const party of p.applicants[0].parties) {
      assert.deepEqual(Object.keys(party).sort(), ['facts', 'name', 'role', 'roleLabel', 'status', 'statusLabel'], 'the six fields of a party, no other');
      assert.deepEqual(party.facts, ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year', 'Income stated'], `kind ${kind}`);
    }
    assert.doesNotMatch(JSON.stringify(p), KIND_WORDS, `kind ${kind}: nothing of it in the snapshot`);
  }
  // The realtor's card and checklist (components/dashboard/ListingView.js, ScreeningChecklist.js) read partyFacts, unchanged.
  assert.deepEqual(P.partyFacts(partyOf('guarantor', 'employment', 200000), {}), ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year (Employment)', 'Income stated']);
  assert.deepEqual(P.partyFacts(partyOf('guarantor', 'self_employed', 200000), {}), ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year (Self employment)', 'Income stated']);
  assert.deepEqual(P.partyFacts(partyOf('guarantor', 'other', 200000), {}), ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year (Other)', 'Income stated']);
  assert.match(src('components/dashboard/ListingView.js'), /import \{ partyFacts, INVITE_CARD \} from '\.\.\/\.\.\/lib\/parties'/);
  assert.match(src('components/dashboard/ScreeningChecklist.js'), /partyFacts\(p, conf\)/);
  assert.doesNotMatch(src('lib/reportSnapshot.js'), /\bpartyFacts\b/, 'the snapshot is built from landlordPartyFacts alone');
});

test('every landlord output is identical for every kind of income, apart from the amount', async () => {
  const base = await outputs(snapshotFor('employment'));
  for (const [name, out] of Object.entries(base)) { assert.doesNotMatch(out, KIND_WORDS, `${name}: no kind`); assert.match(out, /\$200,000 a year/, `${name}: the amount stays`); }
  for (const kind of KINDS) {
    const same = await outputs(snapshotFor(kind));
    for (const name of Object.keys(base)) assert.equal(same[name], base[name], `${name}: kind ${kind} reads as employment does`);
    // Another amount: the outputs differ by the amount and by nothing else.
    const other = await outputs(snapshotFor(kind, 64000));
    for (const name of Object.keys(base)) {
      assert.notEqual(other[name], base[name], `${name}: the amount is printed`);
      assert.equal(other[name].replaceAll('$64,000', '$200,000'), base[name], `${name}: kind ${kind}, only the amount differs`);
    }
  }
});

test('a report frozen with the kind in its income line is shown without it, and the stored payload is not changed', async () => {
  const fresh = snapshotFor('employment');
  const labels = ['Employment', 'Self employment', 'Other', 'assistance'];
  for (const label of labels) {
    // What a snapshot sent before this froze: the income line with the kind after the amount.
    const frozen = JSON.parse(JSON.stringify(fresh));
    for (const party of frozen.applicants[0].parties) party.facts = party.facts.map((line) => (/^Income \$/.test(line) ? `${line} (${label})` : line));
    const stored = JSON.stringify(frozen);
    assert.match(stored, new RegExp(`Income \\$200,000 a year \\(${label}\\)`), 'the stored payload holds the kind');
    const shown = await outputs(frozen);
    const now = await outputs(fresh);
    for (const name of ['page', 'text', 'pdfLines', 'pdf']) {
      assert.doesNotMatch(shown[name], KIND_WORDS, `${name}: (${label}) is left out`);
      assert.equal(shown[name], now[name], `${name}: an old report reads as a new one does`);
    }
    assert.equal(JSON.stringify(frozen), stored, 'showing it changed nothing in the stored payload');
  }
  // Only the brackets after the amount go: every other line comes back as it is.
  for (const line of ['Acme, Clerk', '2 yrs at job', 'Income $200,000 a year', 'Income stated', 'Income docs match', 'Employer confirmed', 'Acme (Canada), Clerk']) assert.equal(P.withoutIncomeKind(line), line);
  assert.equal(P.withoutIncomeKind('Income $1,250,000 a year (Other)'), 'Income $1,250,000 a year');
  assert.deepEqual(P.landlordFacts(null), []);
});

test('the landlord page, the PDF route and the text route show a payload only through those three', () => {
  const page = src('pages/r/[token].js');
  const props = [...page.matchAll(/\bpayload: ([^,}]+)/g)].map((m) => m[1].trim()).filter((v) => v !== 'null');
  assert.ok(props.length >= 2, 'the sandbox report and a sent report');
  for (const v of props) assert.match(v, /^forLandlordPage\(/, `the page receives ${v}`);
  assert.match(src('lib/landlordReportPdf.js'), /const facts = landlordFacts\(p\.facts\)/);
  assert.match(src('lib/reportText.js'), /const facts = landlordFacts\(p\.facts\)/);
  for (const file of ['pages/r/[token].js', 'lib/reportSnapshot.js', 'lib/reportText.js', 'lib/landlordReportPdf.js', 'lib/reportSentence.js']) assert.doesNotMatch(src(file), /INCOME_KIND|incomeKind|incomeSources|employmentType|employment_type|incomeFigure/, `${file} reads no kind of income`);
});
