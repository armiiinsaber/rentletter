-- db/retention-event.sql
-- The events timeline gains one type, retention_run (pages/api/cron/retention.js, lib/retention.js).
-- Run once in the Supabase SQL editor. IDEMPOTENT and guarded: only rewrites the check constraint
-- when it does not yet accept the new type; nothing touches existing rows. Same shape as the
-- constraint blocks in db/screening.sql and db/documents.sql; the list matches lib/eventTypes.js.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%retention_run%' THEN RETURN; END IF;
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
    'retention_run',
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
