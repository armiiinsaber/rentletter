-- db/state-parity-check.sql
-- READ ONLY. Lists every listing and every applicant where the state and the old columns
-- disagree, with ids. It changes nothing and can be run at any time, as often as wanted.
-- An empty result means the two agree everywhere.
--
-- The old columns say less than the state. They cannot tell not_selected from submitted on a
-- reopened listing, and they have no word for docs_pending, fell_through, reconsidered or a
-- closing step. So a row disagrees only when the old columns CONTRADICT its state:
--   1. withdrawn_at is set and the state is not withdrawn_by_applicant, or the other way round
--   2. the row is the winner of a rented listing and the state does not hold the listing
--   3. the state holds a listing that is not rented to this row
--   4. the listing is rented to someone else and the state is still open
--      (submitted, docs_pending, shortlisted, reconsidered)
--   5. the finalist mark is on (and the row is not set aside) and the state is submitted or
--      docs_pending, or the state is shortlisted and the mark is off
-- Set aside (decision_status reject) has no state and is never a disagreement by itself.
-- These are the rules of lib/application-state.js applicantDisagreement and listingDisagreement;
-- npm run verify:migrations compares the two on every combination.
-- expected is what the old columns alone say (the db/003 mapping), which is what
-- db/005-application-state-resync.sql would set. A row in reconsidered is listed and never reset.

WITH facts AS (
  SELECT
    la.id, la.listing_id, la.application_id, la.state::text AS state,
    la.decision_status, la.decision_priority, la.withdrawn_at, l.status AS listing_status,
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
), verdict AS (
  SELECT facts.*, CASE
    WHEN w AND state <> 'withdrawn_by_applicant' THEN 'withdrawn_at is set and the state is not withdrawn_by_applicant'
    WHEN NOT w AND state = 'withdrawn_by_applicant' THEN 'the state is withdrawn_by_applicant and withdrawn_at is empty'
    WHEN w THEN NULL
    WHEN winner AND state NOT IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in') THEN 'the row is the winner of a rented listing and the state does not hold it'
    WHEN NOT winner AND state IN ('accepted', 'agreement_signed', 'deposit_received', 'lease_signed', 'moved_in') THEN 'the state holds a listing that is not rented to this row'
    WHEN rented AND NOT winner AND state IN ('submitted', 'docs_pending', 'shortlisted', 'reconsidered') THEN 'the listing is rented to someone else and the state is still open'
    WHEN mark AND state IN ('submitted', 'docs_pending') THEN 'the finalist mark is on and the state is not shortlisted'
    WHEN NOT mark AND state = 'shortlisted' THEN 'the state is shortlisted and the finalist mark is off'
    ELSE NULL
  END AS disagreement
  FROM facts
)
SELECT 'applicant' AS kind, id, listing_id, application_id, state, expected,
       decision_status, decision_priority, withdrawn_at, listing_status, disagreement
FROM verdict
WHERE disagreement IS NOT NULL
UNION ALL
SELECT 'listing', l.id, l.id, NULL, l.state::text,
       CASE l.status WHEN 'rented' THEN 'rented' WHEN 'closed' THEN 'withdrawn' ELSE 'live' END,
       NULL, NULL, NULL, l.status,
       CASE
         WHEN l.status = 'rented' THEN 'status is rented and the state is not'
         WHEN l.status = 'closed' THEN 'status is closed and the state is not withdrawn'
         ELSE 'status is active and the state is rented or withdrawn'
       END
FROM public.listings l
WHERE l.state IS NOT NULL
  AND NOT (
    (l.status = 'rented' AND l.state::text = 'rented')
    OR (l.status = 'closed' AND l.state::text = 'withdrawn')
    OR (l.status NOT IN ('rented', 'closed') AND l.state::text IN ('live', 'draft', 'paused'))
  )
ORDER BY 1, 3, 2;
