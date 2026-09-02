-- db/screening.sql
-- The screening checklist: what the realtor confirmed, and when a report went out. Run once in
-- the Supabase SQL editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded; nothing
-- touches existing rows. The application tolerates both columns being absent (the optional
-- column probe in lib/supabaseBridge.js fetchListingApplicants), so this can run before or
-- after the deploy.
--
--   listing_applicants.confirmations  jsonb, the realtor's own confirmations for this applicant:
--     { id?: {at, by}, employer?: {at, by}, landlord?: {at, by}, reference?: {at, by} }
--     at is an ISO timestamp, by is the realtor's display name. Written only by
--     pages/api/applicants/confirm.js through the service role. Moves Fit (lib/fitScore.js) and
--     prints on the landlord report. The word "verified" appears only after `employer` exists.
--   listing_applicants.last_sent_at   timestamptz, set on every junction row included in a
--     landlord report when the send succeeds (pages/api/listings/send-report.js). NULL = never sent.

ALTER TABLE public.listing_applicants ADD COLUMN IF NOT EXISTS confirmations jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.listing_applicants ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

COMMENT ON COLUMN public.listing_applicants.confirmations IS 'Realtor confirmations: { id | employer | landlord | reference : { at, by } }. Service role writes only (pages/api/applicants/confirm.js).';
COMMENT ON COLUMN public.listing_applicants.last_sent_at IS 'Set when this applicant was included in a landlord report that was sent. NULL = never sent.';

-- The timeline gains one event type, applicant_confirmed. The check constraint on events.type
-- is recreated with the full list (matches lib/eventTypes.js and db/events.sql). Guarded: only
-- rewritten when the current constraint does not yet accept the new type.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%applicant_confirmed%' THEN RETURN; END IF;
  IF cdef IS NOT NULL THEN ALTER TABLE public.events DROP CONSTRAINT events_type_check; END IF;
  ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (
    'applicant_applied',
    'documents_requested',
    'documents_uploaded',
    'verification_completed',
    'verification_failed',
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
