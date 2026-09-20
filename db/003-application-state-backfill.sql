-- db/003-application-state-backfill.sql
-- Fills the two state columns from the columns that came before them. Run THIRD, after
-- db/001-application-state-enums.sql and db/002-application-state-tables.sql.
-- IDEMPOTENT: only rows whose state is still NULL are written, and the starting audit row is
-- added only for an application that has none. No existing column is changed: the screens keep
-- reading status, decision_status, decision_priority and withdrawn_at exactly as they do today.
-- The mapping is the one lib/application-state.js applicationStateOf and listingStateOf apply to
-- a row with no state, so the application reads the same answer before and after this file.
--
-- LISTINGS  (listings.status, then listings.state)
--   active    live
--   rented    rented
--   closed    withdrawn
--   NULL      live
--
-- APPLICATIONS  (listing_applicants, first match wins, then listing_applicants.state)
--   1. withdrawn_at is set                                   withdrawn_by_applicant
--   2. the listing is rented and rented_link_id is this row  accepted
--   3. the listing is rented, any other row                  not_selected
--   4. decision_status = 'shortlist'                         shortlisted
--   5. decision_priority = 'top', not set aside              shortlisted
--   6. everything else, set aside included                   submitted
-- Set aside (decision_status = 'reject') stays in decision_status: the realtor can undo it, so it
-- is a working sort and not an ending. An open document request lives in KV, not in Postgres, so
-- nothing is backfilled to docs_pending: it is written from the next request on.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'status')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'rented_link_id') THEN
    RAISE EXCEPTION 'Run db/listing-status.sql first: listings.status and listings.rented_link_id are missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listing_applicants' AND column_name = 'withdrawn_at') THEN
    RAISE EXCEPTION 'Run db/listing-applicants-vocabulary.sql first: listing_applicants.withdrawn_at is missing.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listing_applicants' AND column_name = 'state') THEN
    RAISE EXCEPTION 'Run db/002-application-state-tables.sql first: listing_applicants.state is missing.';
  END IF;
END $$;

-- 1. Applications first, while listings.status is still the only word on the listing.
UPDATE public.listing_applicants la
SET state = (CASE
  WHEN la.withdrawn_at IS NOT NULL THEN 'withdrawn_by_applicant'
  WHEN l.status = 'rented' AND l.rented_link_id = la.id THEN 'accepted'
  WHEN l.status = 'rented' THEN 'not_selected'
  WHEN la.decision_status = 'shortlist' THEN 'shortlisted'
  WHEN la.decision_priority = 'top' AND la.decision_status IS DISTINCT FROM 'reject' THEN 'shortlisted'
  ELSE 'submitted'
END)::public.application_state
FROM public.listings l
WHERE l.id = la.listing_id AND la.state IS NULL;

-- 2. Listings.
UPDATE public.listings
SET state = (CASE status WHEN 'rented' THEN 'rented' WHEN 'closed' THEN 'withdrawn' ELSE 'live' END)::public.listing_state
WHERE state IS NULL;

-- 3. One starting row in the audit for every application that has none.
INSERT INTO public.application_events (listing_applicant_id, from_state, to_state, actor, actor_type, reason)
SELECT la.id, NULL, la.state, 'backfill', 'system', 'backfill'
FROM public.listing_applicants la
WHERE la.state IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.application_events e WHERE e.listing_applicant_id = la.id);

-- 4. From here on a new row starts where the application creates it.
ALTER TABLE public.listing_applicants ALTER COLUMN state SET DEFAULT 'submitted';
ALTER TABLE public.listings ALTER COLUMN state SET DEFAULT 'live';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.listing_applicants WHERE state IS NULL) THEN
    ALTER TABLE public.listing_applicants ALTER COLUMN state SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.listings WHERE state IS NULL) THEN
    ALTER TABLE public.listings ALTER COLUMN state SET NOT NULL;
  END IF;
END $$;

-- 5. What to look at afterwards (read only).
SELECT 'listings' AS rows_in, state::text AS state, count(*) FROM public.listings GROUP BY state
UNION ALL
SELECT 'listing_applicants', state::text, count(*) FROM public.listing_applicants GROUP BY state
ORDER BY 1, 2;
