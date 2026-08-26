-- db/billing-and-promos.sql
-- Billing state on profiles + personalised promo codes. Run once in the Supabase SQL editor.
-- IDEMPOTENT: every statement is IF NOT EXISTS / OR REPLACE / guarded, so running it twice is a
-- no-op. ONE statement touches existing rows — the backfill at the very end, which moves the
-- legacy first-50 founders to plan = 'founding'; every other existing profile stays at 'none'.
--
--   profiles.plan            'none' | 'founding' | 'trial' | 'paid'   (lib/entitlements.js is the
--                            ONLY reader that turns this into access — nothing else reads it)
--   promo_codes              one row per person you invite; lifetime codes are capped at 10 ACTIVE
--                            (enforced by trigger, not just the UI)
--   promo_redemptions        who redeemed what, when; one row per (code, profile)
--   redeem_promo_code(...)   the ONLY write path: locks the code row, checks everything, writes the
--                            redemption, bumps the count and grants the plan in ONE transaction, so
--                            a double submit can never grant twice.
-- Both tables are service-role only (RLS enabled, no policies) — realtors can never read them.

-- ── profiles: billing state ───────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS promo_code_used text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status text;  -- mirrors Stripe; null until checkout ships

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('none', 'founding', 'trial', 'paid'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.plan IS 'none | founding | trial | paid. Access is derived ONLY by lib/entitlements.js getEntitlement().';

-- ── promo_codes ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,            -- lowercase, url-safe: rentletter-alex
  label             text,                            -- what the founder sees: "Alex Moreau, Right at Home"
  recipient_name    text,                            -- rendered on /join/<code>
  grant_type        text NOT NULL,                   -- 'lifetime' | 'trial'
  trial_days        integer,                         -- required for trial, null otherwise
  max_redemptions   integer NOT NULL DEFAULT 1,
  redemption_count  integer NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT promo_codes_grant_type CHECK (grant_type IN ('lifetime', 'trial')),
  CONSTRAINT promo_codes_trial_days CHECK (
    (grant_type = 'trial' AND trial_days IS NOT NULL AND trial_days BETWEEN 1 AND 365)
    OR (grant_type = 'lifetime' AND trial_days IS NULL)
  ),
  CONSTRAINT promo_codes_max_redemptions CHECK (max_redemptions >= 1),
  CONSTRAINT promo_codes_redemption_count CHECK (redemption_count >= 0)
);
CREATE INDEX IF NOT EXISTS promo_codes_lower_code_idx ON public.promo_codes (lower(code));
CREATE INDEX IF NOT EXISTS promo_codes_created_idx ON public.promo_codes (created_at DESC);

-- ── promo_redemptions ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, profile_id)
);
CREATE INDEX IF NOT EXISTS promo_redemptions_profile_idx ON public.promo_redemptions (profile_id);

-- ── RLS: service role only. RLS on + no policies = anon/authenticated see nothing. ────────────
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;
REVOKE ALL ON public.promo_redemptions FROM anon, authenticated;

-- ── Cap: at most 10 ACTIVE lifetime codes, enforced in the database ──────────────────────────
CREATE OR REPLACE FUNCTION public.promo_codes_enforce_lifetime_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  -- Only when this row would BECOME an active lifetime code.
  IF NEW.active AND NEW.grant_type = 'lifetime'
     AND (TG_OP = 'INSERT' OR NOT (OLD.active AND OLD.grant_type = 'lifetime')) THEN
    -- Serialise concurrent inserts so two requests can't both see 9 and both succeed.
    PERFORM pg_advisory_xact_lock(hashtext('promo_codes_lifetime_cap'));
    SELECT count(*) INTO n FROM public.promo_codes WHERE active AND grant_type = 'lifetime' AND id <> NEW.id;
    IF n >= 10 THEN
      RAISE EXCEPTION 'Lifetime code limit reached: 10 active lifetime codes already exist. Revoke one first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS promo_codes_lifetime_cap ON public.promo_codes;
CREATE TRIGGER promo_codes_lifetime_cap
  BEFORE INSERT OR UPDATE OF active, grant_type ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.promo_codes_enforce_lifetime_cap();

-- ── Atomic redemption ─────────────────────────────────────────────────────────────────────────
-- Called by lib/promos.js with the service role only (REVOKEd from anon/authenticated below).
-- Returns a status word; the caller maps it to a message. Everything happens in one transaction:
--   1. lock the code row (FOR UPDATE) — concurrent redeems of the same code serialise here
--   2. the profile must exist and must never have redeemed ANY code
--   3. the code must be active with redemptions remaining
--   4. insert the redemption (UNIQUE (code, profile) is the last line of defence), bump the
--      count, grant the plan
-- A double submit either waits on the lock and then sees the redemption (→ 'already_redeemed'),
-- or hits the unique constraint (→ 'already_redeemed'). It can never grant twice.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text, p_profile_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.promo_codes%ROWTYPE; p_plan text;
BEGIN
  SELECT * INTO c FROM public.promo_codes WHERE lower(code) = lower(trim(p_code)) FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF NOT c.active THEN RETURN 'inactive'; END IF;
  IF c.redemption_count >= c.max_redemptions THEN RETURN 'exhausted'; END IF;
  SELECT plan INTO p_plan FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_profile'; END IF;
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE profile_id = p_profile_id) THEN RETURN 'already_redeemed'; END IF;
  BEGIN
    INSERT INTO public.promo_redemptions (promo_code_id, profile_id) VALUES (c.id, p_profile_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'already_redeemed';
  END;
  UPDATE public.promo_codes SET redemption_count = redemption_count + 1 WHERE id = c.id;
  IF c.grant_type = 'lifetime' THEN
    UPDATE public.profiles SET plan = 'founding', trial_ends_at = NULL, promo_code_used = c.code WHERE id = p_profile_id;
    RETURN 'granted_lifetime';
  ELSE
    UPDATE public.profiles SET plan = 'trial', trial_ends_at = now() + make_interval(days => c.trial_days), promo_code_used = c.code WHERE id = p_profile_id;
    RETURN 'granted_trial';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text, uuid) TO service_role;

-- ── Backfill: legacy founders → plan = 'founding' ─────────────────────────────────────────────
-- THE ONE STATEMENT IN THIS FILE THAT TOUCHES EXISTING ROWS. The first-50 founders were recorded
-- under the old scheme (is_founder / subscription_status = 'founder'); from here on plan is the
-- only thing that decides founding status (lib/entitlements.js no longer reads the old flags).
-- Idempotent and scoped: only rows still at plan = 'none' qualify, so a second run matches
-- nothing, and nobody who isn't a legacy founder is touched.
UPDATE public.profiles
   SET plan = 'founding', trial_ends_at = NULL
 WHERE plan = 'none'
   AND (is_founder IS TRUE OR subscription_status = 'founder');
