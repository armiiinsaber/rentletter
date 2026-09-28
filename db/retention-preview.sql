-- db/retention-preview.sql  READ ONLY. Nothing is written, nothing is deleted.
-- What the retention cron (pages/api/cron/retention.js, lib/retention.js) would delete TODAY if
-- enforcement were on (RETENTION_ENFORCE=true). Enforcement stays off; this file only looks.
--
-- THE RULE, as lib/retention.js selectExpired reads it:
--   an application is expired when its last activity is more than 12 months ago and none of its
--   listing_applicants rows sits on an open listing. Last activity is the latest of
--   applications.created_at and profile_updated_at, each junction row's created_at, reviewed_at,
--   last_sent_at and every confirmations.*.at, and each held document's uploaded_at. An open
--   listing is one whose state is live, draft or paused, or, with no state column yet, whose
--   status is active (lib/application-state.js listingStanding).
-- WHAT THE CRON DELETES: the listing_applicants rows, then the applications rows, in batches of
-- 100, at most 50 batches a run (so at most 5000 applications per run). Everything else in the
-- counts below goes with them through ON DELETE CASCADE, and is listed so nothing is a surprise:
--   applicant_documents        db/documents.sql line 24         (cascade from listing_applicants)
--   application_events         db/002 line 180                  (cascade from listing_applicants)
--   closings                   db/002 line 134                  (cascade from listing_applicants)
--   reference_responses        db/reference-responses.sql 16    (cascade from listing_applicants)
--   application_parties        db/002 line 70                   (cascade from applications)
--   income_sources             db/002 line 104                  (cascade from application_parties)
--   events                     db/events.sql line 18            (cascade from applications)
--   pipeline_consents          db/listing-status.sql line 35    (cascade from applications)
-- Held documents' files in storage are not touched by the cron; only their rows go. The cron logs
-- rows still held under an expired applicant and leaves them for the documents expiry.
-- ASSUMES db/documents.sql, db/events.sql, db/listing-status.sql, db/reference-responses.sql and
-- db/001 to db/003 have run (every table named above exists). profile_updated_at and state are
-- read through to_jsonb, so this runs whether or not those two columns exist yet.
--
-- ONE STATEMENT. The first rows are the counts by table; then one row per application the cron
-- would delete, oldest first, with its last activity.

WITH cutoff AS (
  SELECT now() - interval '12 months' AS at
),
junction_activity AS (
  SELECT la.id AS junction_id,
         la.application_id,
         la.listing_id,
         GREATEST(
           la.created_at,
           la.reviewed_at,
           la.last_sent_at,
           (SELECT max((v ->> 'at')::timestamptz)
              FROM jsonb_each(CASE WHEN jsonb_typeof(la.confirmations) = 'object' THEN la.confirmations ELSE '{}'::jsonb END) AS c(k, v)
             WHERE jsonb_typeof(v) = 'object' AND (v ->> 'at') IS NOT NULL),
           (SELECT max(d.uploaded_at) FROM public.applicant_documents d WHERE d.listing_applicant_id = la.id)
         ) AS last_activity,
         (
           COALESCE(
             (to_jsonb(l) ->> 'state') IN ('live', 'draft', 'paused'),
             l.status = 'active'
           )
         ) AS on_open_listing
    FROM public.listing_applicants la
    LEFT JOIN public.listings l ON l.id = la.listing_id
),
candidates AS (
  SELECT a.id,
         a.application_number,
         a.created_at,
         GREATEST(
           a.created_at,
           (to_jsonb(a) ->> 'profile_updated_at')::timestamptz,
           (SELECT max(j.last_activity) FROM junction_activity j WHERE j.application_id = a.id)
         ) AS last_activity,
         COALESCE(bool_or(j.on_open_listing), false) AS on_open_listing
    FROM public.applications a
    LEFT JOIN junction_activity j ON j.application_id = a.id
   WHERE a.created_at < (SELECT at FROM cutoff)
   GROUP BY a.id, a.application_number, a.created_at
),
expired AS (
  SELECT c.*
    FROM candidates c
   WHERE NOT c.on_open_listing
     AND c.last_activity < (SELECT at FROM cutoff)
),
expired_junctions AS (
  SELECT la.id FROM public.listing_applicants la WHERE la.application_id IN (SELECT id FROM expired)
),
expired_parties AS (
  SELECT p.id FROM public.application_parties p WHERE p.application_id IN (SELECT id FROM expired)
),
counts AS (
  SELECT 1 AS ord, 'applications' AS what, count(*)::bigint AS rows FROM expired
  UNION ALL SELECT 2, 'listing_applicants', count(*) FROM expired_junctions
  UNION ALL SELECT 3, 'applicant_documents (cascade)', count(*) FROM public.applicant_documents WHERE listing_applicant_id IN (SELECT id FROM expired_junctions)
  UNION ALL SELECT 4, 'application_events (cascade)', count(*) FROM public.application_events WHERE listing_applicant_id IN (SELECT id FROM expired_junctions)
  UNION ALL SELECT 5, 'closings (cascade)', count(*) FROM public.closings WHERE listing_applicant_id IN (SELECT id FROM expired_junctions)
  UNION ALL SELECT 6, 'reference_responses (cascade)', count(*) FROM public.reference_responses WHERE listing_applicant_id IN (SELECT id FROM expired_junctions)
  UNION ALL SELECT 7, 'application_parties (cascade)', count(*) FROM expired_parties
  UNION ALL SELECT 8, 'income_sources (cascade)', count(*) FROM public.income_sources WHERE application_party_id IN (SELECT id FROM expired_parties)
  UNION ALL SELECT 9, 'events (cascade)', count(*) FROM public.events WHERE application_id IN (SELECT id FROM expired)
  UNION ALL SELECT 10, 'pipeline_consents (cascade)', count(*) FROM public.pipeline_consents WHERE application_id IN (SELECT id FROM expired)
)
SELECT what,
       rows,
       NULL::text AS application_number,
       NULL::timestamptz AS last_activity
  FROM counts
 UNION ALL
SELECT 'application', 1, e.application_number, e.last_activity
  FROM expired e
 ORDER BY 1 DESC, 4 ASC NULLS FIRST, 3;
