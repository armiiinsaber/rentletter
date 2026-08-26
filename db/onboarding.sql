-- db/onboarding.sql
-- First run onboarding state + the report signing name. Run once in the Supabase SQL editor.
-- IDEMPOTENT: every column is IF NOT EXISTS and the backfill is guarded, so running it twice is
-- a no-op. ONE statement touches existing rows: the backfill at the end, which marks accounts
-- that are already set up (a display name and a brokerage) as done so nobody who is already
-- working is dragged through onboarding.
--
--   profiles.onboarding_step           null = never started; 'done' = complete; otherwise the slug
--                                      of the NEXT step to show: 'identity' | 'province' | 'branding' | 'listing'
--   profiles.onboarding_completed_at   set once, when the flow finishes (or by the backfill)
--   profiles.province                  'ON' | 'BC' (already present on most databases; guarded)
--   profiles.report_signature          the signing name on landlord reports. NOT backfilled: it
--                                      resolves at render time to full_name when unset
--                                      (lib/reportSignature.js), because some accounts sign
--                                      reports for more than one agent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_step text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS report_signature text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_onboarding_step_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_onboarding_step_check
      CHECK (onboarding_step IS NULL OR onboarding_step IN ('identity', 'province', 'branding', 'listing', 'done'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.report_signature IS 'Signing name on landlord reports. Null = use full_name (lib/reportSignature.js).';

-- ── Backfill: accounts that are already set up skip onboarding ────────────────────────────────
-- THE ONE STATEMENT IN THIS FILE THAT TOUCHES EXISTING ROWS. Scoped to profiles that have both
-- a display name and a brokerage and have never been marked; a second run matches nothing.
UPDATE public.profiles
   SET onboarding_step = 'done', onboarding_completed_at = now()
 WHERE onboarding_step IS NULL
   AND nullif(trim(coalesce(full_name, '')), '') IS NOT NULL
   AND nullif(trim(coalesce(brokerage, '')), '') IS NOT NULL;
