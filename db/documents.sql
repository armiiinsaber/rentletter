-- db/documents.sql
-- Documents are held for the realtor's review, then deleted. Run once in the Supabase SQL editor.
-- IDEMPOTENT: every statement is IF NOT EXISTS, ON CONFLICT DO NOTHING, or guarded. Nothing
-- touches existing rows. The application tolerates this file not having run: storage is skipped
-- with one server log line, the dashboard shows no "Documents held" section, analysis still runs.
--
-- Each uploaded document is written to the private bucket applicant-documents at
--   {profile_id}/{listing_applicant_id}/{uuid}.{ext}
-- after the AI analysis of that file succeeds, and one row lands in public.applicant_documents.
-- The file is held for 14 days (lib/documentRetention.js) or until the realtor deletes it,
-- whichever comes first. Only the service role reads or writes the bucket and the table; the
-- owning realtor reaches a file through a 60 second signed URL from pages/api/documents/open.js,
-- and every open and delete is recorded on the events timeline.

-- 1. The private bucket. No storage policies for anon or authenticated: the service role is the
--    only reader and writer. 10MB per file, images and PDF only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('applicant-documents', 'applicant-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 2. One row per stored file.
CREATE TABLE IF NOT EXISTS public.applicant_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_applicant_id uuid NOT NULL REFERENCES public.listing_applicants(id) ON DELETE CASCADE,
  profile_id           uuid NOT NULL,
  storage_path         text NOT NULL UNIQUE,
  kind                 text,
  mime                 text,
  bytes                int,
  uploaded_by          text CHECK (uploaded_by IN ('tenant', 'realtor')),
  uploaded_at          timestamptz DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  deleted_at           timestamptz,
  deleted_by           text,
  opened_count         int DEFAULT 0,
  last_opened_at       timestamptz
);

COMMENT ON TABLE public.applicant_documents IS 'A document held for the realtor''s review. Service role only. Deleted by the realtor, on re analysis, or by the daily expiry (pages/api/cron/expire-documents.js).';
COMMENT ON COLUMN public.applicant_documents.kind IS 'The document type the AI identified (pay stub, employment letter, government id, ...) or unknown.';
COMMENT ON COLUMN public.applicant_documents.deleted_by IS 'The realtor''s display name, reanalyze, or expired.';

-- RLS on, no policies: nothing but the service role can read or write.
ALTER TABLE public.applicant_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS applicant_documents_junction_idx ON public.applicant_documents (listing_applicant_id);
CREATE INDEX IF NOT EXISTS applicant_documents_expiry_idx ON public.applicant_documents (expires_at) WHERE deleted_at IS NULL;

-- 3. Four event types for the timeline. The check constraint on events.type is recreated with
--    the full list (matches lib/eventTypes.js and db/events.sql). Guarded: only rewritten when
--    the current constraint does not yet accept the new types.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%documents_expired%' THEN RETURN; END IF;
  IF cdef IS NOT NULL THEN ALTER TABLE public.events DROP CONSTRAINT events_type_check; END IF;
  ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (
    'applicant_applied',
    'documents_requested',
    'documents_uploaded',
    'verification_completed',
    'verification_failed',
    'document_stored',
    'document_opened',
    'document_deleted',
    'documents_expired',
    'report_generated',
    'report_sent',
    'applicant_set_aside',
    'applicant_restored',
    'applicant_withdrew',
    'applicant_marked_finalist',
    'applicant_confirmed',
    'referral_received',
    'referral_accepted',
    'invite_link_created',
    'profile_edited_after_verification',
    'listing_created',
    'listing_updated',
    'branding_updated'
  ));
END $$;
