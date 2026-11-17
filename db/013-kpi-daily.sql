-- db/013-kpi-daily.sql
-- The commitment, counted once a day: one row per Toronto date in public.kpi_daily, and where a
-- realtor first came from in profiles.signup_source. Read by the founder office (pages/admin.js,
-- components/admin/Commitment.js, lib/kpiStore.js); written by the daily cron
-- (pages/api/cron/kpi-snapshot.js) and the auth callback (pages/auth/callback.js,
-- lib/signupSource.js). Every number in a row comes from lib/kpis.js; none is typed by hand.
-- Run once in the Supabase SQL editor.
-- IDEMPOTENT: every statement is IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS followed by
-- its CREATE, or guarded by name, and no existing row is changed. A second run changes nothing.
-- The application tolerates this file not having run: the office counts live and says the history
-- starts once the table exists, the cron answers that the table is not set up, and a new profile's
-- first touch is simply not recorded (it reads unknown).
--
-- kpi_daily, one row per Toronto date (America/Toronto), replaced if the cron runs twice that day:
--   active_realtors_mtd, active_realtors_last_month   realtors with a listing that received a
--                                                     submitted application: this month to date,
--                                                     and the last complete month
--   rentals_closed_mtd, rentals_closed_last_month     listings with a tenant confirmed, less the
--                                                     ones that fell through in the same month
--   streak_months                                     complete months in a row, back from the last
--                                                     complete one, with both targets met
--   profile_reuse, profile_reuse_tracked              all time; tracked is false while the count is
--                                                     tenants who applied to two or more listings
--   signups_*, referral_signups_*, referral_share_*   new realtors, those with a known first touch,
--                                                     those who arrived by referral, and the share
--                                                     (null when no first touch is known)
--   days_left                                         to November 17, 2027
-- Service role only: RLS on, no policy, nothing granted to anon or authenticated.
--
-- profiles.signup_source: nullable. One short word from a closed list, or ref: and a link's code.
-- Never a URL, a query string, a token or anything about a tenant. A profile from before this file
-- stays null and counts as unknown, never as not a referral.

CREATE TABLE IF NOT EXISTS public.kpi_daily (
  day                         date PRIMARY KEY,
  active_realtors_mtd         integer NOT NULL DEFAULT 0 CHECK (active_realtors_mtd >= 0),
  active_realtors_last_month  integer NOT NULL DEFAULT 0 CHECK (active_realtors_last_month >= 0),
  rentals_closed_mtd          integer NOT NULL DEFAULT 0 CHECK (rentals_closed_mtd >= 0),
  rentals_closed_last_month   integer NOT NULL DEFAULT 0 CHECK (rentals_closed_last_month >= 0),
  streak_months               integer NOT NULL DEFAULT 0 CHECK (streak_months >= 0),
  profile_reuse               integer NOT NULL DEFAULT 0 CHECK (profile_reuse >= 0),
  profile_reuse_tracked       boolean NOT NULL DEFAULT false,
  signups_mtd                 integer NOT NULL DEFAULT 0 CHECK (signups_mtd >= 0),
  signups_known_mtd           integer NOT NULL DEFAULT 0 CHECK (signups_known_mtd >= 0),
  referral_signups_mtd        integer NOT NULL DEFAULT 0 CHECK (referral_signups_mtd >= 0),
  referral_share_mtd          numeric(5,4) CHECK (referral_share_mtd IS NULL OR (referral_share_mtd >= 0 AND referral_share_mtd <= 1)),
  signups_last_month          integer NOT NULL DEFAULT 0 CHECK (signups_last_month >= 0),
  signups_known_last_month    integer NOT NULL DEFAULT 0 CHECK (signups_known_last_month >= 0),
  referral_signups_last_month integer NOT NULL DEFAULT 0 CHECK (referral_signups_last_month >= 0),
  referral_share_last_month   numeric(5,4) CHECK (referral_share_last_month IS NULL OR (referral_share_last_month >= 0 AND referral_share_last_month <= 1)),
  days_left                   integer NOT NULL CHECK (days_left >= 0),
  computed_at                 timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kpi_daily IS 'The commitment, counted once a day: one row per Toronto date, every figure from lib/kpis.js. Service role only.';
COMMENT ON COLUMN public.kpi_daily.day IS 'The date in America/Toronto the row was counted on. One row per date; the daily cron upserts it.';
COMMENT ON COLUMN public.kpi_daily.profile_reuse_tracked IS 'False while profile_reuse counts tenants with applications on two or more listings; true once an application records that it reused a saved profile.';
COMMENT ON COLUMN public.kpi_daily.referral_share_mtd IS 'referral_signups_mtd over signups_known_mtd, null when no new realtor has a known first touch.';

-- Service role only: RLS on with no policy, and nothing for the browser roles.
ALTER TABLE public.kpi_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kpi_daily FROM anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_source text;
COMMENT ON COLUMN public.profiles.signup_source IS 'Where this realtor first came from (lib/signupSource.js): direct, invite, realtor_referral, apply, report, my_application, tenant_page, landlord_page, or ref: and a link''s code. Null is unknown. Never a URL or anything about a tenant.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_signup_source_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_signup_source_check CHECK (
      signup_source IS NULL
      OR signup_source ~ '^(direct|invite|realtor_referral|apply|report|my_application|tenant_page|landlord_page|ref:[A-Za-z0-9_-]{1,32})$'
    );
  END IF;
END $$;

-- profiles_update_own lets a signed in realtor update their own row from the browser. The first
-- touch is written by the server only: from the browser roles the column keeps the value it had,
-- whatever the update names. Nothing is refused, so no existing profile write can start failing.
CREATE OR REPLACE FUNCTION public.profiles_keep_signup_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN NEW.signup_source := OLD.signup_source; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_keep_signup_source ON public.profiles;
CREATE TRIGGER profiles_keep_signup_source BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_keep_signup_source();
