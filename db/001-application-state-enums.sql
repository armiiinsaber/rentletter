-- db/001-application-state-enums.sql
-- The enums behind lib/application-state.js. Run FIRST, on its own, in the Supabase SQL editor,
-- then db/002-application-state-tables.sql, then db/003-application-state-backfill.sql.
-- IDEMPOTENT: each type is created only when it is missing, and every value is added with
-- ADD VALUE IF NOT EXISTS, so a second run changes nothing. Nothing here touches a table or a row.
-- The values MUST match lib/application-state.js (tests/applicationState.test.mjs compares them).
-- Undo: db/999-application-state-rollback.sql.

-- 1. The state of one application on one listing (public.listing_applicants.state).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'application_state') THEN
    CREATE TYPE public.application_state AS ENUM ('draft');
  END IF;
END $$;
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'docs_pending';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'shortlisted';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'agreement_signed';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'deposit_received';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'lease_signed';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'moved_in';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'not_selected';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'withdrawn_by_applicant';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'withdrawn_by_realtor';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'fell_through';
ALTER TYPE public.application_state ADD VALUE IF NOT EXISTS 'expired';

-- 2. The state of a listing (public.listings.state).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'listing_state') THEN
    CREATE TYPE public.listing_state AS ENUM ('draft');
  END IF;
END $$;
ALTER TYPE public.listing_state ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.listing_state ADD VALUE IF NOT EXISTS 'live';
ALTER TYPE public.listing_state ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.listing_state ADD VALUE IF NOT EXISTS 'rented';
ALTER TYPE public.listing_state ADD VALUE IF NOT EXISTS 'withdrawn';

-- 3. The people on one application (public.application_parties.role).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'application_party_role') THEN
    CREATE TYPE public.application_party_role AS ENUM ('primary');
  END IF;
END $$;
ALTER TYPE public.application_party_role ADD VALUE IF NOT EXISTS 'primary';
ALTER TYPE public.application_party_role ADD VALUE IF NOT EXISTS 'co_applicant';
ALTER TYPE public.application_party_role ADD VALUE IF NOT EXISTS 'guarantor';
ALTER TYPE public.application_party_role ADD VALUE IF NOT EXISTS 'occupant';

-- 4. How to read an income amount (public.income_sources.kind). It says what the number is.
--    It is never a score input, never a rank and never a filter.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'income_source_kind') THEN
    CREATE TYPE public.income_source_kind AS ENUM ('employment');
  END IF;
END $$;
ALTER TYPE public.income_source_kind ADD VALUE IF NOT EXISTS 'employment';
ALTER TYPE public.income_source_kind ADD VALUE IF NOT EXISTS 'self_employed';
ALTER TYPE public.income_source_kind ADD VALUE IF NOT EXISTS 'pension';
ALTER TYPE public.income_source_kind ADD VALUE IF NOT EXISTS 'other';

-- 5. Who moved an application (public.application_events.actor_type).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'application_actor_type') THEN
    CREATE TYPE public.application_actor_type AS ENUM ('realtor');
  END IF;
END $$;
ALTER TYPE public.application_actor_type ADD VALUE IF NOT EXISTS 'realtor';
ALTER TYPE public.application_actor_type ADD VALUE IF NOT EXISTS 'applicant';
ALTER TYPE public.application_actor_type ADD VALUE IF NOT EXISTS 'system';
