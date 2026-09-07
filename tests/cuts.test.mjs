// The chat and the AI insight are gone; onboarding asks the display name only and the rest is
// asked just in time: the province at the first listing, the signing name at the first send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { needsOnboarding, isOnboarded } from '../lib/onboarding.js';
import { needsProvince, needsSignature, defaultSignature, needsBrandingHint, BRANDING_HINT, BRANDING_HINT_LINK } from '../lib/justInTime.js';

const root = new URL('../', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = `${d}/${n}`; if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git/.test(p)) walk(p); } else if (/\.(js|mjs)$/.test(n)) files.push(p); } };
for (const d of ['pages', 'components', 'lib', 'tests']) walk(`${root}${d}`);
const read = (p) => readFileSync(p, 'utf8');

test('the chat is gone: no file imports or mounts it, no route, no copy sends anyone to it', () => {
  for (const f of ['pages/api/chat.js', 'components/ChatWidget.js', 'lib/assistantActions.js', 'lib/chatKnowledge.js']) assert.equal(existsSync(`${root}${f}`), false, f);
  for (const p of files) {
    if (p.endsWith('tests/cuts.test.mjs')) continue;
    const s = read(p);
    assert.doesNotMatch(s, /ChatWidget|assistantActions|chatKnowledge|\/api\/chat\b|__rlAssistantContext|rl:assistant-applied/, p);
    assert.doesNotMatch(s, /use the chat|chat assistant|ask the assistant/i, p);
  }
  const panel = read(`${root}components/dashboard/AssistantPanel.js`);
  assert.match(panel, /const TABS = \[\['next', 'Next'\], \['history', 'History'\]\];/);
  assert.doesNotMatch(panel, /'ask'/);
});

test('the AI insight is gone: no route, no generator, no control, no ai_insight read outside db and the archive shape key', () => {
  assert.equal(existsSync(`${root}pages/api/applicants/insight.js`), false);
  for (const p of files) {
    if (p.endsWith('tests/cuts.test.mjs')) continue;
    const s = read(p);
    assert.doesNotMatch(s, /generateApplicantInsight|Generate AI insight|\/api\/applicants\/insight|aiInsight|initialInsight/, p);
    if (!p.endsWith('lib/docVerifications.js')) assert.doesNotMatch(s, /ai_insight/, p);
  }
  const bridge = read(`${root}lib/supabaseBridge.js`);
  assert.match(bridge, /const OPTIONAL_JUNCTION_COLS = \['doc_verifications', 'reviewed_at', 'withdrawn_at', 'confirmations', 'last_sent_at'\];/);
  const dv = read(`${root}lib/docVerifications.js`);
  assert.match(dv, /ai_insight: null/, 'the archive entry keeps its key, always null now');
});

test('the onboarding gate: a profile with a display name and nothing else is complete', () => {
  assert.equal(needsOnboarding({ full_name: 'Sarah Chen' }), false);
  assert.equal(needsOnboarding({ full_name: 'Sarah Chen', onboarding_step: 'identity', province: null, brokerage: null }), false, 'whatever the old step says');
  assert.equal(needsOnboarding({ full_name: '  ' }), true);
  assert.equal(needsOnboarding({ email: 'x@y.z' }), true);
  assert.equal(needsOnboarding(null), false, 'no row: never lock anyone out');
  assert.equal(isOnboarded({ full_name: 'A' }), true);
  const page = read(`${root}pages/onboarding.js`);
  assert.match(page, /if \(isOnboarded\(p\)\) return \{ redirect: \{ destination: '\/landlord'/);
  assert.match(page, /onboarding_step: 'done', onboarding_completed_at/);
  assert.doesNotMatch(page, /ProvinceStep|BrandingStep|ListingStep|DoneStep/);
  const flow = read(`${root}components/onboarding/OnboardingFlow.js`);
  assert.doesNotMatch(flow, /ob-brokerage|PROVINCE_OPTIONS|ProvinceStep|BrandingStep|ListingStep/);
  assert.match(flow, /onSave\(\{ full_name: name\.trim\(\)\.slice\(0, NAME_MAX\) \}\)/);
  const gate = read(`${root}pages/landlord.js`);
  assert.match(gate, /if \(needsOnboarding\(finalProfile\)\) return \{ redirect: \{ destination: '\/onboarding'/);
});

test('just in time: province at the first listing, signing name at the first send, the branding hint', () => {
  assert.equal(needsProvince({ province: null }), true); assert.equal(needsProvince({ province: 'ON' }), false);
  assert.equal(needsSignature({}), true); assert.equal(needsSignature({ report_signature: 'Sarah Chen' }), false);
  assert.equal(defaultSignature({ full_name: 'Sarah Chen', brokerage: 'Demo Realty' }), 'Sarah Chen, Demo Realty');
  assert.equal(defaultSignature({ full_name: 'Sarah Chen' }), 'Sarah Chen');
  assert.equal(needsBrandingHint({}), true); assert.equal(needsBrandingHint({ brokerage: 'Demo Realty' }), false); assert.equal(needsBrandingHint({ logo_url: 'x' }), false);
  assert.equal(`${BRANDING_HINT} ${BRANDING_HINT_LINK}`, 'The report carries your name only. Add a logo and brokerage on your profile.');
  const modal = read(`${root}components/listings/ListingSetupModal.js`);
  assert.match(modal, /askProvince = false/); assert.match(modal, /\.\.\.\(askProvince && province \? \{ province \} : \{\}\)/); assert.match(modal, /const provinceOk = !askProvince \|\| !!province;/);
  const home = read(`${root}components/dashboard/HomeView.js`);
  assert.match(home, /askProvince=\{needsProvince\(profile\)\}/);
  assert.match(home, /const \{ province, \.\.\.values \} = input \|\| \{\};/);
  assert.match(home, /body: JSON\.stringify\(\{ province \}\)/, 'the province goes to the profile through its route');
  const lv = read(`${root}components/dashboard/ListingView.js`);
  assert.match(lv, /if \(needsSignature\(profile\)\) \{ setSigValue\(defaultSignature\(profile\)\); setSigSheet\(true\); return; \}/);
  assert.match(lv, /body: JSON\.stringify\(\{ report_signature: v \}\)/);
  assert.match(lv, /title="Sign the report as" confirmLabel="Send"/);
  assert.match(lv, /brandHint && needsBrandingHint\(profile\)/);
});
