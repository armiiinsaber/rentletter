// components/tenant/profileSteps.js  PURE, isomorphic. The words around the steps of
// lib/profileStrength.js on the tenant's own profile (pages/my-application.js), and the guided
// start of the writing helper (components/tenant/ProfilePersonal.js). Nothing here counts a step
// or decides one: the steps, their order, their titles and whether each is done come from the
// library as /api/tenant/personal answers it.
//   MARK_STEPS             the steps the profile card marks (components/tenant/ProfileCard.js)
//   doneLabel(key, vault)  what a done step says: only what happened. An ID is added; an income
//                          figure is read from a document only when a fact was read from one.
//   BENEFIT                the one line under the next step: what that step changes for a realtor
//                          reading the profile (components/dashboard/SharedProfileView.js), and no
//                          promise of any outcome
//   composeAnswers(a)      the three answers of the guided start as the one note the suggest
//                          action already takes (POST /api/tenant/personal { action: 'suggest', text })
//   addsNothing(s, a)      false when a suggestion holds a number or a name the answers do not
import { ABOUT_PROMPTS } from '../../lib/profilePersonal';
import { numbersIn, latinWordsIn } from '../../lib/aboutTranslation';

export const MARK_STEPS = Object.freeze(['photo', 'about', 'id', 'income', 'employment', 'reference']);

const kindsOf = (list) => new Set((list || []).map((x) => x.kind));
// vault: { documents: [{ kind }], checks: [{ kind }] } as /api/tenant/vault answers it, or null.
export function doneLabel(key, vault = null) {
  const docs = kindsOf(vault && vault.documents); const checks = kindsOf(vault && vault.checks);
  switch (key) {
    case 'details': return 'Details added';
    case 'photo': return 'Photo added';
    case 'about': return 'About me added';
    case 'id': return 'ID added';
    case 'income': return checks.has('income_annual_gross') ? 'Income read from your document' : 'Proof of income added';
    case 'employment': return docs.has('employment') || !checks.has('employer_name') ? 'Employment letter added' : 'Employer read from your document';
    case 'reference': return 'Landlord reference added';
    case 'prepay': return 'Offer to prepay added';
    default: return 'Added';
  }
}

export const BENEFIT = Object.freeze({
  details: 'A realtor reads your name, phone, job and income without asking you for them.',
  photo: 'A realtor you share with sees your photo beside your name.',
  about: 'A realtor reads a few lines in your own words before your details.',
  id: 'A realtor sees whether the name on your ID matches your profile, never the ID itself.',
  income: 'A realtor sees the income read from your document and the date it was read.',
  employment: 'A realtor sees the employer read from your letter and the date it was read.',
  reference: 'A realtor gets your landlord’s name and contact, so they can ask for a reference.',
  prepay: 'A realtor sees it marked as your own offer, which no landlord can require.',
});

// The guided start: the three questions the chips under About me already name, each answered in
// a few words, in any language. ANSWER_MAX keeps the three, with their questions, under the 600
// characters the suggest action takes.
export const ANSWER_MAX = 160;
export const GUIDE_QUESTIONS = Object.freeze([...ABOUT_PROMPTS]);
const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, ANSWER_MAX);
// "What you do: …" a line, for the answers given; '' when none was.
export function composeAnswers(answers) {
  return GUIDE_QUESTIONS.map((q, i) => [q, clean(answers && answers[i])]).filter(([, a]) => a).map(([q, a]) => `${q}: ${a}`).join('\n');
}
// The names a suggestion in Latin letters holds: a word with a capital letter that does not start
// a sentence, other than I and its contractions.
function capitalsIn(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?:;\n])\s+/)) {
    const words = sentence.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’&.-]*[A-Za-zÀ-ɏ]|[A-Za-zÀ-ɏ]/g) || [];
    words.slice(1).forEach((w) => { if (/^[A-ZÀ-Þ]/.test(w) && !/^I(['’].*)?$/.test(w)) out.push(w.replace(/[.'’]+$/, '')); });
  }
  return out;
}
// Does the suggestion keep to what the answers say? Every number in it is one the tenant wrote,
// and every name (a capitalised word inside a sentence, or a word in Latin letters inside text in
// another script) is one they wrote too. A suggestion that fails is not shown.
export function addsNothing(suggestion, answers) {
  const said = (answers || []).map(clean).filter(Boolean).join('\n');
  const low = said.toLowerCase();
  const have = new Set(numbersIn(said));
  if (numbersIn(suggestion).some((n) => !have.has(n))) return false;
  const names = [...capitalsIn(suggestion), ...latinWordsIn(suggestion)];
  return names.every((w) => low.includes(w.toLowerCase()));
}
