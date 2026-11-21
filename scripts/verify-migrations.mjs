// scripts/verify-migrations.mjs  npm run verify:migrations
// Proves db/001, db/002, db/003, db/004 and db/999 on a real Postgres engine before anyone runs
// them in the Supabase SQL editor. The engine is PGlite: Postgres compiled to WebAssembly, in
// memory, inside this process. Nothing here opens a network connection, reads an env file or
// knows a Supabase URL. Every path starts from an empty database and throws it away.
//
// Every file is run the way the SQL editor runs a script: as ONE transaction, BEGIN to COMMIT.
// Every path runs twice. First with the statements sent one at a time inside that
// transaction, so a failure names the file and the line of the statement that caused it. Then
// with the whole file sent as one query string, BEGIN and COMMIT included, which is exactly
// what the editor sends. A failure rolls the transaction back and stops the path.
//
//   Path A  fresh setup   baseline, 001, 002, 003, 004, 004 again, 001 again, then every combination
//                         of state and old columns, 005, 005 again, 006, 007, credit-shared, 008, 009, 010, 011, 012, 013, each twice
//   Path B  upgrade       baseline, the OLD 001 (git show b11f1f8, four income kinds), 002, 003,
//                         one income_sources row carrying the fourth kind, 004, 004 again, 001 again,
//                         three drifted rows, 005, 005 again, 006, 007, credit-shared, 008, 009, 010, 011, 012, 013, each twice
//   Path C  rollback      after path B: 999, 999 again
//   Path D  old 012       baseline, the three utility columns as the earlier 012 made them (boolean
//                         NOT NULL DEFAULT false, git show 555c286) on listings that hold rows, 012, 012 again
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as S from '../lib/application-state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(`${ROOT}${rel}`, 'utf8');
const OLD_001_COMMIT = 'b11f1f8';
const FILES = {
  reference: 'db/schema-reference.sql',
  baseline: 'scripts/verify-migrations.baseline.sql',
  vocabulary: 'db/listing-applicants-vocabulary.sql',
  listingStatus: 'db/listing-status.sql',
  documents: 'db/documents.sql',
  m001: 'db/001-application-state-enums.sql',
  m002: 'db/002-application-state-tables.sql',
  m003: 'db/003-application-state-backfill.sql',
  m004: 'db/004-application-state-reconsider.sql',
  m005: 'db/005-application-state-resync.sql',
  m006: 'db/006-trial-default.sql',
  m007: 'db/007-drop-other-occupants.sql',
  credit: 'db/credit-shared.sql',
  parties: 'db/008-application-parties-invites.sql',
  m009: 'db/009-drop-min-years-at-job.sql',
  m010: 'db/010-drop-min-annual-income.sql',
  m011: 'db/011-document-content-hash.sql',
  m012: 'db/012-board-details.sql',
  m013: 'db/013-kpi-daily.sql',
  m014: 'db/014-prefill-record.sql',
  tenantProfiles: 'db/tenant-profiles.sql',
  m015: 'db/015-profile-verified-email.sql',
  m016: 'db/016-drop-application-defaults.sql',
  m017: 'db/017-realtor-invites.sql',
  m018: 'db/018-profile-vault.sql',
  m019: 'db/019-profile-shares.sql',
  m020: 'db/020-share-events.sql',
  m021: 'db/021-realtor-circle.sql',
  m022: 'db/022-full-tenant-profile.sql',
  m023: 'db/023-photo-log-actions.sql',
  m024: 'db/024-share-roles.sql',
  parity: 'db/state-parity-check.sql',
  m999: 'db/999-application-state-rollback.sql',
};
// The fourth income kind the old 001 created. Spelled in two halves so the word itself is not
// written anywhere in lib, pages, components or db (tests/applicationState.test.mjs), nor here.
const FOURTH_KIND = ['pen', 'sion'].join('');

// ── splitting a file into statements, keeping each one's first line ───────────────────
// Understands line comments, block comments, quoted strings, quoted identifiers and dollar
// quoted bodies ($$ ... $$ and $tag$ ... $tag$), which is everything these files use.
export function statements(sql) {
  const out = []; let i = 0; let start = 0; let line = 1; let startLine = 1; let seen = false;
  const n = sql.length;
  const mark = () => { if (!seen) { seen = true; start = i; startLine = line; } };
  while (i < n) {
    const c = sql[i]; const two = sql.slice(i, i + 2);
    if (c === '\n') { line++; i++; continue; }
    if (two === '--') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (two === '/*') { const end = sql.indexOf('*/', i + 2); const stop = end < 0 ? n : end + 2; line += (sql.slice(i, stop).match(/\n/g) || []).length; i = stop; continue; }
    if (/\s/.test(c)) { i++; continue; }
    mark();
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } if (sql[j] === '\n') line++; j++; }
      i = j + 1; continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { const end = sql.indexOf(m[0], i + m[0].length); const stop = end < 0 ? n : end + m[0].length; line += (sql.slice(i, stop).match(/\n/g) || []).length; i = stop; continue; }
    }
    if (c === ';') { out.push({ text: sql.slice(start, i + 1), line: startLine }); seen = false; i++; continue; }
    i++;
  }
  if (seen && sql.slice(start).trim()) out.push({ text: sql.slice(start), line: startLine });
  return out;
}

class StepError extends Error {}
let WHOLE = false; // the second pass: one query string per file

// One file, one transaction. Returns the number of statements it ran.
async function runFile(db, label, sql) {
  const list = statements(sql);
  if (WHOLE) {
    try { await db.exec(`BEGIN;\n${sql}\nCOMMIT;`); }
    catch (e) {
      await db.exec('ROLLBACK').catch(() => {});
      // position counts characters into the string that was sent; BEGIN and its newline are 7 of them.
      const at = Number(e.position) > 7 ? `, line ${sql.slice(0, Number(e.position) - 7).split('\n').length}` : '';
      throw new StepError(`${label}${at} (sent as one query): ${e.code ? `${e.code} ` : ''}${e.message}`);
    }
    return list.length;
  }
  await db.exec('BEGIN');
  for (const s of list) {
    try { await db.exec(s.text); }
    catch (e) {
      await db.exec('ROLLBACK').catch(() => {});
      const inner = e && e.where ? `\n      where: ${String(e.where).split('\n')[0]}` : '';
      throw new StepError(`${label}, statement starting at line ${s.line}: ${e.code ? `${e.code} ` : ''}${e.message}${inner}`);
    }
  }
  await db.exec('COMMIT');
  return list.length;
}

const rows = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = await rows(db, sql, params); return r.length ? Object.values(r[0])[0] : null; };
const labelsOf = async (db, type) => (await rows(db, `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = $1 ORDER BY e.enumsortorder`, [type])).map((r) => r.enumlabel);
const say = (s) => console.log(s);

let checks = 0;
function check(ok, what, detail = '') { checks++; if (!ok) throw new StepError(`CHECK FAILED: ${what}${detail ? ` (${detail})` : ''}`); say(`      ok  ${what}`); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// A statement that MUST be refused by the database; returns the error message.
async function refused(db, sql, params) {
  try { await db.query(sql, params); } catch (e) { return e.message || String(e); }
  return null;
}

async function step(db, label, rel, sql = null) {
  const count = await runFile(db, rel, sql == null ? read(rel) : sql);
  say(`  ${label}: ${rel}, ${count} statements, committed`);
  const app = await labelsOf(db, 'application_state'); const kinds = await labelsOf(db, 'income_source_kind');
  if (app.length || kinds.length) { say(`      application_state   ${app.join(', ') || '(no such type)'}`); say(`      income_source_kind  ${kinds.join(', ') || '(no such type)'}`); }
}

// ── the baseline and its rows ───────────────────────────────────────────────────────
const ID = {
  me: '11111111-1111-4111-8111-111111111111', other: '22222222-2222-4222-8222-222222222222',
  live: 'aaaaaaa1-0000-4000-8000-000000000001', rented: 'aaaaaaa1-0000-4000-8000-000000000002', closed: 'aaaaaaa1-0000-4000-8000-000000000003', theirs: 'aaaaaaa1-0000-4000-8000-000000000004',
};
const app = (k) => `bbbbbbb1-0000-4000-8000-00000000000${k}`;
const link = (k) => `ccccccc1-0000-4000-8000-00000000000${k}`;
// id, listing, application, decision_status, decision_priority, withdrawn, the state db/003 must give it
const LINKS = [
  [link(1), ID.live, app(1), 'none', 'normal', false, 'submitted'],
  [link(2), ID.live, app(2), 'none', 'top', false, 'shortlisted'],
  [link(3), ID.live, app(3), 'reject', 'top', false, 'submitted'],
  [link(4), ID.live, app(4), 'shortlist', 'normal', false, 'shortlisted'],
  [link(5), ID.live, app(5), 'none', 'top', true, 'withdrawn_by_applicant'],
  [link(6), ID.rented, app(1), 'none', 'normal', false, 'accepted'],
  [link(7), ID.rented, app(2), 'reject', 'normal', false, 'not_selected'],
  [link(8), ID.closed, app(3), 'none', 'normal', false, 'submitted'],
  [link(9), ID.theirs, app(4), 'none', 'normal', false, 'submitted'],
];
const DOC = 'ddddddd1-0000-4000-8000-000000000001';

async function baseline(db) {
  const ref = statements(read(FILES.reference)).length;
  await step(db, 'reference', FILES.reference);
  check(ref === 0, 'db/schema-reference.sql holds no statement at all: it documents, it does not create');
  await step(db, 'baseline ', FILES.baseline);
  await step(db, 'baseline ', FILES.vocabulary);
  await step(db, 'baseline ', FILES.listingStatus);
  await step(db, 'baseline ', FILES.documents);
  await db.query('INSERT INTO public.profiles (id, email) VALUES ($1, $2), ($3, $4)', [ID.me, 'me@example.com', ID.other, 'other@example.com']);
  for (const [id, owner, rent] of [[ID.live, ID.me, 2600], [ID.rented, ID.me, 3100], [ID.closed, ID.me, 1900], [ID.theirs, ID.other, 2000]]) await db.query('INSERT INTO public.listings (id, profile_id, name, monthly_rent) VALUES ($1, $2, $3, $4)', [id, owner, `Listing ${id.slice(-1)}`, rent]);
  for (let k = 1; k <= 5; k++) await db.query('INSERT INTO public.applications (id, application_number, full_name, email, annual_income) VALUES ($1, $2, $3, $4, $5)', [app(k), `RL-VERIFY-${k}`, `Applicant ${k}`, `a${k}@example.com`, 90000]);
  for (const [id, listing, application, status, priority, withdrawn] of LINKS) await db.query('INSERT INTO public.listing_applicants (id, listing_id, application_id, decision_status, decision_priority, withdrawn_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, listing, application, status, priority, withdrawn ? '2026-09-01T00:00:00Z' : null]);
  await db.query("UPDATE public.listings SET status = 'rented', closed_at = '2026-09-02T00:00:00Z', rented_link_id = $1 WHERE id = $2", [link(6), ID.rented]);
  await db.query("UPDATE public.listings SET status = 'closed', closed_at = '2026-09-03T00:00:00Z' WHERE id = $1", [ID.closed]);
  await db.query("INSERT INTO public.applicant_documents (id, listing_applicant_id, profile_id, storage_path, kind, mime, bytes, uploaded_by, expires_at) VALUES ($1, $2, $3, $4, 'pay stub', 'application/pdf', 1234, 'tenant', '2026-09-20T00:00:00Z')", [DOC, link(1), ID.me, `${ID.me}/${link(1)}/stub.pdf`]);
  say('  baseline rows: 2 profiles, 4 listings (live, rented, closed, someone else\'s), 5 applications, 9 listing_applicants, 1 applicant_documents');
}

// What must be exactly the same after everything, the rollback included.
async function legacySnapshot(db) {
  return {
    listings: await rows(db, 'SELECT id, status, closed_at::text AS closed_at, rented_link_id FROM public.listings ORDER BY id'),
    links: await rows(db, 'SELECT id, decision_status, decision_priority, withdrawn_at::text AS withdrawn_at, decision_reason_code, added_via FROM public.listing_applicants ORDER BY id'),
    documents: await rows(db, 'SELECT id, listing_applicant_id, profile_id, storage_path, kind, mime, bytes, uploaded_by, expires_at::text AS expires_at, deleted_at, opened_count FROM public.applicant_documents ORDER BY id'),
  };
}

const NEW_TABLES = ['applicant_people', 'application_parties', 'income_sources', 'closings', 'application_events'];
const NEW_TYPES = ['application_state', 'listing_state', 'application_party_role', 'income_source_kind', 'application_actor_type'];
const NEW_TRIGGERS = ['income_sources_refuse_occupant', 'closings_fill_monthly_rent', 'application_events_refuse_update', 'listing_applicants_refuse_client_state', 'listings_refuse_client_state'];
const NEW_FUNCTIONS = ['income_sources_refuse_occupant', 'closings_fill_monthly_rent', 'application_events_refuse_update', 'refuse_client_state_write'];
const NEW_COLUMNS = [['listing_applicants', 'state'], ['listings', 'state'], ['applications', 'applicant_person_id'], ['applicant_documents', 'applicant_person_id'], ['applicant_documents', 'application_party_id']];
const hasTable = (db, t) => one(db, 'SELECT to_regclass($1) IS NOT NULL', [`public.${t}`]);
const hasColumn = (db, t, c) => one(db, "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2)", [t, c]);
const hasType = (db, t) => one(db, "SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = $1)", [t]);
const hasTrigger = (db, t) => one(db, 'SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal)', [t]);
const hasFunction = (db, f) => one(db, "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1)", [f]);
const constraintCount = (db, name) => one(db, 'SELECT count(*)::int FROM pg_constraint WHERE conname = $1', [name]);

// After db/003: the mapping it printed in its own header, row by row.
async function checkBackfill(db) {
  const got = Object.fromEntries((await rows(db, 'SELECT id, state::text AS state FROM public.listing_applicants')).map((r) => [r.id, r.state]));
  for (const [id, , , status, priority, withdrawn, want] of LINKS) check(got[id] === want, `backfill: ${status}, ${priority}${withdrawn ? ', withdrawn' : ''}${id === link(6) ? ', the winner of a rented listing' : ''}${id === link(7) ? ', on a rented listing' : ''} reads ${want}`, `got ${got[id]}`);
  const ls = Object.fromEntries((await rows(db, 'SELECT id, state::text AS state FROM public.listings')).map((r) => [r.id, r.state]));
  check(ls[ID.live] === 'live' && ls[ID.rented] === 'rented' && ls[ID.closed] === 'withdrawn', 'backfill: active reads live, rented reads rented, closed reads withdrawn');
  check((await one(db, "SELECT count(*)::int FROM public.application_events WHERE reason = 'backfill'")) === LINKS.length, 'backfill: one starting audit row per application');
  const notNull = await rows(db, "SELECT table_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'state' AND table_name IN ('listings', 'listing_applicants') ORDER BY table_name");
  check(notNull.every((r) => r.is_nullable === 'NO') && /submitted/.test(notNull[0].column_default) && /live/.test(notNull[1].column_default), 'backfill: both state columns are NOT NULL with their starting default');
}

// After everything is in: the rules the tables themselves must hold.
async function checkRules(db) {
  const party = async (role, extra = {}) => one(db, 'INSERT INTO public.application_parties (application_id, role, full_name, annual_income) VALUES ($1, $2, $3, $4) RETURNING id', [app(5), role, `Party ${role}`, extra.income ?? null]);
  check(/occupant_no_income/.test(await refused(db, "INSERT INTO public.application_parties (application_id, role, full_name, annual_income) VALUES ($1, 'occupant', 'Occupant', 50000)", [app(5)]) || ''), 'an occupant with an income column is refused by the check constraint');
  const occupant = await party('occupant'); const guarantor = await party('guarantor', { income: 120000 });
  check(/occupant carries no income/i.test(await refused(db, "INSERT INTO public.income_sources (application_party_id, kind, annual_amount) VALUES ($1, 'employment', 1)", [occupant]) || ''), 'an income_sources row for an occupant is refused by the trigger');
  await db.query("INSERT INTO public.income_sources (application_party_id, kind, payer, annual_amount) VALUES ($1, 'self_employed', 'Own business', 120000)", [guarantor]);
  check(true, 'a guarantor is a party with income on the same application, not a second application');
  check(/invalid input value for enum|income_sources_kind_permitted/.test(await refused(db, 'INSERT INTO public.income_sources (application_party_id, kind, annual_amount) VALUES ($1, $2, 1)', [guarantor, FOURTH_KIND]) || ''), 'the fourth income kind can no longer be written');
  // closings: the deposit is never more than one month of the listing's rent (2600 on the live listing).
  await db.query('INSERT INTO public.closings (listing_applicant_id, monthly_rent_cents, agreement_signed_at, agreement_signed_by) VALUES ($1, 99999999, now(), $2)', [link(2), ID.me]);
  check((await one(db, 'SELECT monthly_rent_cents::int FROM public.closings WHERE listing_applicant_id = $1', [link(2)])) === 260000, 'closings: the rent comes from the listing (260000 cents), whatever the caller sends');
  check(/closings_deposit_within_one_month/.test(await refused(db, 'UPDATE public.closings SET deposit_received_at = now(), deposit_amount_cents = 260001 WHERE listing_applicant_id = $1', [link(2)]) || ''), 'closings: a deposit one cent over one month of rent is refused');
  await db.query('UPDATE public.closings SET deposit_received_at = now(), deposit_amount_cents = 260000 WHERE listing_applicant_id = $1', [link(2)]);
  check(/closings_keys_after_lease/.test(await refused(db, 'UPDATE public.closings SET keys_at = now() WHERE listing_applicant_id = $1', [link(2)]) || ''), 'closings: keys before the lease is signed are refused');
  check(/append only/.test(await refused(db, "UPDATE public.application_events SET reason = 'edited'") || ''), 'application_events: an update is refused for every role');
  check(/no_fit_result/.test(await refused(db, "INSERT INTO public.applicant_people (email, email_key, email_verified_at, facts) VALUES ('p@example.com', 'k1', now(), '{\"fitScore\": 4.8}')") || ''), 'applicant_people: a Fit result in facts is refused');
  check(/null value|email_verified_at/.test(await refused(db, "INSERT INTO public.applicant_people (email, email_key) VALUES ('q@example.com', 'k2')") || ''), 'applicant_people: a person without a verified email is refused');
  check((await one(db, "SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1) AND column_name ILIKE '%owner%token%'", [NEW_TABLES])) === 0, 'no new table carries an owner token column');

  // Ownership, as the signed in realtor sees it through the API role.
  const as = async (uid, fn) => { await db.exec(`SET request.jwt.claim.sub = '${uid}'; SET ROLE authenticated`); try { return await fn(); } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub'); } };
  const mineEvents = await as(ID.me, () => one(db, 'SELECT count(*)::int FROM public.application_events'));
  const theirEvents = await as(ID.other, () => one(db, 'SELECT count(*)::int FROM public.application_events'));
  check(mineEvents === 8 && theirEvents === 1, 'application_events: a realtor reads only the rows on their own listings (8 and 1 of 9)', `${mineEvents} and ${theirEvents}`);
  check((await as(ID.me, () => one(db, 'SELECT count(*)::int FROM public.closings'))) === 1 && (await as(ID.other, () => one(db, 'SELECT count(*)::int FROM public.closings'))) === 0, 'closings: the owner reads their one row, another realtor reads none');
  for (const t of ['applicant_people', 'application_parties', 'income_sources']) check(/permission denied/.test(await as(ID.me, () => refused(db, `SELECT 1 FROM public.${t}`)) || ''), `${t}: the authenticated role cannot read it at all`);
  for (const t of ['closings', 'application_events']) check(/permission denied/.test(await as(ID.me, () => refused(db, `DELETE FROM public.${t}`)) || ''), `${t}: the authenticated role cannot write it`);
  check(/moved by the server only/.test(await as(ID.me, () => refused(db, "UPDATE public.listing_applicants SET state = 'accepted' WHERE id = $1", [link(1)])) || ''), 'listing_applicants.state: a move from the browser role is refused by the guard');
  check(/moved by the server only/.test(await as(ID.me, () => refused(db, "UPDATE public.listings SET state = 'rented' WHERE id = $1", [ID.live])) || ''), 'listings.state: a move from the browser role is refused by the guard');
  check((await as(ID.me, () => refused(db, "UPDATE public.listing_applicants SET decision_notes = 'note' WHERE id = $1", [link(1)]))) === null, 'the browser role can still write its own row when the state does not change');
  await db.query("UPDATE public.listing_applicants SET state = 'not_selected' WHERE id = $1", [link(1)]);
  await db.query("UPDATE public.listing_applicants SET state = 'reconsidered', decision_notes = NULL WHERE id = $1", [link(1)]);
  check((await one(db, 'SELECT state::text FROM public.listing_applicants WHERE id = $1', [link(1)])) === 'reconsidered', 'the server role can write reconsidered, the value db/004 added');
  await db.query("UPDATE public.listing_applicants SET state = 'submitted' WHERE id = $1", [link(1)]);
}

async function checkEnd(db, { constraint = true } = {}) {
  const appLabels = await labelsOf(db, 'application_state'); const kinds = await labelsOf(db, 'income_source_kind');
  check(appLabels.includes('reconsidered') && appLabels.length === 15, 'application_state includes reconsidered (15 labels)', appLabels.join(', '));
  check(same(kinds, ['employment', 'self_employed', 'other']), 'income_source_kind is exactly employment, self_employed, other', kinds.join(', '));
  if (constraint) check((await constraintCount(db, 'income_sources_kind_permitted')) === 1, 'the check constraint income_sources_kind_permitted exists once');
  for (const t of NEW_TABLES) check((await hasTable(db, t)) === true && (await one(db, 'SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass($1)', [`public.${t}`])) === true, `${t} exists with row level security on`);
  check(same((await rows(db, "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY 1", [NEW_TABLES])).map((r) => r.policyname), ['application_events_select_own', 'closings_select_own']), 'the only policies on the new tables are the two read your own policies');
}

// ── db/006 and db/007 ──────────────────────────────────────────────────────────
// Rows planted before 006 runs: the ones the backfill must leave alone, beside the two baseline
// profiles at none with no history, which it must move to trial.
const P = { history: '33333333-3333-4333-8333-333333333333', lapsed: '44444444-4444-4444-8444-444444444444', founder: '55555555-5555-4555-8555-555555555555', fresh: '66666666-6666-4666-8666-666666666666', explicit: '77777777-7777-4777-8777-777777777777' };
async function plantBefore006(db) {
  await db.query("INSERT INTO public.profiles (id, email, plan, stripe_customer_id) VALUES ($1, 'history@example.com', 'none', 'cus_123')", [P.history]);
  await db.query("INSERT INTO public.profiles (id, email, plan, trial_ends_at) VALUES ($1, 'lapsed@example.com', 'none', '2026-01-01T00:00:00Z')", [P.lapsed]);
  await db.query("INSERT INTO public.profiles (id, email, plan) VALUES ($1, 'founder@example.com', 'founding')", [P.founder]);
  await db.query('CREATE INDEX IF NOT EXISTS applications_occupants_details_idx ON public.applications (occupants_details)');
  check((await hasColumn(db, 'applications', 'occupants_details')) === true && (await one(db, "SELECT to_regclass('public.applications_occupants_details_idx') IS NOT NULL")) === true, 'before 007: occupants_details and an index on it exist');
}
const profileOf = (db, id) => rows(db, "SELECT plan, trial_ends_at::text AS trial_ends_at, to_char(trial_ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS ends_day, stripe_customer_id FROM public.profiles WHERE id = $1", [id]).then((r) => r[0]);
const within7Days = async (db, iso) => one(db, "SELECT $1::timestamptz BETWEEN now() + interval '7 days' - interval '2 minutes' AND now() + interval '7 days' + interval '2 minutes'", [iso]);
async function check006(db, label) {
  for (const id of [ID.me, ID.other]) { const p = await profileOf(db, id); check(p.plan === 'trial' && !!p.trial_ends_at && (await within7Days(db, p.trial_ends_at)), `${label}: a profile at none with no history is on trial, ending in 7 days`, JSON.stringify(p)); }
  check((await profileOf(db, P.history)).plan === 'none', `${label}: a profile at none with a Stripe customer is left at none`);
  const lapsed = await profileOf(db, P.lapsed); check(lapsed.plan === 'none' && lapsed.ends_day === '2026-01-01', `${label}: a lapsed trial keeps its plan and its end date`, JSON.stringify(lapsed));
  check((await profileOf(db, P.founder)).plan === 'founding', `${label}: a founder stays founding`);
  check((await one(db, "SELECT column_default FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'plan'")).includes('trial'), `${label}: plan defaults to trial`);
  check((await hasTrigger(db, 'profiles_start_trial')) === true, `${label}: the insert trigger exists`);
}
async function checkInsertAfter006(db) {
  await db.query("INSERT INTO public.profiles (id, email) VALUES ($1, 'fresh@example.com')", [P.fresh]);
  const fresh = await profileOf(db, P.fresh); check(fresh.plan === 'trial' && (await within7Days(db, fresh.trial_ends_at)), 'a new profile with no plan given starts on trial, ending in 7 days', JSON.stringify(fresh));
  await db.query("INSERT INTO public.profiles (id, email, plan) VALUES ($1, 'explicit@example.com', 'none')", [P.explicit]);
  const explicit = await profileOf(db, P.explicit); check(explicit.plan === 'trial' && !!explicit.trial_ends_at, 'a new profile inserted at none starts on trial too');
  const paid = await one(db, "INSERT INTO public.profiles (email, plan, subscription_status) VALUES ('paid@example.com', 'paid', 'active') RETURNING plan || ' ' || coalesce(trial_ends_at::text, 'null')");
  check(paid === 'paid null', 'a paid profile passes through the trigger untouched');
}
async function check007(db, label) {
  check((await hasColumn(db, 'applications', 'occupants_details')) === false, `${label}: applications.occupants_details is gone`);
  check((await one(db, "SELECT to_regclass('public.applications_occupants_details_idx') IS NULL")) === true, `${label}: the index on it is gone`);
  check((await hasColumn(db, 'applications', 'number_of_occupants')) === (await one(db, "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'number_of_occupants')")), `${label}: nothing else on applications changed`);
}
async function run006And007(db, tag) {
  await plantBefore006(db);
  await step(db, `${tag}1`, FILES.m006); await check006(db, `${tag}1`);
  const ends = (await profileOf(db, ID.me)).trial_ends_at;
  await step(db, `${tag}2 (006 again)`, FILES.m006); await check006(db, `${tag}2`);
  check((await profileOf(db, ID.me)).trial_ends_at === ends, `${tag}2: a second run leaves the trial end date where it was`);
  await checkInsertAfter006(db);
  await step(db, `${tag}3`, FILES.m007); await check007(db, `${tag}3`);
  await step(db, `${tag}4 (007 again)`, FILES.m007); await check007(db, `${tag}4`);
}

// ── db/credit-shared.sql ───────────────────────────────────────────────────────
// The listing switch: present, false by default, left where it was on a second run; a listing
// written without it reads false; the events constraint accepts document_rejected where the
// events table exists (the baseline has none, so the guarded block returns).
async function checkCredit(db, label) {
  check((await hasColumn(db, 'listings', 'pref_ask_credit_report')) === true, `${label}: listings.pref_ask_credit_report exists`);
  const col = (await rows(db, "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'pref_ask_credit_report'"))[0];
  check(col.is_nullable === 'NO' && /false/.test(col.column_default), `${label}: NOT NULL, default false`, JSON.stringify(col));
  check((await one(db, 'SELECT bool_and(pref_ask_credit_report = false) FROM public.listings')) === true, `${label}: every existing listing reads false`);
  const fresh = await one(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'Fresh', 2000) RETURNING pref_ask_credit_report", [ID.me]);
  check(fresh === false, `${label}: a listing inserted without the column reads false`);
  await db.query("DELETE FROM public.listings WHERE name = 'Fresh'");
  if (await hasTable(db, 'events')) check(/document_rejected/.test(await one(db, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'events_type_check'")), `${label}: events.type accepts document_rejected`);
  else check(true, `${label}: no events table here, the guarded block returned`);
}
async function runCredit(db, tag) {
  await step(db, `${tag}1`, FILES.credit); await checkCredit(db, `${tag}1`);
  await db.query('UPDATE public.listings SET pref_ask_credit_report = true WHERE id = $1', [ID.live]);
  await step(db, `${tag}2 (credit-shared again)`, FILES.credit);
  check((await one(db, 'SELECT pref_ask_credit_report FROM public.listings WHERE id = $1', [ID.live])) === true, `${tag}2: a second run leaves a switched on listing on`);
  await db.query('UPDATE public.listings SET pref_ask_credit_report = false WHERE id = $1', [ID.live]);
  await checkCredit(db, `${tag}2`);
}

// ── db/008-application-parties-invites.sql ──────────────────────────────────────
// The invite columns on application_parties: present, the status check, the unique token, a
// second run leaves rows alone, and no new column carries a protected ground.
async function checkParties(db, label) {
  check((await hasColumn(db, 'listings', 'pref_guarantor_accepted')) === true, `${label}: listings.pref_guarantor_accepted exists`);
  check(typeof (await one(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'Guarantor probe', 2000) RETURNING pref_guarantor_accepted", [ID.me])) === 'boolean', `${label}: a listing inserted without the column reads a boolean, never null`);
  await db.query("DELETE FROM public.listings WHERE name = 'Guarantor probe'");
  for (const c of ['party_token', 'status', 'invited_at', 'started_at', 'submitted_at', 'declined_at', 'withdrawn_at', 'consented_at', 'address']) check((await hasColumn(db, 'application_parties', c)) === true, `${label}: application_parties.${c} exists`);
  check((await one(db, "SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application_parties' AND column_name = 'status'")).includes('invited'), `${label}: status defaults to invited`);
  check(/sticky|unknown|not_a_status/.test('') || /application_parties_status_check/.test(await refused(db, "INSERT INTO public.application_parties (application_id, role, full_name, status) VALUES ($1, 'co_applicant', 'X', 'sticky')", [app(5)]) || ''), `${label}: an unknown status is refused`);
  const tok = 'ABCDEFGHJKMNPQRSTUVWXYZ234567892';
  const id = await one(db, "INSERT INTO public.application_parties (application_id, role, full_name, email, party_token) VALUES ($1, 'co_applicant', 'Party One', 'p1@example.com', $2) RETURNING id", [app(5), tok]);
  check(/application_parties_token_idx|duplicate key/.test(await refused(db, "INSERT INTO public.application_parties (application_id, role, full_name, party_token) VALUES ($1, 'guarantor', 'Party Two', $2)", [app(5), tok]) || ''), `${label}: the party token is unique`);
  check((await one(db, 'SELECT status FROM public.application_parties WHERE id = $1', [id])) === 'invited', `${label}: a new party starts invited`);
  await db.query('DELETE FROM public.application_parties WHERE id = $1', [id]);
  const cols = (await rows(db, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'application_parties'")).map((r) => r.column_name);
  check(!cols.some((c) => /relationship|marital|family|age|birth|gender|occupant/.test(c)), `${label}: no column records a relationship, a family status or a protected ground`, cols.join(', '));
}
async function runParties(db, tag) {
  await step(db, `${tag}1`, FILES.parties); await checkParties(db, `${tag}1`);
  const kept = await one(db, "INSERT INTO public.application_parties (application_id, role, full_name, status, party_token) VALUES ($1, 'guarantor', 'Kept', 'submitted', 'KEPTKEPTKEPTKEPTKEPTKEPTKEPTKEP2') RETURNING id", [app(5)]);
  await step(db, `${tag}2 (008 again)`, FILES.parties); await checkParties(db, `${tag}2`);
  check((await one(db, 'SELECT status FROM public.application_parties WHERE id = $1', [kept])) === 'submitted', `${tag}2: a second run leaves a submitted party where it was`);
  await db.query('DELETE FROM public.application_parties WHERE id = $1', [kept]);
}

// ── db/009-drop-min-years-at-job.sql ────────────────────────────────────────────
// The column and any index on it are gone, the columns beside it are untouched, a listing written
// without it still inserts, and a second run changes nothing.
async function check009(db, label) {
  check((await hasColumn(db, 'listings', 'pref_min_years_at_job')) === false, `${label}: listings.pref_min_years_at_job is gone`);
  check((await one(db, "SELECT to_regclass('public.listings_pref_min_years_at_job_idx') IS NULL")) === true, `${label}: the index on it is gone`);
  for (const c of ['pref_min_annual_income', 'pref_rent_to_income_max_pct', 'pref_requires_landlord_reference', 'pref_requires_employer_verification', 'pref_ask_credit_report', 'pref_guarantor_accepted']) check((await hasColumn(db, 'listings', c)) === true, `${label}: listings.${c} is still there`);
  const fresh = await one(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'After 009', 2000) RETURNING id", [ID.me]);
  check(!!fresh, `${label}: a listing inserts without the column`);
  await db.query("DELETE FROM public.listings WHERE name = 'After 009'");
}
async function run009(db, tag) {
  await db.query('CREATE INDEX IF NOT EXISTS listings_pref_min_years_at_job_idx ON public.listings (pref_min_years_at_job)');
  await db.query('UPDATE public.listings SET pref_min_years_at_job = 2 WHERE id = $1', [ID.live]);
  check((await hasColumn(db, 'listings', 'pref_min_years_at_job')) === true && (await one(db, "SELECT to_regclass('public.listings_pref_min_years_at_job_idx') IS NOT NULL")) === true, `${tag}: before 009, the column, a value in it and an index on it exist`);
  const count = await one(db, 'SELECT count(*)::int FROM public.listings');
  await step(db, `${tag}1`, FILES.m009); await check009(db, `${tag}1`);
  await step(db, `${tag}2 (009 again)`, FILES.m009); await check009(db, `${tag}2`);
  check((await one(db, 'SELECT count(*)::int FROM public.listings')) === count, `${tag}2: no listing row was touched`);
}

// ── db/010-drop-min-annual-income.sql ───────────────────────────────────────────
// The income floor's column and any index on it are gone, the columns beside it are untouched, a
// listing still inserts, and a second run changes nothing.
async function check010(db, label) {
  check((await hasColumn(db, 'listings', 'pref_min_annual_income')) === false, `${label}: listings.pref_min_annual_income is gone`);
  check((await one(db, "SELECT to_regclass('public.listings_pref_min_annual_income_idx') IS NULL")) === true, `${label}: the index on it is gone`);
  for (const c of ['pref_rent_to_income_max_pct', 'pref_requires_landlord_reference', 'pref_requires_employer_verification', 'pref_ask_credit_report', 'pref_guarantor_accepted']) check((await hasColumn(db, 'listings', c)) === true, `${label}: listings.${c} is still there`);
  const fresh = await one(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'After 010', 2000) RETURNING id", [ID.me]);
  check(!!fresh, `${label}: a listing inserts without the column`);
  await db.query("DELETE FROM public.listings WHERE name = 'After 010'");
}
async function run010(db, tag) {
  await db.query('CREATE INDEX IF NOT EXISTS listings_pref_min_annual_income_idx ON public.listings (pref_min_annual_income)');
  await db.query('UPDATE public.listings SET pref_min_annual_income = 75000 WHERE id = $1', [ID.live]);
  check((await hasColumn(db, 'listings', 'pref_min_annual_income')) === true && (await one(db, "SELECT to_regclass('public.listings_pref_min_annual_income_idx') IS NOT NULL")) === true, `${tag}: before 010, the column, a value in it and an index on it exist`);
  const count = await one(db, 'SELECT count(*)::int FROM public.listings');
  await step(db, `${tag}1`, FILES.m010); await check010(db, `${tag}1`);
  await step(db, `${tag}2 (010 again)`, FILES.m010); await check010(db, `${tag}2`);
  check((await one(db, 'SELECT count(*)::int FROM public.listings')) === count, `${tag}2: no listing row was touched`);
}

// ── db/011-document-content-hash.sql ────────────────────────────────────────────
// The hash column and its partial index exist, a held row keeps every other column, a deleted row
// that carried a hash is cleared, a live one keeps it, and a second run changes nothing.
async function check011(db, label) {
  check((await hasColumn(db, 'applicant_documents', 'content_hash')) === true, `${label}: applicant_documents.content_hash exists`);
  check((await one(db, "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'applicant_documents' AND column_name = 'content_hash'")) === 'text', `${label}: it is text, nullable`);
  check((await one(db, "SELECT to_regclass('public.applicant_documents_hash_idx') IS NOT NULL")) === true, `${label}: the per realtor hash index exists`);
  check(/WHERE \(\(deleted_at IS NULL\) AND \(content_hash IS NOT NULL\)\)/.test(await one(db, "SELECT pg_get_indexdef('public.applicant_documents_hash_idx'::regclass)")), `${label}: the index covers live rows with a hash only`);
  check((await one(db, 'SELECT count(*)::int FROM public.applicant_documents WHERE deleted_at IS NOT NULL AND content_hash IS NOT NULL')) === 0, `${label}: no deleted row carries a hash`);
}
async function run011(db, tag) {
  const before = await rows(db, 'SELECT id, listing_applicant_id, profile_id, storage_path, kind, mime, bytes, uploaded_by, expires_at::text AS expires_at, deleted_at FROM public.applicant_documents ORDER BY id');
  await step(db, `${tag}1`, FILES.m011); await check011(db, `${tag}1`);
  // A live row with a hash, and a deleted one that still carries one (as if written before the clearing paths).
  const gone = 'ddddddd1-0000-4000-8000-000000000011';
  await db.query("INSERT INTO public.applicant_documents (id, listing_applicant_id, profile_id, storage_path, kind, mime, bytes, uploaded_by, expires_at, deleted_at, deleted_by, content_hash) VALUES ($1, $2, $3, $4, 'pay stub', 'application/pdf', 10, 'tenant', '2026-09-20T00:00:00Z', '2026-09-21T00:00:00Z', 'expired', 'abc')", [gone, link(1), ID.me, `${ID.me}/${link(1)}/gone.pdf`]);
  await db.query("UPDATE public.applicant_documents SET content_hash = 'live-hash' WHERE id = $1", [DOC]);
  await step(db, `${tag}2 (011 again)`, FILES.m011); await check011(db, `${tag}2`);
  check((await one(db, 'SELECT content_hash FROM public.applicant_documents WHERE id = $1', [gone])) === null, `${tag}2: the deleted row's hash is cleared`);
  check((await one(db, 'SELECT content_hash FROM public.applicant_documents WHERE id = $1', [DOC])) === 'live-hash', `${tag}2: the live row keeps its hash`);
  await db.query('DELETE FROM public.applicant_documents WHERE id = $1', [gone]);
  await db.query('UPDATE public.applicant_documents SET content_hash = NULL WHERE id = $1', [DOC]);
  check(same(await rows(db, 'SELECT id, listing_applicant_id, profile_id, storage_path, kind, mime, bytes, uploaded_by, expires_at::text AS expires_at, deleted_at FROM public.applicant_documents ORDER BY id'), before), `${tag}2: every other column of every held row is what it was`);
}

// ── db/012-board-details.sql ────────────────────────────────────────────────────
// Every board column exists with its type and default, a listing and a profile insert without
// them, the board check refuses a word off the list, a value set before a second run survives it,
// no other column of any listing moves, and the events constraint accepts form_data_opened where
// the events table exists (the baseline has none, so the guarded block returns).
const BOARD_COLUMNS = [
  ['mls_number', 'text'], ['listing_brokerage_name', 'text'], ['listing_brokerage_address', 'text'], ['listing_brokerage_phone', 'text'],
  ['coop_brokerage_name', 'text'], ['coop_commission', 'text'], ['possession_date', 'date'], ['lease_term_months', 'integer'],
  ['utilities_heat', 'boolean'], ['utilities_hydro', 'boolean'], ['utilities_water', 'boolean'], ['parking_spaces', 'integer'],
  ['locker', 'text'], ['furnished', 'boolean'], ['deposit_last_month', 'integer'], ['deposit_key', 'integer'], ['deposit_security', 'integer'], ['deposit_pet', 'integer'],
];
// Every column of listings as the catalog holds it: name, type, NOT NULL, and the default expression.
const listingsCatalog = (db) => rows(db, "SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, a.atthasdef, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'public.listings'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum");
async function check012(db, label) {
  for (const [c, type] of BOARD_COLUMNS) check((await one(db, "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = $1", [c])) === type, `${label}: listings.${c} is ${type}`);
  for (const c of ['utilities_heat', 'utilities_hydro', 'utilities_water', 'furnished']) {
    const col = (await rows(db, "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = $1", [c]))[0];
    check(col.is_nullable === 'YES' && col.column_default === null, `${label}: ${c} is nullable with no default`, JSON.stringify(col));
  }
  for (const c of ['brokerage_address', 'board']) check((await one(db, "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = $1", [c])) === 'text', `${label}: profiles.${c} is text`);
  check((await constraintCount(db, 'profiles_board_check')) === 1, `${label}: the board check exists once`);
  const fresh = await rows(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'Board probe', 2000) RETURNING mls_number, utilities_heat, furnished, deposit_key", [ID.me]);
  check(fresh[0].mls_number === null && fresh[0].utilities_heat === null && fresh[0].furnished === null && fresh[0].deposit_key === null, `${label}: a listing inserts without the columns and reads them empty, the utilities not set`);
  await db.query("DELETE FROM public.listings WHERE name = 'Board probe'");
  check(/profiles_board_check/.test(await refused(db, "UPDATE public.profiles SET board = 'elsewhere' WHERE id = $1", [ID.me])), `${label}: a board off the list is refused`);
  await db.query("UPDATE public.profiles SET board = 'trreb', brokerage_address = '1 Sample St' WHERE id = $1", [ID.me]);
  check((await one(db, 'SELECT board FROM public.profiles WHERE id = $1', [ID.me])) === 'trreb', `${label}: a board on the list is kept`);
  await db.query('UPDATE public.profiles SET board = NULL, brokerage_address = NULL WHERE id = $1', [ID.me]);
  if (await hasTable(db, 'events')) check(/form_data_opened/.test(await one(db, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'events_type_check'")), `${label}: events.type accepts form_data_opened`);
  else check(true, `${label}: no events table here, the guarded block returned`);
}
async function run012(db, tag) {
  const before = await rows(db, 'SELECT * FROM public.listings ORDER BY id');
  await step(db, `${tag}1`, FILES.m012); await check012(db, `${tag}1`);
  await db.query("UPDATE public.listings SET mls_number = 'C1234567', utilities_heat = true, lease_term_months = 12, deposit_last_month = 2600 WHERE id = $1", [ID.live]);
  const shape = await listingsCatalog(db);
  await step(db, `${tag}2 (012 again)`, FILES.m012); await check012(db, `${tag}2`);
  check(same(await listingsCatalog(db), shape), `${tag}2: a second run leaves every listings column, its type, NOT NULL and default as they were`);
  const kept = (await rows(db, 'SELECT mls_number, utilities_heat, lease_term_months, deposit_last_month FROM public.listings WHERE id = $1', [ID.live]))[0];
  check(kept.mls_number === 'C1234567' && kept.utilities_heat === true && kept.lease_term_months === 12 && kept.deposit_last_month === 2600, `${tag}2: a second run leaves the typed values where they were`);
  await db.query('UPDATE public.listings SET mls_number = NULL, utilities_heat = NULL, lease_term_months = NULL, deposit_last_month = NULL WHERE id = $1', [ID.live]);
  const after = await rows(db, 'SELECT * FROM public.listings ORDER BY id');
  const strip = (list) => list.map((r) => { const o = { ...r }; for (const [c] of BOARD_COLUMNS) delete o[c]; return o; });
  check(same(strip(after), strip(before)), `${tag}2: every other column of every listing is what it was`);
}

// ── db/013-kpi-daily.sql ────────────────────────────────────────────────────────
// kpi_daily exists with row level security on, no policy and nothing granted to the browser
// roles: a signed in realtor can neither read nor write it, the service role's writes land. One
// row per day: a second insert of a date is refused, an upsert replaces it. profiles.signup_source
// is nullable text, every existing profile stays null, the check refuses a URL and accepts every
// word on the list, and from the browser role the column keeps the value it had while the rest of
// the same update goes through. A second run changes no column, no constraint and no row.
const KPI_COLUMNS = [
  ['day', 'date'], ['active_realtors_mtd', 'integer'], ['active_realtors_last_month', 'integer'], ['rentals_closed_mtd', 'integer'], ['rentals_closed_last_month', 'integer'],
  ['streak_months', 'integer'], ['profile_reuse', 'integer'], ['profile_reuse_tracked', 'boolean'],
  ['signups_mtd', 'integer'], ['signups_known_mtd', 'integer'], ['referral_signups_mtd', 'integer'], ['referral_share_mtd', 'numeric'],
  ['signups_last_month', 'integer'], ['signups_known_last_month', 'integer'], ['referral_signups_last_month', 'integer'], ['referral_share_last_month', 'numeric'],
  ['days_left', 'integer'], ['computed_at', 'timestamp with time zone'],
];
const SIGNUP_SOURCES = ['direct', 'invite', 'realtor_referral', 'apply', 'report', 'my_application', 'tenant_page', 'landlord_page', 'ref:maya-k'];
const kpiCatalog = (db) => rows(db, "SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid IN ('public.kpi_daily'::regclass, 'public.profiles'::regclass) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum");
const kpiConstraints = (db) => rows(db, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid IN ('public.kpi_daily'::regclass, 'public.profiles'::regclass) ORDER BY conname");
async function check013(db, label) {
  for (const [c, type] of KPI_COLUMNS) check((await one(db, "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kpi_daily' AND column_name = $1", [c])) === type, `${label}: kpi_daily.${c} is ${type}`);
  check((await one(db, "SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kpi_daily'")) === KPI_COLUMNS.length, `${label}: kpi_daily has those ${KPI_COLUMNS.length} columns and no other`);
  check((await one(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kpi_daily'::regclass")) === true, `${label}: kpi_daily has row level security on`);
  check((await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kpi_daily'")) === 0, `${label}: kpi_daily has no policy`);
  for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, 'public.kpi_daily', priv])) === false, `${label}: ${role} holds no ${priv} on kpi_daily`);
  const as = async (role, fn) => { await db.exec(`SET ROLE ${role}`); try { return await fn(); } finally { await db.exec('RESET ROLE'); } };
  for (const role of ['anon', 'authenticated']) {
    check(/permission denied/.test(await as(role, () => refused(db, 'SELECT * FROM public.kpi_daily'))), `${label}: ${role} cannot read kpi_daily`);
    check(/permission denied/.test(await as(role, () => refused(db, "INSERT INTO public.kpi_daily (day, days_left) VALUES ('2026-11-17', 365)"))), `${label}: ${role} cannot write kpi_daily`);
  }
  // The service role's path (the owner here): one row per date, replaced by an upsert.
  await db.query("INSERT INTO public.kpi_daily (day, active_realtors_mtd, rentals_closed_mtd, referral_share_mtd, days_left) VALUES ('2026-11-17', 4, 2, 0.3333, 365)");
  check(/kpi_daily_pkey/.test(await refused(db, "INSERT INTO public.kpi_daily (day, days_left) VALUES ('2026-11-17', 365)")), `${label}: a second row for the same date is refused`);
  await db.query("INSERT INTO public.kpi_daily (day, active_realtors_mtd, days_left) VALUES ('2026-11-17', 5, 365) ON CONFLICT (day) DO UPDATE SET active_realtors_mtd = EXCLUDED.active_realtors_mtd");
  check((await one(db, "SELECT active_realtors_mtd FROM public.kpi_daily WHERE day = '2026-11-17'")) === 5 && (await one(db, 'SELECT count(*)::int FROM public.kpi_daily')) === 1, `${label}: an upsert replaces that date's row`);
  check(/check/.test(await refused(db, "INSERT INTO public.kpi_daily (day, referral_share_mtd, days_left) VALUES ('2026-11-18', 1.5, 364)")), `${label}: a share above one is refused`);
  check(/check/.test(await refused(db, "INSERT INTO public.kpi_daily (day, active_realtors_mtd, days_left) VALUES ('2026-11-18', -1, 364)")), `${label}: a negative count is refused`);
  await db.query('DELETE FROM public.kpi_daily');
  // profiles.signup_source
  const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'signup_source'"))[0];
  check(col && col.data_type === 'text' && col.is_nullable === 'YES' && col.column_default === null, `${label}: profiles.signup_source is nullable text with no default`, JSON.stringify(col));
  check((await constraintCount(db, 'profiles_signup_source_check')) === 1, `${label}: the signup_source check exists once`);
  check((await one(db, "SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_keep_signup_source'")) === 1, `${label}: the keep trigger exists once`);
  for (const bad of ['https://rentletter.ca/apply/token', 'apply?from=x', 'ref:', 'ref:has space', 'elsewhere', '']) check(/profiles_signup_source_check/.test(await refused(db, 'UPDATE public.profiles SET signup_source = $2 WHERE id = $1', [ID.me, bad])), `${label}: "${bad}" is refused`);
  for (const good of SIGNUP_SOURCES) { await db.query('UPDATE public.profiles SET signup_source = $2 WHERE id = $1', [ID.me, good]); check((await one(db, 'SELECT signup_source FROM public.profiles WHERE id = $1', [ID.me])) === good, `${label}: "${good}" is kept`); }
  // From the browser role: the realtor's own update goes through, and the first touch stays put.
  await db.query("UPDATE public.profiles SET signup_source = 'apply', full_name = 'Before' WHERE id = $1", [ID.me]);
  await db.exec(`SET request.jwt.claim.sub = '${ID.me}'; SET ROLE authenticated`);
  try { await db.query("UPDATE public.profiles SET signup_source = 'direct', full_name = 'After' WHERE id = $1", [ID.me]); } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub'); }
  const kept = (await rows(db, 'SELECT signup_source, full_name FROM public.profiles WHERE id = $1', [ID.me]))[0];
  check(kept.signup_source === 'apply' && kept.full_name === 'After', `${label}: from the browser role the name changes and the first touch does not`, JSON.stringify(kept));
}
async function run013(db, tag) {
  const strip = (list) => list.map((r) => { const o = { ...r }; delete o.signup_source; return o; });
  const name = await one(db, 'SELECT full_name FROM public.profiles WHERE id = $1', [ID.me]);
  const before = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  await step(db, `${tag}1`, FILES.m013);
  check((await one(db, 'SELECT count(*)::int FROM public.profiles WHERE signup_source IS NOT NULL')) === 0, `${tag}1: every existing profile reads unknown (null)`);
  check(same(strip(await rows(db, 'SELECT * FROM public.profiles ORDER BY id')), before), `${tag}1: no other column of any profile moved`);
  await check013(db, `${tag}1`);
  await db.query("INSERT INTO public.kpi_daily (day, active_realtors_mtd, days_left) VALUES ('2026-11-17', 7, 365)");
  const shape = await kpiCatalog(db); const constraints = await kpiConstraints(db);
  const triggers = await rows(db, "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal ORDER BY 1");
  await step(db, `${tag}2 (013 again)`, FILES.m013);
  check(same(await kpiCatalog(db), shape), `${tag}2: a second run leaves every column of kpi_daily and profiles, its type, NOT NULL and default as they were`);
  check(same(await kpiConstraints(db), constraints), `${tag}2: and every constraint on both tables`);
  check(same(await rows(db, "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal ORDER BY 1"), triggers), `${tag}2: and the triggers on profiles`);
  check((await one(db, "SELECT active_realtors_mtd FROM public.kpi_daily WHERE day = '2026-11-17'")) === 7, `${tag}2: the snapshot row written before the second run is still there`);
  check((await one(db, 'SELECT signup_source FROM public.profiles WHERE id = $1', [ID.me])) === 'apply', `${tag}2: and the first touch a profile holds`);
  await db.query('DELETE FROM public.kpi_daily');
  await check013(db, `${tag}2`);
  await db.query('UPDATE public.profiles SET signup_source = NULL, full_name = $2 WHERE id = $1', [ID.me, name]);
  check(same(await rows(db, 'SELECT * FROM public.profiles ORDER BY id'), before.map((r) => ({ ...r, signup_source: null }))), `${tag}2: put back, every profile is what it was, with an empty first touch`);
}

// ── db/014-prefill-record.sql ───────────────────────────────────────────────────────────────
// applications gains the five nullable columns of the reuse record, with no default, and three
// named checks. Every existing application reads null in all five (unknown, never a reuse) and
// no other column of any application moves. A second run changes nothing.
const PREFILL_COLUMNS = [['prefill_source', 'text'], ['prefill_profile_id', 'uuid'], ['prefill_profile_revision', 'integer'], ['email_verified_at_submit', 'timestamp with time zone'], ['reused_checks', 'ARRAY']];
const PREFILL_CHECKS = ['applications_prefill_source_check', 'applications_prefill_profile_pair', 'applications_prefill_record_whole'];
const PROFILE_ID = 'dddddddd-0000-4000-8000-000000000001';
const applicationsCatalog = (db) => rows(db, "SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'public.applications'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attname");
const applicationsConstraints = (db) => rows(db, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.applications'::regclass ORDER BY conname");
const applicationsIndexes = (db) => rows(db, "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'applications' ORDER BY indexname");
async function check014(db, label) {
  for (const [c, type] of PREFILL_COLUMNS) {
    const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = $1", [c]))[0];
    check(col && col.data_type === type && col.is_nullable === 'YES' && col.column_default === null, `${label}: applications.${c} is nullable ${type} with no default`, JSON.stringify(col));
  }
  for (const name of PREFILL_CHECKS) check((await constraintCount(db, name)) === 1, `${label}: ${name} exists once`);
  check((await one(db, "SELECT count(*)::int FROM pg_constraint WHERE conrelid = 'public.applications'::regclass AND contype = 'f' AND pg_get_constraintdef(oid) LIKE '%prefill_profile_id%'")) === 0, `${label}: prefill_profile_id carries no foreign key`);
  check((await one(db, "SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'applications' AND indexname = 'applications_prefill_profile_idx'")) === 1, `${label}: the index on prefill_profile_id exists once`);
  const set = (cols, id = app(1)) => db.query(`UPDATE public.applications SET prefill_source = $2, prefill_profile_id = $3, prefill_profile_revision = $4, email_verified_at_submit = $5, reused_checks = $6 WHERE id = $1`, [id, cols.source ?? null, cols.profile ?? null, cols.revision ?? null, cols.verified ?? null, cols.checks ?? null]);
  const wrong = async (cols, name, what) => { let message = ''; try { await set(cols); message = '(not refused)'; } catch (e) { message = String(e.message || e); } check(new RegExp(name).test(message), `${label}: ${what} is refused`, message); };
  await wrong({ source: 'typed' }, 'applications_prefill_source_check', 'a source outside the list');
  await wrong({ source: 'profile' }, 'applications_prefill_profile_pair', 'a profile source with no profile');
  await wrong({ source: 'profile', profile: PROFILE_ID }, 'applications_prefill_profile_pair', 'a profile source with no revision');
  await wrong({ source: 'pass_on', profile: PROFILE_ID, revision: -1 }, 'applications_prefill_profile_pair', 'a negative revision');
  await wrong({ source: 'none', profile: PROFILE_ID, revision: 2 }, 'applications_prefill_profile_pair', 'a profile on an application typed fresh');
  await wrong({ source: 'pipeline_invite', profile: PROFILE_ID, revision: 2 }, 'applications_prefill_profile_pair', 'a profile on a pipeline invite');
  await wrong({ profile: PROFILE_ID, revision: 2 }, 'applications_prefill_profile_pair', 'a profile with no source');
  await wrong({ source: 'none', checks: [] }, 'applications_prefill_record_whole', 'document checks with no profile');
  await wrong({ verified: '2026-11-17T15:00:00Z' }, 'applications_prefill_record_whole', 'a proved email with no source');
  const good = [
    { source: 'none' }, { source: 'none', verified: '2026-11-17T15:00:00Z' }, { source: 'previous_application' }, { source: 'pipeline_invite' },
    { source: 'profile', profile: PROFILE_ID, revision: 0, checks: [] }, { source: 'profile', profile: PROFILE_ID, revision: 3, verified: '2026-11-17T15:00:00Z', checks: ['income_annual_gross'] },
    { source: 'pass_on', profile: PROFILE_ID, revision: 1, verified: '2026-11-17T15:00:00Z', checks: [] },
  ];
  for (const g of good) { await set(g); const r = (await rows(db, 'SELECT prefill_source, prefill_profile_id, prefill_profile_revision FROM public.applications WHERE id = $1', [app(1)]))[0]; check(r.prefill_source === g.source && r.prefill_profile_id === (g.profile ?? null) && r.prefill_profile_revision === (g.revision ?? null), `${label}: ${g.source}${g.profile ? ' with its profile' : ''}${g.verified ? ' and a proved email' : ''} is kept`, JSON.stringify(r)); }
  await set({});
}
async function run014(db, tag) {
  const strip = (list) => list.map((r) => { const o = { ...r }; for (const [c] of PREFILL_COLUMNS) delete o[c]; return o; });
  const before = await rows(db, 'SELECT * FROM public.applications ORDER BY id');
  await step(db, `${tag}1`, FILES.m014);
  check((await one(db, 'SELECT count(*)::int FROM public.applications WHERE prefill_source IS NOT NULL OR prefill_profile_id IS NOT NULL OR prefill_profile_revision IS NOT NULL OR email_verified_at_submit IS NOT NULL OR reused_checks IS NOT NULL')) === 0, `${tag}1: every existing application reads unknown (null) in all five columns`);
  check(same(strip(await rows(db, 'SELECT * FROM public.applications ORDER BY id')), before), `${tag}1: no other column of any application moved`);
  await check014(db, `${tag}1`);
  await db.query("UPDATE public.applications SET prefill_source = 'profile', prefill_profile_id = $2, prefill_profile_revision = 4, email_verified_at_submit = '2026-11-17T15:00:00Z', reused_checks = '{}' WHERE id = $1", [app(2), PROFILE_ID]);
  const shape = await applicationsCatalog(db); const constraints = await applicationsConstraints(db); const indexes = await applicationsIndexes(db);
  await step(db, `${tag}2 (014 again)`, FILES.m014);
  check(same(await applicationsCatalog(db), shape), `${tag}2: a second run leaves every column of applications, its type, NOT NULL and default as they were`);
  check(same(await applicationsConstraints(db), constraints), `${tag}2: and every constraint`);
  check(same(await applicationsIndexes(db), indexes), `${tag}2: and every index`);
  const kept = (await rows(db, 'SELECT prefill_source, prefill_profile_id, prefill_profile_revision, reused_checks FROM public.applications WHERE id = $1', [app(2)]))[0];
  check(kept.prefill_source === 'profile' && kept.prefill_profile_id === PROFILE_ID && kept.prefill_profile_revision === 4 && Array.isArray(kept.reused_checks) && kept.reused_checks.length === 0, `${tag}2: a record written before the second run is still there`, JSON.stringify(kept));
  await check014(db, `${tag}2`);
  await db.query('UPDATE public.applications SET prefill_source = NULL, prefill_profile_id = NULL, prefill_profile_revision = NULL, email_verified_at_submit = NULL, reused_checks = NULL WHERE id = $1', [app(2)]);
  check(same(strip(await rows(db, 'SELECT * FROM public.applications ORDER BY id')), before), `${tag}2: put back, every application is what it was`);
}

// ── db/015-profile-verified-email.sql ───────────────────────────────────────────────────────
// Before db/tenant-profiles.sql the file does nothing. After it: two nullable columns, the Fit
// key check on facts, and the view tenant_profile_shareable, which returns facts cut down to the
// whitelist (lib/profileFacts.js PROFILE_FACT_KEYS), never applications or an owner token, and
// is closed to the browser roles. A second run changes nothing.
const SHAREABLE_KEYS = ['fullName', 'email', 'phone', 'employer', 'jobTitle', 'employmentType', 'yearsAtJob', 'annualIncome', 'previousAddress', 'yearsAtPrevious', 'previousLandlordName', 'previousLandlordContact', 'moveInDate'];
const TP = 'eeeeeeee-0000-4000-8000-000000000001';
const profileCatalog = (db) => rows(db, "SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE c.oid IN ('public.tenant_profiles'::regclass, 'public.tenant_profile_shareable'::regclass) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attname");
const profileConstraints = (db) => rows(db, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.tenant_profiles'::regclass ORDER BY conname");
async function check015(db, label) {
  for (const c of ['email_verified_at', 'last_active_at']) {
    const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profiles' AND column_name = $1", [c]))[0];
    check(col && col.data_type === 'timestamp with time zone' && col.is_nullable === 'YES' && col.column_default === null, `${label}: tenant_profiles.${c} is a nullable timestamp with no default`, JSON.stringify(col));
  }
  check((await constraintCount(db, 'tenant_profiles_no_fit_result')) === 1, `${label}: tenant_profiles_no_fit_result exists once`);
  const cols = (await rows(db, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profile_shareable' ORDER BY column_name")).map((r) => r.column_name);
  check(same(cols, ['email_verified_at', 'facts', 'facts_updated_at', 'id']), `${label}: the view has id, email_verified_at, facts_updated_at and facts, and no other column`, JSON.stringify(cols));
  check(/security_invoker=true/.test(String(await one(db, "SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.tenant_profile_shareable'::regclass"))), `${label}: the view reads as its caller (security_invoker)`);
  for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, 'public.tenant_profile_shareable', priv])) === false, `${label}: ${role} holds no ${priv} on the view`);
  const as = async (role, fn) => { await db.exec(`SET ROLE ${role}`); try { return await fn(); } finally { await db.exec('RESET ROLE'); } };
  for (const role of ['anon', 'authenticated']) check(/permission denied/.test(await as(role, () => refused(db, 'SELECT * FROM public.tenant_profile_shareable'))), `${label}: ${role} cannot read the view`);
  // A profile holding every kind of answer, and an owner token on its application list.
  const facts = { fullName: 'Maya Okafor', email: 'maya@mail.ca', phone: '4165550101', employer: 'Northwind', jobTitle: 'Analyst', employmentType: 'full-time', yearsAtJob: '3', annualIncome: '84000', previousAddress: '12 Elm St', yearsAtPrevious: '2', previousLandlordName: 'Lee', previousLandlordContact: 'lee@mail.ca', moveInDate: '2027-01-01', pets: 'none',
    numberOfOccupants: '4', smoker: 'no', age: '31', dateOfBirth: '1995-02-03', coApplicantRelationship: 'spouse', coApplicantAge: '33', coApplicantName: 'Sam', hasCoApplicant: true, netIncome: '61000', currentRent: '2100', businessName: 'Maya Co', reference1Name: 'Ivy', incomeSource: 'assistance' };
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts, applications, facts_updated_at, email_verified_at) VALUES ($1, 'maya@mail.ca', 'k1', $2, $3, '2026-11-10T15:00:00Z', '2026-11-12T15:00:00Z')", [TP, JSON.stringify(facts), JSON.stringify([{ applicationNumber: 'RL-2026-ABCD-EFGH', ownerToken: 'OWNERTOKENSECRET' }])]);
  const seen = (await rows(db, 'SELECT * FROM public.tenant_profile_shareable WHERE id = $1', [TP]))[0];
  check(same(Object.keys(seen.facts).sort(), [...SHAREABLE_KEYS].sort()), `${label}: through the view facts holds the ${SHAREABLE_KEYS.length} whitelisted keys and no other`, Object.keys(seen.facts).sort().join(','));
  check(!/OWNERTOKENSECRET|numberOfOccupants|coApplicant|dateOfBirth|smoker|netIncome|currentRent|reference1|incomeSource|"age"|"pets"/.test(JSON.stringify(seen)), `${label}: no owner token, household size, age, relationship, pets or any other answer comes through the view`);
  check(seen.facts.annualIncome === '84000' && seen.email_verified_at != null && seen.facts_updated_at != null, `${label}: the whitelisted values, the proof of the address and the date of the facts come through`);
  check(/does not exist/.test(await refused(db, 'SELECT applications FROM public.tenant_profile_shareable')), `${label}: the view has no applications column to ask for`);
  // facts that are null, or not an object, read as no facts.
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ('eeeeeeee-0000-4000-8000-000000000002', 'omar@mail.ca', 'k2', NULL), ('eeeeeeee-0000-4000-8000-000000000003', 'lena@mail.ca', 'k3', '[]'::jsonb)");
  check((await one(db, "SELECT count(*)::int FROM public.tenant_profile_shareable WHERE facts = '{}'::jsonb")) === 2, `${label}: a profile with no facts reads as an empty object`);
  for (const key of ['fit', 'fitScore', 'fit_score', 'score', 'scorecard', 'criteria', 'rank', 'ranking']) check(/tenant_profiles_no_fit_result/.test(await refused(db, "UPDATE public.tenant_profiles SET facts = facts || jsonb_build_object($2::text, 91) WHERE id = $1", [TP, key])), `${label}: facts holding "${key}" is refused`);
  await db.query("DELETE FROM public.tenant_profiles WHERE id IN ($1, 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')", [TP]);
}
async function run015(db, tag) {
  // Before db/tenant-profiles.sql: nothing to change, and the file says so without failing.
  await step(db, `${tag}0 (015 before tenant-profiles)`, FILES.m015);
  check((await one(db, "SELECT to_regclass('public.tenant_profile_shareable') IS NULL")) === true && (await one(db, "SELECT to_regclass('public.tenant_profiles') IS NULL")) === true, `${tag}0: with no tenant_profiles table the file creates nothing`);
  await step(db, `${tag}0 (tenant-profiles)`, FILES.tenantProfiles);
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts, profile_revision) VALUES ('eeeeeeee-0000-4000-8000-000000000009', 'kept@mail.ca', 'k9', '{\"fullName\":\"Kept\",\"numberOfOccupants\":\"2\"}', 4)");
  const before = await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id');
  await step(db, `${tag}1`, FILES.m015);
  const strip = (list) => list.map((r) => { const o = { ...r }; delete o.email_verified_at; delete o.last_active_at; return o; });
  check((await one(db, 'SELECT count(*)::int FROM public.tenant_profiles WHERE email_verified_at IS NOT NULL OR last_active_at IS NOT NULL')) === 0, `${tag}1: an existing profile has proved nothing (null)`);
  check(same(strip(await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id')), before), `${tag}1: no other column of any profile moved, and its own facts are whole`);
  await check015(db, `${tag}1`);
  await db.query("UPDATE public.tenant_profiles SET email_verified_at = '2026-11-12T15:00:00Z' WHERE id = 'eeeeeeee-0000-4000-8000-000000000009'");
  const shape = await profileCatalog(db); const constraints = await profileConstraints(db);
  const viewDef = await one(db, "SELECT pg_get_viewdef('public.tenant_profile_shareable'::regclass)");
  await step(db, `${tag}2 (015 again)`, FILES.m015);
  check(same(await profileCatalog(db), shape), `${tag}2: a second run leaves every column of the table and the view as it was`);
  check(same(await profileConstraints(db), constraints), `${tag}2: and every constraint`);
  check((await one(db, "SELECT pg_get_viewdef('public.tenant_profile_shareable'::regclass)")) === viewDef, `${tag}2: and the view's definition`);
  check((await one(db, "SELECT email_verified_at IS NOT NULL FROM public.tenant_profiles WHERE id = 'eeeeeeee-0000-4000-8000-000000000009'")) === true, `${tag}2: a proof recorded before the second run is still there`);
  await check015(db, `${tag}2`);
  await db.query("DELETE FROM public.tenant_profiles WHERE id = 'eeeeeeee-0000-4000-8000-000000000009'");
}

// ── db/018-profile-vault.sql ───────────────────────────────────────────────────────────────
// The tenant's vault: the bucket, one nullable column on tenant_profiles, and three tables with
// row level security on, no policy, and nothing granted to the browser roles. A credit report
// has no kind to be stored under, a fact outside the closed list cannot be recorded, a fact
// outlives its document, and everything goes with the profile. A second run changes nothing.
const VAULT_TABLES = ['tenant_profile_documents', 'tenant_profile_checks', 'profile_access_log'];
const vaultCatalog = (db) => rows(db, "SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('tenant_profile_documents', 'tenant_profile_checks', 'profile_access_log', 'tenant_profiles') AND a.attnum > 0 AND NOT a.attisdropped ORDER BY c.relname, a.attname");
const vaultConstraints = (db) => rows(db, "SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('tenant_profile_documents', 'tenant_profile_checks', 'profile_access_log') ORDER BY c.relname, k.conname");
const vaultIndexes = (db) => rows(db, "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('tenant_profile_documents', 'tenant_profile_checks', 'profile_access_log') ORDER BY indexname");
const VP = 'eeeeeeee-0000-4000-8000-0000000000a1';
const VD = 'dddddddd-0000-4000-8000-0000000000a1';
async function check018(db, label) {
  const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profiles' AND column_name = 'vault_consent_at'"))[0];
  check(col && col.data_type === 'timestamp with time zone' && col.is_nullable === 'YES' && col.column_default === null, `${label}: tenant_profiles.vault_consent_at is a nullable timestamp with no default`, JSON.stringify(col));
  check((await one(db, "SELECT count(*)::int FROM storage.buckets WHERE id = 'tenant-vault' AND public = false")) === 1, `${label}: the bucket tenant-vault exists once, private`);
  for (const t of VAULT_TABLES) {
    check((await one(db, 'SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass', [`public.${t}`])) === true, `${label}: row level security is on for ${t}`);
    check((await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = $1", [t])) === 0, `${label}: ${t} has no policy`);
    for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, `public.${t}`, priv])) === false, `${label}: ${role} holds no ${priv} on ${t}`);
    for (const role of ['anon', 'authenticated']) { await db.exec(`SET ROLE ${role}`); let msg = ''; try { msg = await refused(db, `SELECT * FROM public.${t}`); } finally { await db.exec('RESET ROLE'); } check(/permission denied/.test(msg), `${label}: ${role} cannot read ${t}`, msg); }
  }
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'vault@mail.ca', 'kv1', '{}'::jsonb)", [VP]);
  const doc = (kind, path, extra = '') => `INSERT INTO public.tenant_profile_documents (id, tenant_profile_id, storage_path, kind, mime, bytes, expires_at${extra ? ', deleted_at, deleted_by' : ''}) VALUES (${extra ? 'gen_random_uuid()' : `'${VD}'`}, '${VP}', '${path}', '${kind}', 'application/pdf', 1200, now() + interval '90 days'${extra})`;
  await db.query(doc('income', `${VP}/a.pdf`));
  for (const kind of ['credit', 'credit report', 'bank']) check(/tenant_profile_documents_kind_check/.test(await refused(db, doc(kind, `${VP}/x-${kind}.pdf`).replace(`'${VD}'`, 'gen_random_uuid()'))), `${label}: a document of kind "${kind}" is refused`);
  check(/tenant_profile_documents_deleted_whole/.test(await refused(db, doc('id', `${VP}/half.pdf`, ", now(), NULL"))), `${label}: a deleted document always says who deleted it`);
  check(/deleted_by_check/.test(await refused(db, doc('id', `${VP}/who.pdf`, ", now(), 'realtor'"))), `${label}: and never a realtor`);
  check(/storage_path/.test(await refused(db, doc('income', `${VP}/a.pdf`).replace(`'${VD}'`, 'gen_random_uuid()'))), `${label}: a storage path is held once`);
  const fact = (kind, value) => db.query("INSERT INTO public.tenant_profile_checks (tenant_profile_id, kind, value, source_kind, source_document_id, fresh_until) VALUES ($1, $2, $3::jsonb, 'income', $4, now() + interval '90 days')", [VP, kind, value, VD]);
  await fact('income_annual_gross', '{"cents":8400000}');
  for (const kind of ['date_of_birth', 'age', 'income_type', 'status_in_canada', 'household_size']) check(/tenant_profile_checks_kind_check/.test(await refused(db, "INSERT INTO public.tenant_profile_checks (tenant_profile_id, kind, value, source_kind, fresh_until) VALUES ($1, $2, '{}'::jsonb, 'id', now())", [VP, kind])), `${label}: a fact of kind "${kind}" is refused`);
  check(/tenant_profile_checks_one_per_kind/.test(await refused(db, "INSERT INTO public.tenant_profile_checks (tenant_profile_id, kind, value, source_kind, fresh_until) VALUES ($1, 'income_annual_gross', '{\"cents\":1}'::jsonb, 'income', now())", [VP])), `${label}: one fact of a kind for a profile`);
  check(/tenant_profile_checks_no_fit_result/.test(await refused(db, "INSERT INTO public.tenant_profile_checks (tenant_profile_id, kind, value, source_kind, fresh_until) VALUES ($1, 'employer_name', '{\"name\":\"x\",\"score\":4}'::jsonb, 'income', now())", [VP])), `${label}: a fact holding a score is refused`);
  check(/tenant_profile_checks_value_object/.test(await refused(db, "INSERT INTO public.tenant_profile_checks (tenant_profile_id, kind, value, source_kind, fresh_until) VALUES ($1, 'employer_name', '[]'::jsonb, 'income', now())", [VP])), `${label}: a fact's value is an object`);
  for (const action of ['document_added', 'document_renewed', 'document_expired', 'document_deleted', 'check_recorded', 'check_removed', 'profile_viewed']) await db.query("INSERT INTO public.profile_access_log (tenant_profile_id, actor_type, action, document_id) VALUES ($1, 'system', $2, $3)", [VP, action, VD]);
  check(/profile_access_log_action_check/.test(await refused(db, "INSERT INTO public.profile_access_log (tenant_profile_id, actor_type, action) VALUES ($1, 'tenant', 'fit_scored')", [VP])), `${label}: the log takes only its own actions`);
  check(/profile_access_log_actor_type_check/.test(await refused(db, "INSERT INTO public.profile_access_log (tenant_profile_id, actor_type, action) VALUES ($1, 'landlord', 'profile_viewed')", [VP])), `${label}: and only its own actors`);
  // A fact outlives its document.
  await db.query('DELETE FROM public.tenant_profile_documents WHERE id = $1', [VD]);
  check((await one(db, "SELECT source_document_id IS NULL FROM public.tenant_profile_checks WHERE tenant_profile_id = $1 AND kind = 'income_annual_gross'", [VP])) === true, `${label}: when its document's row goes the fact stays, pointing at none`);
  // Everything goes with the profile.
  await db.query('DELETE FROM public.tenant_profiles WHERE id = $1', [VP]);
  for (const t of VAULT_TABLES) check((await one(db, `SELECT count(*)::int FROM public.${t} WHERE tenant_profile_id = $1`, [VP])) === 0, `${label}: deleting the profile empties ${t} of it`);
}
async function run018(db, tag) {
  const before = await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id');
  await step(db, `${tag}1`, FILES.m018);
  const strip = (list) => list.map((r) => { const o = { ...r }; delete o.vault_consent_at; return o; });
  check(same(strip(await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id')), before), `${tag}1: no column of any existing profile moved`);
  check((await one(db, 'SELECT count(*)::int FROM public.tenant_profiles WHERE vault_consent_at IS NOT NULL')) === 0, `${tag}1: no existing profile has agreed to anything`);
  await check018(db, `${tag}1`);
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts, vault_consent_at) VALUES ('eeeeeeee-0000-4000-8000-0000000000a2', 'kept-vault@mail.ca', 'kv2', '{}'::jsonb, '2026-11-19T15:00:00Z')");
  await db.query("INSERT INTO public.tenant_profile_documents (tenant_profile_id, storage_path, kind, mime, bytes, expires_at) VALUES ('eeeeeeee-0000-4000-8000-0000000000a2', 'eeeeeeee-0000-4000-8000-0000000000a2/k.pdf', 'id', 'image/png', 900, '2026-12-03T15:00:00Z')");
  const shape = await vaultCatalog(db); const constraints = await vaultConstraints(db); const indexes = await vaultIndexes(db);
  const held = await rows(db, 'SELECT * FROM public.tenant_profile_documents ORDER BY id');
  await step(db, `${tag}2 (018 again)`, FILES.m018);
  check(same(await vaultCatalog(db), shape), `${tag}2: a second run leaves every column, its type, NOT NULL and default as they were`);
  check(same(await vaultConstraints(db), constraints) && same(await vaultIndexes(db), indexes), `${tag}2: and every constraint and index`);
  check(same(await rows(db, 'SELECT * FROM public.tenant_profile_documents ORDER BY id'), held) && (await one(db, "SELECT vault_consent_at IS NOT NULL FROM public.tenant_profiles WHERE id = 'eeeeeeee-0000-4000-8000-0000000000a2'")) === true, `${tag}2: and every row: the document and the consent written before it are still there`);
  check((await one(db, "SELECT count(*)::int FROM storage.buckets WHERE id = 'tenant-vault'")) === 1, `${tag}2: and one bucket`);
  await check018(db, `${tag}2`);
  await db.query("DELETE FROM public.tenant_profiles WHERE id = 'eeeeeeee-0000-4000-8000-0000000000a2'");
}

// ── db/019-profile-shares.sql ──────────────────────────────────────────────────────────────
// Shares: one table, row level security on, no policy, nothing granted to the browser roles. The
// tenant and the recipient of a share never change, one live share per tenant, realtor, purpose
// and listing, an approved share always carries its time, and the log's share_id now points at
// it. A second run changes nothing.
const shareCatalog = (db) => rows(db, "SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'public.profile_shares'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attname");
const shareConstraints = (db) => rows(db, "SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('profile_shares', 'profile_access_log') ORDER BY c.relname, k.conname");
const shareIndexes = (db) => rows(db, "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profile_shares' ORDER BY indexname");
const shareTriggers = (db) => rows(db, "SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = 'public.profile_shares'::regclass AND NOT tgisinternal ORDER BY tgname");
const SP = 'eeeeeeee-0000-4000-8000-0000000000b1';
const SP2 = 'eeeeeeee-0000-4000-8000-0000000000b2';
const SP3 = 'eeeeeeee-0000-4000-8000-0000000000b3';
const dropProfiles = (db, ids) => db.query('DELETE FROM public.tenant_profiles WHERE id = ANY($1::uuid[])', [ids]);
async function check019(db, label) {
  check((await one(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profile_shares'::regclass")) === true, `${label}: row level security is on for profile_shares`);
  check((await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_shares'")) === 0, `${label}: profile_shares has no policy`);
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, "SELECT has_table_privilege($1, 'public.profile_shares', $2)", [role, priv])) === false, `${label}: ${role} holds no ${priv} on profile_shares`);
    await db.exec(`SET ROLE ${role}`); let msg = ''; try { msg = await refused(db, 'SELECT * FROM public.profile_shares'); } finally { await db.exec('RESET ROLE'); }
    check(/permission denied/.test(msg), `${label}: ${role} cannot read profile_shares`, msg);
  }
  check((await constraintCount(db, 'profile_access_log_share_id_fkey')) === 1, `${label}: the log's share_id points at profile_shares, once`);
  const realtors = (await rows(db, 'SELECT id FROM public.profiles ORDER BY id LIMIT 2')).map((r) => r.id);
  const listing = await one(db, 'SELECT id FROM public.listings ORDER BY id LIMIT 1');
  check(realtors.length === 2 && !!listing, `${label}: two realtors and a listing to share with`);
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'share@mail.ca', 'ks1', '{}'::jsonb), ($2, 'share2@mail.ca', 'ks2', '{}'::jsonb)", [SP, SP2]);
  const ins = (extra = {}) => { const r = { tenant_profile_id: SP, recipient_profile_id: realtors[0], purpose: 'application', listing_id: listing, status: 'approved', approved_at: '2026-11-19T15:00:00Z', approved_via: 'session', scope: '{facts,checks,documents}', ...extra }; const keys = Object.keys(r); return db.query(`INSERT INTO public.profile_shares (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, keys.map((k) => r[k])); };
  const no = async (extra) => { try { await ins(extra); return ''; } catch (e) { return String(e.message); } };
  const id = (await ins()).rows[0].id;
  check(/profile_shares_one_live_idx/.test(await no({})), `${label}: one live share for a tenant, a realtor, a purpose and a listing`);
  check(/profile_shares_approved_has_time/.test(await no({ recipient_profile_id: realtors[1], approved_at: null })), `${label}: an approved share always carries its time`);
  check(/profile_shares_scope_known/.test(await no({ recipient_profile_id: realtors[1], scope: '{facts,fit}' })), `${label}: a share shows facts, checks and documents, and nothing else`);
  check(/profile_shares_status_check/.test(await no({ recipient_profile_id: realtors[1], status: 'forwarded' })), `${label}: a status off the list is refused`);
  check(/profile_shares_purpose_check/.test(await no({ recipient_profile_id: realtors[1], purpose: 'marketing' })), `${label}: a purpose off the list is refused`);
  check(/profile_shares_pass_on_has_requester/.test(await no({ recipient_profile_id: realtors[1], purpose: 'pass_on' })), `${label}: a pass on names who asked`);
  check(/profile_shares_not_self/.test(await no({ recipient_profile_id: realtors[1], purpose: 'pass_on', requested_by: realtors[1] })), `${label}: and never the recipient`);
  check(/approved_via/.test(await no({ recipient_profile_id: realtors[1], approved_via: 'realtor' })), `${label}: approved only by the tenant's session or link`);
  check(/never change/.test(await refused(db, 'UPDATE public.profile_shares SET recipient_profile_id = $2 WHERE id = $1', [id, realtors[1]])), `${label}: the recipient of a share never changes`);
  check(/never change/.test(await refused(db, 'UPDATE public.profile_shares SET tenant_profile_id = $2 WHERE id = $1', [id, SP2])), `${label}: nor the tenant`);
  await db.query("UPDATE public.profile_shares SET status = 'revoked', ended_at = now() WHERE id = $1", [id]);
  const again = (await ins()).rows[0].id;
  check(!!again && again !== id, `${label}: after a share is revoked the tenant can approve a new one`);
  await db.query("INSERT INTO public.profile_access_log (tenant_profile_id, share_id, actor_type, actor_profile_id, actor_label, action) VALUES ($1, $2, 'realtor', $3, 'A realtor', 'profile_viewed')", [SP, again, realtors[0]]);
  check(/profile_access_log_share_id_fkey/.test(await refused(db, "INSERT INTO public.profile_access_log (tenant_profile_id, share_id, actor_type, action) VALUES ($1, 'ffffffff-0000-4000-8000-000000000001', 'realtor', 'profile_viewed')", [SP])), `${label}: a log line cannot name a share that does not exist`);
  await db.query('DELETE FROM public.profile_shares WHERE id = $1', [again]);
  check((await one(db, "SELECT count(*)::int FROM public.profile_access_log WHERE tenant_profile_id = $1 AND share_id IS NULL AND action = 'profile_viewed'", [SP])) === 1, `${label}: a removed share leaves its log line, pointing at none`);
  await dropProfiles(db, [SP, SP2]);
  check((await one(db, 'SELECT count(*)::int FROM public.profile_shares WHERE tenant_profile_id = $1', [SP])) === 0, `${label}: removing the profile removes its shares`);
}
async function run019(db, tag) {
  const logBefore = await rows(db, 'SELECT * FROM public.profile_access_log ORDER BY id');
  await step(db, `${tag}1`, FILES.m019);
  check(same(await rows(db, 'SELECT * FROM public.profile_access_log ORDER BY id'), logBefore), `${tag}1: no existing log line moved`);
  await check019(db, `${tag}1`);
  const realtor = await one(db, 'SELECT id FROM public.profiles ORDER BY id LIMIT 1');
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'kept-share@mail.ca', 'ks3', '{}'::jsonb)", [SP3]);
  await db.query("INSERT INTO public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, status, approved_at, approved_via) VALUES ($1, $2, 'application', 'approved', '2026-11-19T15:00:00Z', 'session')", [SP3, realtor]);
  const shape = await shareCatalog(db); const constraints = await shareConstraints(db); const indexes = await shareIndexes(db); const triggers = await shareTriggers(db);
  const held = await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id');
  await step(db, `${tag}2 (019 again)`, FILES.m019);
  check(same(await shareCatalog(db), shape), `${tag}2: a second run leaves every column, its type, NOT NULL and default as they were`);
  check(same(await shareConstraints(db), constraints) && same(await shareIndexes(db), indexes) && same(await shareTriggers(db), triggers), `${tag}2: and every constraint, index and trigger, on the shares and on the log`);
  check(same(await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id'), held), `${tag}2: and every row: the share approved before it is still there`);
  await check019(db, `${tag}2`);
  await dropProfiles(db, [SP3]);
}

// ── db/020-share-events.sql ────────────────────────────────────────────────────────────────
// events.type gains profile_share_approved and profile_share_revoked. The baseline has no events
// table, so the file is run three ways here: where the table is absent (it returns and makes
// nothing); on an events table that holds the constraint exactly as db/012 wrote it, with a row
// of an old type in it (the constraint is rewritten once, every old type is still accepted, the
// two new ones are accepted, a type off the list is still refused, the row does not move); and
// again (nothing changes). The events table this makes is the verifier's own and is taken away
// at the end, so the paths that follow see the database as they did before.
const typeList = (sql) => [...sql.split('CHECK (type IN (')[1].split('));')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const eventsConstraint = (db) => one(db, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'events_type_check'");
const SHARE_EVENTS = ['profile_share_approved', 'profile_share_revoked'];
async function run020(db, tag) {
  const had = await hasTable(db, 'events');
  const oldTypes = typeList(read(FILES.m012)); const newTypes = typeList(read(FILES.m020));
  check(same(newTypes, [...oldTypes, ...SHARE_EVENTS]), `${tag}: db/020 lists every type db/012 listed, in order, and the two new ones`);
  if (!had) {
    await step(db, `${tag}0 (no events table)`, FILES.m020);
    check(!(await hasTable(db, 'events')) && (await constraintCount(db, 'events_type_check')) === 0, `${tag}0: where db/events.sql has not run, the file returns and makes nothing`);
    const oldEvents = `CREATE TABLE public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());\nALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (${oldTypes.map((t) => `'${t}'`).join(', ')}));`;
    await step(db, `${tag}0 (events as db/012 left it)`, `an events table with the constraint of ${FILES.m012}`, oldEvents);
  }
  const realtor = await one(db, 'SELECT id FROM public.profiles ORDER BY id LIMIT 1');
  const add = (type) => db.query("INSERT INTO public.events (profile_id, type, payload) VALUES ($1, $2, '{\"applicantName\":\"Probe\"}'::jsonb)", [realtor, type]);
  const probes = () => rows(db, "SELECT id, profile_id, type, payload, created_at FROM public.events WHERE payload->>'applicantName' = 'Probe' ORDER BY created_at, id");
  await add('form_data_opened');
  const before = await eventsConstraint(db);
  if (!SHARE_EVENTS.every((t) => before.includes(t))) for (const t of SHARE_EVENTS) check(/events_type_check/.test(await refused(db, "INSERT INTO public.events (profile_id, type) VALUES ($1, $2)", [realtor, t]) || ''), `${tag}0: before the file, ${t} is refused`);
  const kept = await probes();
  await step(db, `${tag}1`, FILES.m020);
  const after = await eventsConstraint(db);
  check((await constraintCount(db, 'events_type_check')) === 1, `${tag}1: the constraint exists once`);
  check(newTypes.every((t) => after.includes(`'${t}'`)), `${tag}1: events.type accepts every type it accepted and the two new ones`);
  check(same(await probes(), kept), `${tag}1: the event written before the file did not move`);
  for (const t of SHARE_EVENTS) await add(t);
  check((await probes()).length === kept.length + 2, `${tag}1: profile_share_approved and profile_share_revoked are written`);
  check(/events_type_check/.test(await refused(db, "INSERT INTO public.events (profile_id, type) VALUES ($1, 'profile_share_peeked')", [realtor]) || ''), `${tag}1: a type off the list is still refused`);
  const held = await probes();
  await step(db, `${tag}2 (020 again)`, FILES.m020);
  check((await eventsConstraint(db)) === after && (await constraintCount(db, 'events_type_check')) === 1, `${tag}2: a second run leaves the constraint exactly as it was`);
  check(same(await probes(), held), `${tag}2: and every row`);
  if (!had) { await db.query('DROP TABLE public.events'); check(!(await hasTable(db, 'events')), `${tag}2: the verifier's own events table is gone again`); }
  else await db.query("DELETE FROM public.events WHERE payload->>'applicantName' = 'Probe'");
}

// ── db/021-realtor-circle.sql ──────────────────────────────────────────────────────────────
// The realtor circle and the brokerage record: three tables, three nullable columns on profiles,
// the connections of realtors who already joined through an invite link, and six more values of
// events.type. Run where there is no events table (the tables are made, the timeline is left
// alone), then on an events table holding the constraint as db/020 left it with an old row in it,
// then again (nothing changes). The realtors, the brokerages and the events table used here are
// the verifier's own and are taken away at the end.
const CIR = { a: 'c1000000-0000-4000-8000-000000000001', b: 'c1000000-0000-4000-8000-000000000002', c: 'c1000000-0000-4000-8000-000000000003', d: 'c1000000-0000-4000-8000-000000000004' };
const CIRCLE_TABLES = ['brokerages', 'brokerage_members', 'circle_connections'];
const CIRCLE_COLUMNS = ['circle_findable', 'does_rentals', 'service_areas'];
const CIRCLE_EVENTS = ['circle_connection_requested', 'circle_connected', 'circle_connection_removed', 'brokerage_added', 'brokerage_confirmed', 'brokerage_disputed'];
const circleCatalog = (db) => rows(db, "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position", [CIRCLE_TABLES]);
const circleConstraints = (db) => rows(db, 'SELECT c.relname AS t, k.conname, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid WHERE c.relname = ANY($1) ORDER BY 1, 2', [CIRCLE_TABLES]);
const circleIndexes = (db) => rows(db, "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY 1, 2", [CIRCLE_TABLES]);
const circleRows = async (db) => { const out = {}; for (const t of CIRCLE_TABLES) out[t] = await rows(db, `SELECT * FROM public.${t} ORDER BY id`); return out; };
const stripCircle = (list) => list.map((r) => { const o = { ...r }; for (const c of CIRCLE_COLUMNS) delete o[c]; return o; });
async function check021(db, label) {
  for (const t of CIRCLE_TABLES) check(await hasTable(db, t), `${label}: the table ${t} exists`);
  for (const [c, type] of [['circle_findable', 'boolean'], ['does_rentals', 'boolean'], ['service_areas', 'ARRAY']]) {
    const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = $1", [c]))[0];
    check(col && col.data_type === type && col.is_nullable === 'YES' && col.column_default === null, `${label}: profiles.${c} is nullable with no default`, JSON.stringify(col));
  }
  check((await one(db, 'SELECT count(*)::int FROM pg_class WHERE relname = ANY($1) AND relrowsecurity', [CIRCLE_TABLES])) === 3, `${label}: row level security is on for the three tables`);
  check((await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)", [CIRCLE_TABLES])) === 0, `${label}: and no policy opens any of them`);
  check((await one(db, "SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = ANY($1) AND grantee IN ('anon', 'authenticated')", [CIRCLE_TABLES])) === 0, `${label}: nothing is granted to anon or authenticated`);
  for (const t of CIRCLE_TABLES) check(/permission denied|row-level security/.test(await asRealtor(db, CIR.a, () => refused(db, `SELECT count(*) FROM public.${t}`)) || ''), `${label}: a signed in realtor's browser cannot read ${t}`);
  check((await one(db, "SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('circle_connections_pair_idx', 'brokerage_members_one_active_idx')")) === 2, `${label}: the one row per pair index and the one active membership index exist`);
}
async function run021(db, tag) {
  const hadEvents = await hasTable(db, 'events');
  const before = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  const policies = await profilesPolicies(db);
  const oldTypes = typeList(read(FILES.m020)); const newTypes = typeList(read(FILES.m021));
  check(same(newTypes, [...oldTypes, ...CIRCLE_EVENTS]), `${tag}: db/021 lists every type db/020 listed, in order, and the six new ones`);
  // Four realtors of this check's own: b joined through a's invite link before the file ran.
  await db.query("INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'circle-a@example.com', 'Circle A'), ($2, 'circle-b@example.com', 'Circle B'), ($3, 'circle-c@example.com', 'Circle C'), ($4, 'circle-d@example.com', 'Circle D')", [CIR.a, CIR.b, CIR.c, CIR.d]);
  await db.query('UPDATE public.profiles SET invited_by = $2 WHERE id = $1', [CIR.b, CIR.a]);
  const withMine = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  const credited = await one(db, 'SELECT count(*)::int FROM public.profiles WHERE invited_by IS NOT NULL');
  let first = `${tag}1`;
  if (!hadEvents) {
    first = `${tag}0`;
    await step(db, `${tag}0 (no events table)`, FILES.m021);
    check(!(await hasTable(db, 'events')) && (await constraintCount(db, 'events_type_check')) === 0, `${tag}0: where db/events.sql has not run, the tables are made and the timeline is left alone`);
  } else await step(db, `${tag}1`, FILES.m021);
  // The first run: nothing of any profile moved, and the invited realtor is in the inviter's circle.
  check(same(stripCircle(await rows(db, 'SELECT * FROM public.profiles ORDER BY id')), withMine), `${first}: no other column of any profile moved`);
  check((await one(db, 'SELECT count(*)::int FROM public.profiles WHERE circle_findable IS NOT NULL OR does_rentals IS NOT NULL OR service_areas IS NOT NULL')) === 0, `${first}: every existing profile reads null in the three new columns`);
  check(same(await profilesPolicies(db), policies), `${first}: the policies on profiles are exactly what they were`);
  await check021(db, first);
  const made = await rows(db, 'SELECT requester_id, addressee_id, status, answered_at IS NOT NULL AS answered FROM public.circle_connections ORDER BY created_at, id');
  check(made.length === credited && made.some((r) => r.requester_id === CIR.a && r.addressee_id === CIR.b && r.status === 'accepted' && r.answered), `${first}: a realtor who joined through an invite link is connected to the inviter, and nobody else is connected`, JSON.stringify(made));
  // One row per pair, whichever way round; never a realtor with themselves.
  const con = (a, b, extra = "'pending', NULL, NULL") => refused(db, `INSERT INTO public.circle_connections (requester_id, addressee_id, status, answered_at, blocked_by) VALUES ($1, $2, ${extra})`, [a, b]);
  check(/circle_connections_pair_idx/.test(await con(CIR.a, CIR.b) || ''), `${first}: a second row for a pair is refused`);
  check(/circle_connections_pair_idx/.test(await con(CIR.b, CIR.a) || ''), `${first}: and the other way round`);
  check(/circle_connections_not_self/.test(await con(CIR.c, CIR.c) || ''), `${first}: a realtor is never connected to themselves`);
  check(/circle_connections_status_check/.test(await con(CIR.c, CIR.d, "'followed', NULL, NULL") || ''), `${first}: a status off the list is refused`);
  check(/circle_connections_accepted_has_time/.test(await con(CIR.c, CIR.d, "'accepted', NULL, NULL") || ''), `${first}: accepted always carries when`);
  check(/circle_connections_blocked_by_one_of_them/.test(await con(CIR.c, CIR.d, "'blocked', NULL, NULL") || ''), `${first}: a block names who blocked`);
  check(/circle_connections_blocked_by_one_of_them/.test(await refused(db, "INSERT INTO public.circle_connections (requester_id, addressee_id, status, blocked_by) VALUES ($1, $2, 'blocked', $3)", [CIR.c, CIR.d, CIR.a]) || ''), `${first}: and only one of the two`);
  check(/circle_connections_blocked_by_one_of_them/.test(await refused(db, "INSERT INTO public.circle_connections (requester_id, addressee_id, status, blocked_by) VALUES ($1, $2, 'pending', $1)", [CIR.c, CIR.d]) || ''), `${first}: a row that is not a block names nobody`);
  check((await con(CIR.c, CIR.d)) == null, `${first}: a request between two other realtors is written`);
  check(/circle_connections_pair_idx/.test(await con(CIR.d, CIR.c) || ''), `${first}: and its pair is then taken`);
  // The brokerage record: confirmed only after the broker of record, a lower case address, one live link.
  const brokerage = (extra = '') => `INSERT INTO public.brokerages (legal_name, address, broker_of_record_name, broker_of_record_email, created_by${extra ? ', ' + extra.split('=')[0].trim() : ''}) VALUES ('Probe Realty Inc., Brokerage', '1 Main St, Toronto', 'Dana Probe', $2, $1${extra ? ', ' + extra.split('=')[1].trim() : ''}) RETURNING id`;
  const b1 = await one(db, brokerage("confirm_token_hash = 'hash-one'"), [CIR.a, 'dana@probe.ca']);
  check((await one(db, 'SELECT status FROM public.brokerages WHERE id = $1', [b1])) === 'unconfirmed', `${first}: a new brokerage is unconfirmed`);
  check(/broker_of_record_email/.test(await refused(db, brokerage(), [CIR.a, 'Dana@Probe.ca']) || ''), `${first}: the broker of record's address is stored in lower case`);
  check(/confirm_token_hash/.test(await refused(db, brokerage("confirm_token_hash = 'hash-one'"), [CIR.c, 'dana@probe.ca']) || ''), `${first}: one link opens one record`);
  check(/brokerages_status_check/.test(await refused(db, "UPDATE public.brokerages SET status = 'verified' WHERE id = $1", [b1]) || ''), `${first}: a status off the list is refused`);
  check(/brokerages_confirmed_by_broker_first/.test(await refused(db, "UPDATE public.brokerages SET status = 'confirmed', confirmed_at = now() WHERE id = $1", [b1]) || ''), `${first}: a brokerage cannot be confirmed before its broker of record has confirmed`);
  await db.query("UPDATE public.brokerages SET broker_confirmed_at = now(), confirm_token_hash = NULL WHERE id = $1", [b1]);
  check((await refused(db, "UPDATE public.brokerages SET status = 'confirmed', confirmed_at = now() WHERE id = $1", [b1])) == null, `${first}: after the broker of record, the office confirms it`);
  const m1 = await one(db, 'INSERT INTO public.brokerage_members (brokerage_id, profile_id) VALUES ($1, $2) RETURNING id', [b1, CIR.a]);
  const b2 = await one(db, brokerage(), [CIR.a, 'other@probe.ca']);
  check(/brokerage_members_one_active_idx/.test(await refused(db, 'INSERT INTO public.brokerage_members (brokerage_id, profile_id) VALUES ($1, $2)', [b2, CIR.a]) || ''), `${first}: a realtor has one active membership`);
  await db.query("UPDATE public.brokerage_members SET status = 'left', left_at = now() WHERE id = $1", [m1]);
  check((await refused(db, 'INSERT INTO public.brokerage_members (brokerage_id, profile_id) VALUES ($1, $2)', [b2, CIR.a])) == null, `${first}: after leaving one, the realtor joins another, and the history is kept`);
  check(/brokerage_members_status_check/.test(await refused(db, "UPDATE public.brokerage_members SET status = 'owner' WHERE id = $1", [m1]) || ''), `${first}: a membership status off the list is refused`);
  check(/brokerage_members_brokerage_id_fkey/.test(await refused(db, 'DELETE FROM public.brokerages WHERE id = $1', [b1]) || ''), `${first}: a brokerage with members cannot be deleted`);
  // The timeline: on an events table as db/020 left it, with a row of an old type in it.
  const probe = "payload->>'realtorName' = 'Probe'";
  const addEvent = (type) => db.query("INSERT INTO public.events (profile_id, type, payload) VALUES ($1, $2, '{\"realtorName\":\"Probe\"}'::jsonb)", [CIR.a, type]);
  const probes = () => rows(db, `SELECT id, profile_id, type, payload, created_at FROM public.events WHERE ${probe} ORDER BY created_at, id`);
  if (!hadEvents) {
    const oldEvents = `CREATE TABLE public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());\nALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (${oldTypes.map((t) => `'${t}'`).join(', ')}));`;
    await step(db, `${tag}0 (events as db/020 left it)`, `an events table with the constraint of ${FILES.m020}`, oldEvents);
    await addEvent('profile_share_revoked');
    for (const t of CIRCLE_EVENTS) check(/events_type_check/.test(await refused(db, 'INSERT INTO public.events (profile_id, type) VALUES ($1, $2)', [CIR.a, t]) || ''), `${tag}0: before the file, ${t} is refused`);
    const kept = await probes(); const circleBefore = await circleRows(db);
    await step(db, `${tag}1`, FILES.m021);
    check(same(await probes(), kept), `${tag}1: the event written before the file did not move`);
    check(same(await circleRows(db), circleBefore), `${tag}1: and no row of the circle or a brokerage moved`);
  } else await addEvent('profile_share_revoked');
  const after = await eventsConstraint(db);
  check((await constraintCount(db, 'events_type_check')) === 1, `${tag}1: the constraint on events.type exists once`);
  check(newTypes.every((t) => after.includes(`'${t}'`)), `${tag}1: events.type accepts every type it accepted and the six new ones`);
  const n = (await probes()).length;
  for (const t of CIRCLE_EVENTS) await addEvent(t);
  check((await probes()).length === n + 6, `${tag}1: the six circle and brokerage events are written`);
  check(/events_type_check/.test(await refused(db, "INSERT INTO public.events (profile_id, type) VALUES ($1, 'circle_followed')", [CIR.a]) || ''), `${tag}1: a type off the list is still refused`);
  // Again: nothing changes, and a connection someone removed is not brought back.
  await db.query("UPDATE public.circle_connections SET status = 'removed' WHERE requester_id = $1 AND addressee_id = $2", [CIR.a, CIR.b]);
  const shape = await circleCatalog(db); const constraints = await circleConstraints(db); const indexes = await circleIndexes(db);
  const profilesShape = await profilesCatalog(db); const profilesHeld = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  const held = await circleRows(db); const events = await probes();
  await step(db, `${tag}2 (021 again)`, FILES.m021);
  check(same(await circleCatalog(db), shape), `${tag}2: a second run leaves every column of the three tables, its type, NOT NULL and default as they were`);
  check(same(await circleConstraints(db), constraints) && same(await circleIndexes(db), indexes), `${tag}2: and every constraint and index`);
  check(same(await profilesCatalog(db), profilesShape) && same(await rows(db, 'SELECT * FROM public.profiles ORDER BY id'), profilesHeld) && same(await profilesPolicies(db), policies), `${tag}2: and profiles: every column, every row, every policy`);
  check(same(await circleRows(db), held), `${tag}2: and every row: no connection is added, and the removed one stays removed`);
  check((await eventsConstraint(db)) === after && (await constraintCount(db, 'events_type_check')) === 1 && same(await probes(), events), `${tag}2: and the constraint on events.type and every event`);
  await check021(db, `${tag}2`);
  // This check's own rows go; a realtor who is deleted leaves no connection behind.
  await db.query('DELETE FROM public.brokerage_members WHERE profile_id = ANY($1)', [Object.values(CIR)]);
  await db.query('DELETE FROM public.brokerages WHERE id = ANY($1)', [[b1, b2]]);
  if (!hadEvents) { await db.query('DROP TABLE public.events'); check(!(await hasTable(db, 'events')), `${tag}2: the verifier's own events table is gone again`); }
  else await db.query(`DELETE FROM public.events WHERE ${probe}`);
  await db.query('DELETE FROM public.profiles WHERE id = ANY($1)', [Object.values(CIR)]);
  check((await one(db, 'SELECT count(*)::int FROM public.circle_connections WHERE requester_id = ANY($1) OR addressee_id = ANY($1)', [Object.values(CIR)])) === 0, `${tag}2: removing a realtor removes their connections`);
  check(same(stripCircle(await rows(db, 'SELECT * FROM public.profiles ORDER BY id')), before), `${tag}2: this check's own realtors removed, every profile is what it was`);
}

// ── db/022-full-tenant-profile.sql ─────────────────────────────────────────────────────────
// Six nullable columns on tenant_profiles (the tenant's own words, their offer to prepay rent,
// the landlord report switch, the photo's path, type and date), three checks, and the view
// tenant_profile_personal. Run, exercised with a profile of the verifier's own, then run again.
const PP = 'eeeeeeee-0000-4000-8000-0000000000c1'; const PP2 = 'eeeeeeee-0000-4000-8000-0000000000c2';
const PERSONAL_COLUMNS = [['about_me', 'text'], ['prepay_months', 'smallint'], ['landlord_report_ok', 'boolean'], ['photo_path', 'text'], ['photo_mime', 'text'], ['photo_added_at', 'timestamp with time zone']];
const PERSONAL_CONSTRAINTS = ['tenant_profiles_about_me_length', 'tenant_profiles_prepay_months_range', 'tenant_profiles_photo_whole'];
const stripPersonal = (list) => list.map((r) => { const o = { ...r }; for (const [c] of PERSONAL_COLUMNS) delete o[c]; return o; });
const personalViewDef = (db) => one(db, "SELECT pg_get_viewdef('public.tenant_profile_personal'::regclass)");
async function check022(db, label) {
  for (const [c, type] of PERSONAL_COLUMNS) {
    const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profiles' AND column_name = $1", [c]))[0];
    check(col && col.data_type === type && col.is_nullable === 'YES' && col.column_default === null, `${label}: tenant_profiles.${c} is nullable ${type} with no default`, JSON.stringify(col));
  }
  for (const name of PERSONAL_CONSTRAINTS) check((await constraintCount(db, name)) === 1, `${label}: the constraint ${name} exists once`);
  const cols = (await rows(db, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profile_personal' ORDER BY ordinal_position")).map((r) => r.column_name);
  check(same(cols, ['id', ...PERSONAL_COLUMNS.map(([c]) => c)]), `${label}: the view holds the id and the six columns, and nothing else of the profile`, cols.join(','));
  check(/security_invoker=true/.test(String(await one(db, "SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.tenant_profile_personal'::regclass"))), `${label}: the view reads as its caller (security_invoker)`);
  for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, 'public.tenant_profile_personal', priv])) === false, `${label}: ${role} holds no ${priv} on the view`);
  const as = async (role, fn) => { await db.exec(`SET ROLE ${role}`); try { return await fn(); } finally { await db.exec('RESET ROLE'); } };
  for (const role of ['anon', 'authenticated']) check(/permission denied/.test(await as(role, () => refused(db, 'SELECT * FROM public.tenant_profile_personal')) || ''), `${label}: ${role} cannot read the view`);
  check((await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_profiles'")) === 0, `${label}: no policy opens tenant_profiles`);
  for (const c of ['facts', 'applications', 'email']) check(/does not exist/.test(await refused(db, `SELECT ${c} FROM public.tenant_profile_personal`) || ''), `${label}: the view has no ${c} column to ask for`);
}
async function run022(db, tag) {
  const before = await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id');
  const shareable = await one(db, "SELECT pg_get_viewdef('public.tenant_profile_shareable'::regclass)");
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'personal@mail.ca', 'pp1', '{\"fullName\":\"Probe Tenant\"}'::jsonb), ($2, 'personal2@mail.ca', 'pp2', '{}'::jsonb)", [PP, PP2]);
  const withMine = await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id');
  await step(db, `${tag}1`, FILES.m022);
  check(same(stripPersonal(await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id')), withMine), `${tag}1: no other column of any tenant profile moved`);
  check((await one(db, 'SELECT count(*)::int FROM public.tenant_profiles WHERE about_me IS NOT NULL OR prepay_months IS NOT NULL OR landlord_report_ok IS NOT NULL OR photo_path IS NOT NULL OR photo_mime IS NOT NULL OR photo_added_at IS NOT NULL')) === 0, `${tag}1: every existing profile reads null in the six new columns`);
  check((await one(db, "SELECT pg_get_viewdef('public.tenant_profile_shareable'::regclass)")) === shareable, `${tag}1: the view of shareable facts is exactly what it was`);
  await check022(db, `${tag}1`);
  // The tenant's own words: 1 to 600 characters, counted as characters.
  const set = (sql, params) => refused(db, `UPDATE public.tenant_profiles SET ${sql} WHERE id = $1`, [PP, ...(params || [])]);
  check(/tenant_profiles_about_me_length/.test(await set('about_me = $2', ['x'.repeat(601)]) || ''), `${tag}1: 601 characters are refused`);
  check(/tenant_profiles_about_me_length/.test(await set("about_me = ''") || ''), `${tag}1: an empty note is refused: none is null`);
  check((await set('about_me = $2', ['é'.repeat(600)])) == null, `${tag}1: 600 characters are kept, counted as characters`);
  // The offer: 1 to 12 months, or none.
  for (const bad of [0, 13, -1]) check(/tenant_profiles_prepay_months_range/.test(await set('prepay_months = $2', [bad]) || ''), `${tag}1: an offer of ${bad} months is refused`);
  for (const ok of [1, 12]) check((await set('prepay_months = $2', [ok])) == null, `${tag}1: an offer of ${ok} is kept`);
  // The photo: its path, type and date together, under the profile's own id, JPEG or PNG.
  check(/tenant_profiles_photo_whole/.test(await set("photo_path = $2", [`${PP}/photo-1.jpg`]) || ''), `${tag}1: a path without its type and date is refused`);
  check(/tenant_profiles_photo_whole/.test(await set("photo_path = $2, photo_mime = 'image/gif', photo_added_at = now()", [`${PP}/photo-1.gif`]) || ''), `${tag}1: a type that is not JPEG or PNG is refused`);
  check(/tenant_profiles_photo_whole/.test(await set("photo_path = $2, photo_mime = 'image/jpeg', photo_added_at = now()", [`${PP2}/photo-1.jpg`]) || ''), `${tag}1: a path under another profile's id is refused`);
  check(/tenant_profiles_photo_whole/.test(await set("photo_path = 'maya@mail.ca/selfie.jpg', photo_mime = 'image/jpeg', photo_added_at = now()") || ''), `${tag}1: a path that is not the profile's own photo path is refused`);
  check((await set("photo_path = $2, photo_mime = 'image/jpeg', photo_added_at = now(), landlord_report_ok = false", [`${PP}/photo-1.jpg`])) == null, `${tag}1: a whole photo under the profile's own id is kept`);
  const seen = (await rows(db, 'SELECT * FROM public.tenant_profile_personal WHERE id = $1', [PP]))[0];
  check(seen.prepay_months === 12 && seen.landlord_report_ok === false && seen.photo_path === `${PP}/photo-1.jpg` && [...seen.about_me].length === 600, `${tag}1: through the view the realtor's reader sees what the tenant chose, and the switch`, JSON.stringify({ ...seen, about_me: '…' }));
  check((await one(db, 'SELECT count(*)::int FROM public.tenant_profile_personal WHERE id = $1 AND about_me IS NULL AND prepay_months IS NULL AND photo_path IS NULL', [PP2])) === 1, `${tag}1: a profile that added nothing reads null in all of them`);
  check((await set('photo_path = NULL, photo_mime = NULL, photo_added_at = NULL')) == null && (await one(db, 'SELECT photo_path IS NULL FROM public.tenant_profiles WHERE id = $1', [PP])) === true, `${tag}1: a removed photo leaves nothing behind`);
  await db.query("UPDATE public.tenant_profiles SET photo_path = $2, photo_mime = 'image/png', photo_added_at = now() WHERE id = $1", [PP, `${PP}/photo-2.png`]);
  // Again: nothing changes.
  const shape = await profileCatalog(db); const constraints = await profileConstraints(db); const def = await personalViewDef(db);
  const held = await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id');
  await step(db, `${tag}2 (022 again)`, FILES.m022);
  check(same(await profileCatalog(db), shape), `${tag}2: a second run leaves every column of tenant_profiles and its views, its type, NOT NULL and default as they were`);
  check(same(await profileConstraints(db), constraints) && (await personalViewDef(db)) === def && (await one(db, "SELECT pg_get_viewdef('public.tenant_profile_shareable'::regclass)")) === shareable, `${tag}2: and every constraint and both views`);
  check(same(await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id'), held), `${tag}2: and every row: the words, the offer and the photo written before it are still there`);
  await check022(db, `${tag}2`);
  await dropProfiles(db, [PP, PP2]);
  check(same(stripPersonal(await rows(db, 'SELECT * FROM public.tenant_profiles ORDER BY id')), before), `${tag}2: this check's own profiles removed, every tenant profile is what it was`);
}

// ── db/023-photo-log-actions.sql ───────────────────────────────────────────────────────────
// profile_access_log.action gains photo_added and photo_removed. Run on the log as db/018 made
// it, with a line of an old action in it: the two are refused before and accepted after, an
// action off the list is still refused, the old line does not move; and again (nothing changes).
const actionList = (sql) => [...sql.split('CHECK (action IN (')[1].split('))')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const logActionConstraints = (db) => rows(db, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.profile_access_log'::regclass ORDER BY conname");
const PL = 'eeeeeeee-0000-4000-8000-0000000000d1';
async function run023(db, tag) {
  const oldActions = actionList(read(FILES.m018)); const newActions = actionList(read(FILES.m023));
  check(same(newActions, [...oldActions, 'photo_added', 'photo_removed']), `${tag}: db/023 lists every action db/018 listed, in order, and the two new ones`);
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'photolog@mail.ca', 'pl1', '{}'::jsonb)", [PL]);
  const add = (action) => refused(db, "INSERT INTO public.profile_access_log (tenant_profile_id, actor_type, action) VALUES ($1, 'tenant', $2)", [PL, action]);
  const lines = () => rows(db, 'SELECT * FROM public.profile_access_log ORDER BY id');
  check((await add('document_added')) == null, `${tag}0: a line of an old action is written`);
  for (const a of ['photo_added', 'photo_removed']) check(/action/.test(await add(a) || ''), `${tag}0: before the file, ${a} is refused`);
  const kept = await lines(); const before = await logActionConstraints(db);
  const policies = await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_access_log'");
  await step(db, `${tag}1`, FILES.m023);
  const after = await logActionConstraints(db);
  check(after.length === before.length, `${tag}1: the log has as many constraints as before: one was rewritten, none added`, `${before.length} -> ${after.length}`);
  check(after.filter((c) => /photo_removed/.test(c.def)).length === 1 && newActions.every((a) => after.some((c) => c.def.includes(`'${a}'`))), `${tag}1: one constraint accepts every action it accepted and the two new ones`);
  check(same(after.filter((c) => !/photo_removed/.test(c.def)), before.filter((c) => !/profile_exported/.test(c.def))), `${tag}1: every other constraint on the log is exactly what it was`);
  check(same(await lines(), kept), `${tag}1: the line written before the file did not move`);
  for (const a of ['photo_added', 'photo_removed']) check((await add(a)) == null, `${tag}1: ${a} is written`);
  check(/action/.test(await add('photo_viewed') || ''), `${tag}1: an action off the list is still refused`);
  check((await one(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profile_access_log'::regclass")) === true && (await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_access_log'")) === policies && policies === 0, `${tag}1: row level security is still on, with no policy`);
  for (const role of ['anon', 'authenticated']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, 'public.profile_access_log', 'SELECT'])) === false, `${tag}1: ${role} still holds nothing on the log`);
  const held = await lines();
  await step(db, `${tag}2 (023 again)`, FILES.m023);
  check(same(await logActionConstraints(db), after), `${tag}2: a second run leaves every constraint exactly as it was`);
  check(same(await lines(), held), `${tag}2: and every line`);
  await dropProfiles(db, [PL]);
  check((await one(db, 'SELECT count(*)::int FROM public.profile_access_log WHERE tenant_profile_id = $1', [PL])) === 0, `${tag}2: this check's own profile and its lines are gone`);
}

// ── db/024-share-roles.sql ─────────────────────────────────────────────────────────────────
// profile_shares gains a nullable role (realtor, listing_agent; null reads as realtor), and the
// table profile_share_invites is made. Run with a share from before the file in place, then
// again: that share keeps every value and reads no role, both roles are accepted and no other,
// a tenant holds a share with their realtor and one with a listing agent for the same listing,
// and the invites table is closed to the browser.
const SR = 'eeeeeeee-0000-4000-8000-0000000000e1';
const roleConstraints = (db) => rows(db, "SELECT c.relname AS t, k.conname, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid WHERE c.relname IN ('profile_shares', 'profile_share_invites') ORDER BY 1, 2");
const roleIndexes = (db) => rows(db, "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('profile_shares', 'profile_share_invites') ORDER BY 1, 2");
const roleCatalog = (db) => rows(db, "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('profile_shares', 'profile_share_invites') ORDER BY table_name, ordinal_position");
async function run024(db, tag) {
  const realtors = (await rows(db, 'SELECT id FROM public.profiles ORDER BY id LIMIT 2')).map((r) => r.id);
  const listing = await one(db, 'SELECT id FROM public.listings ORDER BY id LIMIT 1');
  await db.query("INSERT INTO public.tenant_profiles (id, email, email_key, facts) VALUES ($1, 'roles@mail.ca', 'sr1', '{}'::jsonb)", [SR]);
  const old = await one(db, "INSERT INTO public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, listing_id, status, approved_at, approved_via) VALUES ($1, $2, 'application', $3, 'approved', '2026-11-19T15:00:00Z', 'session') RETURNING id", [SR, realtors[0], listing]);
  const before = await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id');
  const triggers = await rows(db, "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profile_shares'::regclass AND NOT tgisinternal ORDER BY 1");
  await step(db, `${tag}1`, FILES.m024);
  const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profile_shares' AND column_name = 'role'"))[0];
  check(col && col.data_type === 'text' && col.is_nullable === 'YES' && col.column_default === null, `${tag}1: profile_shares.role is nullable text with no default`, JSON.stringify(col));
  check(same((await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id')).map(({ role, ...r }) => r), before) && (await one(db, 'SELECT count(*)::int FROM public.profile_shares WHERE role IS NOT NULL')) === 0, `${tag}1: every share made before the file keeps every value and has no role, so it reads as the tenant's realtor`);
  check(same(await rows(db, "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profile_shares'::regclass AND NOT tgisinternal ORDER BY 1"), triggers), `${tag}1: the trigger that keeps a share's tenant and recipient is untouched`);
  check((await constraintCount(db, 'profile_shares_role_known')) === 1, `${tag}1: the role check exists once`);
  check(/profile_shares_role_known/.test(await refused(db, "UPDATE public.profile_shares SET role = 'landlord' WHERE id = $1", [old]) || ''), `${tag}1: a role off the list is refused`);
  check((await refused(db, "UPDATE public.profile_shares SET role = 'realtor' WHERE id = $1", [old])) == null, `${tag}1: realtor is kept`);
  // Both at once for the same listing: another recipient, as listing agent.
  const agent = await one(db, "INSERT INTO public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, listing_id, role, status, approved_at, approved_via) VALUES ($1, $2, 'application', $3, 'listing_agent', 'approved', now(), 'session') RETURNING id", [SR, realtors[1], listing]);
  check(!!agent && (await one(db, "SELECT count(*)::int FROM public.profile_shares WHERE tenant_profile_id = $1 AND listing_id = $2 AND status = 'approved'", [SR, listing])) === 2, `${tag}1: a tenant holds a share with their realtor and one with a listing agent for the same listing`);
  check(/profile_shares_one_live_idx/.test(await refused(db, "INSERT INTO public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, listing_id, role, status, approved_at, approved_via) VALUES ($1, $2, 'application', $3, 'listing_agent', 'approved', now(), 'session')", [SR, realtors[1], listing]) || ''), `${tag}1: and still one live share per tenant, realtor and listing`);
  check(/never change/.test(await refused(db, 'UPDATE public.profile_shares SET recipient_profile_id = $2 WHERE id = $1', [agent, realtors[0]]) || ''), `${tag}1: a listing agent's share cannot be pointed at another realtor`);
  // The invites: closed to the browser, a lower case address, one live invite per tenant, listing and address.
  check(await hasTable(db, 'profile_share_invites'), `${tag}1: the table profile_share_invites exists`);
  check((await one(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profile_share_invites'::regclass")) === true && (await one(db, "SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profile_share_invites'")) === 0, `${tag}1: row level security is on for it, with no policy`);
  for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) check((await one(db, 'SELECT has_table_privilege($1, $2, $3)', [role, 'public.profile_share_invites', priv])) === false, `${tag}1: ${role} holds no ${priv} on it`);
  const invite = (email, status = 'sent') => refused(db, 'INSERT INTO public.profile_share_invites (tenant_profile_id, listing_id, email, status) VALUES ($1, $2, $3, $4)', [SR, listing, email, status]);
  check((await invite('agent@lakeshore.ca')) == null, `${tag}1: an invite is written`);
  check(/profile_share_invites_one_live_idx/.test(await invite('agent@lakeshore.ca') || ''), `${tag}1: one live invite per tenant, listing and address`);
  check(/email/.test(await invite('Agent@Lakeshore.ca') || ''), `${tag}1: the address is stored in lower case`);
  check(/status/.test(await invite('b@lakeshore.ca', 'approved') || ''), `${tag}1: an invite has no status that shares anything`);
  check((await one(db, "SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profile_share_invites' AND column_name ~ '(recipient|share|scope|facts|token)'")) === 0, `${tag}1: an invite names no recipient and holds no share, scope, fact or token`);
  // Again: nothing changes.
  const shape = await roleCatalog(db); const constraints = await roleConstraints(db); const indexes = await roleIndexes(db);
  const held = await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id'); const invites = await rows(db, 'SELECT * FROM public.profile_share_invites ORDER BY id');
  await step(db, `${tag}2 (024 again)`, FILES.m024);
  check(same(await roleCatalog(db), shape) && same(await roleConstraints(db), constraints) && same(await roleIndexes(db), indexes), `${tag}2: a second run leaves every column, constraint and index of both tables as they were`);
  check(same(await rows(db, 'SELECT * FROM public.profile_shares ORDER BY id'), held) && same(await rows(db, 'SELECT * FROM public.profile_share_invites ORDER BY id'), invites), `${tag}2: and every share and every invite`);
  await dropProfiles(db, [SR]);
  check((await one(db, 'SELECT count(*)::int FROM public.profile_shares WHERE tenant_profile_id = $1', [SR])) === 0 && (await one(db, 'SELECT count(*)::int FROM public.profile_share_invites WHERE tenant_profile_id = $1', [SR])) === 0, `${tag}2: removing the profile removes its shares and its invites`);
}

// ── db/005 and db/state-parity-check.sql against lib/application-state.js ──────────────
// The parity file is one read only statement; its rows are what it lists.
const parityRows = async (db) => rows(db, statements(read(FILES.parity))[0].text);
const applicantRows = (db) => rows(db, "SELECT la.id, la.listing_id, la.state::text AS state, la.decision_status, la.decision_priority, la.withdrawn_at::text AS withdrawn_at, l.status, l.rented_link_id FROM public.listing_applicants la JOIN public.listings l ON l.id = la.listing_id");
const verdictOf = (r) => S.applicantDisagreement(r, { status: r.status, rented_link_id: r.rented_link_id });
const targetOf = (r) => S.resyncTarget(r, { status: r.status, rented_link_id: r.rented_link_id });
const stillDisagree = async (db) => (await rows(db, statements(read(FILES.m005)).at(-1).text))[0];

// Every state, with every old column combination, in every place a row can be: on a live
// listing, on a closed one, the winner of a rented listing, and someone else on a rented listing.
async function seedCombinations(db) {
  const hex = (n) => n.toString(16).padStart(4, '0');
  const combos = [];
  for (const state of S.APPLICATION_STATES) for (const status of Object.values(S.DECISION_STATUS)) for (const priority of Object.values(S.DECISION_PRIORITY)) for (const withdrawn of [false, true]) combos.push({ state, status, priority, withdrawn });
  const appId = (k) => `eeeeeee1-0000-4000-8000-00000000${hex(k)}`;
  const listingId = (k) => `fffffff1-0000-4000-8000-00000000${hex(k)}`;
  const linkId = (role, k) => `${role}${role}${role}${role}${role}${role}${role}1-0000-4000-8000-00000000${hex(k)}`;
  const values = (list) => list.map((r) => `(${r.map((v) => (v == null ? 'NULL' : `'${v}'`)).join(', ')})`).join(',\n');
  await db.exec(`INSERT INTO public.applications (id, application_number, full_name) VALUES\n${values(combos.map((c, k) => [appId(k), `RL-COMBO-${k}`, `Combination ${k}`]))}`);
  const shared = { live: listingId(9000), closed: listingId(9001) };
  await db.exec(`INSERT INTO public.listings (id, profile_id, name, monthly_rent, status, state) VALUES ('${shared.live}', '${ID.me}', 'All combinations, live', 2000, 'active', 'live'), ('${shared.closed}', '${ID.me}', 'All combinations, closed', 2000, 'closed', 'withdrawn')`);
  await db.exec(`INSERT INTO public.listings (id, profile_id, name, monthly_rent, status, state) VALUES\n${values(combos.map((c, k) => [listingId(k), ID.me, `Rented ${k}`, 2000, 'rented', 'rented']))}`);
  const link = (id, listing, k, c) => [id, listing, appId(k), c.status, c.priority, c.withdrawn ? '2026-09-10T00:00:00Z' : null, c.state];
  const all = [];
  combos.forEach((c, k) => { all.push(link(linkId('1', k), shared.live, k, c), link(linkId('2', k), shared.closed, k, c), link(linkId('3', k), listingId(k), k, c), link(linkId('4', k), listingId(k), (k + 1) % combos.length, c)); });
  await db.exec(`INSERT INTO public.listing_applicants (id, listing_id, application_id, decision_status, decision_priority, withdrawn_at, state) VALUES\n${values(all)}`);
  for (let k = 0; k < combos.length; k++) await db.query('UPDATE public.listings SET rented_link_id = $1 WHERE id = $2', [linkId('3', k), listingId(k)]);
  // Listings: every state against every status.
  const ls = []; let n = 9100;
  for (const state of S.LISTING_STATES) for (const status of S.LEGACY_LISTING_STATUSES) ls.push([listingId(n++), ID.me, `Listing ${state} ${status}`, 2000, status, state]);
  await db.exec(`INSERT INTO public.listings (id, profile_id, name, monthly_rent, status, state) VALUES\n${values(ls)}`);
  return { applicants: all.length, listings: ls.length };
}

async function checkResync(db, label) {
  const before = await applicantRows(db);
  const events0 = await one(db, 'SELECT count(*)::int FROM public.application_events');
  // 1. The parity file lists exactly the rows the module says disagree, with the same reason and the same expected state.
  const listed = await parityRows(db);
  const wantApplicants = before.filter((r) => verdictOf(r)).map((r) => `${r.id}|${verdictOf(r)}|${S.applicationStateOf({ ...r, state: null }, r)}`).sort();
  const gotApplicants = listed.filter((r) => r.kind === 'applicant').map((r) => `${r.id}|${r.disagreement}|${r.expected}`).sort();
  check(same(gotApplicants, wantApplicants), `${label}: db/state-parity-check.sql lists the ${wantApplicants.length} applicants lib/application-state.js says disagree, of ${before.length}, reason and expected state included`, `${gotApplicants.length} listed`);
  const listingsBefore = await rows(db, 'SELECT id, status, state::text AS state FROM public.listings');
  const wantListings = listingsBefore.filter((l) => S.listingDisagreement(l)).map((l) => `${l.id}|${S.listingDisagreement(l)}`).sort();
  check(same(listed.filter((r) => r.kind === 'listing').map((r) => `${r.id}|${r.disagreement}`).sort(), wantListings), `${label}: and the ${wantListings.length} listings, of ${listingsBefore.length}`);
  // 2. The resync sets exactly those rows, to exactly what the module names, and no row in reconsidered.
  await step(db, `${label} 005`, FILES.m005);
  const after = Object.fromEntries((await applicantRows(db)).map((r) => [r.id, r]));
  const wrong = before.filter((r) => after[r.id].state !== (targetOf(r) || r.state));
  check(wrong.length === 0, `${label}: every row reads what resyncTarget names, and every other row is untouched`, wrong.slice(0, 3).map((r) => `${r.id} ${r.state} to ${after[r.id].state}, wanted ${targetOf(r) || r.state}`).join('; '));
  const changed = before.filter((r) => targetOf(r));
  check(before.filter((r) => r.state === 'reconsidered').every((r) => after[r.id].state === 'reconsidered'), `${label}: no row in reconsidered was touched (${before.filter((r) => r.state === 'reconsidered').length} of them)`);
  const audit = await rows(db, "SELECT listing_applicant_id AS id, from_state::text AS f, to_state::text AS t, actor, actor_type::text AS actor_type FROM public.application_events WHERE reason = 'resync'");
  check(audit.length === changed.length && same(audit.map((a) => `${a.id}|${a.f}|${a.t}|${a.actor}|${a.actor_type}`).sort(), changed.map((r) => `${r.id}|${r.state}|${targetOf(r)}|resync|system`).sort()), `${label}: one application_events row per changed row (${changed.length}), actor system, reason resync, from and to right`);
  check((await one(db, 'SELECT count(*)::int FROM public.application_events')) === events0 + changed.length, `${label}: and no audit row for anything else`);
  check(same(before.map((r) => [r.id, r.decision_status, r.decision_priority, r.withdrawn_at]).sort(), Object.values(after).map((r) => [r.id, r.decision_status, r.decision_priority, r.withdrawn_at]).sort()), `${label}: no old column was changed`);
  check((await rows(db, 'SELECT id, status, state::text AS state FROM public.listings')).every((l) => !S.listingDisagreement(l)), `${label}: every listing agrees, and draft and paused were left alone`);
  // 3. What is left, and the second run.
  const left = await parityRows(db);
  check(left.every((r) => r.kind === 'applicant' && r.state === 'reconsidered'), `${label}: what the parity check still lists is in reconsidered, and nothing else (${left.length})`);
  const tail = await stillDisagree(db);
  check(Number(tail.still_disagree) === 0 && Number(tail.reconsidered_left_alone) === left.length && Number(tail.resync_audit_rows) === changed.length, `${label}: db/005 ends on still_disagree 0`, JSON.stringify(tail));
  await step(db, `${label} 005 again`, FILES.m005);
  check((await one(db, 'SELECT count(*)::int FROM public.application_events')) === events0 + changed.length && same(Object.values(after).map((r) => [r.id, r.state]).sort(), (await applicantRows(db)).map((r) => [r.id, r.state]).sort()), `${label}: 005 again changes no row and adds no audit row`);
  return changed.length;
}

// ── the paths ───────────────────────────────────────────────────────────────────────
async function pathA() {
  say('\nPATH A  fresh setup');
  const db = new PGlite();
  await baseline(db); const before = await legacySnapshot(db);
  await step(db, 'A1', FILES.m001);
  await step(db, 'A2', FILES.m002);
  await step(db, 'A3', FILES.m003); await checkBackfill(db);
  await step(db, 'A4', FILES.m004);
  await step(db, 'A5 (004 again)', FILES.m004);
  await step(db, 'A6 (001 again)', FILES.m001);
  await checkEnd(db); await checkRules(db);
  check(same(await legacySnapshot(db), before), 'status, closed_at, rented_link_id, the decision columns, withdrawn_at and the document row are what they were before 001');
  // Not asked for, and cheap: the other two files are safe to run twice as well.
  await step(db, 'A7 (002 again)', FILES.m002);
  await step(db, 'A8 (003 again)', FILES.m003);
  check((await one(db, "SELECT count(*)::int FROM public.application_events WHERE reason = 'backfill'")) === LINKS.length, '003 again adds no second starting row'); await checkEnd(db);
  // db/005: on the backfilled rows alone there is nothing to do, then on every combination.
  check((await parityRows(db)).length === 0, 'after the backfill the parity check lists nothing');
  const seeded = await seedCombinations(db);
  say(`  seeded: ${seeded.applicants} applicants (15 states, 3 decision_status, 2 decision_priority, withdrawn or not, 4 places) and ${seeded.listings} listings (5 states, 3 status)`);
  await checkResync(db, 'A9');
  await run006And007(db, 'A1');
  await runCredit(db, 'A2');
  await runParties(db, 'A3');
  await run009(db, 'A4');
  await run010(db, 'A5');
  await run011(db, 'A6');
  await run012(db, 'A7');
  await run013(db, 'A8');
  await run014(db, 'A10');
  await run015(db, 'A11');
  await run016(db, 'A12');
  await run017(db, 'A13');
  await run018(db, 'A14');
  await run019(db, 'A15');
  await run020(db, 'A16');
  await run021(db, 'A17');
  await run022(db, 'A18');
  await run023(db, 'A19');
  await run024(db, 'A20');
  await db.close();
}

// ── db/016-drop-application-defaults.sql ────────────────────────────────────────────────────
// The baseline has none of the three columns: the file runs first with nothing to do. Then the
// columns are added as production has them (a default of '1', 'no' and '[]'), a row is written
// that relies on those defaults, and the file runs twice. The defaults go, no row changes, no
// type, NOT NULL, constraint or index moves, and a row written afterwards without the columns
// reads null in all three.
const DEFAULT_COLUMNS = ['number_of_occupants', 'smoker', 'references'];
const defaultsOf = async (db) => Object.fromEntries((await rows(db, "SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = ANY($1)", [DEFAULT_COLUMNS])).map((r) => [r.column_name, r.column_default]));
async function run016(db, tag) {
  const noDefault = (list) => list.map((r) => (DEFAULT_COLUMNS.includes(r.attname) ? { ...r, def: null } : r));
  const shape0 = await applicationsCatalog(db); const rows0 = await rows(db, 'SELECT * FROM public.applications ORDER BY id');
  await step(db, `${tag}0 (016 before the columns exist)`, FILES.m016);
  check(same(await applicationsCatalog(db), shape0) && same(await rows(db, 'SELECT * FROM public.applications ORDER BY id'), rows0), `${tag}0: with none of the three columns there, nothing changes`);
  await db.exec(`ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS number_of_occupants text DEFAULT '1'; ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS smoker text DEFAULT 'no'; ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS "references" jsonb DEFAULT '[]'::jsonb;`);
  const OLD = 'ffffffff-0000-4000-8000-000000000016';
  await db.query("INSERT INTO public.applications (id, application_number, full_name) VALUES ($1, 'RL-2026-016A-016A', 'Written on the defaults')", [OLD]);
  const had = await defaultsOf(db);
  check(DEFAULT_COLUMNS.every((c) => had[c] != null), `${tag}: before 016 the three columns carry a default`, JSON.stringify(had));
  const shape = await applicationsCatalog(db); const constraints = await applicationsConstraints(db); const indexes = await applicationsIndexes(db);
  const before = await rows(db, 'SELECT * FROM public.applications ORDER BY id');
  await step(db, `${tag}1`, FILES.m016);
  const after = await defaultsOf(db);
  check(DEFAULT_COLUMNS.every((c) => c in after && after[c] === null), `${tag}1: number_of_occupants, smoker and references have no default`, JSON.stringify(after));
  check(same(await applicationsCatalog(db), noDefault(shape)), `${tag}1: every column, type and NOT NULL of applications is as it was, and no other default moved`);
  check(same(await applicationsConstraints(db), constraints) && same(await applicationsIndexes(db), indexes), `${tag}1: every constraint and index is as it was`);
  check(same(await rows(db, 'SELECT * FROM public.applications ORDER BY id'), before), `${tag}1: no row of applications changed`);
  const kept = (await rows(db, 'SELECT number_of_occupants, smoker, "references" FROM public.applications WHERE id = $1', [OLD]))[0];
  check(kept.number_of_occupants === '1' && kept.smoker === 'no' && Array.isArray(kept.references) && kept.references.length === 0, `${tag}1: a row written on the defaults keeps what it stored`, JSON.stringify(kept));
  const shape1 = await applicationsCatalog(db);
  await step(db, `${tag}2 (016 again)`, FILES.m016);
  check(same(await applicationsCatalog(db), shape1) && same(await applicationsConstraints(db), constraints) && same(await applicationsIndexes(db), indexes), `${tag}2: a second run leaves every column, constraint and index as they were`);
  check(same(await rows(db, 'SELECT * FROM public.applications ORDER BY id'), before), `${tag}2: and every row`);
  const NEW = 'ffffffff-0000-4000-8000-000000000017';
  await db.query("INSERT INTO public.applications (id, application_number, full_name) VALUES ($1, 'RL-2026-016B-016B', 'Written after')", [NEW]);
  const fresh = (await rows(db, 'SELECT number_of_occupants, smoker, "references" FROM public.applications WHERE id = $1', [NEW]))[0];
  check(fresh.number_of_occupants === null && fresh.smoker === null && fresh.references === null, `${tag}2: a row written without the three columns reads null in each, never a household of one, a non smoker or no references`, JSON.stringify(fresh));
  await db.query('DELETE FROM public.applications WHERE id = ANY($1)', [[OLD, NEW]]);
}

// ── db/017-realtor-invites.sql ──────────────────────────────────────────────────────────────
// profiles gains invite_code (text) and invited_by (uuid), both nullable with no default, and
// every existing profile reads null in both. The code is checked and unique, a profile can never
// be its own inviter, and the inviter must exist. From the browser role both columns keep the
// value they had while the rest of the same update goes through; from any role a code or a credit
// that is set stays what it is, and the credit empties only when the inviting profile is deleted.
// Row level security is as it was: a realtor reads their own code and no other profile's row.
// A second run changes no column, constraint, index, trigger, policy or row.
const INV = { a: 'ffffffff-0000-4000-8000-0000000017a1', b: 'ffffffff-0000-4000-8000-0000000017b2', c: 'ffffffff-0000-4000-8000-0000000017c3', gone: 'ffffffff-0000-4000-8000-0000000017d4' };
const CODE = { a: 'K7M2Q9XW4TPB3HNC', b: 'B7M2Q9XW4TPB3HNC', other: 'Z7M2Q9XW4TPB3HNZ' };
const INVITE_CONSTRAINTS = ['profiles_invite_code_check', 'profiles_invited_by_fkey', 'profiles_not_invited_by_self'];
const profilesCatalog = (db) => rows(db, "SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum");
const profilesConstraints = (db) => rows(db, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass ORDER BY conname");
const profilesIndexes = (db) => rows(db, "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' ORDER BY indexname");
const profilesTriggers = (db) => rows(db, "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal ORDER BY 1");
const profilesPolicies = (db) => rows(db, "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' ORDER BY policyname");
const inviteOf = async (db, id) => (await rows(db, 'SELECT invite_code, invited_by, full_name FROM public.profiles WHERE id = $1', [id]))[0];
const asRealtor = async (db, id, fn) => { await db.exec(`SET request.jwt.claim.sub = '${id}'; SET ROLE authenticated`); try { return await fn(); } finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub'); } };
async function check017(db, label) {
  for (const [c, type] of [['invite_code', 'text'], ['invited_by', 'uuid']]) {
    const col = (await rows(db, "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = $1", [c]))[0];
    check(col && col.data_type === type && col.is_nullable === 'YES' && col.column_default === null, `${label}: profiles.${c} is nullable ${type} with no default`, JSON.stringify(col));
  }
  for (const name of INVITE_CONSTRAINTS) check((await constraintCount(db, name)) === 1, `${label}: the constraint ${name} exists once`);
  check((await one(db, "SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'profiles_keep_invite'")) === 1, `${label}: the keep trigger exists once`);
  check((await one(db, "SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' AND indexname IN ('profiles_invite_code_key', 'profiles_invited_by_idx')")) === 2, `${label}: the unique code index and the invited_by index exist`);
  // Three realtors of this check's own: a invites b, c is nobody's.
  await db.query("INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'inviter@example.com', 'Inviter'), ($2, 'invited@example.com', 'Invited'), ($3, 'third@example.com', 'Third')", [INV.a, INV.b, INV.c]);
  // The code: checked, unique, and once set it stays.
  for (const bad of ['short', 'k7m2q9xw4tpb3hnc', 'K7M2Q9XW4TPB3HN0', 'K7M2Q9XW4TPB3HNCX', INV.a, 'inviter@example.com', '']) check(/profiles_invite_code_check/.test(await refused(db, 'UPDATE public.profiles SET invite_code = $2 WHERE id = $1', [INV.a, bad])), `${label}: the code "${bad}" is refused`);
  await db.query('UPDATE public.profiles SET invite_code = $2 WHERE id = $1', [INV.a, CODE.a]);
  check(/profiles_invite_code_key/.test(await refused(db, 'UPDATE public.profiles SET invite_code = $2 WHERE id = $1', [INV.b, CODE.a])), `${label}: a code another profile holds is refused`);
  await db.query('UPDATE public.profiles SET invite_code = $2 WHERE id = $1', [INV.b, CODE.b]);
  await db.query('UPDATE public.profiles SET invite_code = $2 WHERE id = $1', [INV.a, CODE.other]);
  await db.query('UPDATE public.profiles SET invite_code = NULL WHERE id = $1', [INV.a]);
  check((await inviteOf(db, INV.a)).invite_code === CODE.a, `${label}: a code that is set never changes, even from the server`);
  // The credit: never the profile itself, never a profile that is not there, and once set it stays.
  check(/profiles_not_invited_by_self/.test(await refused(db, 'UPDATE public.profiles SET invited_by = id WHERE id = $1', [INV.c])), `${label}: a realtor can never be invited by themselves`);
  check(/profiles_invited_by_fkey/.test(await refused(db, 'UPDATE public.profiles SET invited_by = $2 WHERE id = $1', [INV.c, INV.gone])), `${label}: the inviter must be a profile`);
  await db.query('UPDATE public.profiles SET invited_by = $2 WHERE id = $1', [INV.b, INV.a]);
  await db.query('UPDATE public.profiles SET invited_by = $2 WHERE id = $1', [INV.b, INV.c]);
  await db.query('UPDATE public.profiles SET invited_by = NULL WHERE id = $1', [INV.b]);
  check((await inviteOf(db, INV.b)).invited_by === INV.a, `${label}: a credit that is set never changes, even from the server`);
  // From the browser role: the realtor's own update goes through, and neither column moves.
  await asRealtor(db, INV.b, () => db.query("UPDATE public.profiles SET invite_code = $2, invited_by = $3, full_name = 'Renamed' WHERE id = $1", [INV.b, CODE.other, INV.c]));
  let kept = await inviteOf(db, INV.b);
  check(kept.invite_code === CODE.b && kept.invited_by === INV.a && kept.full_name === 'Renamed', `${label}: from the browser role the name changes, the code and the credit do not`, JSON.stringify(kept));
  await asRealtor(db, INV.c, () => db.query("UPDATE public.profiles SET invite_code = $2, invited_by = $3, full_name = 'Third renamed' WHERE id = $1", [INV.c, CODE.other, INV.a]));
  kept = await inviteOf(db, INV.c);
  check(kept.invite_code === null && kept.invited_by === null && kept.full_name === 'Third renamed', `${label}: from the browser role an empty code and an empty credit stay empty: a realtor cannot credit anyone, themselves included`, JSON.stringify(kept));
  // Row level security: their own code, and no other profile's row.
  check((await asRealtor(db, INV.a, () => one(db, 'SELECT invite_code FROM public.profiles WHERE id = $1', [INV.a]))) === CODE.a, `${label}: a realtor reads their own invite code`);
  check((await asRealtor(db, INV.c, () => one(db, 'SELECT count(*)::int FROM public.profiles WHERE id = $1', [INV.a]))) === 0, `${label}: a realtor cannot read another realtor's invite code`);
  check((await asRealtor(db, INV.c, () => one(db, 'SELECT count(*)::int FROM public.profiles WHERE invite_code IS NOT NULL OR invited_by IS NOT NULL'))) === 0, `${label}: nor any code or credit at all through a filter`);
  check((await asRealtor(db, INV.c, () => one(db, 'SELECT count(*)::int FROM public.profiles WHERE invited_by = $1', [INV.a]))) === 0, `${label}: nor another realtor's list of invited realtors`);
  check((await asRealtor(db, INV.a, () => one(db, 'SELECT count(*)::int FROM public.profiles'))) === 1, `${label}: the browser role sees one profile, its own: the invited list is the server's to answer`);
  check(/permission denied|row-level security/.test(await db.exec('SET ROLE anon').then(() => refused(db, 'SELECT invite_code FROM public.profiles')).finally(() => db.exec('RESET ROLE'))) || (await db.exec('SET ROLE anon').then(() => one(db, 'SELECT count(*)::int FROM public.profiles')).finally(() => db.exec('RESET ROLE'))) === 0, `${label}: a visitor who is not signed in reads no code`);
}
async function run017(db, tag) {
  const strip = (list) => list.map((r) => { const o = { ...r }; delete o.invite_code; delete o.invited_by; return o; });
  const before = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  const policies = await profilesPolicies(db);
  await step(db, `${tag}1`, FILES.m017);
  check((await one(db, 'SELECT count(*)::int FROM public.profiles WHERE invite_code IS NOT NULL OR invited_by IS NOT NULL')) === 0, `${tag}1: every existing profile has no code and no credit`);
  check(same(strip(await rows(db, 'SELECT * FROM public.profiles ORDER BY id')), before), `${tag}1: no other column of any profile moved`);
  check(same(await profilesPolicies(db), policies), `${tag}1: the policies on profiles are exactly what they were`);
  await check017(db, `${tag}1`);
  const shape = await profilesCatalog(db); const constraints = await profilesConstraints(db); const indexes = await profilesIndexes(db); const triggers = await profilesTriggers(db);
  const held = await rows(db, 'SELECT * FROM public.profiles ORDER BY id');
  await step(db, `${tag}2 (017 again)`, FILES.m017);
  check(same(await profilesCatalog(db), shape), `${tag}2: a second run leaves every column of profiles, its type, NOT NULL and default as they were`);
  check(same(await profilesConstraints(db), constraints) && same(await profilesIndexes(db), indexes) && same(await profilesTriggers(db), triggers) && same(await profilesPolicies(db), policies), `${tag}2: and every constraint, index, trigger and policy`);
  check(same(await rows(db, 'SELECT * FROM public.profiles ORDER BY id'), held), `${tag}2: and every row: the codes and the credit written before the second run are still there`);
  // The one way a credit empties: the inviting profile is deleted.
  await db.query('DELETE FROM public.profiles WHERE id = $1', [INV.a]);
  const orphan = await inviteOf(db, INV.b);
  check(orphan.invited_by === null && orphan.invite_code === CODE.b, `${tag}2: when the inviting profile is deleted the credit empties and the invited realtor keeps their own code`, JSON.stringify(orphan));
  await db.query('DELETE FROM public.profiles WHERE id = ANY($1)', [[INV.b, INV.c]]);
  check(same(await rows(db, 'SELECT * FROM public.profiles ORDER BY id'), before.map((r) => ({ ...r, invite_code: null, invited_by: null }))), `${tag}2: this check's own realtors removed, every profile is what it was, with no code and no credit`);
}

async function pathB() {
  say('\nPATH B  upgrade from the old 001');
  const db = new PGlite();
  const old001 = execFileSync('git', ['show', `${OLD_001_COMMIT}:${FILES.m001}`], { cwd: ROOT, encoding: 'utf8' });
  check(old001.includes(`ADD VALUE IF NOT EXISTS '${FOURTH_KIND}'`), `git show ${OLD_001_COMMIT}:${FILES.m001} is the copy with the fourth income kind`);
  await baseline(db); const before = await legacySnapshot(db);
  await step(db, 'B1 (old 001)', `git show ${OLD_001_COMMIT}:${FILES.m001}`, old001);
  check((await labelsOf(db, 'income_source_kind')).includes(FOURTH_KIND), 'the old 001 put the fourth kind in the type');
  await step(db, 'B2', FILES.m002);
  await step(db, 'B3', FILES.m003); await checkBackfill(db);
  const party = await one(db, "INSERT INTO public.application_parties (application_id, role, full_name, annual_income) VALUES ($1, 'primary', 'Applicant 1', 90000) RETURNING id", [app(1)]);
  const income = await one(db, 'INSERT INTO public.income_sources (application_party_id, kind, payer, annual_amount) VALUES ($1, $2, $3, 30000) RETURNING id', [party, FOURTH_KIND, 'A plan']);
  check((await one(db, 'SELECT kind::text FROM public.income_sources WHERE id = $1', [income])) === FOURTH_KIND, 'one income_sources row carries the fourth kind (parents: applications, then application_parties)');
  await step(db, 'B4', FILES.m004);
  check((await one(db, 'SELECT kind::text FROM public.income_sources WHERE id = $1', [income])) === 'other', 'after 004 that row reads other');
  check((await one(db, "SELECT data_type || ' ' || udt_name FROM information_schema.columns WHERE table_name = 'income_sources' AND column_name = 'kind'")) === 'USER-DEFINED income_source_kind', 'and the column is the enum again, not text');
  await step(db, 'B5 (004 again)', FILES.m004);
  await step(db, 'B6 (001 again)', FILES.m001);
  check((await one(db, 'SELECT kind::text || \' \' || annual_amount FROM public.income_sources WHERE id = $1', [income])) === 'other 30000', 'the row still reads other, amount untouched');
  await checkEnd(db); await checkRules(db);
  // db/005 on three rows whose state drifted while their old columns stayed where they were.
  await db.query("UPDATE public.listing_applicants SET state = 'withdrawn_by_applicant' WHERE id = $1", [link(1)]); // withdrawn_at is empty: reads submitted again
  await db.query("UPDATE public.listing_applicants SET state = 'submitted' WHERE id = $1", [link(2)]);              // the mark is on: reads shortlisted again
  await db.query("UPDATE public.listing_applicants SET state = 'reconsidered' WHERE id = $1", [link(7)]);           // on a rented listing: listed, never reset
  check((await checkResync(db, 'B7')) === 2, 'two of the three drifted rows were reset, the reconsidered one was left alone');
  check(same(await legacySnapshot(db), before), 'status, closed_at, rented_link_id, the decision columns, withdrawn_at and the document row are what they were before 001');
  await run006And007(db, 'B');
  await runCredit(db, 'B9');
  await runParties(db, 'B10');
  await run009(db, 'B11');
  await run010(db, 'B12');
  await run011(db, 'B13');
  await run012(db, 'B14');
  await run013(db, 'B15');
  await run014(db, 'B16');
  await run015(db, 'B17');
  await run016(db, 'B18');
  await run017(db, 'B19');
  await run018(db, 'B20');
  await run019(db, 'B21');
  await run020(db, 'B22');
  await run021(db, 'B23');
  await run022(db, 'B24');
  await run023(db, 'B25');
  await run024(db, 'B26');
  return { db, before };
}

async function pathC({ db, before }) {
  say('\nPATH C  rollback, after path B');
  await step(db, 'C1', FILES.m999);
  await step(db, 'C2 (999 again)', FILES.m999);
  for (const t of NEW_TABLES) check((await hasTable(db, t)) === false, `table ${t} is gone`);
  for (const [t, c] of NEW_COLUMNS) check((await hasColumn(db, t, c)) === false, `column ${t}.${c} is gone`);
  for (const t of NEW_TRIGGERS) check((await hasTrigger(db, t)) === false, `trigger ${t} is gone`);
  for (const f of NEW_FUNCTIONS) check((await hasFunction(db, f)) === false, `function ${f} is gone`);
  for (const t of NEW_TYPES) check((await hasType(db, t)) === false, `enum ${t} is gone`);
  check(same(await legacySnapshot(db), before), 'listings.status, decision_status, decision_priority, withdrawn_at and the applicant_documents row are intact');
  check((await one(db, 'SELECT count(*)::int FROM public.listing_applicants')) === LINKS.length && (await one(db, 'SELECT count(*)::int FROM public.applicant_documents')) === 1, 'no listing_applicants or applicant_documents row was lost');
  // And the way forward still works from here: a rollback is not a dead end.
  await step(db, 'C3 (001 after the rollback)', FILES.m001); await step(db, 'C4', FILES.m002); await step(db, 'C5', FILES.m003); await step(db, 'C6', FILES.m004);
  await checkBackfill(db); await checkEnd(db);
  await db.close();
}

// The earlier db/012 (git show 555c286) created the three utility columns boolean NOT NULL DEFAULT
// false, and ADD COLUMN IF NOT EXISTS leaves that shape alone. 012 relaxes them in a guarded block:
// after it each one is nullable with no default, every stored value is kept (a false the old
// default wrote stays false), and a bare insert reads them as not set. 012 again changes nothing.
const OLD_012_COMMIT = '555c286';
const UTILITIES = ['utilities_heat', 'utilities_hydro', 'utilities_water'];
const OLD_UTILITIES_SQL = UTILITIES.map((c) => `ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS ${c} boolean NOT NULL DEFAULT false;`).join('\n');
const utilityShape = async (db) => Object.fromEntries((await rows(db, "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = ANY($1) ORDER BY column_name", [UTILITIES])).map((r) => [r.column_name, `${r.is_nullable} ${r.column_default}`]));
const utilityRows = (db) => rows(db, 'SELECT id, utilities_heat, utilities_hydro, utilities_water FROM public.listings ORDER BY id');
async function pathD() {
  say('\nPATH D  upgrade from the earlier 012: the utility columns NOT NULL DEFAULT false');
  const db = new PGlite();
  const old012 = execFileSync('git', ['show', `${OLD_012_COMMIT}:${FILES.m012}`], { cwd: ROOT, encoding: 'utf8' });
  check(OLD_UTILITIES_SQL.split('\n').every((line) => old012.includes(line)), `git show ${OLD_012_COMMIT}:${FILES.m012} created the three utility columns boolean NOT NULL DEFAULT false, the shape built here`);
  await baseline(db);
  const listingCount = await one(db, 'SELECT count(*)::int FROM public.listings');
  check(listingCount > 0, `before the old shape, listings already holds ${listingCount} rows`);
  await step(db, 'D1 (the old utility columns)', `the three ADD COLUMN lines of ${OLD_012_COMMIT}:${FILES.m012}`, OLD_UTILITIES_SQL);
  check(same(await utilityShape(db), Object.fromEntries(UTILITIES.map((c) => [c, 'NO false']))), 'D1: all three are NOT NULL with the default false', JSON.stringify(await utilityShape(db)));
  // Rows written under the old shape: the ones that were there read the default, one row set by
  // hand per column, and one inserted afterward that took the default.
  await db.query('UPDATE public.listings SET utilities_heat = true WHERE id = $1', [ID.live]);
  await db.query('UPDATE public.listings SET utilities_hydro = true, utilities_water = true WHERE id = $1', [ID.rented]);
  await db.query("INSERT INTO public.listings (id, profile_id, name, monthly_rent) VALUES ('aaaaaaa1-0000-4000-8000-000000000005', $1, 'Saved under the old shape', 2200)", [ID.me]);
  const held = await utilityRows(db);
  check(held.length === listingCount + 1 && held.every((r) => UTILITIES.every((c) => typeof r[c] === 'boolean')) && held.flatMap((r) => UTILITIES.map((c) => r[c])).filter(Boolean).length === 3, `D1: ${held.length} rows hold a boolean in every utility column, three of them true, the rest false from the default`);
  const before = await rows(db, 'SELECT * FROM public.listings ORDER BY id');
  await step(db, 'D2', FILES.m012); await check012(db, 'D2');
  check(same(await utilityShape(db), Object.fromEntries(UTILITIES.map((c) => [c, 'YES null']))), 'D2: all three are nullable with no default', JSON.stringify(await utilityShape(db)));
  check(same(await utilityRows(db), held), 'D2: every row keeps the value it held, every false still false and every true still true, none turned null');
  const strip = (list) => list.map((r) => { const o = { ...r }; for (const [c] of BOARD_COLUMNS) if (!UTILITIES.includes(c)) delete o[c]; return o; });
  check(same(strip(await rows(db, 'SELECT * FROM public.listings ORDER BY id')), strip(before)), 'D2: no listing row was changed');
  const bare = (await rows(db, "INSERT INTO public.listings (profile_id, name, monthly_rent) VALUES ($1, 'Bare insert', 2000) RETURNING utilities_heat, utilities_hydro, utilities_water", [ID.me]))[0];
  check(UTILITIES.every((c) => bare[c] === null), 'D2: a bare insert afterward reads all three as not set', JSON.stringify(bare));
  await db.query("DELETE FROM public.listings WHERE name = 'Bare insert'");
  const shape = await listingsCatalog(db);
  await step(db, 'D3 (012 again)', FILES.m012); await check012(db, 'D3');
  check(same(await listingsCatalog(db), shape), 'D3: a second run leaves every listings column, its type, NOT NULL and default as they were');
  check(same(await utilityRows(db), held), 'D3: and every row still holds the value it held under the old shape');
  await db.close();
}

// Before trusting a pass: a statement that fails must be reported with its file and its line,
// and must leave nothing behind.
async function selfCheck() {
  say('\nSELF CHECK  a failure is reported with its file and line, and rolled back');
  const db = new PGlite();
  const broken = "-- a comment with a ; in it\nCREATE TABLE public.kept_out (id int);\n\nDO $$ BEGIN\n  RAISE EXCEPTION 'stop; here';\nEND $$;\nCREATE TABLE public.never (id int);\n";
  for (const whole of [false, true]) {
    WHOLE = whole; let message = '';
    try { await runFile(db, 'selfcheck.sql', broken); } catch (e) { message = e.message; }
    check(/^selfcheck\.sql/.test(message) && /stop; here/.test(message) && (whole || /line 4/.test(message)), whole ? 'sent as one query: the Postgres error is reported against the file' : 'sent one at a time: the error names the file and line 4, where the failing statement starts', message);
    check((await hasTable(db, 'kept_out')) === false, 'and the table created earlier in the same file is gone: the file is one transaction');
  }
  WHOLE = false; await db.close();
}

const results = [];
async function main() {
  say(`engine: ${await one(new PGlite(), 'SELECT version()')}`);
  await selfCheck();
  for (const whole of [false, true]) {
    WHOLE = whole;
    say(`\n════ ${whole ? 'SECOND PASS: each file sent as one query string, BEGIN to COMMIT' : 'FIRST PASS: each file one transaction, statements sent one at a time'} ════`);
    let carried = null;
    for (const [name, fn] of [['A', pathA], ['B', async () => { carried = await pathB(); }], ['C', async () => { if (!carried) throw new StepError('path B did not finish, so there is nothing to roll back'); await pathC(carried); }], ['D', pathD]]) {
      const tag = `${name}${whole ? ' (one query)' : ''}`;
      try { await fn(); results.push([tag, 'pass']); }
      catch (e) { if (!(e instanceof StepError)) throw e; results.push([tag, e.message]); say(`  FAILED: ${e.message}`); }
    }
  }
  say('\nRESULT');
  for (const [name, r] of results) say(`  Path ${name}: ${r}`);
  say(`  ${checks} checks`);
  process.exit(results.every(([, r]) => r === 'pass') ? 0 : 1);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
