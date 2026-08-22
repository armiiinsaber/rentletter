-- db/reviewed-at.sql
-- Per-applicant "reviewed" state, per realtor. The listing_applicants junction row already scopes
-- realtor (via listing) ↔ applicant, so one column is the whole feature.
--
-- reviewed_at is set (RLS, the realtor's own session) the first time the realtor OPENS that
-- applicant's card on the listing page. Never reset by applicant edits ("edited after
-- verification" already covers the case that matters). A referred applicant newly assigned to
-- a listing gets a fresh junction row → NULL → unreviewed.
--
-- BACKFILL: every junction row that exists when this runs is marked reviewed (at its decision
-- time, else its arrival time), so realtors don't wake up to their entire history flagged
-- "new". Only applicants who arrive AFTER this runs count as unreviewed.
--
-- Until it runs, the dashboard detects the missing column and shows no markers at all.
-- Run once in Supabase (SQL editor). Safe/idempotent.

ALTER TABLE public.listing_applicants
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

UPDATE public.listing_applicants
   SET reviewed_at = COALESCE(decision_changed_at, created_at, now())
 WHERE reviewed_at IS NULL;

COMMENT ON COLUMN public.listing_applicants.reviewed_at IS 'First time the realtor opened this applicant''s card. NULL = not yet reviewed.';
-- RLS: realtors already UPDATE their own listing_applicants rows (decisions); no policy change.
