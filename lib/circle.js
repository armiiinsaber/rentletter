// lib/circle.js  SERVER ONLY (takes the service role client).
// The realtor circle (db/021-realtor-circle.sql; docs/design/profile-and-circle.md section 4.8):
// a realtor finds another by name or brokerage, asks to connect, and the two are connected only
// when the other accepts. Every function takes the caller's own id from the session
// (pages/api/circle/index.js, behind lib/realtorRoute.js withRealtor) and checks whose row it is
// before it writes: only the realtor who was asked can accept or decline, only one of the two
// can remove or block, and only the one who blocked can unblock.
//   · what another realtor is ever shown: a name, a brokerage, initials, and what that realtor
//     said about their own work (does rentals, service areas). Never an email, a phone, a plan,
//     a listing, an applicant or a number. publicCard below is the one place a card is built;
//   · a realtor who turned findable off (profiles.circle_findable = false) is in no search;
//   · a connection is ONE ROW PER PAIR (the database refuses a second), whoever asked;
//   · a decline, a removal and a block are silent: nothing is written to the other realtor's
//     timeline and no mail is sent. The realtor who asked keeps seeing "Requested";
//   · asking is limited: REQUESTS_A_DAY a day, MAX_PENDING waiting at once, and a declined
//     request cannot be sent again for ASK_AGAIN_DAYS days; searching is limited too;
//   · no score, no rank, no count of followers. The history with a connection is the caller's
//     own handoffs with that one person, and is zero until handoffs exist;
//   · before db/021 has run every function answers that the circle is not available.
import { Resend } from 'resend';
import { kvIncr, kvExpire } from './kv.js';
import { recordEvent } from './events.js';
import { logServerError } from './serverLog.js';
import { ensureInviteCode, inviteLink } from './realtorInvite.js';
import { circleRequestEmail, CIRCLE_FROM } from './circleEmails.js';
import { myBrokerage, brokerageCards } from './brokerage.js';

export const CONNECTIONS = 'circle_connections';
export const REQUESTS_A_DAY = 20;
export const MAX_PENDING = 50;
export const ASK_AGAIN_DAYS = 30;
export const SEARCHES_AN_HOUR = 120;
export const SEARCH_LIMIT = 20;
const DAY = 86400000;
const CARD_COLUMNS = 'id, full_name, brokerage, circle_findable, does_rentals, service_areas';

const msg = (e) => String((e && e.message) || e || '');
const absent = (error) => !!error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || error.code === 'PGRST205' || /(does not exist|could not find)/i.test(msg(error)));
const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://rentletter.ca').replace(/\/+$/, '');
const same = (a, b) => String(a) === String(b);
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const nameOf = (p) => String((p && p.full_name) || '').trim();
export const initialsOf = (name) => { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'; };
const areasOf = (v) => (Array.isArray(v) ? v.map((a) => String(a || '').trim()).filter(Boolean).slice(0, 8) : []);

// What one realtor is shown of another: built here and nowhere else.
export function publicCard(p) {
  const name = nameOf(p);
  return { id: p.id, name: name || 'Name not added yet', brokerage: String(p.brokerage || '').trim() || null, initials: initialsOf(name), doesRentals: p.does_rentals === true ? true : p.does_rentals === false ? false : null, serviceAreas: areasOf(p.service_areas) };
}

// A counter in KV with a window. True: over the limit. KV down: not counted (the database caps
// below still hold).
async function over(scope, userId, limit, seconds) {
  const key = `circle:${scope}:${String(userId).replace(/[^A-Za-z0-9-]/g, '')}:${Math.floor(Date.now() / (seconds * 1000))}`;
  const n = await kvIncr(key);
  if (n === 1) await kvExpire(key, seconds + 5);
  return n !== null && n > limit;
}

// Profiles by a query, with the suspension column where the database has it.
async function readProfiles(build) {
  let r = await build(`${CARD_COLUMNS}, suspended_at`);
  if (r.error && absent(r.error)) r = await build(CARD_COLUMNS);
  return r;
}
const profilesById = async (admin, ids) => {
  if (!ids.length) return { byId: new Map() };
  const { data, error } = await readProfiles((cols) => admin.from('profiles').select(cols).in('id', ids));
  if (error) return { error };
  return { byId: new Map((data || []).map((p) => [String(p.id), p])) };
};

// Every connection row the caller is one side of.
async function rowsOf(admin, userId) {
  const [asked, was] = await Promise.all([
    admin.from(CONNECTIONS).select('*').eq('requester_id', userId),
    admin.from(CONNECTIONS).select('*').eq('addressee_id', userId),
  ]);
  const error = asked.error || was.error;
  if (error) return absent(error) ? { available: false } : { error };
  return { available: true, rows: [...(asked.data || []), ...(was.data || [])] };
}
const otherOf = (row, userId) => (same(row.requester_id, userId) ? row.addressee_id : row.requester_id);
// The one row for a pair, whichever way round it was written.
async function pairRow(admin, a, b) {
  const one = await admin.from(CONNECTIONS).select('*').eq('requester_id', a).eq('addressee_id', b).maybeSingle();
  if (one.error) return absent(one.error) ? { available: false } : { error: one.error };
  if (one.data) return { available: true, row: one.data };
  const two = await admin.from(CONNECTIONS).select('*').eq('requester_id', b).eq('addressee_id', a).maybeSingle();
  if (two.error) return absent(two.error) ? { available: false } : { error: two.error };
  return { available: true, row: two.data || null };
}
// A request the other realtor declined still reads "Requested" to the one who asked.
const waitingFor = (row, userId) => same(row.requester_id, userId) && (row.status === 'pending' || row.status === 'declined');
// How a pair stands, as the caller may see it: none, sent, incoming, connected, or hidden.
export function standing(row, userId) {
  if (!row) return 'none';
  if (row.status === 'blocked') return 'hidden';
  if (row.status === 'accepted') return 'connected';
  if (row.status === 'pending') return same(row.requester_id, userId) ? 'sent' : 'incoming';
  if (row.status === 'declined' && same(row.requester_id, userId)) return 'sent';
  return 'none';
}

const NOT_AVAILABLE = { status: 200, body: { available: false } };

// The Circle screen: requests to answer, requests sent, the circle, the caller's own settings,
// invite link and brokerage record.
export async function loadCircle({ admin, userId }) {
  const { data: mine, error: mineErr } = await admin.from('profiles').select(CARD_COLUMNS).eq('id', userId).maybeSingle();
  if (mineErr) { if (absent(mineErr)) return NOT_AVAILABLE; throw mineErr; }
  if (!mine) return { status: 404, body: { error: 'Profile not found.' } };
  const all = await rowsOf(admin, userId);
  if (all.error) throw all.error;
  if (!all.available) return NOT_AVAILABLE;
  const shown = all.rows.filter((r) => r.status === 'accepted' || r.status === 'pending' || (r.status === 'declined' && same(r.requester_id, userId)) || (r.status === 'blocked' && same(r.blocked_by, userId)));
  const people = await profilesById(admin, [...new Set(shown.map((r) => String(otherOf(r, userId))))]);
  if (people.error) throw people.error;
  const records = await brokerageCards(admin, shown.filter((r) => r.status === 'accepted').map((r) => String(otherOf(r, userId))));
  const cardOf = (r) => { const p = people.byId.get(String(otherOf(r, userId))); return p && !p.suspended_at ? publicCard(p) : null; };
  const requests = []; const sent = []; const connections = []; const blocked = [];
  for (const r of [...shown].sort((a, b) => String(b.answered_at || b.created_at || '').localeCompare(String(a.answered_at || a.created_at || '')))) {
    const card = cardOf(r); if (!card) continue;
    const { id, ...who } = card; // the other realtor's own id is not needed on these lists
    if (r.status === 'accepted') connections.push({ connectionId: r.id, ...who, since: r.answered_at || r.created_at || null, record: records.get(String(id)) || null, history: { sent: 0, received: 0, closed: 0 } });
    else if (r.status === 'blocked') blocked.push({ connectionId: r.id, name: who.name, brokerage: who.brokerage, initials: who.initials });
    else if (waitingFor(r, userId)) sent.push({ connectionId: r.id, name: who.name, brokerage: who.brokerage, initials: who.initials });
    else requests.push({ connectionId: r.id, name: who.name, brokerage: who.brokerage, initials: who.initials, askedAt: r.created_at || null });
  }
  const code = await ensureInviteCode(admin, userId);
  if (code.error) throw code.error;
  const brokerage = await myBrokerage(admin, userId);
  return { status: 200, body: {
    available: true,
    me: { name: nameOf(mine) || null, brokerage: String(mine.brokerage || '').trim() || null, findable: mine.circle_findable !== false, doesRentals: mine.does_rentals === true ? true : mine.does_rentals === false ? false : null, serviceAreas: areasOf(mine.service_areas) },
    requests, sent, connections, blocked,
    invite: code.available ? { link: inviteLink(code.code) } : null,
    brokerage,
  } };
}

// How many requests wait for the caller: the badge on the Circle item.
export async function pendingCount({ admin, userId }) {
  const { data, error } = await admin.from(CONNECTIONS).select('id, requester_id').eq('addressee_id', userId).eq('status', 'pending');
  if (error) { if (absent(error)) return NOT_AVAILABLE; throw error; }
  return { status: 200, body: { available: true, pending: (data || []).length } };
}

// The words a search runs on: letters, digits, spaces and a few marks. The pattern characters
// of LIKE are taken out, so the words are only ever matched as they are.
export const searchWords = (q) => String(q || '').normalize('NFKC').replace(/[%_\\*(),"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

// Find realtors by name or brokerage. Never the caller, never a realtor who turned findable off,
// never a suspended account, never one side of a block.
export async function searchRealtors({ admin, userId, q }) {
  const words = searchWords(q);
  if (words.length < 2) return { status: 200, body: { available: true, results: [], tooShort: true } };
  if (await over('search', userId, SEARCHES_AN_HOUR, 3600)) return { status: 429, body: { error: 'Too many searches. Try again in an hour.' } };
  const like = `%${words}%`;
  const [byName, byBrokerage, byRecord] = await Promise.all([
    readProfiles((cols) => admin.from('profiles').select(cols).ilike('full_name', like).limit(40)),
    readProfiles((cols) => admin.from('profiles').select(cols).ilike('brokerage', like).limit(40)),
    admin.from('brokerages').select('id').ilike('legal_name', like).limit(40),
  ]);
  const error = byName.error || byBrokerage.error;
  if (error) { if (absent(error)) return NOT_AVAILABLE; throw error; }
  const found = new Map();
  for (const p of [...(byName.data || []), ...(byBrokerage.data || [])]) found.set(String(p.id), p);
  // Realtors whose brokerage record carries the words (its legal name).
  if (!byRecord.error && (byRecord.data || []).length) {
    const { data: members } = await admin.from('brokerage_members').select('profile_id').in('brokerage_id', byRecord.data.map((b) => b.id)).eq('status', 'active');
    const more = await profilesById(admin, [...new Set((members || []).map((m) => String(m.profile_id)))].filter((id) => !found.has(id)).slice(0, 40));
    if (!more.error) for (const [id, p] of more.byId) found.set(id, p);
  }
  const all = await rowsOf(admin, userId);
  if (all.error) throw all.error;
  if (!all.available) return NOT_AVAILABLE;
  const rowWith = new Map(all.rows.map((r) => [String(otherOf(r, userId)), r]));
  const results = [];
  for (const p of found.values()) {
    if (same(p.id, userId) || p.circle_findable === false || p.suspended_at || !nameOf(p)) continue;
    const row = rowWith.get(String(p.id)) || null;
    const state = standing(row, userId);
    if (state === 'hidden') continue;
    const card = publicCard(p);
    results.push({ id: card.id, name: card.name, brokerage: card.brokerage, initials: card.initials, state, connectionId: row && state !== 'none' ? row.id : null });
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return { status: 200, body: { available: true, results: results.slice(0, SEARCH_LIMIT) } };
}

async function mailRequest(admin, me, targetId) {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    // The address is read here to send this one mail, and goes nowhere else.
    const { data: to } = await admin.from('profiles').select('email').eq('id', targetId).maybeSingle();
    if (!to || !to.email) return false;
    const mail = circleRequestEmail({ fromName: nameOf(me), fromBrokerage: String(me.brokerage || '').trim(), circleUrl: `${siteBase()}/circle` });
    const out = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: CIRCLE_FROM, to: to.email, subject: mail.subject, html: mail.html, text: mail.text });
    if (out && out.error) throw new Error(out.error.message || 'send failed');
    return true;
  } catch (e) { logServerError('[circle] request email', e, { userId: me.id }); return false; }
}

const connectedEvents = async (admin, a, b) => {
  await recordEvent(admin, { profileId: a.id, type: 'circle_connected', payload: { realtorName: nameOf(b) || null } });
  await recordEvent(admin, { profileId: b.id, type: 'circle_connected', payload: { realtorName: nameOf(a) || null } });
};

// Ask to connect. The caller is the requester, always: no id of a requester is read from the
// request. A request the other realtor already sent the caller is accepted by this (both asked).
export async function requestConnection({ admin, userId, targetId }) {
  if (!isId(targetId) || same(targetId, userId)) return { status: 400, body: { error: 'Choose a realtor to add.' } };
  const people = await profilesById(admin, [String(userId), String(targetId)]);
  if (people.error) { if (absent(people.error)) return NOT_AVAILABLE; throw people.error; }
  const me = people.byId.get(String(userId)); const target = people.byId.get(String(targetId));
  if (!me) return { status: 404, body: { error: 'Profile not found.' } };
  const pair = await pairRow(admin, userId, targetId);
  if (pair.error) throw pair.error;
  if (!pair.available) return NOT_AVAILABLE;
  const row = pair.row;
  // Not there, suspended, or not findable and never in touch with the caller: one answer.
  if (!target || target.suspended_at || (target.circle_findable === false && !row)) return { status: 404, body: { error: 'That realtor could not be found.' } };
  if (row && row.status === 'accepted') return { status: 200, body: { ok: true, state: 'connected', connectionId: row.id } };
  if (row && row.status === 'blocked') {
    if (same(row.blocked_by, userId)) return { status: 409, body: { error: 'You blocked this realtor. Unblock them first.' } };
    return { status: 200, body: { ok: true, state: 'sent', connectionId: null } }; // silent: nothing is written
  }
  if (row && row.status === 'pending') {
    if (same(row.requester_id, userId)) return { status: 200, body: { ok: true, state: 'sent', connectionId: row.id } };
    return acceptConnection({ admin, userId, id: row.id });
  }
  if (row && row.status === 'declined' && same(row.requester_id, userId) && Date.now() - Date.parse(row.answered_at || row.created_at || 0) < ASK_AGAIN_DAYS * DAY) {
    return { status: 200, body: { ok: true, state: 'sent', connectionId: row.id } }; // silent: not sent again
  }
  // A new request: the limits, then the one row for the pair.
  if (await over('request', userId, REQUESTS_A_DAY, 86400)) return { status: 429, body: { error: 'You have sent a lot of requests today. Try again tomorrow.' } };
  const waiting = await admin.from(CONNECTIONS).select('id').eq('requester_id', userId).eq('status', 'pending');
  if (waiting.error) throw waiting.error;
  if ((waiting.data || []).length >= MAX_PENDING) return { status: 429, body: { error: 'You have many requests waiting. Try again once some are answered.' } };
  const now = new Date().toISOString();
  let id = row ? row.id : null;
  if (row) {
    const { data, error } = await admin.from(CONNECTIONS).update({ requester_id: userId, addressee_id: targetId, status: 'pending', blocked_by: null, created_at: now, answered_at: null }).eq('id', row.id).eq('status', row.status).select('id');
    if (error) throw error;
    if (!(data || []).length) return { status: 409, body: { error: 'That changed a moment ago. Try again.' } };
  } else {
    const { data, error } = await admin.from(CONNECTIONS).insert({ requester_id: userId, addressee_id: targetId, status: 'pending' }).select('id').maybeSingle();
    if (error) {
      // The other realtor asked in the same moment: the database kept one row for the pair.
      if (error.code === '23505') return { status: 409, body: { error: 'That changed a moment ago. Try again.' } };
      throw error;
    }
    id = data ? data.id : null;
  }
  await recordEvent(admin, { profileId: targetId, type: 'circle_connection_requested', payload: { realtorName: nameOf(me) || null } });
  await mailRequest(admin, me, targetId);
  return { status: 200, body: { ok: true, state: 'sent', connectionId: id } };
}

// The caller's own row, or the answer for a row that is not theirs (the same as for none).
async function ownRow(admin, userId, id) {
  if (!isId(id)) return { status: 400, body: { error: 'Nothing to change.' } };
  const { data: row, error } = await admin.from(CONNECTIONS).select('*').eq('id', id).maybeSingle();
  if (error) { if (absent(error)) return NOT_AVAILABLE; throw error; }
  if (!row || (!same(row.requester_id, userId) && !same(row.addressee_id, userId))) return { status: 404, body: { error: 'That request could not be found.' } };
  return { row };
}

// Accept: only the realtor who was asked. A connection exists from here, and only from here
// (or from a signup through the other realtor's invite link, lib/signupSource.js).
export async function acceptConnection({ admin, userId, id }) {
  const own = await ownRow(admin, userId, id); if (!own.row) return own;
  const row = own.row;
  if (!same(row.addressee_id, userId)) return { status: 404, body: { error: 'That request could not be found.' } };
  if (row.status === 'accepted') return { status: 200, body: { ok: true, state: 'connected', connectionId: row.id } };
  if (row.status !== 'pending') return { status: 409, body: { error: 'That request is no longer waiting.' } };
  const { data, error } = await admin.from(CONNECTIONS).update({ status: 'accepted', answered_at: new Date().toISOString() }).eq('id', row.id).eq('addressee_id', userId).eq('status', 'pending').select('id');
  if (error) throw error;
  if (!(data || []).length) return { status: 409, body: { error: 'That request is no longer waiting.' } };
  const people = await profilesById(admin, [String(row.requester_id), String(row.addressee_id)]);
  if (!people.error) { const a = people.byId.get(String(row.requester_id)); const b = people.byId.get(String(row.addressee_id)); if (a && b) await connectedEvents(admin, a, b); }
  return { status: 200, body: { ok: true, state: 'connected', connectionId: row.id } };
}

// Decline: only the realtor who was asked. Silent.
export async function declineConnection({ admin, userId, id }) {
  const own = await ownRow(admin, userId, id); if (!own.row) return own;
  const row = own.row;
  if (!same(row.addressee_id, userId)) return { status: 404, body: { error: 'That request could not be found.' } };
  if (row.status !== 'pending') return { status: 409, body: { error: 'That request is no longer waiting.' } };
  const { error } = await admin.from(CONNECTIONS).update({ status: 'declined', answered_at: new Date().toISOString() }).eq('id', row.id).eq('addressee_id', userId).eq('status', 'pending');
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

// Remove: either of the two, at any time. Ends the connection for both, or takes back a request
// the caller sent. Silent: the line on the timeline is the caller's own.
export async function removeConnection({ admin, userId, id }) {
  const own = await ownRow(admin, userId, id); if (!own.row) return own;
  const row = own.row;
  const mineToEnd = row.status === 'accepted' || ((row.status === 'pending' || row.status === 'declined') && same(row.requester_id, userId));
  if (!mineToEnd) return { status: 409, body: { error: 'There is nothing to remove.' } };
  // A request that was declined stays declined, so it cannot be sent again at once.
  if (row.status !== 'declined') {
    const { error } = await admin.from(CONNECTIONS).update({ status: 'removed' }).eq('id', row.id).eq('status', row.status);
    if (error) throw error;
  }
  if (row.status === 'accepted') {
    const people = await profilesById(admin, [String(otherOf(row, userId))]);
    const other = people.byId ? people.byId.get(String(otherOf(row, userId))) : null;
    await recordEvent(admin, { profileId: userId, type: 'circle_connection_removed', payload: { realtorName: nameOf(other) || null } });
  }
  return { status: 200, body: { ok: true } };
}

// Block: either of the two. Ends anything between them and stops new requests from the other
// realtor, who is told nothing. Unblock: only the one who blocked.
export async function blockConnection({ admin, userId, id }) {
  const own = await ownRow(admin, userId, id); if (!own.row) return own;
  const row = own.row;
  if (row.status === 'blocked') return same(row.blocked_by, userId) ? { status: 200, body: { ok: true } } : { status: 404, body: { error: 'That request could not be found.' } };
  const { error } = await admin.from(CONNECTIONS).update({ status: 'blocked', blocked_by: userId }).eq('id', row.id).eq('status', row.status);
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}
export async function unblockConnection({ admin, userId, id }) {
  const own = await ownRow(admin, userId, id); if (!own.row) return own;
  const row = own.row;
  if (row.status !== 'blocked' || !same(row.blocked_by, userId)) return { status: 404, body: { error: 'That request could not be found.' } };
  const { error } = await admin.from(CONNECTIONS).update({ status: 'removed', blocked_by: null }).eq('id', row.id).eq('blocked_by', userId);
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

// The caller's own settings: findable in search, does rentals, service areas. Written on the
// caller's own profile row and no other.
export async function saveCircleSettings({ admin, userId, body }) {
  const patch = {};
  if (typeof body.findable === 'boolean') patch.circle_findable = body.findable;
  if (body.doesRentals === true || body.doesRentals === false || body.doesRentals === null) patch.does_rentals = body.doesRentals;
  if (Array.isArray(body.serviceAreas) || typeof body.serviceAreas === 'string') {
    const list = (Array.isArray(body.serviceAreas) ? body.serviceAreas : String(body.serviceAreas).split(',')).map((a) => String(a || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
    patch.service_areas = [...new Set(list)].slice(0, 8);
  }
  if (!Object.keys(patch).length) return { status: 400, body: { error: 'Nothing to save.' } };
  const { data, error } = await admin.from('profiles').update(patch).eq('id', userId).select('id');
  if (error) { if (absent(error)) return NOT_AVAILABLE; throw error; }
  if (!(data || []).length) return { status: 404, body: { error: 'Profile not found.' } };
  return { status: 200, body: { ok: true, findable: patch.circle_findable, doesRentals: patch.does_rentals, serviceAreas: patch.service_areas } };
}
