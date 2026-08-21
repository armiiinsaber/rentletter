-- db/admin-suspend.sql
-- Founder admin (/admin): reversible SUSPEND for a realtor account.
--
-- suspended_at is the flag the dashboard reads. Enforcement is two-layer: the admin action also
-- bans the Supabase auth user (auth.admin.updateUserById ban_duration), so new sign-ins and
-- token refreshes are refused at the auth layer; pages/landlord.js additionally redirects a
-- suspended profile immediately (existing access tokens live ≤1h otherwise).
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, suspend/unsuspend report
-- "column missing" in the admin UI (the auth-layer ban still applies); delete is unaffected.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

COMMENT ON COLUMN public.profiles.suspended_at IS 'Set by the founder admin. Non-null = realtor access suspended (reversible).';
