-- db/025-listing-archive.sql
-- A realtor can archive a listing and restore it (lib/listingArchive.js; pages/api/listings/archive.js).
--   listings.archived_at   when the realtor archived the listing. Null: the listing is on the Active
--                          view, as every listing is today. An archived listing shows under Archived,
--                          and its apply link says it is no longer taking applications
--                          (pages/apply/[token].js). Its applications, shares, events and reports are
--                          not touched by archiving: nothing is removed and all of it stays readable.
-- Run once in the Supabase SQL editor, after db/024-share-roles.sql.
-- IDEMPOTENT: the column is ADD COLUMN IF NOT EXISTS, nullable, with no default, so no existing row is
-- rewritten and every listing reads as not archived. The comment is set to the same words each run.
-- A second run changes nothing. Where public.listings is not there the file says so and does nothing.
-- No policy, grant, index, trigger or row is written; row level security on listings is as it was.
-- The application tolerates this file not having run: the dashboard shows no archive control and
-- nothing else changes. Deleting a listing with no real application works either way.

DO $$
BEGIN
  IF to_regclass('public.listings') IS NULL THEN
    RAISE NOTICE 'db/025: public.listings is not there yet. Run the schema first, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
  COMMENT ON COLUMN public.listings.archived_at IS 'When the realtor archived the listing. Null: on the Active view.';
END $$;
