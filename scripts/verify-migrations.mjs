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
//   Path A  fresh setup   baseline, 001, 002, 003, 004, 004 again, 001 again
//   Path B  upgrade       baseline, the OLD 001 (git show b11f1f8, four income kinds), 002, 003,
//                         one income_sources row carrying the fourth kind, 004, 004 again, 001 again
//   Path C  rollback      after path B: 999, 999 again
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  check(same(await legacySnapshot(db), before), 'status, closed_at, rented_link_id, the decision columns, withdrawn_at and the document row are what they were before 001');
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
