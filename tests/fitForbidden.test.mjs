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

test('the kind of income is refused even where the old scan would not look', () => {
  const text = stripComments(readFileSync(new URL('lib/fitScore.js', ROOT), 'utf8')).replace(/isCreditKind/g, '');
  assert.doesNotMatch(text, /kind/i);
});
