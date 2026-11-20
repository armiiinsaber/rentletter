// /api/tenant/vault  The tenant's own vault (lib/tenantVault.js, db/018-profile-vault.sql).
// The tenant's session cookie is the only credential, and the profile id comes from that
// session, never from the request. No realtor session opens this route: it never reads one.
//
//   GET                       what the tenant's profile page shows: whether the vault is on
//                             (TENANT_VAULT_ENABLED), whether it is set up, the consent time, the
//                             stored documents with their expiry, the facts read from them, when
//                             the typed facts were last typed, and who has viewed the profile.
//   POST { action }
//     consent                 the tenant agrees that Rentletter keeps their documents in their
//                             profile and reads them. Recorded once.
//     upload { file }         ONE document a request ({ name, type, data: base64 }). It is read
//                             once (lib/applicantAnalysis.js, the same reader as every upload);
//                             only after that read succeeds is the file stored and the facts read
//                             from it recorded. A credit report, or a file that cannot be
//                             recognised, is refused and nothing of it is kept. Refused before
//                             anything is read while the vault is off, before the address is
//                             proved, and before the consent.
//     renew { id }            90 days more for a file that may be renewed. Not while the vault is off.
//     delete { id }           the file and its row's content, at once. Always allowed.
//     remove-check { id }     one fact read from a document, gone. Always allowed.
import { sessionProfile, recordVaultConsent, vaultConsentAt, emailVerifiedAt, rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { runDocumentAnalysis } from '../../../lib/applicantAnalysis';
import { fileFacts } from '../../../lib/documentFile';
import { logServerError } from '../../../lib/serverLog';
import { listVault, storeVaultDocument, deleteVaultDocument, renewVaultDocument, removeVaultCheck } from '../../../lib/tenantVault';
import { vaultEnabled, vaultKindOf, REFUSALS, VAULT_MIME, VAULT_MAX_BYTES, VAULT_MAX_DOCUMENTS } from '../../../lib/tenantVaultRules';

// One base64 file a request, under the platform's 4.5MB body cap; one read by the model.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } }, maxDuration: 30 };

const PAUSED = 'Documents are paused. Nothing new is stored for now.';
const adminClient = () => (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.', code: 'no_session' });
  const admin = adminClient();
  const enabled = vaultEnabled();

  try {
    if (req.method === 'GET') {
      const vault = admin ? await listVault(admin, p.id) : { available: false, documents: [], checks: [], views: [] };
      return res.status(200).json({ enabled, available: vault.available, consentAt: vaultConsentAt(p), emailProved: !!emailVerifiedAt(p), typedAt: p.factsUpdatedAt || null, documents: vault.documents, checks: vault.checks, views: vault.views });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action } = req.body || {};
    const id = typeof req.body?.id === 'string' ? req.body.id : '';

    if (action === 'delete' || action === 'remove-check') {
      if (!admin) return res.status(503).json({ error: 'Service temporarily unavailable.' });
      if (!id) return res.status(400).json({ error: 'Nothing to remove.' });
      const out = action === 'delete' ? await deleteVaultDocument(admin, { profileId: p.id, id }) : await removeVaultCheck(admin, { profileId: p.id, id });
      if (!out.ok) return res.status(out.reason === 'missing' ? 404 : 503).json({ error: out.reason === 'missing' ? 'That is no longer in your profile.' : 'Documents are not available yet.' });
      return res.status(200).json({ ok: true });
    }

    // Everything below stores or keeps something: not while the vault is off.
    if (!enabled) { if (req.body) req.body.file = null; return res.status(503).json({ error: PAUSED, code: 'paused' }); }

    if (action === 'consent') {
      const at = await recordVaultConsent(p.id);
      return res.status(200).json({ ok: true, consentAt: at });
    }

    if (action === 'renew') {
      if (!admin) return res.status(503).json({ error: 'Service temporarily unavailable.' });
      if (!id) return res.status(400).json({ error: 'Nothing to renew.' });
      const out = await renewVaultDocument(admin, { profileId: p.id, id });
      if (!out.ok) return res.status(out.reason === 'missing' ? 404 : out.reason === 'not_renewable' ? 400 : 503).json({ error: out.reason === 'missing' ? 'That document is no longer in your profile.' : out.reason === 'not_renewable' ? 'An ID is kept 14 days and cannot be renewed. Add it again when you need it.' : 'Documents are not available yet.' });
      return res.status(200).json({ ok: true, document: out.document });
    }

    if (action === 'upload') {
      let file = req.body && req.body.file;
      const drop = () => { if (file) file.data = null; if (req.body) req.body.file = null; file = null; };
      if (!admin) { drop(); return res.status(503).json({ error: 'Service temporarily unavailable.' }); }
      if (!emailVerifiedAt(p)) { drop(); return res.status(403).json({ error: 'Sign in with the link we email you before adding documents.', code: 'unproved' }); }
      if (!vaultConsentAt(p)) { drop(); return res.status(403).json({ error: 'Agree to keeping documents in your profile first.', code: 'consent' }); }
      if (!file || typeof file !== 'object') return res.status(400).json({ error: 'No document received.' });
      if (await rateLimited('vault', p.id, 20, 3600) || await rateLimited('vault:ip', clientIp(req), 40, 3600)) { drop(); return res.status(429).json({ error: 'Too many documents in a short time. Try again in an hour.' }); }
      const mime = String(file.type || '').toLowerCase();
      const data = String(file.data || '');
      const name = String(file.name || 'document').slice(0, 120);
      if (!data || data.length < 16) { drop(); return res.status(400).json({ error: 'That file looks empty.' }); }
      if (!VAULT_MIME.includes(mime)) { drop(); return res.status(400).json({ error: 'Add a PDF or an image (JPG or PNG).' }); }
      if (Math.floor((data.length * 3) / 4) > VAULT_MAX_BYTES) { drop(); return res.status(413).json({ error: 'This file is too large. Add a version under 3MB.' }); }
      // Is there room, and is the vault set up? Asked before the file is read by anything.
      const held = await listVault(admin, p.id);
      if (!held.available) { drop(); return res.status(503).json({ error: 'Documents are not available yet.', code: 'absent' }); }
      if (held.documents.length >= VAULT_MAX_DOCUMENTS) { drop(); return res.status(400).json({ error: `Your profile holds up to ${VAULT_MAX_DOCUMENTS} documents. Delete one to add another.` }); }

      // The one read. The tenant's typed facts stand in for an application, so the name on the
      // document and the figures are compared in code; nothing typed reaches the model.
      const f = p.facts || {};
      const application = { full_name: f.fullName || null, annual_income: f.annualIncome || null, employer: f.employer || null, job_title: f.jobTitle || null, years_at_job: f.yearsAtJob || null };
      let run = null;
      try { run = await runDocumentAnalysis({ files: [{ name, type: mime, data }], application, listing: null }); }
      catch (e) { console.error('[tenant/vault] read error:', e?.code || e?.message || e); }
      finally { drop(); }
      const doc = run && Array.isArray(run.documents) ? run.documents[0] : null;
      if (!doc) return res.status(502).json({ error: `We could not read ${name}. Please try again.` });
      const kind = vaultKindOf(doc);
      if (kind.refused) return res.status(422).json({ error: REFUSALS[kind.refused], rejected: kind.refused });

      const bytes = Buffer.from(data, 'base64');
      const facts = await fileFacts(bytes, mime);
      const out = await storeVaultDocument(admin, { profileId: p.id, facts: f, bytes, mime, doc, vaultKind: kind.kind, hash: facts.hash || null });
      if (!out.ok) return res.status(out.reason === 'full' ? 400 : 503).json({ error: out.reason === 'full' ? `Your profile holds up to ${VAULT_MAX_DOCUMENTS} documents. Delete one to add another.` : out.reason === 'absent' ? 'Documents are not available yet.' : 'We could not keep that document. Please try again.' });
      return res.status(200).json({ ok: true, document: out.document, checks: out.checks });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/vault]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
