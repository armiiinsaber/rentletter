-- db/004-application-state-reconsider.sql
-- Two amendments to the application state foundation. Run FOURTH, after
-- db/001-application-state-enums.sql, db/002-application-state-tables.sql and
-- db/003-application-state-backfill.sql, on its own, in the Supabase SQL editor.
-- IDEMPOTENT: the enum value is added with IF NOT EXISTS, the income kinds are rebuilt only
-- while the removed value is still in the type, and the check constraint is added only when it
-- is missing. A second run changes nothing. It needs db/001 to have run (the types must
-- exist); it works whether or not db/002 and db/003 have, and db/001 can be run again
-- afterwards without undoing it.
-- Undo: db/999-application-state-rollback.sql.

-- ── 1. The reconsidered state ────────────────────────────────────────────────────
-- An applicant who was told no can be looked at again when the deal with someone else falls
-- through. The rules live in lib/application-state.js and are asserted on the server before any
-- write: entered from not_selected only, by a realtor only, while the listing is live only, with
-- a reason, and with one application_events row. From reconsidered the ways out are shortlisted,
-- withdrawn_by_applicant, or back to not_selected. It restores no document and no access.
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'reconsidered';

-- ── 2. income_sources.kind: employment, self_employed, other ───────────────────────
-- Postgres cannot drop one value from an enum, so where the removed value is still in the type
-- the type is rebuilt: the column becomes text, any row carrying the removed value becomes
-- other (nothing writes this table yet, so none is expected), the type is dropped and created
-- again with the three permitted values, and the column takes the type back.
DO $$
DECLARE has_table boolean := to_regclass('public.income_sources') IS NOT NULL;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'income_source_kind' AND e.enumlabel NOT IN ('employment', 'self_employed', 'other')
  ) THEN
    IF has_table THEN
      ALTER TABLE public.income_sources DROP CONSTRAINT IF EXISTS income_sources_kind_permitted;
      ALTER TABLE public.income_sources ALTER COLUMN kind TYPE text USING kind::text;
      UPDATE public.income_sources SET kind = 'other' WHERE kind NOT IN ('employment', 'self_employed', 'other');
    END IF;
    DROP TYPE public.income_source_kind;
    CREATE TYPE public.income_source_kind AS ENUM ('employment', 'self_employed', 'other');
    IF has_table THEN
      ALTER TABLE public.income_sources ALTER COLUMN kind TYPE public.income_source_kind USING kind::public.income_source_kind;
    END IF;
  END IF;
END $$;

-- The same three values as a check on the column, so the rule holds even if a value is ever
-- added to the type again.
DO $$ BEGIN
  IF to_regclass('public.income_sources') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_sources_kind_permitted' AND conrelid = to_regclass('public.income_sources')) THEN
      ALTER TABLE public.income_sources ADD CONSTRAINT income_sources_kind_permitted CHECK (kind::text IN ('employment', 'self_employed', 'other'));
    END IF;
  END IF;
END $$;

COMMENT ON TYPE public.income_source_kind IS 'employment, self_employed, other. How to read an amount. Never a score input, never a rank, never a filter.';

-- 3. What to look at afterwards (read only): the values each type carries now.
SELECT t.typname AS type, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS labels
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typname IN ('application_state', 'income_source_kind')
GROUP BY t.typname ORDER BY 1;
