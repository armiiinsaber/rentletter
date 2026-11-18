-- db/015-profile-verified-email.sql
-- The tenant profile learns when its email was proved and when the tenant was last there, its
-- facts can never hold a Fit result, and a view gives realtor facing code the only part of a
-- profile it may ever read (docs/design/profile-and-circle.md sections 4.1, 4.12, 6.2 and 6.3).
-- Written by lib/tenantProfileStore.js (the magic link, a confirmed change of address); the view
-- is read by lib/profileShareStore.js and by nothing else. Run once in the Supabase SQL editor,
-- after db/tenant-profiles.sql.
-- IDEMPOTENT: the columns are ADD COLUMN IF NOT EXISTS, the constraint is added only when no
-- constraint of its name exists, the view is CREATE OR REPLACE with the same columns, and no
-- existing row is changed. A second run changes nothing. Where db/tenant-profiles.sql has not run
-- there is no table to change: the file says so and does nothing.
-- The application tolerates this file not having run: the proof of the address is kept in the
-- profile's KV record and written to the row without the new columns
-- (lib/tenantProfileStore.js), and a share read answers that the view is absent.
--
-- tenant_profiles:
--   email_verified_at  when the tenant proved this address: the magic link sent to it was used,
--                      or the link confirming a change to it. Null for a profile that only ever
--                      came from a submission: nothing proved, never treated as proved.
--   last_active_at     when the tenant was last signed in, written at most once a day.
--   tenant_profiles_no_fit_result   facts never holds a Fit score, a rank or a criterion.
--
-- tenant_profile_shareable (view): id, when the email was proved, when the facts were last
-- updated, and facts cut down to the keys of lib/profileFacts.js PROFILE_FACT_KEYS. It never
-- selects applications (which holds owner tokens), the email column, or any other key of facts:
-- no household size, age, date of birth, relationship, pets, smoker, net income, current rent or
-- personal reference can be read through it, whatever a later query asks for.
-- tests/profileFacts.test.mjs compares the list below with the code's.
-- security_invoker: the view reads as the caller, so the table's row level security (on, no
-- policy) still applies; and nothing is granted to anon or authenticated. Service role only.

DO $$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NULL THEN
    RAISE NOTICE 'db/015: public.tenant_profiles is not there yet. Run db/tenant-profiles.sql, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
  COMMENT ON COLUMN public.tenant_profiles.email_verified_at IS 'When the tenant proved this address (the magic link, or the link confirming a change of address). Null: nothing proved.';
  COMMENT ON COLUMN public.tenant_profiles.last_active_at IS 'When the tenant was last signed in, written at most once a day (lib/tenantProfileStore.js).';

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_no_fit_result') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_no_fit_result CHECK (
      NOT (COALESCE(facts, '{}'::jsonb) ?| ARRAY['fit', 'fitScore', 'fit_score', 'score', 'scorecard', 'criteria', 'rank', 'ranking'])
    );
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.tenant_profile_shareable WITH (security_invoker = true) AS
    SELECT
      p.id,
      p.email_verified_at,
      p.facts_updated_at,
      COALESCE((
        SELECT jsonb_object_agg(f.key, f.value)
        FROM jsonb_each(CASE WHEN jsonb_typeof(p.facts) = 'object' THEN p.facts ELSE '{}'::jsonb END) AS f(key, value)
        WHERE f.key IN ('fullName', 'email', 'phone', 'employer', 'jobTitle', 'employmentType', 'yearsAtJob', 'annualIncome', 'previousAddress', 'yearsAtPrevious', 'previousLandlordName', 'previousLandlordContact', 'moveInDate')
      ), '{}'::jsonb) AS facts
    FROM public.tenant_profiles p
  $view$;
  COMMENT ON VIEW public.tenant_profile_shareable IS 'The only part of a tenant profile realtor facing code may read (lib/profileShareStore.js): facts cut down to lib/profileFacts.js PROFILE_FACT_KEYS. Never applications, never owner tokens. Service role only.';
  REVOKE ALL ON public.tenant_profile_shareable FROM anon, authenticated;
END $$;
