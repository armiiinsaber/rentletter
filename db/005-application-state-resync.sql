-- db/005-application-state-resync.sql
-- Brings the state back in step with the old columns, once, where the two disagree. Run FIFTH,
-- after db/001 to db/004, on its own, in the Supabase SQL editor. Look first, if wanted, with
-- db/state-parity-check.sql (read only): it lists exactly the rows this file would change.
-- IDEMPOTENT: only a row that disagrees is written, and a row that has been written agrees, so
-- a second run changes nothing and adds no audit row. No old column is changed.
--
-- WHAT DISAGREES. The old columns say less than the state (they cannot tell not_selected from
-- submitted on a reopened listing, and have no word for docs_pending, fell_through,
-- reconsidered or a closing step), so a row disagrees only when the old columns CONTRADICT it:
--   1. withdrawn_at is set and the state is not withdrawn_by_applicant, or the other way round
--   2. the row is the winner of a rented listing and the state does not hold the listing
--   3. the state holds a listing that is not rented to this row
--   4. the listing is rented to someone else and the state is still open
--   5. the finalist mark is on (not set aside) and the state is submitted or docs_pending, or
--      the state is shortlisted and the mark is off
-- Everything else is left exactly as it is: a not_selected applicant on a reopened listing stays
-- not_selected, and nobody is revived.
--
-- WHAT IT SETS. The state the old columns alone give, the db/003 mapping:
--   withdrawn_at set                                  withdrawn_by_applicant
--   the winner of a rented listing                    accepted
--   anyone else on a rented listing                   not_selected
--   decision_status shortlist, or top and not reject  shortlisted
--   everything else                                   submitted
-- A row in reconsidered is NEVER touched, whatever its old columns say: only the realtor's own
-- action moves someone out of reconsidered.
-- Every changed row writes one application_events row: actor resync, actor_type system,
-- reason resync, from the state it had to the state it has.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listing_applicants' AND column_name = 'state')
     OR to_regclass('public.application_events') IS NULL THEN
    RAISE EXCEPTION 'Run db/001 to db/004 first: listing_applicants.state or application_events is missing.';
  END IF;
END $$;

-- 1. Applicants: the update and its audit rows are one statement, so there is exactly one audit
--    row per changed row and none for a row that was left alone.
WITH facts AS (
  SELECT
    la.id, la.state::text AS state,
    (la.withdrawn_at IS NOT NULL) AS w,
    (la.decision_status = 'shortlist' OR (la.decision_status IS DISTINCT FROM 'reject' AND la.decision_priority = 'top')) AS mark,
    (l.status = 'rented') AS rented,
    (l.status = 'rented' AND COALESCE(l.rented_link_id = la.id, false)) AS winner,
    CASE
      WHEN la.withdrawn_at IS NOT NULL THEN 'withdrawn_by_applicant'
      WHEN l.status = 'rented' AND COALESCE(l.rented_link_id = la.id, false) THEN 'accepted'
      WHEN l.status = 'rented' THEN 'not_selected'
      WHEN la.decision_status = 'shortlist' THEN 'shortlisted'
      WHEN la.decision_priority = 'top' AND la.decision_status IS DISTINCT FROM 'reject' THEN 'shortlisted'
      ELSE 'submitted'
    END AS expected
  FROM public.listing_applicants la
  JOIN public.listings l ON l.id = la.listing_id
  WHERE la.state IS NOT NULL
), disagreeing AS (
  SELECT id, state, expected FROM facts
  WHERE state <> 'reconsidered'
    AND state <> expected
    AND (
      (w AND state <> 'withdrawn_by_applicant')
      OR (NOT w AND state = 'withdrawn_by_applicant')
      OR (NOT w AND winner AND state NOT IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in'))
      OR (NOT w AND NOT winner AND state IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in'))
      OR (NOT w AND rented AND NOT winner AND state IN ('submitted', 'docs_pending', 'shortlisted'))
      OR (NOT w AND mark AND state IN ('submitted', 'docs_pending'))
      OR (NOT w AND NOT mark AND state = 'shortlisted')
    )
), changed AS (
  UPDATE public.listing_applicants la
  SET state = d.expected::public.application_state
  FROM disagreeing d
  WHERE la.id = d.id
  RETURNING la.id, d.state AS from_state, d.expected AS to_state
)
INSERT INTO public.application_events (listing_applicant_id, from_state, to_state, actor, actor_type, reason)
SELECT id, from_state::public.application_state, to_state::public.application_state, 'resync', 'system', 'resync'
FROM changed;

-- 2. Listings: rented reads rented, closed reads withdrawn, and active reads live unless the
--    state is draft or paused, which the status column cannot say and which are left alone.
UPDATE public.listings l
SET state = (CASE l.status WHEN 'rented' THEN 'rented' WHEN 'closed' THEN 'withdrawn' ELSE 'live' END)::public.listing_state
WHERE l.state IS NOT NULL
  AND NOT (
    (l.status = 'rented' AND l.state::text = 'rented')
    OR (l.status = 'closed' AND l.state::text = 'withdrawn')
    OR (l.status NOT IN ('rented', 'closed') AND l.state::text IN ('live', 'draft', 'paused'))
  );

-- 3. What to look at afterwards (read only). still_disagree is expected to be 0.
--    reconsidered_left_alone counts rows in reconsidered whose old columns contradict them: they
--    are never reset here, and db/state-parity-check.sql lists them by id.
WITH facts AS (
  SELECT
    la.state::text AS state,
    (la.withdrawn_at IS NOT NULL) AS w,
    (la.decision_status = 'shortlist' OR (la.decision_status IS DISTINCT FROM 'reject' AND la.decision_priority = 'top')) AS mark,
    (l.status = 'rented') AS rented,
    (l.status = 'rented' AND COALESCE(l.rented_link_id = la.id, false)) AS winner
  FROM public.listing_applicants la
  JOIN public.listings l ON l.id = la.listing_id
  WHERE la.state IS NOT NULL
), verdict AS (
  SELECT state, (
      (w AND state <> 'withdrawn_by_applicant')
      OR (NOT w AND state = 'withdrawn_by_applicant')
      OR (NOT w AND winner AND state NOT IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in'))
      OR (NOT w AND NOT winner AND state IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in'))
      OR (NOT w AND rented AND NOT winner AND state IN ('submitted', 'docs_pending', 'shortlisted', 'reconsidered'))
      OR (NOT w AND mark AND state IN ('submitted', 'docs_pending'))
      OR (NOT w AND NOT mark AND state = 'shortlisted')
    ) AS disagrees
  FROM facts
)
SELECT
  (SELECT count(*) FROM verdict WHERE disagrees AND state <> 'reconsidered')
  + (SELECT count(*) FROM public.listings l WHERE l.state IS NOT NULL AND NOT (
      (l.status = 'rented' AND l.state::text = 'rented')
      OR (l.status = 'closed' AND l.state::text = 'withdrawn')
      OR (l.status NOT IN ('rented', 'closed') AND l.state::text IN ('live', 'draft', 'paused')))) AS still_disagree,
  (SELECT count(*) FROM verdict WHERE disagrees AND state = 'reconsidered') AS reconsidered_left_alone,
  (SELECT count(*) FROM public.application_events WHERE reason = 'resync') AS resync_audit_rows;
