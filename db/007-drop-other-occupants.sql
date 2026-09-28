-- db/007-drop-other-occupants.sql
-- Removes public.applications.occupants_details, the free text "other occupants" the application
-- form used to collect (docs/lifecycle-audit-2026-09.md, E38): who lives with the applicant can
-- only read as family status, a protected ground under the Ontario Human Rights Code and the BC
-- Human Rights Code. The count, number_of_occupants, stays: it is used only to check the unit's
-- occupancy limit and never enters the Fit. Run SEVENTH, after db/006, on its own, in the
-- Supabase SQL editor. The code stopped writing the column in the same change
-- (lib/applicationMap.js), so this file can run before or after that deploy.
-- IDEMPOTENT: every index on the column is dropped by name only while it exists, and the column
-- is dropped IF EXISTS. A second run finds nothing and changes nothing.
-- IRREVERSIBLE for the data: the text in the column is gone. That is the point.

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
       AND t.relname = 'applications'
       AND a.attname = 'occupants_details'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.relname);
  END LOOP;
END $$;

ALTER TABLE public.applications DROP COLUMN IF EXISTS occupants_details;
