// lib/duplicates.js  PURE, shared by lib/supabaseBridge.js and the sandbox. Two active
// applications on one listing that share a phone (digits only), a normalized email, or a
// normalized full name and employer are the same person twice. The later one gets duplicateOf
// (the earlier one's linkId) and duplicateBy ('phone' | 'email' | 'name and employer'). Nothing
// is merged, nothing scores differently: the card says it in one line and the realtor decides.
import { isWithdrawn } from './listingApplicantsVocabulary.js';
import { DECISION_STATUS } from './listingApplicantsVocabulary.js';
import { normalizeEmployer } from './employerName.js';

const digits = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const active = (a) => a && !isWithdrawn(a) && a.decisionStatus !== DECISION_STATUS.REJECT;

export function duplicateMatch(earlier, later) {
  const a = earlier?.application || {}, b = later?.application || {};
  const pa = digits(a.phone), pb = digits(b.phone);
  if (pa && pa.length >= 10 && pa === pb) return 'phone';
  const ea = norm(a.email), eb = norm(b.email);
  if (ea && ea === eb) return 'email';
  const na = norm(a.full_name), nb = norm(b.full_name), ma = normalizeEmployer(a.employer), mb = normalizeEmployer(b.employer); // lib/employerName.js
  if (na && ma && na === nb && ma === mb) return 'name and employer';
  return null;
}

// applicants: one listing's rows in arrival order (earliest first). Mutates and returns.
export function markDuplicates(applicants) {
  const list = applicants || [];
  const seen = [];
  for (const a of list) {
    if (!a) continue;
    delete a.duplicateOf; delete a.duplicateBy;
    if (!active(a)) continue;
    for (const prev of seen) {
      const by = duplicateMatch(prev, a);
      if (by) { a.duplicateOf = prev.linkId; a.duplicateBy = by; a.duplicateOfName = prev.application?.full_name || null; break; }
    }
    seen.push(a);
  }
  return list;
}

export const duplicateLine = (a) => (a && a.duplicateOf ? `Same ${a.duplicateBy} as ${a.duplicateOfName || 'an earlier applicant'}` : null);
