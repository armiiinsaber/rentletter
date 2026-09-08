// lib/documentSet.js  PURE, isomorphic. The one definition of a complete document set, shared by
// the tenant's upload card (components/tenant/DocumentUploader.js), the emails that ask for
// documents (lib/nudges.js, pages/api/applicants/request-documents.js, pages/api/send.js) and the
// realtor's document panel. Realtors expect one to three recent pay stubs, an employment letter,
// and a credit report if the tenant has one. The credit report is optional and is never scored.
import { kindOf } from './documentAuthority.js';

export const DOCUMENT_SET = Object.freeze([
  Object.freeze({ key: 'paystubs', label: '1 to 3 recent pay stubs', min: 1, max: 3, types: Object.freeze(['pay stub']) }),
  Object.freeze({ key: 'letter', label: 'An employment letter', min: 1, max: 1, types: Object.freeze(['employment letter']) }),
  Object.freeze({ key: 'credit', label: 'A credit report, if you have one', min: 0, max: 1, types: Object.freeze(['credit report']), optional: true }),
]);

// The set in one sentence, for the tenant ("you") and for the realtor ("they").
export const SET_SENTENCE = 'One to three recent pay stubs, an employment letter, and a credit report if you have one.';
export const SET_SENTENCE_LOWER = 'one to three recent pay stubs, an employment letter, and a credit report if you have one';
export const SET_SENTENCE_REALTOR = 'Ask for one to three recent pay stubs, an employment letter, and a credit report if they have one.';

// The kind of an analysed document: an analysed document object ({ documentType, unrecognized })
// or a bare type string. Recognition is the analysis's own type, read through the same rules as
// document authority, so an "earnings statement" counts as a pay stub.
const kindOfEntry = (d) => kindOf(typeof d === 'string' ? { documentType: d } : d);

// setStatus(documents) -> { items: [{ key, label, min, max, optional, count, met }], complete }
// complete: every item that is not optional has at least its minimum.
export function setStatus(documents) {
  const kinds = (Array.isArray(documents) ? documents : []).map(kindOfEntry);
  const items = DOCUMENT_SET.map((it) => {
    const count = kinds.filter((k) => it.types.includes(k)).length;
    return { key: it.key, label: it.label, min: it.min, max: it.max, optional: !!it.optional, count, met: count >= Math.max(it.min, 1) };
  });
  return { items, complete: items.every((it) => it.optional || it.count >= it.min) };
}
