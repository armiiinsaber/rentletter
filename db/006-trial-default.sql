-- db/006-trial-default.sql
-- A new profile starts on the 7 day trial. Run SIXTH, after db/001 to db/005, on its own, in the
-- Supabase SQL editor. Before this file public.profiles.plan defaulted to none
-- (db/billing-and-promos.sql line 18), so a plain sign up met the paywall at once; CLAUDE.md
-- says later signups get a 7 day trial (docs/lifecycle-audit-2026-09.md, E16).
-- IDEMPOTENT: the default and the trigger are replaced in place, and the backfill matches only a
-- profile still at none with no trial history, which a first run leaves none of. Nothing is
-- removed. lib/entitlements.js getEntitlement stays the only reader that turns plan into access.
--
-- WHAT IT DOES
--   1. plan defaults to trial.
--   2. On insert, a profile arriving at none or with no plan is put on trial, and a profile on
--      trial with no end date gets trial_ends_at = now() + 7 days. founding and paid pass through
--      untouched, and an explicit trial_ends_at is kept (a promo code sets its own).
--   3. Every existing profile at none with no trial history (no trial_ends_at, no promo code, no
--      Stripe customer, no subscription, no subscription status) gets the same 7 days from now.
--      A lapsed trial keeps its trial_ends_at and is left alone; a canceled subscription keeps its
--      status and is left alone.

-- 1. The default.
ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'trial';

-- 2. The insert rule.
CREATE OR REPLACE FUNCTION public.profiles_start_trial() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.plan IS NULL OR NEW.plan = 'none' THEN
    NEW.plan := 'trial';
  END IF;
  IF NEW.plan = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + interval '7 days';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_start_trial ON public.profiles;
CREATE TRIGGER profiles_start_trial
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_start_trial();

COMMENT ON FUNCTION public.profiles_start_trial() IS 'A new profile starts on the 7 day trial (db/006-trial-default.sql). founding and paid pass through untouched.';

-- 3. The backfill: the profiles that never had a plan and never had a trial.
UPDATE public.profiles
   SET plan = 'trial',
       trial_ends_at = now() + interval '7 days'
 WHERE plan = 'none'
   AND trial_ends_at IS NULL
   AND promo_code_used IS NULL
   AND stripe_customer_id IS NULL
   AND stripe_subscription_id IS NULL
   AND subscription_status IS NULL;
