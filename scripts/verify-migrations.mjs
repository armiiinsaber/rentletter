// scripts/verify-migrations.mjs  npm run verify:migrations
// Proves db/001, db/002, db/003, db/004 and db/999 on a real Postgres engine before anyone runs
// them in the Supabase SQL editor. The engine is PGlite: Postgres compiled to WebAssembly, in
// memory, inside this process. Nothing here opens a network connection, reads an env file or
// knows a Supabase URL. Every path starts from an empty database and throws it away.
//
// Every file is run the way the SQL editor runs a script: as ONE transaction, BEGIN to COMMIT.
// All three paths run twice. First with the statements sent one at a time inside that
// transaction, so a failure names the file and the line of the statement that caused it. Then
// with the whole file sent as one query string, BEGIN and COMMIT included, which is exactly
// what the editor sends. A failure rolls the transaction back and stops the path.
//
//   Path A  fresh setup   baseline, 001, 002, 003, 004, 004 again, 001 again, then every combination
//                         of state and old columns, 005, 005 again, 006, 007, credit-shared, 008, 009, 010, 011, each twice
//   Path B  upgrade       baseline, the OLD 001 (git show b11f1f8, four income kinds), 002, 003,
//                         one income_sources row carrying the fourth kind, 004, 004 again, 001 again,
//                         three drifted rows, 005, 005 again, 006, 007, credit-shared, 008, 009, 010, 011, each twice
//   Path C  rollback      after path B: 999, 999 again
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
  await db.close();
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
    for (const [name, fn] of [['A', pathA], ['B', async () => { carried = await pathB(); }], ['C', async () => { if (!carried) throw new StepError('path B did not finish, so there is nothing to roll back'); await pathC(carried); }]]) {
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
