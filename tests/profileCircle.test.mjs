// The realtor's Profile and Circle laid out for the desktop (components/dashboard/ProfileView.js,
// ProfileEditorBody.js, CircleView.js, RealtorCard.js, components/ReportBrand.js, DashShell.js ds-fill):
//   1. the one sentence on saving is the one the code makes true;
//   2. the preview is drawn by the components that draw it for real, from the same values;
//   3. every field and action that was on the two screens is still there;
//   4. the brokerage form opens over the view from one button and saves as it always did, and the
//      two brokerage names are stored apart, each saying what it is for;
//   5. one style of buttons on each screen, and red only for the one main action;
//   6. the layout: the main area's whole width from 1024px, the columns, the grid of cards.
// The walk looks at the screens themselves (tests/routes/profileCircleWebkit.test.mjs) and the
// wrapped text walk measures them at every width (tests/helpers/typesetStates.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./helpers/fakeStackHook.mjs', import.meta.url);

const ROOT = new URL('../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (p) => src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PV = await import('../components/dashboard/ProfileView.js');
const RC = await import('../components/dashboard/RealtorCard.js');
const { LEGAL_NAME_LINE } = await import('../components/dashboard/CircleView.js');
const { BROKERAGE_NAME_LINE } = await import('../components/dashboard/ProfileEditorBody.js');
const Ci = await import('../lib/circle.js');
const { buildSnapshot } = await import('../lib/reportSnapshot.js');
const { tables } = await import('./routes/fixture.mjs');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const ReportBrand = (await import('../components/ReportBrand.js')).default;

test('1. one sentence on saving, under the title, and the code makes it true', () => {
  assert.equal(PV.SAVE_LINE, 'Changes save on their own when you leave a field or make a choice.');
  const view = code('components/dashboard/ProfileView.js'); const body = code('components/dashboard/ProfileEditorBody.js');
  assert.equal((view.match(/\{SAVE_LINE\}/g) || []).length, 1, 'said once');
  assert.match(view, /<h1 className="t-d1 pv-title"[^\n]*>Profile<\/h1>\s*<p data-profile-saving=""[^>]*>\{SAVE_LINE\}<\/p>/, 'under the title');
  for (const s of [view, body]) assert.doesNotMatch(s, /save as you type|Saved automatically when you leave a field/i, 'the other sentence is gone');
  // Leave a field: every text field saves on blur, and typing only sets the form.
  assert.match(body, /<input id=\{`profile-field-\$\{f\.k\}`\}[^\n]*onChange=\{\(e\) => set\(f\.k, e\.target\.value\)\} onBlur=\{autosave\}/);
  assert.match(body, /const set = \(k, v\) => \{ setForm\(\(f\) => \(\{ \.\.\.f, \[k\]: v \}\)\); setSavedOk\(false\); \};/, 'typing writes nothing');
  assert.match(body, /autosaveTimer\.current = setTimeout\(\(\) => \{[^}]*if \(dirtyNow && !savingRef\.current\) persistDetails\(\);\s*\}, 250\);/);
  // Make a choice: the province and the board save when picked, the colours a moment after they
  // change, a font pairing and a logo the moment they are chosen.
  for (const k of ['province', 'board']) assert.match(body, new RegExp(`onChange=\\{\\(e\\) => \\{ set\\('${k}', e\\.target\\.value\\); autosave\\(\\); \\}\\}`), k);
  assert.match(body, /const \{ data \} = await postJson\('\/api\/profile\/branding', \{ brand_color: p, brand_color_secondary: s,[^\n]*\n[^\n]*\n[^\n]*\n\s*\}, 600\);/);
  assert.match(body, /const selectFont = async \(fp\) => \{[\s\S]{0,200}await postJson\('\/api\/profile\/branding', \{ brand_fonts: fp \}\)/);
  assert.match(body, /await postJson\('\/api\/profile\/branding', \{ logo_url: url \}\)/);
});

test('2. the preview is the real thing: the report\'s brand block and the Circle card, from the same values', () => {
  // The report page and the preview draw the same component.
  assert.match(code('pages/r/[token].js'), /<ReportBrand realtor=\{realtor\} \/>/);
  const view = code('components/dashboard/ProfileView.js');
  assert.match(view, /<ReportBrand realtor=\{reportRealtorOf\(profile, shown\)\} \/>/);
  assert.match(view, /<RealtorCard who=\{circleCardOf\(shown\)\} \/>/);
  // Circle draws every realtor with the same card, and no card of its own.
  const circle = code('components/dashboard/CircleView.js');
  assert.doesNotMatch(circle, /const Person =|className="cv-person"/);
  assert.equal((circle.match(/<RealtorCard /g) || []).length, 4, 'results, requests, the circle, requests sent');
  // The report's realtor, as lib/reportSnapshot.js builds it, for the same profile.
  const t = tables();
  for (const p of [{ full_name: 'Sarah Chen', brokerage: 'Demo Realty', logo_url: 'https://example.com/logo.png' }, { full_name: '  Sarah   Chen ', brokerage: '', logo_url: null, report_signature: 'Team Chen' }, { full_name: '', brokerage: 'B'.repeat(140) }]) {
    const real = buildSnapshot({ listing: t.listings[0], applicants: [], profile: p }).realtor;
    const shown = PV.reportRealtorOf(p, { full_name: p.full_name, brokerage: p.brokerage, logoUrl: p.logo_url || '' });
    assert.deepEqual(shown, { name: real.name, brokerage: real.brokerage, logoUrl: real.logoUrl }, JSON.stringify(p));
  }
  // The Circle card, as lib/circle.js publicCard builds it.
  for (const name of ['Sarah Chen', '  Priya   Raman ', '', 'María Fernanda González Rodríguez', 'madonna']) {
    const real = Ci.publicCard({ id: 'x', full_name: name, brokerage: ' Demo Realty ' });
    assert.deepEqual(PV.circleCardOf({ full_name: name, brokerage: ' Demo Realty ' }), { name: real.name, brokerage: real.brokerage, initials: real.initials }, name);
    assert.equal(RC.initialsOf(name), Ci.initialsOf(name), name);
  }
  // Drawn, each shows what it was given.
  const brand = renderToStaticMarkup(React.createElement(ReportBrand, { realtor: { name: 'Sarah Chen', brokerage: 'Demo Realty', logoUrl: '/logo.png' } }));
  assert.match(brand, /<img src="\/logo\.png"/); assert.match(brand, />Sarah Chen</); assert.match(brand, />Demo Realty</);
  const card = renderToStaticMarkup(React.createElement('ul', null, React.createElement(RC.default, { who: { name: 'Sarah Chen', brokerage: 'Demo Realty', initials: 'SC' } })));
  assert.match(card, /class="cv-avatar"[^>]*>SC</); assert.match(card, /class="cv-name"[^>]*>Sarah Chen</); assert.match(card, /class="cv-brok">Demo Realty</);
});

test('3. every field and action that was on the two screens is still there', () => {
  const body = code('components/dashboard/ProfileEditorBody.js'); const view = code('components/dashboard/ProfileView.js');
  for (const k of ['full_name', 'phone', 'license_number', 'brokerage', 'brokerage_address']) assert.match(body, new RegExp(`${k}: \\{ k: '${k}'`), k);
  for (const k of ['province', 'board']) assert.match(body, new RegExp(`<select id="profile-field-${k}"`), k);
  assert.match(body, /The province you operate in\. Sets rules like the tenant age of majority \(Ontario 18, BC 19\)\./);
  for (const s of [/fileRef\.current\?\.click\(\)/, /setStudioOpen\(\(o\) => !o\)/, /data-destructive="" onClick=\{async \(\) => \{ await removeLogo\(\); setRemoveAsk\(false\); \}\}/, /<LogoStudio/, /PALETTE_ORDER\.map/, /FONT_PAIRINGS\.map/, /onClick=\{\(\) => selectFont\(fp\)\}/]) assert.match(body, s, String(s));
  assert.match(view, /<InviteRealtor \/>/); assert.match(view, /onClick=\{signOut\}/);
  assert.match(view, /<a \{\.\.\.linkProps\(adapter\.paths\.home, \{ back: true \}\)\} className="pv-back"/, 'the back row, on a phone');
  const circle = code('components/dashboard/CircleView.js');
  for (const s of ['id="cv-search"', '>Add to circle</button>', '>Requested</button>', 'label="Accepting">Accept<', 'label="Declining">Decline<', '>Block</button>', '>Remove</button>', '>Cancel request</button>', "'Copy link'", '>Share by text</a>', 'Save and email them', 'Send again', 'label="Show me in search"', 'label="I do rentals"', 'Save areas', '>Unblock</button>', '>Try again</button>', '<InviteRealtor full />', 'Connected since', 'Your handoffs with them', 'Broker of record:', 'How you appear', 'Blocked']) assert.ok(circle.includes(s), s);
  for (const id of ['cv-b-name', 'cv-b-address', 'cv-b-phone', 'cv-b-broker', 'cv-b-email', 'cv-b-hst']) assert.ok(circle.includes(`id="${id}"`), id);
});

test('4. the brokerage form: one button opens it over the view, it saves as it always did, and the two names are stored apart', () => {
  const circle = code('components/dashboard/CircleView.js');
  // The same route, the same payload, the same fields.
  assert.match(circle, /const \{ ok, j \} = await post\(adapter, '\/api\/circle\/brokerage', \{ action: 'save', \.\.\.form \}\);/);
  assert.match(circle, /setForm\(\(f\) => f \|\| \{ legalName: [^,]+, address: [^,]+, phone: [^,]+, brokerName: [^,]+, brokerEmail: [^,]+, hstNumber: [^}]+\}\);/);
  assert.match(circle, /await post\(adapter, '\/api\/circle\/brokerage', \{ action: 'resend' \}\);/);
  // One button on the short card opens the panel; the panel is the sheet every panel is.
  assert.match(circle, /<button type="button" className="cv-btn cv-btn-line" aria-haspopup="dialog" data-brokerage-open="" onClick=\{openPanel\}>/);
  assert.match(circle, /<Sheet open=\{panelShown\} onClose=\{\(\) => setPanel\(false\)\} label="Your brokerage"/);
  assert.match(circle, /<div className="cv cv-panel" onKeyDown=\{holdTab\} data-brokerage-panel="">/);
  assert.match(circle, /const panelShown = panel && wide;/);
  assert.match(circle, /\{!panelShown && \(\s*<section className="rl-card cv-card cv-brk-page"/, 'one form at a time: the page\'s goes while the panel is up');
  // Each name says what it is for.
  assert.equal(BROKERAGE_NAME_LINE, 'The name on your reports.');
  assert.equal(LEGAL_NAME_LINE, 'The legal entity your broker of record confirms.');
  assert.match(circle, /<Field id="cv-b-name" label="Legal name"[^\n]*hint=\{LEGAL_NAME_LINE\} \/>/);
  assert.match(code('components/dashboard/ProfileEditorBody.js'), /brokerage: \{ k: 'brokerage',[^\n]*hint: BROKERAGE_NAME_LINE \}/);
  // Stored apart: the profile's brokerage through the profile route, the legal name on the record.
  assert.match(code('lib/brokerage.js'), /legal_name: text\(body\.legalName, 120\)/);
  assert.doesNotMatch(code('lib/brokerage.js'), /from\('profiles'\)\.update/);
  assert.match(code('components/dashboard/ProfileEditorBody.js'), /await postJson\('\/api\/profile\/update', \{\s*full_name:[^}]*brokerage: f\.brokerage\.trim\(\) \|\| null,/);
});

test('5. one style of buttons on each screen, and red only for the one main action', () => {
  const circle = code('components/dashboard/CircleView.js');
  // Each button's opening tag, an arrow function's => inside it included.
  const buttons = (s) => s.split('<button').slice(1).map((b) => b.match(/^(?:=>|[^>])*/)[0]);
  for (const b of buttons(circle)) assert.match(b, /className="(cv-btn cv-btn-(ink|line|quiet)|cv-switch)"/, b);
  assert.doesNotMatch(circle, /cv-btn-red|cv-btn-text|\bC\.red\b/, 'no red on the screen: the sidebar\'s New listing is its one red');
  const studio = code('components/dashboard/LogoStudio.js');
  for (const b of buttons(studio)) assert.match(b, /className="ds-btn ds-btn-(ink|line)"/, b);
  assert.doesNotMatch(studio, /background: [^,\n]*C\.red\b/, 'no red button in the studio');
  const body = code('components/dashboard/ProfileEditorBody.js');
  const row = body.slice(body.indexOf('data-logo-row=""'), body.indexOf('Upload accepts PNG'));
  assert.deepEqual(row.match(/className="ds-btn [^"]+"/g), ['className="ds-btn ds-btn-ink"', 'className="ds-btn ds-btn-quiet"', 'className="ds-btn ds-btn-quiet"'], 'the upload the main one, the AI studio and Remove quiet');
  // Red in the editor only in a modal host's own Save (onClose), never on the page.
  const page = body.slice(0, body.indexOf('{onClose && <div'));
  assert.doesNotMatch(page, /\bC\.red\b/);
  assert.match(code('components/dashboard/ProfileView.js'), /className="ds-btn ds-btn-line" data-sign-out=""/);
  assert.match(code('components/dashboard/InviteRealtor.js'), /data-invite-open-circle="" className="ds-btn ds-btn-line"/);
  assert.match(code('components/dashboard/DashShell.js'), /:global\(\.ds-btn-ink\) \{ background: \$\{C\.inkFill\}; color: \$\{C\.onInk\}; border: 1px solid \$\{C\.inkFill\}; \}/);
  // Remove asks in the page, and the confirm is marked as the destructive control.
  assert.match(body, /\{removeAsk \? \(\s*<div className="pe-ask" data-logo-remove-ask="">/);
  assert.doesNotMatch(body, /window\.confirm|\bconfirm\(/, 'never a browser dialog');
});

test('6. the layout: the main area\'s whole width from 1024px, two columns, a grid of cards', () => {
  const shell = code('components/dashboard/DashShell.js');
  assert.match(shell, /\.ds-main :global\(\.ds-fill\) \{ box-sizing: border-box !important; max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: var\(--ds-pad\) !important; padding-right: var\(--ds-pad\) !important; \}/);
  assert.match(code('components/dashboard/ProfileView.js'), /<div className="pv ds-fill">/);
  assert.match(code('components/dashboard/CircleView.js'), /<div className="cv-page ds-fill">/);
  const view = code('components/dashboard/ProfileView.js');
  assert.match(view, /@media \(min-width: 1024px\) \{\s*\.pv-back \{ display: none !important; \}/, 'the sidebar does the back row\'s job');
  assert.match(view, /\.pv-cols \{[^}]*grid-template-columns: minmax\(0, clamp\(560px, 44vw, 880px\)\) minmax\(340px, 1fr\);/, 'the form at a comfortable width, the preview the rest');
  assert.match(view, /\.pv-aside \{ display: block; min-width: 0; position: sticky; top: var\(--pv-top\); \}/);
  assert.match(view, /\.pv-aside \{ display: none; \}/, 'no preview column under 1024px');
  const circle = code('components/dashboard/CircleView.js');
  assert.match(circle, /\.cv :global\(\.cv-aside\) \{ grid-column: 2; grid-row: 1 \/ span 2;[^}]*position: sticky; top: var\(--cv-top\);/);
  assert.match(circle, /@media \(min-width: 1280px\) \{\s*\.cv :global\(\.cv-grid\) \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(circle, /@media \(min-width: 1920px\) \{ \.cv :global\(\.cv-grid\) \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/);
  assert.match(circle, /@media \(min-width: 2560px\) \{ \.cv :global\(\.cv-grid\) \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \} \}/);
  // The empty circle invites: one line and the two ways to start.
  assert.match(circle, /<div className="cv-empty" data-circle-empty="">\s*<p className="cv-empty-line">[^<]+<\/p>\s*<div className="cv-actions">\s*<button[^>]*data-circle-start="search"[^>]*>Find a realtor<\/button>\s*\{link \? <button[^>]*data-circle-start="link"/);
});
