-- db/017-realtor-invites.sql
-- Invite a realtor: every realtor has one personal invite link, and a realtor who signs up from
-- it is recorded as invited by the link's owner. One level only: who brought whom in, and nothing
-- about anyone further along. No reward is stored or implied here. This is not the tenant
-- referral system (db/referrals.sql), which passes a tenant between realtors and is not touched.
-- Written by lib/realtorInvite.js (the code, the first time a realtor opens the invite section)
-- and lib/signupSource.js recordSignupSource (the credit, once, in the auth callback); read by
-- pages/api/profile/invite.js and by the founder office (lib/kpiStore.js, lib/kpis.js).
-- Run once in the Supabase SQL editor, after db/013-kpi-daily.sql.
-- IDEMPOTENT: the columns are ADD COLUMN IF NOT EXISTS, the indexes CREATE INDEX IF NOT EXISTS,
-- each constraint is added only when no constraint of its name exists, the function is CREATE OR
-- REPLACE and its trigger is DROP ... IF EXISTS followed by its CREATE. No existing row is
-- changed: both columns are nullable with no default. A second run changes nothing.
-- The application tolerates this file not having run: the invite section does not appear, an
-- invite link opens the ordinary signup, a new profile's first touch is written without a credit,
-- and the office says invites are not recorded yet.
--
-- profiles.invite_code   nullable text, unique. 16 characters from an alphabet with no look
--                        alikes (lib/signupSource.js INVITE_CODE): not the profile's id, not its
--                        email, not derived from either. A profile from before this file has
--                        none until its realtor first opens the invite section. Once set it
--                        never changes.
-- profiles.invited_by    nullable uuid, the profile whose link this realtor signed up from. Set
--                        once, at signup, by the server. Never the profile itself. Once set it
--                        never changes; it empties only if the inviting profile is deleted.
--
-- Row level security is left exactly as it is: profiles_select_own lets a signed in realtor read
-- their own row and no other, so a realtor can read their own invite_code and nobody else's, and
-- no policy is added that would open another profile's row. The list of realtors someone invited
-- is answered by the server (pages/api/profile/invite.js), keyed by the caller's own id, as a
-- name and a join date and nothing else.
-- profiles_update_own lets a realtor update their own row from the browser: the trigger below
-- keeps both columns as they were on any write from a browser role, whatever the write names.
-- Nothing is refused, so no existing profile write can start failing.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invite_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_by uuid;
COMMENT ON COLUMN public.profiles.invite_code IS 'Invite a realtor: this realtor''s one stable invite code (lib/realtorInvite.js), made by the server the first time they open the invite section. Their link is /join?invite=<code>. Null until then. Never changes once set.';
COMMENT ON COLUMN public.profiles.invited_by IS 'Invite a realtor: the profile whose invite link this realtor signed up from (lib/signupSource.js recordSignupSource). Set once, at signup, by the server. Null: nobody is credited. One level only.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_invite_code_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_invite_code_check CHECK (invite_code IS NULL OR invite_code ~ '^[A-HJKMNP-Z2-9]{16}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_invited_by_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_not_invited_by_self') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_not_invited_by_self CHECK (invited_by IS NULL OR invited_by <> id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_code_key ON public.profiles (invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_invited_by_idx ON public.profiles (invited_by) WHERE invited_by IS NOT NULL;

-- Both columns are the server's. From a browser role they keep the value they had, on an update
-- and on an insert alike. From any role, a code that is set stays that code and a credit that is
-- set stays that credit: the one change let through is the foreign key emptying invited_by when
-- the inviting profile no longer exists.
CREATE OR REPLACE FUNCTION public.profiles_keep_invite() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('anon', 'authenticated') THEN NEW.invite_code := NULL; NEW.invited_by := NULL; END IF;
    RETURN NEW;
  END IF;
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.invite_code := OLD.invite_code; NEW.invited_by := OLD.invited_by;
    RETURN NEW;
  END IF;
  IF OLD.invite_code IS NOT NULL THEN NEW.invite_code := OLD.invite_code; END IF;
  IF OLD.invited_by IS NOT NULL AND NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
    IF NOT (NEW.invited_by IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.invited_by)) THEN
      NEW.invited_by := OLD.invited_by;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_keep_invite ON public.profiles;
CREATE TRIGGER profiles_keep_invite BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_keep_invite();
