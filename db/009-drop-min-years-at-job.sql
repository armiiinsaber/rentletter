-- db/009-drop-min-years-at-job.sql
-- Removes public.listings.pref_min_years_at_job, the "Min years at job" criterion (docs/fit-v2.md).
-- Job tenure is no longer a criterion and never enters Fit: the Ontario Human Rights Commission's
-- Policy on Human Rights and Rental Housing names employment history requirements as a barrier
-- that falls hardest on newcomers, and the number now describes the applicant as they are today.
-- The code stopped reading and writing the column in the same change (lib/realtorWrites.js,
-- lib/supabaseBridge.js, components/listings/ListingSetupModal.js), so this file can run before or
-- after that deploy. Run NINTH, after db/008, on its own, in the Supabase SQL editor.
-- IDEMPOTENT: every index on the column is dropped by name only while it exists, and the column is
-- dropped IF EXISTS. A second run finds nothing and changes nothing.
-- IRREVERSIBLE for the data: the minimum a realtor once typed is gone. That is the point.

DO $$
DECLARE idx record;
BEGIN
  FOR idx IN
    SELECT c.relname
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
     WHERE n.nspname = 'public'
       AND t.relname = 'listings'
       AND a.attname = 'pref_min_years_at_job'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.relname);
  END LOOP;
END $$;

ALTER TABLE public.listings DROP COLUMN IF EXISTS pref_min_years_at_job;
