// lib/documentSet.js  PURE, isomorphic. The one definition of a complete document set, shared by
// the tenant's upload card (components/tenant/DocumentUploader.js), the emails that ask for
// documents (lib/nudges.js, pages/api/applicants/request-documents.js, pages/api/send.js) and the
// realtor's document panel. Realtors expect one to three recent pay stubs, an employment letter,
// and a credit report if the tenant has one. The credit report is optional and is never scored.
import { kindOf } from './documentAuthority.js';
import { CREDIT_OPTIONAL_LINE } from './creditShared.js';

export const DOCUMENT_SET = Object.freeze([
  Object.freeze({ key: 'paystubs', label: '1 to 3 recent pay stubs', min: 1, max: 3, types: Object.freeze(['pay stub']) }),
  Object.freeze({ key: 'letter', label: 'An employment letter', min: 1, max: 1, types: Object.freeze(['employment letter']) }),
  // Optional, always: never required by the form, the reminders or the realtor's criteria. The
  // note is the one line under it; a listing that asks for one (pref_ask_credit_report) only moves
  // this row first (lib/creditShared.js).
  Object.freeze({ key: 'credit', label: 'A credit report', note: CREDIT_OPTIONAL_LINE, min: 0, max: 1, types: Object.freeze(['credit report']), optional: true }),
]);

// The set in one sentence, for the tenant ("you") and for the realtor ("they").
export const SET_SENTENCE = 'One to three recent pay stubs, an employment letter, and a credit report if you have one.';
export const SET_SENTENCE_LOWER = 'one to three recent pay stubs, an employment letter, and a credit report if you have one';
export const SET_SENTENCE_REALTOR = 'Ask for one to three recent pay stubs, an employment letter, and a credit report if they have one.';

// The kind of an analysed document: an analysed document object ({ documentType, unrecognized })
// or a bare type string. Recognition is the analysis's own type, read through the same rules as
// document authority, so an "earnings statement" counts as a pay stub.
const kindOfEntry = (d) => kindOf(typeof d === 'string' ? { documentType: d } : d);

// setStatus(documents, { creditFirst }) -> { items: [{ key, label, note, min, max, optional, count, met }], complete }
// complete: every item that is not optional has at least its minimum. creditFirst: the credit
// report row leads (the listing asked for one); nothing else about the set changes.
export function setStatus(documents, { creditFirst = false } = {}) {
  const kinds = (Array.isArray(documents) ? documents : []).map(kindOfEntry);
  const ordered = creditFirst ? [...DOCUMENT_SET.filter((it) => it.key === 'credit'), ...DOCUMENT_SET.filter((it) => it.key !== 'credit')] : DOCUMENT_SET;
  const items = ordered.map((it) => {
    const count = kinds.filter((k) => it.types.includes(k)).length;
    return { key: it.key, label: it.label, note: it.note || null, min: it.min, max: it.max, optional: !!it.optional, count, met: count >= Math.max(it.min, 1) };
  });
  return { items, complete: items.every((it) => it.optional || it.count >= it.min) };
}
