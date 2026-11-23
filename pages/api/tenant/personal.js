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
//     about { text }        the tenant's own words, up to 600 characters, in any language. Empty
//                           removes them. Saved first; then, when they are not English, an
//                           English version is prepared (lib/aboutTranslation.js) and kept
//                           unapproved. A change to the words ends the English version before
//                           it. Where none could be prepared the save still stands and the
//                           answer says so (englishFailed).
//     english-prepare       prepares the English version of the saved words again (Try again).
//     english-approve { text }  "Looks right": the tenant approves the English version they
//                           read. Only from here does a realtor see it.
//     english-edit { text } the tenant's own change to the English version, up to 900
//                           characters. Not approved until they say so.
//     english-remove        removes the English version, at any time. The original stays.
//     prepay { months }     1 to 12, or null for no offer.
//     landlord { ok }       whether the words and the offer may go on a landlord report.
//     photo { data, type }  one JPEG or PNG, base64, made small by the browser. Replaces the one
//                           before. Stored as it is: nothing reads it, no model sees it.
//     photo-delete          the file and its columns, at once. Always allowed.
//     suggest { text }      "Help me write this": asks Claude for clearer wording of the text the
//                           tenant typed, and of nothing else. It answers a suggestion; nothing
//                           is saved until the tenant accepts it and saves it themselves. Where
//                           the helper could not be reached (an error, a timeout, an empty
//                           answer) it says so, code helper_unreachable; where it answered and
//                           had nothing to offer it says "No suggestion this time". The server
//                           log names the two apart: "helper unreachable" and "helper had no
//                           suggestion".
// The English version runs on the same client and model as the suggestion, under the same
// session, the same hourly limit (about-help) and the same switch (no key, no call).
// None of this is in the profile's facts, so none is sent with an application or read by Fit.
import Anthropic from '@anthropic-ai/sdk';
import { sessionProfile, getPersonal, savePersonal, saveAbout, saveEnglish, approveEnglish, editEnglish, removeEnglish, creditReportShared, rateLimited, clientIp } from '../../../lib/tenantProfileStore';
import { getSupabaseAdminClient } from '../../../lib/supabase/admin';
import { isSupabaseConfigured } from '../../../lib/supabase/server';
import { logServerError } from '../../../lib/serverLog';
import { listVault, logVault, putProfilePhoto, removeProfilePhoto, profilePhoto, photoDataUrl, photoLog } from '../../../lib/tenantVault';
import { vaultEnabled } from '../../../lib/tenantVaultRules';
import { cleanAbout, cleanPrepay, photoKind, ABOUT_MAX, PHOTO_MIME, PHOTO_MAX_BYTES } from '../../../lib/profilePersonal';
import { profileStrength } from '../../../lib/profileStrength';
import { TRANSLATE_SYSTEM, looksEnglish, certainlyNotEnglish, readTranslation, cleanEnglish, keepsNamesAndNumbers, languageName } from '../../../lib/aboutTranslation';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } }, maxDuration: 30 };

const adminClient = () => (isSupabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseAdminClient() : null);
const NOT_YET = 'This is not available yet.';
export const HELPER_UNREACHABLE = 'The helper could not be reached. Your words are unchanged. Try again in a minute.';

// The one instruction the suggestion runs on. The only thing sent with it is the text the
// tenant typed in the box: never their facts, their documents, their photo or anything else.
export const SUGGEST_SYSTEM = `You help a person tidy a short note about themselves for a rental profile. They wrote the note; it stays theirs.
Rewrite it so it reads clearly and warmly, in the first person, in plain words.
Use only what the note says. Add no fact, detail, claim or adjective that is not already in it, and leave out nothing they chose to say.
Never add or guess anything about family, relationships, religion, health, age, origin, nationality or money.
Keep it under ${ABOUT_MAX} characters. Answer with the rewritten note only: no preface, no quotation marks, no explanation.`;

// One question to the model: an instruction and the tenant's text, and nothing else. The same
// client and model for the suggestion and for the English version.
//   -> { refused, text }   throws when the provider cannot be reached or does not answer in time
async function askModel(system, text) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Claude Opus 5.5: thinking is always on and effort is the one control; low is right for a
  // short rewrite. A policy decline is retried on a fallback model inside the same call. One
  // retry, each try 12 seconds at most, so the route answers inside its own limit.
  const message = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low' },
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  }, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' }, timeout: 12000, maxRetries: 1 });
  return { refused: message.stop_reason === 'refusal', text: (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
}

// -> { suggestion } | { none: why }   throws when the helper could not be reached or said nothing
async function suggestWording(text) {
  const answer = await askModel(SUGGEST_SYSTEM, text);
  if (answer.refused) return { none: 'declined' };
  const out = answer.text.replace(/^["“]+|["”]+$/g, '').trim();
  if (!out) throw new Error('empty answer');
  const clean = cleanAbout(out);
  if (!clean.value) return { none: 'too long' };
  if (clean.value === text) return { none: 'same words' };
  return { suggestion: clean.value };
}

// The English version of the tenant's saved words.
//   -> { ok: true, english, lang } (english null: the words are English) | { ok: false, reason }
// The words themselves are never logged: only why no English version came back.
async function prepareEnglish(p, original) {
  const no = (reason, e = null) => { if (e) logServerError('[tenant/personal] translation unreachable', e, {}); else console.warn('[tenant/personal] translation not kept', JSON.stringify({ reason })); return { ok: false, reason }; };
  if (!process.env.ANTHROPIC_API_KEY) return no('off');
  if (await rateLimited('about-help', p.id, 10, 3600)) return no('limit');
  let answer = null;
  try { answer = await askModel(TRANSLATE_SYSTEM, original); } catch (e) { return no('unreachable', e); }
  if (answer.refused) return no('declined');
  const read = readTranslation(answer.text);
  if (!read) return no('unreadable');
  if (!read.english) return { ok: true, english: null, lang: null };
  const clean = cleanEnglish(read.english);
  if (!clean.value) return no('too long');
  // Names and numbers are kept exactly: an answer that lost one is not shown to anyone.
  const kept = keepsNamesAndNumbers(original, clean.value);
  if (!kept.ok) return no(`changed ${kept.numbers.length} numbers and ${kept.names.length} names`);
  return { ok: true, english: clean.value, lang: read.language };
}
// Prepares and keeps it, unapproved.  -> true (kept, or not needed) | false (not ready)
async function prepareAndKeep(p, original) {
  const made = await prepareEnglish(p, original);
  if (!made.ok) return false;
  if (!made.english) return true;
  return saveEnglish(p, { original, english: made.english, lang: made.lang });
}
// What the tenant's page is told of the English version. null before db/026: nothing is offered.
//   wanted: there is none and the words are certainly not English (another script).
const englishState = (mine) => (mine.available && mine.english && mine.english.available ? { text: mine.english.text, language: languageName(mine.english.lang), approvedAt: mine.english.approvedAt, wanted: !mine.english.text && !!mine.about && (certainlyNotEnglish(mine.about) || !!mine.english.lang) } : null);

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
      return res.status(200).json({ available: !!mine.available, about: mine.available ? mine.about : null, prepayMonths: mine.available ? mine.prepayMonths : null, landlordReportOk: mine.available ? mine.landlordReportOk : true, english: englishState(mine), photo, photoAddedAt: mine.available && mine.photo && photo ? mine.photo.addedAt : null, photosPaused: !vaultEnabled(), photoLog: admin ? await photoLog(admin, p.id) : [], strength });
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
      // Two different things, said and logged apart: the helper could not be reached, or it
      // answered and had nothing to offer.
      let made = null;
      try { made = await suggestWording(typed.value); } catch (e) { logServerError('[tenant/personal] helper unreachable', e, {}); return res.status(503).json({ error: HELPER_UNREACHABLE, code: 'helper_unreachable' }); }
      if (!made.suggestion) { console.warn('[tenant/personal] helper had no suggestion', JSON.stringify({ reason: made.none })); return res.status(502).json({ error: 'No suggestion this time. Your own words are unchanged.', code: 'no_suggestion' }); }
      return res.status(200).json({ ok: true, suggestion: made.suggestion });
    }

    if (!admin) return res.status(503).json({ error: 'Service temporarily unavailable.' });

    if (action === 'about') {
      const v = cleanAbout(body.text);
      if (v.error) return res.status(400).json({ error: v.error });
      // The same words again change nothing: an English version made from them stays.
      const before = await getPersonal(p.id);
      if (before.available && before.about === v.value && v.value) return res.status(200).json({ ok: true, about: v.value });
      // The original first. Whatever happens to the English version, the save stands.
      const saved = await saveAbout(p, v.value);
      if (!saved.ok) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      let englishFailed = false;
      if (saved.english && v.value && !looksEnglish(v.value)) englishFailed = !(await prepareAndKeep(p, v.value));
      return res.status(200).json({ ok: true, about: v.value, ...(englishFailed ? { englishFailed: true } : {}) });
    }
    if (action === 'english-prepare' || action === 'english-approve' || action === 'english-edit' || action === 'english-remove') {
      const mine = await getPersonal(p.id);
      if (!mine.available || !mine.english.available) return res.status(503).json({ error: NOT_YET, code: 'absent' });
      if (action === 'english-remove') {
        if (mine.english.text && !(await removeEnglish(p))) return res.status(503).json({ error: 'The English version could not be removed. Try again.' });
        return res.status(200).json({ ok: true });
      }
      if (action === 'english-prepare') {
        if (!mine.about) return res.status(400).json({ error: 'Write About me first.' });
        if (mine.english.text) return res.status(200).json({ ok: true });
        if (!(await prepareAndKeep(p, mine.about))) return res.status(200).json({ ok: true, englishFailed: true });
        return res.status(200).json({ ok: true });
      }
      if (!mine.english.text) return res.status(409).json({ error: 'There is no English version now.', code: 'changed' });
      if (action === 'english-approve') {
        // Approved for exactly the text the tenant read, and no other.
        if (cleanEnglish(body.text).value !== mine.english.text) return res.status(409).json({ error: 'The English version changed. Read it again.', code: 'changed' });
        const at = await approveEnglish(p, { english: mine.english.text });
        if (!at) return res.status(503).json({ error: 'That could not be saved. Try again.' });
        return res.status(200).json({ ok: true, approvedAt: at });
      }
      const v = cleanEnglish(body.text);
      if (v.error) return res.status(400).json({ error: v.error });
      if (!v.value) return res.status(400).json({ error: 'Write the English version, or remove it.' });
      if (v.value !== mine.english.text && !(await editEnglish(p, { was: mine.english.text, english: v.value }))) return res.status(503).json({ error: 'That could not be saved. Try again.' });
      return res.status(200).json({ ok: true });
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
      await logVault(admin, { profileId: p.id, action: 'photo_removed' });
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
      await logVault(admin, { profileId: p.id, action: 'photo_added', at });
      return res.status(200).json({ ok: true, photo: `data:${type};base64,${bytes.toString('base64')}`, photoAddedAt: at });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logServerError('[tenant/personal]', e, { action: req.body?.action });
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
