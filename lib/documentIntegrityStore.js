// lib/documentIntegrityStore.js  SERVER ONLY (takes the service role client). Check g of
// lib/documentIntegrity.js: the same file, by content hash (db/011 applicant_documents.content_hash),
// submitted by two different applicants on the same realtor's listings. Every read is filtered by
// that realtor's profile_id, so two realtors' files are never compared; only live rows carry a hash
// (it is cleared when the file is deleted or expires, lib/documentStore.js).
//   sameFileFindings(admin, { profileId, linkId, applicationId, application, documentIds, at })
//     -> { findings, mirrors }: the findings for this applicant, and the matching ones for the
//        applicants who sent the same file earlier ({ linkId, finding })
//   applyMirrors(admin, mirrors)   adds each mirror finding to that applicant's active report, once
// Before db/011 the column is absent and both answer nothing.
import { INTEGRITY, storedFindings } from './documentIntegrity.js';
import { nameOnDocMatches } from './documentAuthority.js';
import { displayLabel } from './listingAddress.js';
import { normalizeDocV } from './docVerifications.js';

const kindWord = (kind) => {
  const k = String(kind || '').toLowerCase();
  if (/pay\s*stub|pay\s*statement|earnings|payslip/.test(k)) return 'pay stub';
  if (/employment letter|offer letter/.test(k)) return 'employment letter';
  if (/bank statement/.test(k)) return 'bank statement';
  if (/t4|notice of assessment|tax/.test(k)) return 'tax document';
  return 'document';
};
const samePerson = (a, b) => {
  if (!a || !b) return false;
  const ea = String(a.email || '').trim().toLowerCase(), eb = String(b.email || '').trim().toLowerCase();
  if (ea && ea === eb) return true;
  return nameOnDocMatches(a.full_name || '', b.full_name || '') === true;
};

export async function sameFileFindings(admin, { profileId, linkId, applicationId, application, documentIds, at = new Date() } = {}) {
  const none = { findings: [], mirrors: [] };
  const ids = (documentIds || []).filter(Boolean).map(String);
  if (!admin || !profileId || !linkId || !ids.length) return none;
  const stamp = new Date(at).toISOString();
  try {
    const { data: mine, error } = await admin.from('applicant_documents').select('id, kind, content_hash, profile_id').in('id', ids);
    if (error) return none;
    const own = (mine || []).filter((r) => r && r.content_hash && String(r.profile_id) === String(profileId));
    const hashes = [...new Set(own.map((r) => r.content_hash))];
    if (!hashes.length) return none;
    const { data: matches, error: mErr } = await admin.from('applicant_documents').select('id, kind, content_hash, profile_id, listing_applicant_id, deleted_at').eq('profile_id', profileId).in('content_hash', hashes).is('deleted_at', null);
    if (mErr) return none;
    const foreign = (matches || []).filter((r) => r && String(r.profile_id) === String(profileId) && String(r.listing_applicant_id) !== String(linkId) && !ids.includes(String(r.id)));
    if (!foreign.length) return none;
    const { data: links } = await admin.from('listing_applicants').select('id, listing_id, application_id').in('id', [...new Set(foreign.map((r) => r.listing_applicant_id))]);
    const linkById = new Map((links || []).map((l) => [String(l.id), l]));
    const appIds = [...new Set((links || []).map((l) => l.application_id).filter((x) => x != null && String(x) !== String(applicationId)))];
    const listingIds = [...new Set((links || []).map((l) => l.listing_id))];
    const { data: apps } = appIds.length ? await admin.from('applications').select('id, full_name, email').in('id', appIds) : { data: [] };
    const { data: listings } = listingIds.length ? await admin.from('listings').select('*').in('id', listingIds) : { data: [] };
    const appById = new Map((apps || []).map((a) => [String(a.id), a]));
    const listingById = new Map((listings || []).map((l) => [String(l.id), l]));
    // This applicant's own listing, for the mirror sentence on the other side.
    const { data: myLink } = await admin.from('listing_applicants').select('id, listing_id').eq('id', linkId).maybeSingle();
    const { data: myListing } = myLink ? await admin.from('listings').select('*').eq('id', myLink.listing_id).maybeSingle() : { data: null };
    const findings = []; const mirrors = []; const seen = new Set();
    for (const r of own) {
      for (const o of foreign.filter((x) => x.content_hash === r.content_hash)) {
        const link = linkById.get(String(o.listing_applicant_id));
        const listing = link && listingById.get(String(link.listing_id));
        const other = link && appById.get(String(link.application_id));
        if (!link || !listing || String(listing.profile_id) !== String(profileId) || !other) continue; // another realtor, or the same applicant
        if (samePerson(application, other)) continue; // one person on two listings is never a finding
        const key = `${r.id}:${o.listing_applicant_id}`;
        if (seen.has(key)) continue; seen.add(key);
        findings.push({ type: INTEGRITY.SAME_FILE, documentId: r.id, sentence: `This ${kindWord(r.kind)} is the same file another applicant submitted on ${displayLabel(listing, 'another of your listings')}.`, at: stamp });
        mirrors.push({ linkId: o.listing_applicant_id, partyRow: !!o.application_party_id, finding: { type: INTEGRITY.SAME_FILE, documentId: o.id, sentence: `This ${kindWord(o.kind)} is the same file another applicant submitted on ${displayLabel(myListing || listing, 'another of your listings')}.`, at: stamp } });
      }
    }
    return { findings, mirrors };
  } catch (e) {
    return none;
  }
}

// The applicant who sent the file first gets the same finding on their active report, once. A
// party's file (its report lives on application_parties) is left to that party's next read.
export async function applyMirrors(admin, mirrors) {
  for (const m of mirrors || []) {
    if (!m || m.partyRow || !m.linkId) continue;
    try {
      const { data: row } = await admin.from('listing_applicants').select('id, doc_verifications').eq('id', m.linkId).maybeSingle();
      const n = normalizeDocV(row && row.doc_verifications);
      if (!n.active) continue;
      const current = storedFindings(n.active.integrity);
      if (current.some((f) => f.type === m.finding.type && f.documentId === m.finding.documentId)) continue;
      await admin.from('listing_applicants').update({ doc_verifications: { active: { ...n.active, integrity: storedFindings([...current, m.finding]) }, archived: n.archived } }).eq('id', m.linkId);
    } catch (e) { /* a mirror never fails the upload that found it */ }
  }
}
