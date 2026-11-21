// Every script in the PDFs (lib/pdfScripts.js, lib/profileExportPdf.js, lib/landlordReportPdf.js):
// "Download my profile" and the landlord report print a name and a tenant's own words in the
// script they were typed in. Tested with a name and an About me in Persian and in Chinese, and
// with Korean, Hindi and accented Latin beside them: nothing is dropped, the fonts are in the
// repository with their licences and nothing is fetched, and a page of Latin text is drawn with
// the fonts it always was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);

const { PDFDocument, PDFName, StandardFonts } = await import('pdf-lib');
const fkm = await import('@pdf-lib/fontkit'); const fk = fkm.default || fkm;
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createTextKit, visualOrder, SCRIPT_FONTS, breaksAnywhere } = await import('../lib/pdfScripts.js');
const { buildProfilePdf } = await import('../lib/profileExportPdf.js');
const { buildLandlordReportPdf } = await import('../lib/landlordReportPdf.js');
const { demoSnapshot } = await import('../lib/demoReport.js');

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const FA = { name: 'مریم رضایی', about: 'من در یک کلینیک توانبخشی کودکان کار می‌کنم و ۴ سال است که آنجا هستم. به دنبال خانه‌ای آرام نزدیک دریاچه هستم.\n\nبیشتر شب‌ها آشپزی می‌کنم و کتاب می‌خوانم. Toronto را دوست دارم.' };
const ZH = { name: '王小明', about: '我在一家儿童康复诊所担任运营协调员，已经工作了四年。我想找一个靠近湖边、安静的家，可以长期居住。\n\n我大多数晚上自己做饭、看书，周末沿着湖滨小道骑自行车。' };
const KO = { name: '김민준', about: '저는 조용한 집을 찾고 있습니다.' };
const HI = { name: 'अनीता शर्मा', about: 'मैं एक क्लिनिक में काम करती हूँ और शांत घर ढूँढ रही हूँ।' };
const LATIN = { name: 'Zoë Müller-Ørsted', about: 'J’habite à Montréal, près du café Żółć. Tôi làm việc ở phòng khám.' };

const textOf = async (bytes) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + ' ';
  return out.normalize('NFKC');
};
const letters = (s, re) => Array.from(s.normalize('NFKC')).filter((ch) => re.test(ch));
const HAN = /\p{Script=Han}/u; const ARABIC = /\p{Script=Arabic}/u; const HANGUL = /\p{Script=Hangul}/u; const DEVA = /\p{Script=Devanagari}/u;
const fontNames = async (bytes) => {
  const doc = await PDFDocument.load(bytes); const out = new Set();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) { const d = obj && typeof obj.lookup === 'function' ? obj : obj && obj.dict && typeof obj.dict.lookup === 'function' ? obj.dict : null; if (d) { let base = null; try { base = d.lookup(PDFName.of('BaseFont')); } catch (e) { base = null; } if (base) out.add(String(base).replace(/^\//, '').replace(/^[A-Z]{6}\+/, '')); } }
  return [...out].sort();
};
const profile = (p, extra = {}) => ({ name: p.name, email: 'tenant@example.com', about: p.about, prepayMonths: 3, facts: { fullName: p.name, phone: '4165550142', employer: 'Northwind Clinic Inc.', jobTitle: 'Coordinator', annualIncome: '118000' }, factsUpdatedAt: '2026-11-08T15:00:00Z', checks: [], documents: [], generatedAt: '2026-11-21T15:00:00Z', ...extra });
const row = (rank, p) => ({ rank, firstName: p.name, lastName: '', name: p.name, fit: { score: 4.2, label: 'stated', pillars: [] }, jobTitle: 'Coordinator', employer: 'Northwind', numbers: { annualIncome: 118000, incomeJoint: false, rentSharePct: 27, yearsAtJob: 4, references: 1 }, landlordReference: true, confirmations: {}, confirmedLine: null, criteria: [], reason: null, sentence: 'Coordinator at Northwind, 4 years at the job.', credit: { shared: false, label: 'No credit report shared', lines: [] }, parties: [], tenant: { about: p.about, offer: 'Open to prepaying 3 months of rent', offerLabel: 'Offered by the tenant' } });
const report = (people) => ({ version: 1, generatedAt: '2026-11-21T15:00:00Z', listing: { address: '2150 Lake Shore Boulevard West, Montréal', name: 'x', rent: 2650, bedroomsLabel: '1 bedroom', criteria: {}, criteriaLine: null, fitLine: 'Fit out of 5.', landlordName: 'Zoë Müller' }, realtor: { name: 'Sarah Chen', brokerage: 'Demo Realty', signature: 'Sarah Chen · Demo Realty' }, applicants: people.map((p, i) => row(i + 1, p)) });

test('Download my profile: a name and an About me in Persian and in Chinese print whole', async () => {
  for (const [who, p, re, font] of [['Persian', FA, ARABIC, 'NotoSansArabic-Regular'], ['Chinese', ZH, HAN, 'DroidSansFallback']]) {
    let dropped = null;
    const bytes = await buildProfilePdf(profile(p, { onDropped: (d) => { dropped = d; } }));
    assert.deepEqual(dropped, [], `${who}: no character was left out`);
    const text = await textOf(bytes);
    // Every letter typed is in the file: the name twice (the title and the Name row) and the words once.
    const typed = [...letters(p.name, re), ...letters(p.name, re), ...letters(p.about, re)];
    const printed = letters(text, re);
    assert.equal(printed.length, typed.length, `${who}: as many letters printed as were typed`);
    if (who === 'Chinese') assert.deepEqual([...new Set(printed)].sort(), [...new Set(typed)].sort(), 'and they are the same characters');
    const used = await fontNames(bytes);
    assert.ok(used.some((n) => n.startsWith(font)), `${who}: drawn by ${font} (${used.join(', ')})`);
    assert.ok(bytes.length < 120000, `${who}: only the glyphs used are embedded (${bytes.length} bytes)`);
  }
  // Latin inside Persian keeps its own order, and the Persian digits theirs.
  assert.match(await textOf(await buildProfilePdf(profile(FA))), /Toronto/);
});

test('the landlord report: names and words in Persian, Chinese, Korean, Hindi and accented Latin print whole', async () => {
  const bytes = await buildLandlordReportPdf({ payload: report([FA, ZH, KO, HI, LATIN]) });
  const text = await textOf(bytes);
  for (const [who, p, re] of [['Persian', FA, ARABIC], ['Chinese', ZH, HAN], ['Korean', KO, HANGUL]]) {
    assert.equal(letters(text, re).length, letters(p.name, re).length + letters(p.about, re).length, `${who}: as many letters printed as were typed`);
  }
  assert.ok(letters(text, DEVA).length > 0, 'Hindi is drawn');
  assert.deepEqual([...new Set(letters(text, HAN))].sort(), [...new Set([...letters(ZH.name, HAN), ...letters(ZH.about, HAN)])].sort());
  for (const word of ['Zoë', 'Müller-Ørsted', 'Montréal', 'Żółć', 'việc']) assert.ok(text.replace(/\s/g, '').includes(word.normalize('NFKC')), `${word} keeps its accents`);
  const names = await fontNames(bytes);
  for (const f of ['NotoSansArabic-Regular', 'DroidSansFallback', 'NanumGothic', 'NotoSansDevanagari-Regular', 'Inter-Regular']) assert.ok(names.some((n) => n.startsWith(f)), `${f} is in the file (${names.join(', ')})`);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
});

test('nothing is dropped: every character of each text is given a font that has it', async () => {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fk);
  const base = await pdf.embedFont(StandardFonts.Helvetica);
  const all = [FA, ZH, KO, HI, LATIN].flatMap((p) => [p.name, p.about]);
  const more = ['עברית שלום', 'ภาษาไทย', 'ਪੰਜਾਬੀ', 'বাংলা', 'ગુજરાતી', 'தமிழ்', 'Русский Ελληνικά', 'こんにちは 東京 繁體中文'];
  const kit = await createTextKit(pdf, fk, [...all, ...more], [base]);
  for (const t of [...all, ...more]) {
    const runs = kit.runs(t, base);
    const drawn = runs.map((r) => r.text).join('');
    const want = Array.from(t).filter((ch) => !/[​-‏­\n]/.test(ch)).join('');
    assert.equal(Array.from(drawn).filter((ch) => !/[​-‏]/.test(ch)).join(''), want, `every character of "${t.slice(0, 20)}" is in a run`);
    for (const r of runs) for (const ch of Array.from(r.text)) assert.ok(/[​-‏]/.test(ch) || r.font.getCharacterSet().includes(ch.codePointAt(0)), `${ch} is drawn by a font that has it`);
    assert.ok(kit.width(t, base, 12) > 0);
  }
  assert.deepEqual([...kit.dropped], []);
  // What no bundled font has is left out and counted, never thrown on.
  const emoji = await createTextKit(pdf, fk, ['Maya 🏡'], [base]);
  assert.equal(emoji.runs('Maya 🏡', base).map((r) => r.text).join(''), 'Maya ');
  assert.deepEqual([...emoji.dropped], ['🏡']);
});

test('right to left lines read in order, and Chinese wraps between characters', async () => {
  const k = (kind, text) => ({ kind, text });
  const order = (runs) => visualOrder(runs).map((r) => r.text);
  // A right to left line: runs from the right; a number and a Latin word keep their own order.
  assert.deepEqual(order([k('R', 'A '), k('N', '12'), k('R', ' B')]), [' B', '12', 'A ']);
  assert.deepEqual(order([k('R', 'A '), k('L', 'Toronto '), k('N', '12'), k('R', ' B')]), [' B', 'Toronto ', '12', 'A ']);
  // A left to right line: only the right to left stretch is turned, with a number inside it.
  assert.deepEqual(order([k('L', 'In their own words: '), k('R', 'A '), k('N', '4'), k('R', ' B')]), ['In their own words: ', ' B', '4', 'A ']);
  assert.deepEqual(order([k('L', 'Suite '), k('N', '1200')]), ['Suite ', '1200']);
  assert.deepEqual(order([k('L', 'x')]), ['x']);
  // A line with no right to left text is one run: drawn exactly as before.
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fk);
  const base = await pdf.embedFont(StandardFonts.Helvetica);
  const kit = await createTextKit(pdf, fk, [FA.about, ZH.about], [base]);
  assert.deepEqual(kit.runs('Typed by you on November 8, 2026', base).map((r) => [r.text, r.kind]), [['Typed by you on November 8, 2026', 'L']]);
  assert.equal(kit.width('Typed by you on November 8, 2026', base, 10), base.widthOfTextAtSize('Typed by you on November 8, 2026', 10));
  assert.deepEqual(kit.runs('۴ سال', base).map((r) => r.kind), ['N', 'S', 'R']);
  assert.deepEqual(visualOrder(kit.runs('۴ سال', base)).map((r) => r.kind), ['R', 'S', 'N'], 'a line that starts with a number and holds only right to left words is set from the right');
  // Wrapping: Chinese has no spaces, and every line still fits.
  const lines = kit.wrap(ZH.about.split('\n')[0], base, 11, 300);
  assert.ok(lines.length >= 2, `${lines.length} lines`);
  for (const ln of lines) assert.ok(kit.width(ln, base, 11) <= 300, ln);
  assert.equal(lines.join(''), ZH.about.split('\n')[0], 'no character is lost or added at a break');
  assert.equal(breaksAnywhere('我'.codePointAt(0)), true); assert.equal(breaksAnywhere('a'.codePointAt(0)), false);
  // Latin wraps at spaces, and a last line of one word takes a word from the line above, as the report always did.
  assert.deepEqual(kit.wrap('aaaa bbbb cccc dddd', base, 10, base.widthOfTextAtSize('aaaa bbbb cccc', 10) + 1), ['aaaa bbbb', 'cccc dddd']);
});

test('Latin text keeps its look: a page with no other script embeds no other font', async () => {
  const plainProfile = await buildProfilePdf(profile({ name: 'Maya Okafor', about: 'I coordinate a clinic and cycle to work.' }));
  assert.deepEqual(await fontNames(plainProfile), ['Helvetica', 'Helvetica-Bold'], 'the download is Helvetica, as it was');
  assert.equal(Buffer.from(plainProfile).includes('FontFile2'), false, 'and no font file is embedded');
  const plainReport = await buildLandlordReportPdf({ payload: demoSnapshot('demo-carlaw') });
  const names = await fontNames(plainReport);
  assert.equal(names.some((n) => /Noto|Droid|Nanum/.test(n)), false, `the report is Inter and Fraunces, as it was (${names.join(', ')})`);
  assert.ok(names.some((n) => /Inter/.test(n)) && names.some((n) => /Fraunces/.test(n)));
});

test('the fonts are in the repository with their licences, open, and never fetched', () => {
  for (const f of SCRIPT_FONTS) assert.ok(existsSync(new URL(`assets/fonts/${f.file}`, ROOT)), f.file);
  const dir = new URL('assets/fonts/scripts/', ROOT);
  const folders = readdirSync(dir).filter((n) => statSync(new URL(n, dir)).isDirectory()).sort();
  assert.deepEqual(folders, ['DroidSansFallback', 'NanumGothic', 'NotoSansArabic', 'NotoSansBengali', 'NotoSansDevanagari', 'NotoSansGujarati', 'NotoSansGurmukhi', 'NotoSansHebrew', 'NotoSansTamil', 'NotoSansThai']);
  for (const folder of folders) {
    const files = readdirSync(new URL(`${folder}/`, dir));
    assert.equal(files.filter((n) => /\.ttf$/.test(n)).length, 1, `${folder}: one font`);
    const licence = files.find((n) => /^(OFL\.txt|LICENSE-2\.0\.txt)$/.test(n));
    assert.ok(licence, `${folder}: its licence beside it`);
    const text = readFileSync(new URL(`${folder}/${licence}`, dir), 'utf8');
    assert.match(text, folder === 'DroidSansFallback' ? /Apache License\s+Version 2\.0/ : /SIL OPEN FONT LICENSE Version 1\.1/, `${folder}: an open licence`);
  }
  const lib = code('lib/pdfScripts.js');
  assert.doesNotMatch(lib, /fetch\(|https?:\/\/|require\('https?'\)|from 'https?'/, 'nothing is fetched at run time');
  assert.match(lib, /const DIR = path\.join\(process\.cwd\(\), 'assets', 'fonts'\);/);
  // Both PDFs are sent from routes whose server bundle carries the fonts.
  for (const route of ['/api/tenant/export', '/api/report/pdf', '/api/listings/report-pdf', '/api/listings/send-report']) assert.ok(src('next.config.js').includes(`'${route}': ['./assets/fonts/**']`), route);
  assert.match(code('lib/profileExportPdf.js'), /const kit = await createTextKit\(pdf, fk, \[plain\(JSON\.stringify\(L\)\)\], \[regular, bold\]\);/);
  assert.match(code('lib/landlordReportPdf.js'), /const kit = await createTextKit\(pdfDoc, fk, \[keep\(JSON\.stringify\(\{ header, blocks, footer \}\)\)\], \[inter, interMedium, fraunces\]\);/);
});
