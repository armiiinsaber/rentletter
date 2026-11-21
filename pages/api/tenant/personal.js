// /api/tenant/personal  What a tenant chooses to add to their profile about themselves
// (db/022-full-tenant-profile.sql; lib/profilePersonal.js): a photo, a few words, an offer to
// prepay rent, and whether a realtor may put the words and the offer on a landlord report. The
// tenant's session cookie is the only credential, and the profile is the one that session
// belongs to: no id of a profile is read from the request. No realtor session opens this route.
//
//   GET                     the words, the offer, the switch, the photo (its bytes, as a data
//                           URL: no link to it exists) and PROFILE STRENGTH, which is answered
//                           here and nowhere else (lib/profileStrength.js).
//   POST { action }
//     about { text }        the tenant's own words, up to 600 characters. Empty removes them.
//     prepay { months }     1 to 12, or null for no offer.
//     landlord { ok }       whether the words and the offer may go on a landlord report.
//     photo { data, type }  one JPEG or PNG, base64, made small by the browser. Replaces the one
//                           before. Stored as it is: nothing reads it, no model sees it.
//     photo-delete          the file and its columns, at once. Always allowed.
//     suggest { text }      "Help me write this": asks Claude for clearer wording of the text the
//                           tenant typed, and of nothing else. It answers a suggestion; nothing
//                           is saved until the tenant accepts it and saves it themselves.
// None of this is in the profile's facts, so none is sent with an application or read by Fit.
import Anthropic from '@anthropic-ai/sdk';
import { sessionProfile, getPersonal, savePersonal, creditReportShared, rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { logServerError } from '../../../lib/serverLog';
import { listVault, logVault, putProfilePhoto, removeProfilePhoto, profilePhoto, photoDataUrl } from '../../../lib/tenantVault';
import { vaultEnabled } from '../../../lib/tenantVaultRules';
import { cleanAbout, cleanPrepay, photoKind, ABOUT_MAX, PHOTO_MIME, PHOTO_MAX_BYTES } from '../../../lib/profilePersonal';
import { profileStrength } from '../../../lib/profileStrength';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 30 };

const adminClient = () => (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null);
const NOT_YET = 'This is not available yet.';

// The one instruction the suggestion runs on. The only thing sent with it is the text the
// tenant typed in the box: never their facts, their documents, their photo or anything else.
export const SUGGEST_SYSTEM = `You help a person tidy a short note about themselves for a rental profile. They wrote the note; it stays theirs.
Rewrite it so it reads clearly and warmly, in the first person, in plain words.
Use only what the note says. Add no fact, detail, claim or adjective that is not already in it, and leave out nothing they chose to say.
Never add or guess anything about family, relationships, religion, health, age, origin, nationality or money.
Keep it under ${ABOUT_MAX} characters. Answer with the rewritten note only: no preface, no quotation marks, no explanation.`;

async function suggestWording(text) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Claude Opus 5.5: thinking is always on and effort is the one control; low is right for a
  // short rewrite. A policy decline is retried on a fallback model inside the same call.
  const message = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low' },
    fallbacks: 'default',
    system: SUGGEST_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  }, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } });
  if (message.stop_reason === 'refusal') return null;
  const out = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim().replace(/^["“]+|["”]+$/g, '').trim();
  const clean = cleanAbout(out);
  return clean.value || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const p = await sessionProfile(req);
  if (!p) return res.status(401).json({ error: 'Not signed in.', code: 'no_session' });
  const admin = adminClient();
  try {
    if (req.method === 'GET') {
      const mine = await getPersonal(p.id);
      const vault = admin ? await listVault(admin, p.id) : { documents: [], checks: [] };
      const photo = mine.available && mine.photo && admin ? photoDataUrl(await profilePhoto(admin, { profileId: p.id, path: mine.photo.path, mime: mine.photo.mime })) : null;
      const strength = profileStrength({ facts: p.facts || {}, documentKinds: vault.documents.map((d) => d.kind), checkKinds: vault.checks.map((c) => c.kind), hasPhoto: !!photo, hasAbout: !!(mine.available && mine.about), prepayMonths: mine.available ? mine.prepayMonths : null, creditShared: await creditReportShared(p) });
      return res.status(200).json({ available: !!mine.available, about: mine.available ? mine.about : null, prepayMonths: mine.available ? mine.prepayMonths : null, landlordReportOk: mine.available ? mine.landlordReportOk : true, photo, photoAddedAt: mine.available && mine.photo && photo ? mine.photo.addedAt : null, photosPaused: !vaultEnabled(), strength });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { action } = body;

    if (action === 'suggest') {
      const typed = cleanAbout(body.text);
      if (typed.error) return res.status(400).json({ error: typed.error });
      if (!typed.value || typed.value.length < 20) return res.status(400).json({ error: 'Write a sentence or two first, then ask for help with the wording.' });
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Help with wording is not available right now.' });
      if (await rateLimited('about-help', p.id, 10, 3600)) return res.status(429).json({ error: 'That is a lot of suggestions. Try again in an hour.' });
      let suggestion = null;
      try { suggestion = await suggestWording(typed.value); } catch (e) { logServerError('[tenant/personal] suggest', e, {}); }
      if (!suggestion) return res.status(502).json({ error: 'No suggestion this time. Your own words are unchanged.' });
      return res.status(200).json({ ok: true, suggestion });
    }

    if (!admin) return res.status(503).json({ error: 'Service temporarily unavailable.' });

    if (action === 'about') {
      const v = cleanAbout(body.text);
      if (v.error) return res.status(400).json({ error: v.error });
      if (!(await savePersonal(p, { about_me: v.value }))) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      return res.status(200).json({ ok: true, about: v.value });
    }
    if (action === 'prepay') {
      const v = cleanPrepay(body.months);
      if (v.error) return res.status(400).json({ error: v.error });
      if (!(await savePersonal(p, { prepay_months: v.value }))) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      return res.status(200).json({ ok: true, prepayMonths: v.value });
    }
    if (action === 'landlord') {
      if (typeof body.ok !== 'boolean') return res.status(400).json({ error: 'Choose on or off.' });
      if (!(await savePersonal(p, { landlord_report_ok: body.ok }))) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      return res.status(200).json({ ok: true, landlordReportOk: body.ok });
    }
    if (action === 'photo-delete') {
      const mine = await getPersonal(p.id);
      if (!mine.available) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      if (!mine.photo) return res.status(200).json({ ok: true });
      // The file first; the profile forgets it only once the bucket says it is gone.
      if (!(await removeProfilePhoto(admin, { profileId: p.id, path: mine.photo.path }))) return res.status(503).json({ error: 'Your photo could not be removed. Try again.' });
      if (!(await savePersonal(p, { photo_path: null, photo_mime: null, photo_added_at: null }))) return res.status(503).json({ error: 'Your photo could not be removed. Try again.' });
      await logVault(admin, { profileId: p.id, action: 'document_deleted' });
      return res.status(200).json({ ok: true });
    }
    if (action === 'photo') {
      const drop = () => { body.data = null; };
      if (!vaultEnabled()) { drop(); return res.status(503).json({ error: 'Photos are paused. Nothing new is stored for now.', code: 'paused' }); }
      const type = String(body.type || '').toLowerCase(); const data = String(body.data || '');
      if (!data || data.length < 16) { drop(); return res.status(400).json({ error: 'That photo looks empty.' }); }
      if (!PHOTO_MIME.includes(type)) { drop(); return res.status(400).json({ error: 'Add a JPG or PNG photo.' }); }
      if (Math.floor((data.length * 3) / 4) > PHOTO_MAX_BYTES) { drop(); return res.status(413).json({ error: 'This photo is too large. Try a smaller one.' }); }
      if (await rateLimited('photo', p.id, 10, 3600) || await rateLimited('photo:ip', clientIp(req), 30, 3600)) { drop(); return res.status(429).json({ error: 'Too many photos in a short time. Try again in an hour.' }); }
      const bytes = Buffer.from(data, 'base64'); drop();
      // What the file really is, from its own first bytes. Nothing else looks inside it.
      if (photoKind(bytes) !== type) return res.status(400).json({ error: 'Add a JPG or PNG photo.' });
      const mine = await getPersonal(p.id);
      if (!mine.available) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      const put = await putProfilePhoto(admin, { profileId: p.id, bytes, mime: type });
      if (!put.ok) return res.status(503).json({ error: put.reason === 'absent' ? NOT_YET : 'Your photo could not be saved. Try again.', code: put.reason });
      const at = new Date().toISOString();
      if (!(await savePersonal(p, { photo_path: put.path, photo_mime: type, photo_added_at: at }))) { await removeProfilePhoto(admin, { profileId: p.id, path: put.path }); return res.status(503).json({ error: 'Your photo could not be saved. Try again.' }); }
      // The photo it replaces is removed, the file itself.
      if (mine.photo && mine.photo.path !== put.path) await removeProfilePhoto(admin, { profileId: p.id, path: mine.photo.path });
      await logVault(admin, { profileId: p.id, action: 'document_added', at });
      return res.status(200).json({ ok: true, photo: `data:${type};base64,${bytes.toString('base64')}`, photoAddedAt: at });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/personal]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
