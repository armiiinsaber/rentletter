-- db/026-about-me-translation.sql
-- About me in any language. A tenant writes About me in the language they choose; when it is not
-- English, Rentletter prepares an English version, the tenant reads it and approves it, and only
-- then does a realtor read the English, with the tenant's original kept under it
-- (lib/aboutTranslation.js). The original stays where it is, in tenant_profiles.about_me, and
-- this file does not touch it or its 600 character limit.
-- Written by lib/tenantProfileStore.js under the tenant's own session
-- (pages/api/tenant/personal.js); read for a realtor only by the one share reader,
-- lib/profileShareStore.js, through the view below and only behind a share the tenant approved.
-- Run once in the Supabase SQL editor, after db/025-listing-archive.sql.
-- IDEMPOTENT: every column is ADD COLUMN IF NOT EXISTS (nullable, no default, so no existing row
-- is rewritten), each constraint is added only when no constraint of its name exists, the view is
-- CREATE OR REPLACE with the same columns, and the REVOKE repeats without effect. No existing row
-- is changed. A second run changes nothing. Where db/tenant-profiles.sql or
-- db/022-full-tenant-profile.sql has not run there is no About me to translate: the file says so
-- and does nothing.
-- The application tolerates this file not having run: About me is saved and shown as before, no
-- English version is prepared or offered, and a realtor reads the original alone.
--
-- tenant_profiles.about_me_en              the English version, up to 900 characters. Null: none
--                                          (the original is English, or none was prepared, or
--                                          the tenant removed it).
-- tenant_profiles.about_me_lang            the language the tenant wrote in, as a short code
--                                          (fa, ar, fr). Null: English, or not known.
-- tenant_profiles.about_me_en_approved_at  when the tenant approved the English version. Null:
--                                          not approved, and no realtor sees it.
-- A change to the original clears about_me_en and about_me_en_approved_at in the same write
-- (lib/tenantProfileStore.js saveAbout). None of the three is in facts, so none reaches an
-- application, Fit, a score, a document check or a KPI.
--
-- tenant_profile_about_english (view): what the share reader may read. The id, the original, the
-- language, and the English version ONLY once it is approved: before that the view answers null
-- in about_me_en, so an unapproved English version cannot be read through it at all. Nothing
-- else of the profile: never facts, never applications, never an email. security_invoker: the
-- view reads as the caller, so the table's row level security (on, no policy) applies to it.
-- Nothing is granted to anon or authenticated on the view, and no policy is created anywhere:
-- the browser roles read and write none of this. The view tenant_profile_personal (db/022) is
-- not touched, so db/022 still runs again without effect.

DO $$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NULL THEN
    RAISE NOTICE 'db/026: public.tenant_profiles is not there yet. Run db/tenant-profiles.sql and db/022-full-tenant-profile.sql, then this file again.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_profiles' AND column_name = 'about_me') THEN
    RAISE NOTICE 'db/026: tenant_profiles.about_me is not there yet. Run db/022-full-tenant-profile.sql, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS about_me_en text;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS about_me_lang text;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS about_me_en_approved_at timestamptz;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_about_me_en_length') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_about_me_en_length CHECK (about_me_en IS NULL OR char_length(about_me_en) BETWEEN 1 AND 900);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_about_me_lang_code') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_about_me_lang_code CHECK (about_me_lang IS NULL OR about_me_lang ~ '^[a-z]{2,3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_about_me_en_approved_whole') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_about_me_en_approved_whole CHECK (about_me_en_approved_at IS NULL OR about_me_en IS NOT NULL);
  END IF;

  COMMENT ON COLUMN public.tenant_profiles.about_me_en IS 'The English version of about_me, up to 900 characters. Shown to a realtor only once about_me_en_approved_at is set.';
  COMMENT ON COLUMN public.tenant_profiles.about_me_lang IS 'The language the tenant wrote about_me in, as a short code. Null: English, or not known.';
  COMMENT ON COLUMN public.tenant_profiles.about_me_en_approved_at IS 'When the tenant approved about_me_en. Null: not approved.';

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.tenant_profile_about_english WITH (security_invoker = true) AS
    SELECT p.id, p.about_me, p.about_me_lang,
           CASE WHEN p.about_me_en_approved_at IS NOT NULL THEN p.about_me_en END AS about_me_en,
           p.about_me_en_approved_at
    FROM public.tenant_profiles p
  $view$;
  COMMENT ON VIEW public.tenant_profile_about_english IS 'About me for a realtor (lib/profileShareStore.js reads it, only behind an approved share): the original, the language it was written in, and the English version only once the tenant approved it. Never facts, applications or an email.';
  REVOKE ALL ON public.tenant_profile_about_english FROM anon, authenticated;
END $$;
