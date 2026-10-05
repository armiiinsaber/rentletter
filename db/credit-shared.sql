-- db/credit-shared.sql
-- A credit report the applicant shares themselves (lib/creditShared.js, docs/credit-shared.md).
-- Run once in the Supabase SQL editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded,
-- and nothing touches an existing row. The application tolerates this file not having run: a
-- listing write that names the new column retries without it (lib/realtorWrites.js
-- OPTIONAL_LISTING_FIELDS), and the request mint reads the column on its own and treats an error
-- as false (pages/api/applications/mirror.js).
--
--   listings.pref_ask_credit_report  boolean, default false. The realtor's switch "Ask for a credit
--     report". On, the tenant's upload step shows the credit report row first. It never makes the
--     report required: not on the form, not in the reminders, not in the criteria, and Fit
--     (lib/fitScore.js) reads nothing from a credit report either way.
--
--   events.type gains document_rejected: a credit report the tenant added was not kept because
--     its name did not match the applicant, it carried no legible name or date, it was older than
--     90 days, or the file was not a credit report (pages/api/upload/analyze-file.js). The file is
--     never written to the bucket; the event is the record, with the reason in the payload.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pref_ask_credit_report boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.listings.pref_ask_credit_report IS 'Ask for a credit report: the upload step shows the credit row first. Optional for the tenant always; never a criterion, never read by Fit (lib/creditShared.js).';

-- The check constraint on events.type is recreated with the full list (matches lib/eventTypes.js
-- and db/events.sql). Guarded: only rewritten when the current constraint does not yet accept
-- document_rejected, and skipped entirely where db/events.sql has not run.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%document_rejected%' THEN RETURN; END IF;
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
    'document_rejected',
    'documents_expired',
    'retention_run',
    'report_generated',
    'report_sent',
    'report_opened',
    'landlord_answered',
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
    'branding_updated',
    'pipeline_invited',
    'pipeline_renewal_sent',
    'pipeline_removed',
    'reference_requested',
    'reference_answered'
  ));
END $$;
