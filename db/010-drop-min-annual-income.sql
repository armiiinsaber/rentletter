-- db/010-drop-min-annual-income.sql
-- Removes public.listings.pref_min_annual_income, the "Minimum annual income" criterion. Legal
-- basis: the Ontario Human Rights Commission's Policy on Human Rights and Rental Housing says a
-- rent to income cutoff is illegal outside subsidized housing, and Ontario Regulation 290/98 says
-- income can never be the sole reason to refuse an applicant; a fixed income floor on a listing is
-- that cutoff. Affordability against this unit's rent stays in Fit (lib/fitScore.js), which has
-- not read this column since Fit v2. The code stopped reading and writing it in the same change
-- (lib/realtorWrites.js, lib/supabaseBridge.js, components/listings/ListingSetupModal.js), so this
-- file can run before or after that deploy. Run TENTH, after db/009, on its own, in the Supabase
-- SQL editor.
-- IDEMPOTENT: every index on the column is dropped by name only while it exists, and the column is
-- dropped IF EXISTS. A second run finds nothing and changes nothing.
-- IRREVERSIBLE for the data: the floor a realtor once typed is gone. That is the point.

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
       AND a.attname = 'pref_min_annual_income'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.relname);
  END LOOP;
END $$;

ALTER TABLE public.listings DROP COLUMN IF EXISTS pref_min_annual_income;
