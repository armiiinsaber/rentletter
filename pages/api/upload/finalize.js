// /api/upload/finalize
// PUBLIC. Phase 2 of the tenant document upload: called ONCE after every file has been analyzed
// by /api/upload/analyze-file. It reads the staged per-document facts, assembles the SAME run
// shape the realtor batch produces (so the realtor-facing DocIntelReport renders identically),
// runs the shared insight engine over the combined result, and writes doc_verifications /
// ai_insight / docs_submitted_at / docs_verified onto the exact applicant this token maps to —
// under the same two-key (linkId + application_id) write guard as the realtor path.
//
// No document analysis happens here (no image bytes are present) — only structured facts and one
// short text insight call, so there is no 4.5MB / 60s exposure. On success it marks the docreq
// received, sets the realtor's notification marker, and clears the staging keys. A transient save
// failure returns an error WITHOUT marking received or clearing staging, so the client can retry
// finalize only (no re-analysis).
import { kvReady, kvGetJson, kvSetJson, kvDel, reqKey, appKey, stagingKey, isDocReqToken, DOCREQ_TTL } from '../../../lib/docRequest';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { generateApplicantInsight, computeNameMatch } from '../../../lib/applicantAnalysis';

// Only a token in the body; one text insight call. Modest duration, no large body.
export const config = { maxDuration: 30 };

const norm = (v) => String(v ?? '').trim().toLowerCase();

// Cross-reference across documents (screenable facts only). Each file was read alone, so we derive
// consistency here from the extracted facts: a field is "consistent" if every document that states
// it agrees, otherwise a "discrepancy" (both values shown — factual, never an accusation). OHRC:
// only name / employer / income are ever compared.
function deriveCrossReference(documents) {
  const out = [];
  const stated = (field, onlyRecognized) => documents
    .filter((d) => d && (!onlyRecognized || d.unrecognized !== true))
    .map((d) => d.extracted && d.extracted[field])
    .filter((v) => v != null && String(v).trim());

  const names = stated('applicantName', true);
  if (names.length >= 2) {
    const same = names.every((n) => norm(n) === norm(names[0]));
    out.push({ field: 'Applicant name', status: same ? 'consistent' : 'discrepancy',
      detail: same ? `Name matches across ${names.length} documents.` : `Names differ across documents: ${[...new Set(names)].join(' vs ')}.` });
  }
  const employers = stated('employer', false);
  if (employers.length >= 2) {
    const same = employers.every((e) => norm(e) === norm(employers[0]));
    out.push({ field: 'Employer', status: same ? 'consistent' : 'discrepancy',
      detail: same ? `Employer matches across documents (${employers[0]}).` : `Employer differs across documents: ${[...new Set(employers)].join(' vs ')}.` });
  }
  const incomes = stated('income', false);
  if (incomes.length >= 2) {
    const same = incomes.every((e) => norm(e) === norm(incomes[0]));
    out.push({ field: 'Income', status: same ? 'consistent' : 'discrepancy',
      detail: same ? 'Income figure consistent across documents.' : `Income figures differ across documents: ${[...new Set(incomes)].join(' vs ')}.` });
  }
  return out;
}

// Merge each file's comparison-to-application into one per field. Drop not-found; surface the most
// informative status (a real mismatch or match beats "not found"). Keeps discrepancies realtor-side.
function mergeComparisons(items) {
  const rank = { mismatch: 3, close: 2, match: 1, not_found: 0 };
  const byField = {};
  for (const it of items) {
    for (const c of (it.comparisons || [])) {
      if (!c || !c.field) continue;
      const cur = byField[c.field];
      if (!cur || (rank[c.status] ?? 0) > (rank[cur.status] ?? 0)) byField[c.field] = c;
    }
  }
  return Object.values(byField);
}

function buildSummary(documents, comparisons, nameMatch) {
  if (!documents.length) return '';
  const n = documents.length;
  const parts = [`Read ${n} document${n === 1 ? '' : 's'}.`];
  const verified = comparisons.filter((c) => c.status === 'match').map((c) => c.field);
  const issues = comparisons.filter((c) => c.status === 'mismatch').map((c) => c.field);
  if (verified.length) parts.push(`${verified.join(', ')} verified against the application.`);
  if (issues.length) parts.push(`${issues.join(', ')} did not match the application — review the details.`);
  if (nameMatch === 'match') parts.push('Document name matches the applicant.');
  else if (nameMatch === 'mismatch') parts.push('Document name does not match the applicant.');
  return parts.join(' ').slice(0, 1200);
}

// Assemble the combined run in the exact shape runDocumentAnalysis produces for the realtor batch.
function buildCombinedRun(items, applicantName) {
  const sorted = [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const documents = sorted.map((it) => it.document).filter(Boolean);
  const documentNames = documents
    .filter((d) => d && d.unrecognized !== true)
    .map((d) => (d.extracted && d.extracted.applicantName) || null)
    .filter((n) => typeof n === 'string' && n.trim());
  const nameMatch = computeNameMatch(applicantName, documentNames); // 'match' | 'mismatch' | 'unclear'
  const comparisons = mergeComparisons(sorted);

  // Confidence: the most conservative across the documents.
  const order = { low: 0, medium: 1, high: 2 };
  let confidence = documents.length ? 'high' : 'low';
  for (const it of sorted) { if ((order[it.confidence] ?? 1) < (order[confidence] ?? 1)) confidence = it.confidence || 'medium'; }

  return {
    analyzedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
    crossReference: deriveCrossReference(documents),
    comparisons,
    overallSummary: buildSummary(documents, comparisons, nameMatch),
    confidence,
    nameMatch,
    documentNames,
    applicantName,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvReady()) return res.status(503).json({ error: 'Service unavailable.' });

  const { token } = req.body || {};
  if (!isDocReqToken(token)) return res.status(400).json({ error: 'Invalid link.' });

  const rec = await kvGetJson(reqKey(token));
  if (!rec) return res.status(404).json({ error: 'This upload link has expired or is no longer active.' });

  const staging = await kvGetJson(stagingKey(token));
  const items = staging && staging.items ? Object.values(staging.items) : [];
  if (!items.length) {
    // Idempotent: a duplicate finalize after success (staging already cleared) is a no-op success.
    if (rec.status === 'received') return res.status(200).json({ ok: true, received: rec.fileCount || 0, verified: !!rec.verified, alreadyDone: true });
    return res.status(400).json({ error: 'No analyzed documents to finish. Please add your documents and try again.' });
  }

  const receivedAt = new Date().toISOString();
  const fileCount = items.length;

  let verified = false;
  let persistAttempted = false;
  let persistFailed = false;

  const supaOk = isSupabaseConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaOk && rec.linkId && rec.listingId) {
    try {
      const admin = getSupabaseAdminClient();
      const { data: junction } = await admin
        .from('listing_applicants').select('*, application:applications(*)')
        .eq('id', rec.linkId).eq('listing_id', rec.listingId).maybeSingle();

      // STRICT two-key guard: only write to the exact applicant this token was minted for.
      const bound = junction && rec.applicationId != null && String(junction.application_id) === String(rec.applicationId);
      if (junction && !bound) {
        console.error('[upload/finalize] applicant binding mismatch — linkId row application_id',
          junction.application_id, '!== token applicationId', rec.applicationId, '(refusing to write)');
      }

      if (bound) {
        persistAttempted = true;
        const application = { ...(junction.application || {}) };
        delete application.owner_token;
        delete application.cover_letter;
        const { data: listing } = await admin.from('listings').select('*').eq('id', rec.listingId).maybeSingle();

        const run = buildCombinedRun(items, application.full_name || '');

        // Persist the combined result — tagged as a tenant self-upload — accumulating across
        // analyses (most recent last). Same column, row, and shape as the realtor path.
        const existing = junction.doc_verifications;
        const verifications = Array.isArray(existing) ? [...existing, { ...run, source: 'tenant' }] : [{ ...run, source: 'tenant' }];
        const { data: upRows, error: upErr } = await admin
          .from('listing_applicants').update({ doc_verifications: verifications }).eq('id', rec.linkId).select('id, application_id');

        if (upErr) { console.error('[upload/finalize] persist error:', upErr.message); persistFailed = true; }
        else if (!(upRows || []).length) { console.error('[upload/finalize] persist affected 0 rows'); persistFailed = true; }
        else {
          verified = true;
          console.log('[verif-trace][tenant-finalize] linkId=%s applicationId=%s affectedRows=%j',
            rec.linkId, rec.applicationId, (upRows || []).map((r) => ({ id: r.id, application_id: r.application_id })));

          // Auto-generate + persist the OHRC-safe insight (best-effort) so the realtor sees the
          // complete read on next load — the tenant uploads async and isn't there to click it.
          try {
            const insight = await generateApplicantInsight({ application, listing, verificationRun: run });
            if (insight) await admin.from('listing_applicants').update({ ai_insight: insight }).eq('id', rec.linkId);
          } catch (e) { console.error('[upload/finalize] insight error:', e?.code || e?.message || e); }

          // Notification marker (best-effort, isolated so a not-yet-migrated column can't fail it).
          try {
            await admin.from('listing_applicants').update({ docs_submitted_at: receivedAt, docs_verified: true }).eq('id', rec.linkId);
          } catch (e) { console.warn('[upload/finalize] notification marker skipped:', e?.message || e); }
        }
      }
    } catch (e) {
      console.error('[upload/finalize] persist exception:', e?.message || e);
      persistFailed = true;
    }
  }

  // Transient save failure → keep staging, let the client retry finalize only (no re-analysis).
  if (persistAttempted && persistFailed) {
    return res.status(502).json({ error: 'We received your documents but couldn’t finish saving them. Please tap Submit to finish.' });
  }

  // Terminal (verified, or nothing-to-persist because Supabase is off / unbound): acknowledge
  // receipt in KV and clear the staging keys.
  try {
    await kvSetJson(reqKey(token), { ...rec, status: 'received', receivedAt, fileCount, verified }, DOCREQ_TTL);
    if (rec.linkId) {
      const ptr = await kvGetJson(appKey(rec.linkId));
      await kvSetJson(appKey(rec.linkId), { ...(ptr || {}), token, status: 'received', requestedAt: (ptr && ptr.requestedAt) || rec.requestedAt || null, receivedAt, fileCount }, DOCREQ_TTL);
    }
    await kvDel(stagingKey(token));
  } catch (e) {
    console.error('[upload/finalize] status write error:', e?.message || e);
  }

  return res.status(200).json({ ok: true, received: fileCount, verified });
}
