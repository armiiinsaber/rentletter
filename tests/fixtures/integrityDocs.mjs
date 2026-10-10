// The document checks' fixture set (lib/documentIntegrity.js): documents as the read returns them
// (lib/applicantAnalysis.js), in the formats real applicants send. CLEAN: 37 documents across 12
// applicants (ADP, Ceridian Dayforce, Nethris in French, Wagepoint, QuickBooks, Payworks, Rise,
// Humi, a scanned photo; weekly, biweekly, semi monthly and monthly pay; overtime, a bonus in the
// period, an off cycle bonus run, vacation pay, a new hire; names with accents, hyphens,
// apostrophes, initials, middle names and reversed order; employers with and without Inc. and
// Ltd., in French, and as an abbreviation). Every clean document must raise no flag; the one
// employment letter older than 90 days raises a note. INCONSISTENT: at least one document per check.
// Invented people and figures throughout.
export const UPLOADED_AT = '2026-10-09T15:00:00Z';

const stub = (o) => ({ documentType: 'pay stub', unrecognized: false, notes: o.provider || '', extracted: { applicantName: o.name, employer: o.employer, periodStart: o.start ?? null, periodEnd: o.end ?? null, payDate: o.pay ?? null, grossForPeriod: o.gross ?? null, deductionsForPeriod: o.ded ?? null, netForPeriod: o.net ?? null, ytdGross: o.ytd ?? null, payFrequency: o.freq ?? null, documentDate: null } });
const letter = (o) => ({ documentType: 'employment letter', unrecognized: false, notes: o.provider || '', extracted: { applicantName: o.name, employer: o.employer, jobTitle: o.title ?? null, documentDate: o.date ?? null, annualSalaryPrinted: o.salary ?? null, startDate: o.since ?? null } });
const idDoc = (o) => ({ documentType: 'government ID', unrecognized: false, extracted: { applicantName: o.name } });
const bank = (o) => ({ documentType: 'bank statement', unrecognized: false, extracted: { applicantName: o.name, documentDate: o.date ?? null, closingBalance: o.balance ?? null } });
const t4 = (o) => ({ documentType: 'tax document (T4)', unrecognized: false, extracted: { applicantName: o.name, employer: o.employer, annualSalaryPrinted: o.amount ?? null, documentDate: o.date ?? null } });

// { id, applicant, statedEmployer, docs: [{ label, doc, fileEdited? }] }
export const CLEAN = [
  { id: 'S1', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [
    { label: 'ADP biweekly stub, Sep 4', doc: stub({ provider: 'ADP', name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', start: '2026-08-17', end: '2026-08-30', pay: '2026-09-04', gross: 3538.46, ded: 1012.30, net: 2526.16, ytd: 63692.28 }) },
    { label: 'ADP biweekly stub, Sep 18', doc: stub({ provider: 'ADP', name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', start: '2026-08-31', end: '2026-09-13', pay: '2026-09-18', gross: 3538.46, ded: 1012.30, net: 2526.16, ytd: 67230.74 }) },
    { label: 'ADP biweekly stub, Oct 2', doc: stub({ provider: 'ADP', name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', start: '2026-09-14', end: '2026-09-27', pay: '2026-10-02', gross: 3538.46, ded: 1012.30, net: 2526.16, ytd: 70769.20 }) },
    { label: 'employment letter, Inc. suffix', doc: letter({ name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre Inc.', date: '2026-09-20', salary: 92000 }) },
  ] },
  { id: 'S2', applicant: 'Marc Andre Tremblay', statedEmployer: 'Hydro Quebec', docs: [
    { label: 'Ceridian Dayforce semi monthly stub, accents and hyphen', doc: stub({ provider: 'Ceridian Dayforce', name: 'Marc-André Tremblay', employer: 'Hydro-Québec', start: '2026-09-01', end: '2026-09-15', pay: '2026-09-15', gross: 4310.00, ded: 1296.85, net: 3013.15, ytd: 73270.00 }) },
    { label: 'Ceridian Dayforce semi monthly stub with overtime', doc: stub({ provider: 'Ceridian Dayforce', name: 'Marc-André Tremblay', employer: 'Hydro-Québec', start: '2026-09-16', end: '2026-09-30', pay: '2026-09-30', gross: 4795.50, ded: 1460.20, net: 3335.30, ytd: 78065.50 }) },
    { label: 'employment letter, accented employer', doc: letter({ name: 'Marc-André Tremblay', employer: 'Hydro-Québec', date: '2026-08-28' }) },
  ] },
  { id: 'S3', applicant: 'Emilie Cote', statedEmployer: 'Desjardins', docs: [
    { label: 'Nethris stub in French, amounts with commas', doc: stub({ provider: 'Nethris', name: 'Émilie Côté', employer: 'Fédération des caisses Desjardins du Québec', start: '7 septembre 2026', end: '20 septembre 2026', pay: '24 septembre 2026', gross: '2 845,30 $', ded: '812,45 $', net: '2 032,85 $', ytd: '54 060,70 $', freq: 'aux deux semaines' }) },
    { label: 'Nethris stub in French, the next period', doc: stub({ provider: 'Nethris', name: 'Émilie Côté', employer: 'Fédération des caisses Desjardins du Québec', start: '21 septembre 2026', end: '4 octobre 2026', pay: '8 octobre 2026', gross: '2 845,30 $', ded: '812,45 $', net: '2 032,85 $', ytd: '56 906,00 $', freq: 'aux deux semaines' }) },
    { label: 'lettre d\'emploi', doc: letter({ name: 'Émilie Côté', employer: 'Desjardins', date: '15 septembre 2026' }) },
  ] },
  { id: 'S4', applicant: 'Liam O\'Brien', statedEmployer: 'Halifax Brewing Company', docs: [
    { label: 'Wagepoint weekly stub, apostrophe dropped', doc: stub({ provider: 'Wagepoint', name: 'LIAM OBRIEN', employer: 'Halifax Brewing Co.', start: '2026-09-14', end: '2026-09-20', pay: '2026-09-25', gross: 1240.00, ded: 298.10, net: 941.90, ytd: 48360.00 }) },
    { label: 'Wagepoint weekly stub, an extra shift', doc: stub({ provider: 'Wagepoint', name: 'LIAM OBRIEN', employer: 'Halifax Brewing Co.', start: '2026-09-21', end: '2026-09-27', pay: '2026-10-02', gross: 1302.00, ded: 315.40, net: 986.60, ytd: 49662.00 }) },
    { label: 'T4 for 2025', doc: t4({ name: 'Liam O\'Brien', employer: 'Halifax Brewing Company', amount: 61200, date: '2026-02-20' }) },
    { label: 'bank statement, name split', doc: bank({ name: 'Liam O Brien', date: '2026-09-30', balance: 8400 }) },
  ] },
  { id: 'S5', applicant: 'Aisha Rahman', statedEmployer: 'Northwind Sample Clinic Inc.', docs: [
    { label: 'QuickBooks monthly stub, Ltd. suffix', doc: stub({ provider: 'QuickBooks', name: 'Aisha Rahman', employer: 'Northwind Sample Clinic Ltd', start: '2026-08-01', end: '2026-08-31', pay: '2026-08-31', gross: 6500.00, ded: 1890.25, net: 4609.75, ytd: 52000.00 }) },
    { label: 'QuickBooks monthly stub with a bonus in the period', doc: stub({ provider: 'QuickBooks', name: 'Aisha Rahman', employer: 'Northwind Sample Clinic Ltd', start: '2026-09-01', end: '2026-09-30', pay: '2026-09-30', gross: 9500.00, ded: 2985.60, net: 6514.40, ytd: 61500.00 }) },
    { label: 'employment letter, 99 days old (a note)', doc: letter({ name: 'Aisha Rahman', employer: 'Northwind Sample Clinic Ltd.', date: '2026-07-02' }), note: true },
  ] },
  { id: 'S6', applicant: 'Wei Chen', statedEmployer: 'CIBC', docs: [
    { label: 'Payworks biweekly stub, name reversed', doc: stub({ provider: 'Payworks', name: 'CHEN, WEI', employer: 'CIBC', start: '2026-08-24', end: '2026-09-06', pay: '2026-09-11', gross: 4038.46, ded: 1180.22, net: 2858.24, ytd: 72692.28 }) },
    { label: 'Payworks biweekly stub with vacation pay', doc: stub({ provider: 'Payworks', name: 'CHEN, WEI', employer: 'CIBC', start: '2026-09-07', end: '2026-09-20', pay: '2026-09-25', gross: 4846.15, ded: 1452.33, net: 3393.82, ytd: 77538.43 }) },
    { label: 'employment letter, employer spelled out', doc: letter({ name: 'Wei Chen', employer: 'Canadian Imperial Bank of Commerce', date: '2026-09-01' }) },
  ] },
  { id: 'S7', applicant: 'James Okafor', statedEmployer: 'Shopify', docs: [
    { label: 'scanned photo of an ADP stub, deductions unreadable', doc: stub({ provider: 'ADP, photographed', name: 'JAMES OKAFOR', employer: 'Shopify Inc.', pay: 'Sept 26, 2026', gross: 3653.85, net: 2690.11 }) },
    { label: 'scanned photo of the stub before', doc: stub({ provider: 'ADP, photographed', name: 'JAMES OKAFOR', employer: 'Shopify Inc.', pay: 'Sept 12, 2026', gross: 3653.85 }) },
    { label: 'scanned employment letter', doc: letter({ name: 'James Okafor', employer: 'Shopify', date: 'August 15, 2026' }) },
  ] },
  { id: 'S8', applicant: 'Alexandra Papadopoulos Whitfield', statedEmployer: 'Maple Leaf Foods', docs: [
    { label: 'Rise biweekly stub, first initial', doc: stub({ provider: 'Rise', name: 'A. Papadopoulos Whitfield', employer: 'Maple Leaf Foods Inc.', start: '2026-08-31', end: '2026-09-13', pay: '2026-09-17', gross: 3076.92, ded: 865.40, net: 2211.52, ytd: 55384.56 }) },
    { label: 'Rise biweekly stub, the next period', doc: stub({ provider: 'Rise', name: 'A. Papadopoulos Whitfield', employer: 'Maple Leaf Foods Inc.', start: '2026-09-14', end: '2026-09-27', pay: '2026-10-01', gross: 3076.92, ded: 865.40, net: 2211.52, ytd: 58461.48 }) },
    { label: 'government ID with a middle name', doc: idDoc({ name: 'Alexandra Maria Papadopoulos Whitfield' }) },
  ] },
  { id: 'S9', applicant: 'Nadia Haddad', statedEmployer: 'Livenation', docs: [
    { label: 'Humi semi monthly stub', doc: stub({ provider: 'Humi', name: 'Nadia Haddad', employer: 'Live Nation Canada Inc.', start: '2026-09-01', end: '2026-09-15', pay: '2026-09-15', gross: 3125.00, ded: 902.75, net: 2222.25, ytd: 53125.00 }) },
    { label: 'Humi semi monthly stub, month end', doc: stub({ provider: 'Humi', name: 'Nadia Haddad', employer: 'Live Nation Canada Inc.', start: '2026-09-16', end: '2026-09-30', pay: '2026-09-30', gross: 3125.00, ded: 902.75, net: 2222.25, ytd: 56250.00 }) },
    { label: 'employment letter, comma before Inc.', doc: letter({ name: 'Nadia Haddad', employer: 'Live Nation Canada, Inc.', date: '2026-09-10' }) },
  ] },
  { id: 'S10', applicant: 'Omar Haddad', statedEmployer: 'Ontario Health', docs: [
    { label: 'Ceridian biweekly stub, a new hire\'s first pay', doc: stub({ provider: 'Ceridian', name: 'Omar Haddad', employer: 'Ontario Health', start: '2026-09-07', end: '2026-09-20', pay: '2026-09-24', gross: 3461.54, ded: 1001.20, net: 2460.34, ytd: 3461.54 }) },
    { label: 'Ceridian biweekly stub, second pay', doc: stub({ provider: 'Ceridian', name: 'Omar Haddad', employer: 'Ontario Health', start: '2026-09-21', end: '2026-10-04', pay: '2026-10-08', gross: 3461.54, ded: 1001.20, net: 2460.34, ytd: 6923.08 }) },
  ] },
  { id: 'S11', applicant: 'Lucia Fernandez', statedEmployer: 'TELUS', docs: [
    { label: 'ADP biweekly stub', doc: stub({ provider: 'ADP', name: 'Lucia Fernandez', employer: 'Telus Communications Inc.', start: '2026-08-17', end: '2026-08-30', pay: '2026-09-04', gross: 3269.23, ded: 943.80, net: 2325.43, ytd: 58846.14 }) },
    { label: 'ADP off cycle bonus run, no period', doc: stub({ provider: 'ADP', name: 'Lucia Fernandez', employer: 'Telus Communications Inc.', pay: '2026-09-10', gross: 5000.00, ded: 2150.00, net: 2850.00, ytd: 63846.14 }) },
    { label: 'ADP biweekly stub after the bonus', doc: stub({ provider: 'ADP', name: 'Lucia Fernandez', employer: 'Telus Communications Inc.', start: '2026-08-31', end: '2026-09-13', pay: '2026-09-18', gross: 3269.23, ded: 943.80, net: 2325.43, ytd: 67115.37 }) },
  ] },
  { id: 'S12', applicant: 'Marie-Ève Gagnon-Roy', statedEmployer: 'Ville de Montreal', docs: [
    { label: 'monthly municipal stub, hyphens dropped', doc: stub({ provider: 'Ville de Montréal payroll', name: 'Marie Eve Gagnon Roy', employer: 'Ville de Montréal', start: '2026-09-01', end: '2026-09-30', pay: '2026-09-30', gross: 6250.00, ded: 1893.75, net: 4356.25, ytd: 56250.00 }) },
    { label: 'employment letter, 81 days old', doc: letter({ name: 'Marie-Ève Gagnon-Roy', employer: 'Ville de Montréal', date: '2026-07-20' }) },
    { label: 'second employment letter', doc: letter({ name: 'Marie-Ève Gagnon-Roy', employer: 'Ville de Montréal', date: '2026-09-25' }) },
  ] },
];

const clean = (o = {}) => stub({ provider: 'ADP', name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', start: '2026-09-14', end: '2026-09-27', pay: '2026-10-02', gross: 3538.46, ded: 1012.30, net: 2526.16, ytd: 70769.20, ...o });
// { id, check, applicant, statedEmployer, docs, expect: { type, on } }  on: the index of the document flagged
export const INCONSISTENT = [
  { id: 'X1', check: 'a. arithmetic', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'net is not gross less deductions', doc: clean({ start: '2026-08-31', end: '2026-09-13', pay: '2026-09-18', gross: 3500, ded: 900, net: 2912, ytd: 66700 }) }, { label: 'clean stub', doc: clean() }], expect: { type: 'pay_arithmetic', on: 0 } },
  { id: 'X2', check: 'a. year to date', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'year to date below the period gross', doc: clean({ gross: 3500, ded: 1000, net: 2500, ytd: 2000 }) }], expect: { type: 'pay_ytd', on: 0 } },
  { id: 'X3', check: 'a. year to date carry', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'earlier stub', doc: clean({ start: '2026-08-31', end: '2026-09-13', pay: '2026-09-18', ytd: 67230.74 }) }, { label: 'later stub, year to date drops', doc: clean({ ytd: 60000 }) }], expect: { type: 'pay_ytd', on: 1 } },
  { id: 'X4', check: 'a. year to date ceiling', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'year to date over three times the periods', doc: clean({ gross: 1000, ded: 250, net: 750, ytd: 90000 }) }], expect: { type: 'pay_ytd', on: 0 } },
  { id: 'X5', check: 'b. pay schedule', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'biweekly stub', doc: clean({ start: '2026-09-07', end: '2026-09-20', pay: '2026-09-25', ytd: null }) }, { label: 'biweekly stub a week later', doc: clean({ ytd: null }) }], expect: { type: 'pay_schedule', on: 1 } },
  { id: 'X6', check: 'b. future pay date', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'pay date three weeks ahead', doc: clean({ start: '2026-10-12', end: '2026-10-25', pay: '2026-10-30', ytd: 77846.12 }) }], expect: { type: 'pay_future', on: 0 } },
  { id: 'X7', check: 'b. most recent stub', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'newest stub 81 days before upload', doc: clean({ start: '2026-07-06', end: '2026-07-19', pay: '2026-07-20', ytd: 49538.44 }) }], expect: { type: 'pay_stale', on: 0 } },
  { id: 'X8', check: 'c. same person', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'stub in another name', doc: clean({ name: 'Daniel Moreau' }) }], expect: { type: 'name', on: 0 } },
  { id: 'X9', check: 'd. same employer', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'stub from another employer', doc: clean({ employer: 'Maple Leaf Foods Inc.' }) }, { label: 'employment letter', doc: letter({ name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', date: '2026-09-20' }) }], expect: { type: 'employer', on: 0 } },
  { id: 'X10', check: 'e. future date', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'letter dated next month', doc: letter({ name: 'Priya Sharma', employer: 'Sunnybrook Health Sciences Centre', date: '2026-11-15' }) }], expect: { type: 'future_date', on: 0 } },
  { id: 'X11', check: 'f. file history alone', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'clean stub saved in an editor', doc: clean(), fileEdited: true }], expect: { type: null, on: 0 } },
  { id: 'X12', check: 'f. file history with a', applicant: 'Priya Sharma', statedEmployer: 'Sunnybrook', docs: [{ label: 'arithmetic off, saved in an editor', doc: clean({ start: '2026-08-31', end: '2026-09-13', pay: '2026-09-18', gross: 3500, ded: 900, net: 2912, ytd: 66700 }), fileEdited: true }, { label: 'clean stub', doc: clean() }], expect: { type: 'pay_arithmetic', on: 0, fileLine: true } },
];

// The staged items for a set, as both upload paths stage them (lib/uploadCombine.js stagedItem).
export const itemsOf = (set) => set.docs.map((d, i) => ({ index: i, filename: `${set.id}-${i + 1}.pdf`, size: 1000, document: d.doc, documentId: `${set.id}-doc-${i + 1}`, fileEdited: d.fileEdited === true, confidence: 'high' }));
