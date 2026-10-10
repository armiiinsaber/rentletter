// The forbidden inputs (docs/fit-v2.md): no file whose name says fit, score or scorecard may read
// citizenship, nationality, place of origin, time in Canada, an arrival date, age, a date of
// birth, family or marital status, the number of occupants, the kind of income, years at the job,
// student status, the absence of a credit history, any credit report field, or any party's income.
// Comments are stripped before the scan, so the rule can be written down where it is enforced.
// The income kind scan in tests/applicationState.test.mjs stays beside this one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const walk = (dir, out = []) => { for (const f of readdirSync(new URL(dir, ROOT))) { const rel = `${dir}${f}`; if (/node_modules|^\.next/.test(rel)) continue; if (statSync(new URL(rel, ROOT)).isDirectory()) walk(`${rel}/`, out); else if (/\.(js|mjs)$/.test(f)) out.push(rel); } return out; };
const FILES = ['lib/', 'components/', 'pages/', 'scripts/'].flatMap((d) => walk(d)).filter((p) => /fit|score|scorecard/i.test(p.split('/').pop()));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FORBIDDEN = [
  ['citizenship', /citizen/i], ['nationality', /nationalit/i], ['place of origin', /\borigin\b|place_of_origin|placeOfOrigin|ethnic/i],
  ['time in Canada', /in_?canada|inCanada|time_in|timeIn|newcomer|immigra/i], ['arrival date', /arriv/i],
  ['age', /\bages?\b|\bage_|Age\b/], ['date of birth', /birth|\bdob\b|date_of_birth|dateOfBirth/i],
  ['family status', /famil|children|\bkids?\b|dependant|dependent/i], ['marital status', /marital|married|spouse|partner/i],
  ['number of occupants', /occupant|household/i], ['income source type', /income_?source_?kind|incomeKind|income_kind|INCOME_KIND|employment_type|employmentType|self.?employed|\bpension\b|benefit|assistance|\bODSP\b|\bOW\b/i],
  ['years at job', /years_at_job|yearsAtJob|job_tenure|jobTenure|tenure|min_years/i], ['student status', /student|enrol/i],
  ['absence of credit history', /credit_?history|creditHistory|no_?credit|noCredit|thin_?file/i], ['credit report field', /credit(?!Kind\b|Shared\.js)/i],
  ['a party\'s income', /co_?applicant|coIncome|parties|party|guarantor|income_sources|application_parties|joint/i],
  ['an income floor', /pref_min_annual_income|min_?annual_?income|minAnnualIncome|minimum income|minIncome|income_below_min|effectiveMinIncome|derivedMinIncome/i],
];

test('the files the scan covers are the Fit files', () => {
  assert.ok(FILES.includes('lib/fitScore.js') && FILES.includes('lib/deriveScorecard.js'), FILES.join(', '));
  console.log(`  scanned: ${FILES.join(', ')}`);
});

for (const file of FILES) {
  test(`${file} reads no forbidden input`, () => {
    const text = stripComments(readFileSync(new URL(file, ROOT), 'utf8'))
      // the one allowed appearance of the word credit: the filter that keeps a shared credit report OUT of the evidence
      .replace(/import \{ isCreditKind \} from '\.\/creditShared\.js';/, '').replace(/!isCreditKind\(d\)/g, '');
    for (const [name, re] of FORBIDDEN) {
      const m = text.match(re);
      assert.equal(m, null, `${file} reads ${name}: "${m && m[0]}" at ${m && text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}`);
    }
  });
}

test('no component, page or lib file names the income floor at all', () => {
  const all = ['lib/', 'components/', 'pages/'].flatMap((d) => walk(d));
  const hits = [];
  for (const file of all) { const text = readFileSync(new URL(file, ROOT), 'utf8'); const m = text.match(/pref_min_annual_income|min(?:imum)?\.?[\s_]*(?:annual[\s_]*)?income|minAnnualIncome/i); if (m) hits.push(`${file}: ${m[0]}`); }
  assert.deepEqual(hits, []);
  assert.ok(all.length > 100, `${all.length} files scanned`);
});

// The film and the mockups depict the product to realtors and landlords. A rent to income cutoff is
// illegal outside subsidized housing (OHRC Policy on Human Rights and Rental Housing) and income is
// never the sole reason to refuse (Ontario Regulation 290/98), so no depiction states one: no rent
// share, no rent to income, no percentage of income or rent, no threshold a percentage clears.
test('the film and the mockups state no income cutoff: no rent share, no percentage of income', () => {
  const files = ['components/film/', 'components/mockups/'].flatMap((d) => walk(d));
  const CUTOFF = [
    /rent share/i,
    /rent[\s-]*to[\s-]*income/i, // words a reader sees; the rent_to_income_ratio column a prototype passes to lib is data
    /\d{1,3}\s?%\s*(?:of\s+)?(?:(?:gross|net|monthly|annual|household|the)\s+)?(?:income|rent|salary|pay)\b/i,
    /\b(?:income|salary|pay)\b[^'"`\n]{0,40}\d{1,3}\s?%/i,
    /\b(?:under|below|over|above|max(?:imum)?|min(?:imum)?|at most|at least|less than|more than|clears?|meets?|within)\s+\d{1,3}\s?%/i,
    /\d+(?:\.\d+)?\s?[x\u00d7]\s+(?:the\s+)?rent/i,
  ];
  const hits = [];
  for (const file of files) readFileSync(new URL(file, ROOT), 'utf8').split('\n').forEach((line, i) => { for (const re of CUTOFF) { const m = line.match(re); if (m) hits.push(`${file}:${i + 1} "${m[0]}"`); } });
  assert.deepEqual(hits, []);
  assert.ok(files.includes('components/film/beats.js') && files.includes('components/mockups/scenes.js') && files.includes('components/mockups/HeroDemo.js'));
});

// Being new to a city or to Canada is a place of origin proxy under the OHRC, and a first tenancy
// is an absence of history; neither may ever count against anyone, so no user facing string in
// components, pages or lib names them. Comments are stripped first: the code may explain the rule.
test('no user facing string names a newcomer or a first tenancy', () => {
  const files = ['components/', 'pages/', 'lib/'].flatMap((d) => walk(d));
  const NEWCOMER = /new to (?:the )?city|new to canada|newcomers?|recently (?:arrived|moved)|first[\s-]?time renters?|no canadian/i;
  const hits = [];
  for (const file of files) stripComments(readFileSync(new URL(file, ROOT), 'utf8')).split('\n').forEach((line, i) => { const m = line.match(NEWCOMER); if (m) hits.push(`${file}:${i + 1} "${m[0]}"`); });
  assert.deepEqual(hits, []);
  for (const s of ['New to the city', 'new to Canada', 'Newcomer', 'recently arrived', 'Recently moved', 'first-time renter', 'First time renters', 'No Canadian credit']) assert.match(s, NEWCOMER, s);
  assert.ok(files.length > 300, `${files.length} files scanned`);
});

// Income that "clears" something states a threshold was passed: an income cutoff by another name.
// No user facing string in components, pages or lib puts the two words together.
test('no user facing string says income clears anything', () => {
  const files = ['components/', 'pages/', 'lib/'].flatMap((d) => walk(d));
  const CLEARS = /\bincome\b[^'"`\n]{0,40}\bclear(?:s|ed|ing)?\b|\bclear(?:s|ed|ing)?\b[^'"`\n]{0,40}\bincome\b/i;
  const hits = [];
  for (const file of files) stripComments(readFileSync(new URL(file, ROOT), 'utf8')).split('\n').forEach((line, i) => { const m = line.match(CLEARS); if (m) hits.push(`${file}:${i + 1} "${m[0]}"`); });
  assert.deepEqual(hits, []);
  for (const s of ['Income comfortably clears', 'Income clears 40%', 'clears the income bar']) assert.match(s, CLEARS, s);
});

test('the kind of income is refused even where the old scan would not look', () => {
  const text = stripComments(readFileSync(new URL('lib/fitScore.js', ROOT), 'utf8')).replace(/isCreditKind/g, '');
  assert.doesNotMatch(text, /kind/i);
});
