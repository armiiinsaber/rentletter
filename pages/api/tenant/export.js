// /api/tenant/export  GET. "Download my profile": one PDF of what the tenant's own profile holds
// (lib/profileExportPdf.js): their photo and name, their own words, their offer to prepay rent,
// each typed fact and each fact read from a document with its date, and the list of their stored
// documents with their dates. Never the files themselves, never profile strength. The tenant's
// session cookie is the only credential and the profile is that session's own. Every download
// writes profile_exported to the tenant's log (db/018 profile_access_log) before the file is
// sent; where the log is not set up yet the download still goes to its owner. A paragraph in
// Persian or Arabic is set flush right and reads right to left, with the numbers and Latin words
// inside it in their order (lib/pdfScripts.js withRightToLeftParagraphs).
import { sessionProfile, getPersonal, rateLimited } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { logServerError } from '../../../lib/serverLog';
import { listVault, logVault, profilePhoto } from '../../../lib/tenantVault';
import { shareableFacts } from '../../../lib/profileFacts';
import { buildProfilePdf } from '../../../lib/profileExportPdf';
import { withRightToLeftParagraphs } from '../../../lib/pdfScripts';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.', code: 'no_session' });
  try {
    if (await rateLimited('export', p.id, 20, 3600)) return res.status(429).json({ error: 'Too many downloads. Try again in an hour.' });
    const admin = isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null;
    const mine = await getPersonal(p.id);
    const vault = admin ? await listVault(admin, p.id) : { documents: [], checks: [] };
    const photo = admin && mine.available && mine.photo ? await profilePhoto(admin, { profileId: p.id, path: mine.photo.path, mime: mine.photo.mime }) : null;
    const now = new Date().toISOString();
    const facts = { ...shareableFacts(p.facts || {}), email: p.email };
    const bytes = await withRightToLeftParagraphs(() => buildProfilePdf({ name: (p.facts && p.facts.fullName) || '', email: p.email, about: mine.available ? mine.about : null, prepayMonths: mine.available ? mine.prepayMonths : null, photo: photo && photo.ok ? { bytes: photo.bytes, mime: photo.mime } : null, facts, factsUpdatedAt: p.factsUpdatedAt || null, checks: vault.checks, documents: vault.documents, generatedAt: now }));
    if (admin) await logVault(admin, { profileId: p.id, action: 'profile_exported', at: now });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="my-rentletter-profile.pdf"');
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    logServerError('[tenant/export]', e, {});
    return res.status(500).json({ error: 'Your profile could not be downloaded. Try again.' });
  }
}
