-- db/016-drop-application-defaults.sql
-- Three columns of public.applications carry a default that states a fact nobody gave:
--   number_of_occupants  '1'    a household of one
--   smoker               'no'   a non smoker
--   "references"         '[]'   no references
-- A row written without one of them would read as if the tenant had answered. Null means unknown,
-- so the defaults go: a column nobody wrote reads null.
-- Every write of an application goes through lib/supabaseBridge.js upsertApplication, which sends
-- all three columns on every call (lib/applicationMap.js kvAppToRow), so no path relies on a
-- default and the application behaves the same whether or not this file has run.
-- Run once in the Supabase SQL editor.
-- IDEMPOTENT: a default is dropped only where the column exists and still has one, and
-- ALTER COLUMN ... DROP DEFAULT on a column with none changes nothing. No row is changed: a value
-- already stored, default or not, stays as it is. No type, NOT NULL, constraint or index moves.
-- A second run changes nothing. Where a column is not there, it is skipped.

DO $$
DECLARE
  col text;
BEGIN
  IF to_regclass('public.applications') IS NULL THEN
    RAISE NOTICE 'db/016: public.applications is not there. Nothing to do.';
    RETURN;
  END IF;
  FOREACH col IN ARRAY ARRAY['number_of_occupants', 'smoker', 'references'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = col AND column_default IS NOT NULL
    ) THEN
      EXECUTE format('ALTER TABLE public.applications ALTER COLUMN %I DROP DEFAULT', col);
    END IF;
  END LOOP;
END $$;
