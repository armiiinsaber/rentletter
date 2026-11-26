// Send report asks first, and there is one way to send (components/dashboard/SendReportSheet.js,
// sendReport.js, HomeView.js, ListingView.js). A card's Send report, the Ready to send tile and
// Needs you's Send on the dashboard, and the Landlord section's Send on the listing page, open the
// send sheet; the report goes only from the sheet's Send to the landlord, and no other file in the
// app names the send route. The sheet lists the applicants the report carries, in its order, with
// their Fit words (the send route's own buildSnapshot), and says which of the landlord's email and
// the signing name is missing, with a button to add it. The walk (tests/routes/shellWebkit.test.mjs)
// presses all of it in WebKit and in Chrome, on the dashboard and on the listing page: nothing sent
// while the sheet is open, Cancel, Escape and a tap outside send nothing, the names against the
// landlord's own page after the send, the email added through the listing's setup form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { reportRows, fitWord, sendMissing, LANDLORD_EMAIL, NO_FIT_WORD } = await import('../components/dashboard/sendReport.js');
const { SendReportBody, SEND_COPY, SEND_FAILED } = await import('../components/dashboard/SendReportSheet.js');
const { buildSnapshot } = await import('../lib/reportSnapshot.js');
const { INCOMPLETE_LINE } = await import('../lib/fitScore.js');
const { isWithdrawn, isSetAside } = await import('../lib/listingApplicantsVocabulary.js');
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (p) => src(p).replace(/^\s*\/\/.*$/gm, '');
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/[\s\u00a0]+/g, ' ').trim();

const LISTING = { id: 'L1', name: '210 Carlaw Ave, Unit 4', address: '210 Carlaw Ave, Unit 4, Toronto', monthly_rent: 2600, bedrooms: '2', landlord_name: 'Marco Rossi', landlord_email: 'marco@example.com', pref_rent_to_income_max_pct: 40 };
const PROFILE = { full_name: 'Sarah Chen', brokerage: 'Demo Realty', report_signature: 'Sarah Chen, Demo Realty' };
const fit = (score, label) => ({ score, scoreExact: score, label, assessed: 2, of: 3, notAssessed: ['Conduct'], basis: null, pillars: [] });
const person = (linkId, fullName, over = {}) => ({ linkId, id: linkId, createdAt: over.createdAt || '2026-11-10T12:00:00.000Z', decisionStatus: 'none', withdrawnAt: null, confirmations: {}, docVerifications: [], ...over, application: { full_name: fullName, job_title: 'Analyst', employer: 'Northwind', years_at_job: '3', annual_income: 90000, ...(over.application || {}) } });
// Seven applicants on one listing: two scored, one set aside, one withdrawn, a second application
// from the first person, one with no Fit, one whose Fit is not a number yet.
const APPLICANTS = [
  person('J-low', 'Priya Sharma', { createdAt: '2026-11-08T12:00:00.000Z', application: { fit: fit(3.1, 'stated') } }),
  person('J-none', 'Wei Zhang', { createdAt: '2026-11-07T12:00:00.000Z', application: { fit: null } }),
  person('J-aside', 'Marta Nowak', { decisionStatus: 'reject', application: { fit: fit(4.9, 'verified') } }),
  person('J-gone', 'Tom Baker', { withdrawnAt: '2026-11-12T12:00:00.000Z', application: { fit: fit(4.8, 'docs match') } }),
  person('J-high', 'Oluwaseun Adebayo Fitzgerald', { createdAt: '2026-11-09T12:00:00.000Z', application: { fit: fit(4.4, 'verified') } }),
  person('J-dup', 'Oluwaseun Adebayo Fitzgerald', { duplicateOf: 'J-high', application: { fit: fit(4.6, 'docs match') } }),
  person('J-part', 'Ana Lima', { createdAt: '2026-11-11T12:00:00.000Z', application: { fit: { score: null, scoreExact: null, label: 'stated', assessed: 1, of: 3, incomplete: { line: INCOMPLETE_LINE, next: 'Add documents.' }, pillars: [] } } }),
];

test('the sheet lists the applicants the report carries, in its order: best Fit first, then the rest by when they applied', () => {
  assert.ok(isSetAside(APPLICANTS[2]) && isWithdrawn(APPLICANTS[3]), 'the fixture sets one aside and withdraws one');
  const rows = reportRows({ listing: LISTING, applicants: APPLICANTS, profile: PROFILE });
  assert.deepEqual(rows.map((r) => [r.rank, r.linkId, r.name]), [
    [1, 'J-high', 'Oluwaseun Adebayo Fitzgerald'],
    [2, 'J-low', 'Priya Sharma'],
    [3, 'J-none', 'Wei Zhang'],
    [4, 'J-part', 'Ana Lima'],
  ], 'set aside, withdrawn and the second application left out');
  // The same rows the send freezes for the landlord: names, order and Fit.
  const sent = buildSnapshot({ listing: LISTING, applicants: APPLICANTS, profile: PROFILE }).applicants;
  assert.deepEqual(rows.map((r) => [r.rank, r.name, r.fit && r.fit.label, r.linkId]), sent.map((r) => [r.rank, r.name, r.fit && r.fit.label, r.linkId]));
  assert.deepEqual(reportRows({ listing: null, applicants: APPLICANTS }), [], 'no listing, no rows');
  assert.deepEqual(reportRows({ listing: LISTING, applicants: [] }), []);
});

test('each applicant\'s Fit word: the word beside the number, or the line in its place', () => {
  const rows = reportRows({ listing: LISTING, applicants: APPLICANTS, profile: PROFILE });
  assert.deepEqual(rows.map((r) => fitWord(r.fit)), ['verified', 'stated', NO_FIT_WORD, INCOMPLETE_LINE]);
  assert.equal(fitWord(fit(3.9, 'check docs')), 'check docs');
  assert.equal(fitWord(fit(3.9, 'docs match')), 'docs match');
  assert.equal(fitWord({ score: null, incomplete: 'Not enough to score yet' }), 'Not enough to score yet', 'a frozen Fit carries the line itself');
  assert.equal(fitWord(null), 'Rent share unknown');
});

test('what the send still needs: the landlord\'s email as the route checks it, and the signing name', () => {
  assert.deepEqual(sendMissing(LISTING, PROFILE), { email: false, signature: false });
  assert.deepEqual(sendMissing({ ...LISTING, landlord_email: null }, PROFILE), { email: true, signature: false });
  assert.deepEqual(sendMissing({ ...LISTING, landlord_email: '  ' }, PROFILE), { email: true, signature: false });
  assert.deepEqual(sendMissing({ ...LISTING, landlord_email: 'marco@example' }, PROFILE), { email: true, signature: false }, 'an address the route refuses');
  assert.deepEqual(sendMissing(LISTING, { ...PROFILE, report_signature: null }), { email: false, signature: true });
  assert.deepEqual(sendMissing({ ...LISTING, landlord_email: '' }, { full_name: 'Sarah Chen' }), { email: true, signature: true });
  assert.equal(String(LANDLORD_EMAIL), String(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
  assert.ok(src('pages/api/listings/send-report.js').includes(".test(landlordEmail)") && src('pages/api/listings/send-report.js').includes(String(LANDLORD_EMAIL).slice(1, -1)), 'the route\'s own check');
});

const body = (over = {}) => {
  const listing = over.listing || LISTING; const profile = over.profile || PROFILE;
  return renderToStaticMarkup(React.createElement(SendReportBody, { listing, profile, rows: reportRows({ listing, applicants: APPLICANTS, profile }), missing: sendMissing(listing, profile), onSend() {}, onCancel() {}, onAddEmail() {}, onSaveSignature: async () => null, onPreview() {}, previewHref: '/api/listings/report-pdf?listingId=L1', ...over.props }));
};

test('the sheet: the address, the landlord, the signing name, the applicants with their Fit words, Preview, and the two buttons', () => {
  const html = body();
  assert.equal(text(html), 'Send the report? 210 Carlaw Ave, Unit 4 Landlord Marco Rossi marco@example.com Signed by Sarah Chen, Demo Realty In the report 4 Preview 1 Oluwaseun Adebayo Fitzgerald verified 2 Priya Sharma stated 3 Wei Zhang Rent share unknown 4 Ana Lima Not enough to score yet Send to the landlord Cancel');
  assert.deepEqual([...html.matchAll(/data-send-applicant="([^"]*)"/g)].map((m) => m[1]), ['J-high', 'J-low', 'J-none', 'J-part'], 'in the report\'s order');
  assert.match(html, /<a href="\/api\/listings\/report-pdf\?listingId=L1" target="_blank" rel="noopener" class="srs-preview" aria-label="Preview the report as the landlord will see it" data-send-preview="">/);
  // Two buttons: Send to the landlord, available, and Cancel. No other button on the sheet.
  assert.deepEqual([...html.matchAll(/<button[^>]*>/g)].map((m) => (m[0].match(/data-send-[a-z-]+/) || [''])[0]), ['data-send-confirm', 'data-send-cancel']);
  assert.doesNotMatch(html.match(/<button[^>]*data-send-confirm[^>]*>/)[0], /disabled/);
  // No applicant detail beyond the name and the Fit word: the income, the employer and the job stay on the listing page.
  assert.doesNotMatch(text(html), /90,000|Northwind|Analyst/);
});

test('the missing email case: the sheet says the email is missing, offers to add it, and Send waits', () => {
  const html = body({ listing: { ...LISTING, landlord_email: null } });
  assert.match(text(html), /Landlord Marco Rossi No email yet Add the email Signed by Sarah Chen, Demo Realty/);
  assert.doesNotMatch(html, /data-send-landlord-email/);
  assert.match(html, /<button type="button" class="srs-add" data-send-add-email="">Add the email<\/button>/);
  const send = html.match(/<button[^>]*data-send-confirm[^>]*>/)[0];
  assert.match(send, /disabled=""/, 'Send to the landlord is unavailable');
  assert.match(send, /aria-describedby="srs-miss-email"/, 'and says why');
  assert.match(html, /<p class="srs-missing" id="srs-miss-email">No email yet<\/p>/);
  // The email added in the listing's setup form, the form the listing page's Edit listing opens.
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /const addEmail = \(\) => \{ const id = sendFor; if \(!id\) return; closeSend\(\); afterSheet\(\(\) => \{ setEditFor\(id\); setEditOpen\(true\); \}\); \};/);
  assert.match(h, /<ListingSetupModal open=\{editOpen && !!editListing\} mode="edit" initial=\{editListing\}/);
  assert.match(h, /onCancel=\{\(\) => backToSend\(editFor\)\} onSave=\{saveEdit\}/, 'saved or cancelled, back to the sheet');
});

test('the missing signing name: the sheet says so and offers the field; with both missing it names both', () => {
  const html = body({ profile: { full_name: 'Sarah Chen', brokerage: 'Demo Realty' } });
  assert.match(text(html), /Signed by No signing name yet Add a signing name In the report/);
  assert.match(html.match(/<button[^>]*data-send-confirm[^>]*>/)[0], /disabled=""[^>]*aria-describedby="srs-miss-signature"/);
  const both = body({ listing: { ...LISTING, landlord_email: '' }, profile: { full_name: 'Sarah Chen' } });
  assert.match(both.match(/<button[^>]*data-send-confirm[^>]*>/)[0], /aria-describedby="srs-miss-email srs-miss-signature"/);
  // The field the listing page asks with: prefilled with the display name and the brokerage, saved to the profile.
  const s = code('components/dashboard/SendReportSheet.js');
  assert.match(s, /const openSig = \(\) => \{ setSigValue\(defaultSignature\(profile\)\);/);
  assert.match(s, /aria-label=\{SEND_COPY\.signAs\}/);
  assert.equal(SEND_COPY.signAs, 'Sign the report as');
  assert.match(s, /adapter\.fetch\('\/api\/profile\/update', \{ method: 'POST', headers: \{ 'Content-Type': 'application\/json' \}, body: JSON\.stringify\(\{ report_signature: v \}\) \}\)/, 'saved by the sheet');
  assert.match(s, /if \(onProfile\) onProfile\(\{ \.\.\.\(j\.profile \|\| profile \|\| \{\}\), report_signature: v \}\);/);
  for (const page of ['components/dashboard/HomeView.js', 'components/dashboard/ListingView.js']) assert.match(code(page), /<SendReportSheet [^\n]*(?:\n[^\n<]*)?onProfile=\{setProfile\} \/>/, page);
});

// Every file of the app's own code (pages/api, the routes themselves, aside).
const ROOT = new URL('../', import.meta.url);
const ownFiles = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (`${dir}${e.name}/` === 'pages/api/' ? [] : ownFiles(`${dir}${e.name}/`)) : /\.(m?js|jsx)$/.test(e.name) ? [`${dir}${e.name}`] : []));
const ROUTE = "'/api/listings/send-report'";

test('one way to send: no component, page or helper calls the send route but the sheet', () => {
  const files = [...ownFiles('components/'), ...ownFiles('pages/'), ...ownFiles('lib/')];
  assert.ok(files.length > 200, `the app's files (${files.length})`);
  const naming = files.filter((f) => code(f).includes('/api/listings/send-report'));
  // The sheet sends; the two adapters carry the route (the real one's list of routes, the sandbox's
  // stand in for it), and neither is called by name: every page reaches them through adapter.fetch.
  assert.deepEqual(naming.sort(), ['components/dashboard/SendReportSheet.js', 'lib/dashboardAdapter.js', 'lib/demoAdapter.js']);
  assert.match(code('lib/dashboardAdapter.js'), /'POST \/api\/listings\/send-report'/);
  assert.match(code('lib/demoAdapter.js'), /'POST \/api\/listings\/send-report': \(q, b\) => \{/);
  // In the sheet: one send, run by Send to the landlord alone.
  const s = code('components/dashboard/SendReportSheet.js');
  assert.equal(s.split(ROUTE).length - 1, 1, 'one send');
  const send = s.match(/const send = async \(\) => \{[\s\S]*?\n  \};/)[0];
  assert.ok(send.includes(ROUTE), 'the send is the sheet\'s send');
  assert.match(send, /if \(!listing \|\| busy \|\| missing\.email \|\| missing\.signature\) return;/, 'never with the email or the signing name missing, never twice');
  assert.equal(s.split('onSend={send}').length - 1, 1, 'handed to the body once');
  assert.equal(s.split('onClick={onSend}').length - 1, 1, 'and in the body to one button');
  assert.match(s, /<button type="button" className="srs-btn srs-send" onClick=\{onSend\} disabled=\{busy \|\| blocked\}/);
  assert.match(s, /<button type="button" className="srs-btn srs-cancel" onClick=\{onCancel\} disabled=\{busy\}/);
  assert.match(s, /<Sheet open=\{!!listing\} onClose=\{onClose\} role="alertdialog" label=\{SEND_COPY\.title\} busy=\{busy\} maxWidth=\{520\} dialogWidth=\{680\}>/, 'at 1024 and wider a pop up wider than the default, for the applicant list');
  assert.match(s, /onSend=\{send\} onCancel=\{onClose\}/);
  // A refusal stays in the sheet; a send tells the page that opened it.
  assert.match(send, /if \(!r\.ok\) \{ setNote\(j\.error \|\| SEND_FAILED\); return; \}\s*if \(onSent\) onSent\(l, j\);/);
  assert.equal(SEND_FAILED, 'The report did not go. Try again.');
});

test('every way in opens the sheet: the card, the tile and Needs you on the dashboard, Send on the listing page', () => {
  const h = code('components/dashboard/HomeView.js');
  assert.match(h, /<ListingCard [^>]*onSend=\{askSend\}/, 'the card');
  assert.match(h, /const onTile = \(item\) => \{ if \(item && item\.kind === 'ready' && askSend\(listingById\.get\(item\.listingId\)\)\) return; navigateToAction\(item, adapter\.paths\); \};/, 'the Ready to send tile');
  assert.match(h, /if \(it\.go\.kind === 'action' && it\.go\.item && it\.go\.item\.kind === 'ready' && askSend\(listingById\.get\(it\.go\.item\.listingId\)\)\) return;/, 'Needs you');
  assert.match(h, /const askSend = \(l\) => \{ if \(!l \|\| !l\.id\) return false; setSendFor\(l\.id\); return true; \};/, 'askSend opens, nothing more');
  assert.match(h, /const closeSend = \(\) => setSendFor\(null\);/, 'Cancel, Escape and a tap outside close it');
  assert.match(h, /<SendReportSheet listing=\{sendListing\} applicants=\{sendListing \? byListing\[sendListing\.id\] \|\| \[\] : \[\]\} profile=\{profile\}\s*onClose=\{closeSend\} onSent=\{onSent\} onAddEmail=\{addEmail\} onProfile=\{setProfile\} \/>/);
  // Once sent: the sheet closes and the card shows Sent in place, as built.
  assert.match(h, /const onSent = \(l, j\) => \{\s*setSendFor\(null\);\s*if \(j && j\.preview\)[^\n]*\n\s*setSends\(\(s\) => \(\{ \.\.\.s, \[l\.id\]: \{ state: 'sent' \} \}\)\);/);
  // The listing page: its Send opens the same sheet, with the same contents and handling.
  const v = code('components/dashboard/ListingView.js');
  assert.match(v, /<button type="button" onClick=\{openSend\} aria-haspopup="dialog" className="rl-btn" data-send-open=""/, 'the Landlord section\'s Send');
  assert.match(v, /const openSend = \(\) => \{ setBrandHint\(true\); setSendMsg\(''\); setSendOpen\(true\); \};/, 'it opens the sheet, nothing more');
  assert.match(v, /else if \(a\.event === 'send-report'\) \{[^}]*\}\);\s*openSend\(\);\s*\}/, 'the send-report notice opens it too');
  assert.match(v, /<SendReportSheet listing=\{sendOpen \? listing : null\} applicants=\{applicants\} profile=\{profile\} onClose=\{\(\) => setSendOpen\(false\)\} onSent=\{onSent\} onAddEmail=\{addEmailFromSend\} onProfile=\{setProfile\} \/>/);
  // The missing email: this page's own Edit listing form, then back to the sheet, saved or cancelled.
  assert.match(v, /const addEmailFromSend = \(\) => \{ setSendOpen\(false\); resumeSend\.current = true; afterSheet\(\(\) => setEditOpen\(true\)\); \};/);
  assert.match(v, /function backFromEdit\(\) \{ if \(!resumeSend\.current\) return; resumeSend\.current = false; afterSheet\(\(\) => setSendOpen\(true\)\); \}/);
  assert.match(v, /setEditOpen\(false\);\s*backFromEdit\(\);\s*refreshApplicants\(\);/, 'saved');
  assert.match(v, /onCancel=\{\(\) => \{ setEditOpen\(false\); backFromEdit\(\); \}\} onSave=\{saveEdit\}/, 'cancelled');
  // The old one tap send and its own signing sheet are gone.
  assert.doesNotMatch(v, /sendEmail|doSend|signAndSend|setSigSheet|title="Sign the report as"/);
  // The same focus rule everywhere: the sheet takes the focus on its panel, never on a button.
  assert.doesNotMatch(code('components/dashboard/SendReportSheet.js'), /autoFocus/);
});

test('red is the one action on the sheet; the error line is the danger red', () => {
  const s = code('components/dashboard/SendReportSheet.js');
  const reds = s.split('\n').filter((l) => /\bC\.red\b/.test(l)).map((l) => l.trim().split(' {')[0]);
  assert.deepEqual(reds, ['.srs-send'], 'only Send to the landlord');
  assert.match(s, /\.srs-note \{[^}]*color: \$\{C\.danger\};/);
  // A constant tagged with css.global, so styled-jsx gives the style a name of its own (tests/styleNames.test.mjs).
  assert.match(s, /<style jsx global>\{SRS_CSS\}<\/style>/);
  assert.match(s, /^const SRS_CSS = css\.global`\n  \.srs \{/m);
  // Motion: none of its own (the sheet rises on components/Sheet.js).
  assert.doesNotMatch(s, /transition:|animation:|@keyframes/);
});
