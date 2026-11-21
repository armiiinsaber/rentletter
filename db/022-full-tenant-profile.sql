-- db/022-full-tenant-profile.sql
-- The full tenant profile: a photo, a few words about themselves, an offer to prepay rent, and
-- whether a realtor may put the words and the offer in a report to a landlord. Every one is the
-- tenant's own choice, optional, and theirs to change or remove at any time. None of them is in
-- facts, so none reaches an application, Fit, a document check or any reading by AI.
-- Written by lib/tenantProfileStore.js (the words, the offer, the switch) and lib/tenantVault.js
-- (the photo's file and its three columns) under the tenant's own session
-- (pages/api/tenant/personal.js); read for a realtor only by the one share reader,
-- lib/profileShareStore.js, through the view below and only behind a share the tenant approved.
-- Run once in the Supabase SQL editor, after db/021-realtor-circle.sql.
-- IDEMPOTENT: every column is ADD COLUMN IF NOT EXISTS (nullable, no default, so no existing row
-- is rewritten), each constraint is added only when no constraint of its name exists, the view is
-- CREATE OR REPLACE with the same columns, and the REVOKE repeats without effect. No existing row
-- is changed. A second run changes nothing. Where db/tenant-profiles.sql has not run there is no
-- profile to add to: the file says so and does nothing.
-- The application tolerates this file not having run: the profile page says the photo, the
-- words and the offer are not available yet, a realtor's shared view shows the facts as before,
-- and the landlord report is as before.
--
-- tenant_profiles.about_me            the tenant's own words, up to 600 characters. Null: none.
-- tenant_profiles.prepay_months       the tenant's own offer to prepay rent, 1 to 12 months.
--                                     Null: no offer. Never a deposit, never a requirement.
-- tenant_profiles.landlord_report_ok  false: the words and the offer never go on a report to a
--                                     landlord. Null or true: a realtor the tenant shares with
--                                     may include them. The photo never goes on a report.
-- tenant_profiles.photo_path          where the photo sits in the private bucket tenant-vault
--                                     (db/018): {profile id}/photo-{uuid}.{ext}. Never a
--                                     filename, an email or a token. Null: no photo.
-- tenant_profiles.photo_mime, photo_added_at   its type (JPEG or PNG) and when it was added.
--
-- tenant_profile_personal (view): id and the six columns above, and nothing else of the profile:
-- never facts, never applications (which hold each application's owner token), never an email.
-- security_invoker: the view reads as the caller, so the table's row level security (on, no
-- policy) applies to it. Nothing is granted to anon or authenticated on the view, and no policy
-- is created anywhere: the browser roles read and write none of this. The photo's file is in the
-- bucket tenant-vault, which is private with no storage policy (db/018): no link to it is ever
-- made, and the server sends its bytes only to the tenant or through a share.

DO $$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NULL THEN
    RAISE NOTICE 'db/022: public.tenant_profiles is not there yet. Run db/tenant-profiles.sql, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS about_me text;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS prepay_months smallint;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS landlord_report_ok boolean;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS photo_path text;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS photo_mime text;
  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS photo_added_at timestamptz;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_about_me_length') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_about_me_length CHECK (about_me IS NULL OR char_length(about_me) BETWEEN 1 AND 600);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_prepay_months_range') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_prepay_months_range CHECK (prepay_months IS NULL OR prepay_months BETWEEN 1 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_photo_whole') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_photo_whole CHECK (
      (photo_path IS NULL AND photo_mime IS NULL AND photo_added_at IS NULL)
      OR (photo_path IS NOT NULL AND photo_mime IN ('image/jpeg', 'image/png') AND photo_added_at IS NOT NULL AND photo_path LIKE id::text || '/photo-%')
    );
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.tenant_profile_personal WITH (security_invoker = true) AS
    SELECT p.id, p.about_me, p.prepay_months, p.landlord_report_ok, p.photo_path, p.photo_mime, p.photo_added_at
    FROM public.tenant_profiles p
  $view$;
  COMMENT ON VIEW public.tenant_profile_personal IS 'What a tenant chose to say about themselves (lib/profileShareStore.js reads it for a realtor, only behind an approved share): their own words, their offer to prepay rent, whether both may go on a landlord report, and where their photo is. Never facts, applications or an email.';
  REVOKE ALL ON public.tenant_profile_personal FROM anon, authenticated;
END $$;
