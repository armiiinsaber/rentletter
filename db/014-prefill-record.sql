-- db/014-prefill-record.sql
-- Where a submitted application's answers came from, recorded by the server at submit, so the
-- commitment can count true profile reuse (docs/design/profile-and-circle.md sections 4.7 and 5).
-- Written once per application by pages/api/applications/mirror.js through lib/prefillRecord.js;
-- read by the founder office through lib/kpiStore.js and counted by lib/kpis.js profileReuse.
-- Run once in the Supabase SQL editor.
-- IDEMPOTENT: every column is ADD COLUMN IF NOT EXISTS, every constraint is added only when no
-- constraint of its name exists, and no existing row is changed. A second run changes nothing.
-- The application tolerates this file not having run: the mirror writes no record, and the office
-- keeps the old count with its label "applied twice (reuse not yet tracked)".
--
-- applications, five nullable columns with no default:
--   prefill_source            none                  typed fresh
--                             profile               filled from the tenant's standing profile
--                             previous_application  filled from one earlier application, by its
--                                                   owner token, on the tenant's own device
--                             pipeline_invite       filled from the application a realtor kept,
--                                                   through that realtor's Pipeline invite
--                             pass_on               made from the profile after a pass on (later)
--   prefill_profile_id        the tenant profile the form was filled from (tenant_profiles.id),
--                             set for profile and pass_on only
--   prefill_profile_revision  that profile's profile_revision at the moment of filling
--   email_verified_at_submit  when the tenant proved the email on the application (the magic
--                             link behind the tenant session that was signed in at submit), null
--                             when nobody was signed in with that address
--   reused_checks             the kinds of document check sent from the profile, empty when
--                             only typed answers were reused, null when no profile was used
-- An application from before this file keeps null in all five: unknown, never counted as a reuse.
-- Not to be confused with applications.profile_revision (db/profile-edits.sql), which counts the
-- tenant's edits to that one application.
-- prefill_profile_id carries no foreign key on purpose: a tenant who deletes their profile must
-- not be stopped by, or rewrite, the record of an application already sent, and the id is a
-- random uuid that names nobody once the profile is gone.
-- No Fit result, no protected ground and nothing about a document's contents is stored here.
-- RLS: applications keeps the policies it has. Only the service role writes these columns.

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_source text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_profile_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_profile_revision integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS email_verified_at_submit timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS reused_checks text[];

COMMENT ON COLUMN public.applications.prefill_source IS 'Where the answers came from, decided by the server at submit (lib/prefillRecord.js): none, profile, previous_application, pipeline_invite or pass_on. Null is an application from before db/014: unknown.';
COMMENT ON COLUMN public.applications.prefill_profile_id IS 'The tenant profile (tenant_profiles.id) the form was filled from, for profile and pass_on. No foreign key: the record outlives a deleted profile.';
COMMENT ON COLUMN public.applications.prefill_profile_revision IS 'That profile''s profile_revision when the form was filled. Not applications.profile_revision, which counts edits to this application.';
COMMENT ON COLUMN public.applications.email_verified_at_submit IS 'When the tenant proved this application''s email, if a tenant session for the same address was signed in at submit. Null otherwise.';
COMMENT ON COLUMN public.applications.reused_checks IS 'The kinds of document check sent from the profile with this application. Empty when only typed answers were reused; null when no profile was used.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_source_check') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_source_check CHECK (
      prefill_source IS NULL OR prefill_source IN ('none', 'profile', 'previous_application', 'pipeline_invite', 'pass_on')
    );
  END IF;
  -- A profile source always names its profile and revision; nothing else ever does.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_profile_pair') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_profile_pair CHECK (
      (prefill_source IS NOT NULL AND prefill_source IN ('profile', 'pass_on') AND prefill_profile_id IS NOT NULL AND prefill_profile_revision IS NOT NULL AND prefill_profile_revision >= 0)
      OR ((prefill_source IS NULL OR prefill_source NOT IN ('profile', 'pass_on')) AND prefill_profile_id IS NULL AND prefill_profile_revision IS NULL)
    );
  END IF;
  -- Document checks ride only on a profile source, and a row with no source holds nothing else.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_record_whole') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_record_whole CHECK (
      (reused_checks IS NULL OR prefill_profile_id IS NOT NULL)
      AND (prefill_source IS NOT NULL OR email_verified_at_submit IS NULL)
    );
  END IF;
END $$;

-- The office counts the tenants who reused a profile: the rows that name one.
CREATE INDEX IF NOT EXISTS applications_prefill_profile_idx ON public.applications (prefill_profile_id) WHERE prefill_profile_id IS NOT NULL;
