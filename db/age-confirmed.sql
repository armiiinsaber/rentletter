-- db/age-confirmed.sql
-- The age of majority answer gets its own column. Run once in the Supabase SQL editor.
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, and a backfill that only fills rows still null. The
-- application tolerates this file not having run: the write retries without the column
-- (lib/applicationMap.js OPTIONAL_COLUMNS) and the read falls back to scorecard->>'ageConfirmed'
-- while the column is absent (lib/applicationMap.js ageConfirmedOf).

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS age_confirmed boolean;

COMMENT ON COLUMN public.applications.age_confirmed IS 'The applicant confirmed they are of the age of majority in the listing''s province. The date of birth and the age are never stored.';

-- Backfill from the flag the form used to write into the scorecard jsonb.
UPDATE public.applications
   SET age_confirmed = true
 WHERE age_confirmed IS NULL
   AND scorecard IS NOT NULL
   AND scorecard->>'ageConfirmed' = 'true';
