-- db/nudges-event.sql
-- The events timeline gains one type, documents_nudged (pages/api/cron/nudges.js, lib/nudges.js):
-- one row per reminder sent in the realtor's name, payload { nudge: 1 | 2 }. Run once in the
-- Supabase SQL editor. IDEMPOTENT and guarded: only rewrites the check constraint when it does
-- not yet accept the new type; nothing touches existing rows. Same shape as db/retention-event.sql
-- and db/listing-status.sql; the list matches lib/eventTypes.js and db/events.sql.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%documents_nudged%' THEN RETURN; END IF;
  IF cdef IS NOT NULL THEN ALTER TABLE public.events DROP CONSTRAINT events_type_check; END IF;
  ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (
    'applicant_applied',
    'documents_requested',
    'documents_uploaded',
    'documents_nudged',
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
    'applicant_not_selected',
    'referral_received',
    'referral_accepted',
    'invite_link_created',
    'profile_edited_after_verification',
    'listing_created',
    'listing_updated',
    'branding_updated'
  ));
END $$;
