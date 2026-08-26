-- db/founder-renumber.sql
-- Founder numbers stay a contiguous 1..N. When a founder (one of the first 50) is deleted from
-- /admin, the founders after them shift down by one, in signup order; each shift is recorded
-- here so the history ("now #2, was #3") stays visible in /admin. Accounts beyond the founder
-- cohort keep their plain number and are never renumbered.
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, renumbering still updates
-- signup_number; the admin action reports "history column missing" and the prior numbers are
-- kept only in the admin audit trail.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_number_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.signup_number_history IS
  'Prior founder numbers, oldest first: [{"from":3,"to":2,"at":"2026-08-26T…Z","reason":"renumber","deleted":["<profile id>"]}]. Appended by the founder admin on delete; never edited by the app otherwise.';

-- NOTE on the next signup number. profiles.signup_number is assigned OUTSIDE this repo (a Supabase
-- trigger on profile creation — there is no insert of signup_number anywhere in the app code).
-- After a renumber the founders occupy exactly 1..N, so:
--   • if the trigger assigns max(signup_number)+1 (or count+1), the next signup gets the right
--     number with no change needed;
--   • if it reads a Postgres SEQUENCE, the sequence still holds the old high-water mark and the
--     next signup would SKIP a number. In that case reset it after the first renumber:
--       SELECT setval('<sequence name>', (SELECT coalesce(max(signup_number), 0) FROM public.profiles));
-- Check with:  SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;
