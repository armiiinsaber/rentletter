-- db/011-document-content-hash.sql
-- One column for the document checks (lib/documentIntegrity.js check g): the content hash of a
-- held file, so the same file submitted by two different applicants on one realtor's listings can
-- be noted for that realtor. The hash lives on the realtor's own applicant_documents row (the row
-- carries profile_id, and every comparison is filtered by it), and it goes with the file: every
-- path that marks a row deleted or expired clears it (lib/documentStore.js). No personal field is
-- added. The findings themselves ride on the report the product already stores
-- (listing_applicants.doc_verifications), as type, document id, sentence and date only.
-- Run ELEVENTH, after db/010, on its own, in the Supabase SQL editor. The application tolerates
-- this file not having run: the same file check answers nothing and every write runs without the
-- column.
-- IDEMPOTENT: the column and the index are IF NOT EXISTS, the clearing update touches only rows
-- already deleted that still carry a hash, and the whole file returns early when db/documents.sql
-- has not run. A second run finds nothing to do.

DO $$
BEGIN
  IF to_regclass('public.applicant_documents') IS NULL THEN RETURN; END IF; -- db/documents.sql has not run yet
  ALTER TABLE public.applicant_documents ADD COLUMN IF NOT EXISTS content_hash text;
  COMMENT ON COLUMN public.applicant_documents.content_hash IS 'sha256 of the held file, for the same file check on this realtor''s listings only (lib/documentIntegrityStore.js). Cleared when the file is deleted or expires.';
  CREATE INDEX IF NOT EXISTS applicant_documents_hash_idx ON public.applicant_documents (profile_id, content_hash) WHERE deleted_at IS NULL AND content_hash IS NOT NULL;
  UPDATE public.applicant_documents SET content_hash = NULL WHERE deleted_at IS NOT NULL AND content_hash IS NOT NULL;
END $$;
