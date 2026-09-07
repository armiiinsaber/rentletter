-- db/pipeline.sql
-- People: the pipeline. Consented applicants and rented link emails are listed, scored against
-- every active listing, invited to apply with their application prefilled, and asked once to
-- renew before the 60 days end. Run once in the Supabase SQL editor. IDEMPOTENT: every
-- statement is IF NOT EXISTS or guarded; nothing touches existing rows. The application
-- tolerates all of this being absent (the columns are probed, a missing column reads as empty).
--
--   pipeline_consents.invites        [{ listingId, at }] one entry per invitation sent, written by
--                                    pages/api/pipeline/invite.js (session, entitlement, ownership).
--   pipeline_consents.renew_token    the one time token in the renewal email (/keep/{renewToken}).
--   pipeline_consents.renew_sent_at  when the renewal email went; NULL until the cron sends it.
--   pipeline_consents.status         gains 'expired', set by pages/api/cron/pipeline.js once
--                                    expires_at has passed. Expired rows are never listed.

ALTER TABLE public.pipeline_consents ADD COLUMN IF NOT EXISTS invites jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.pipeline_consents ADD COLUMN IF NOT EXISTS renew_token text UNIQUE;
ALTER TABLE public.pipeline_consents ADD COLUMN IF NOT EXISTS renew_sent_at timestamptz;

COMMENT ON COLUMN public.pipeline_consents.invites IS '[{ listingId, at }] one entry per invitation sent from People. pages/api/pipeline/invite.js writes it.';
COMMENT ON COLUMN public.pipeline_consents.renew_token IS 'One time token for the renewal email (/keep/{renewToken}); cleared when answered.';
COMMENT ON COLUMN public.pipeline_consents.renew_sent_at IS 'When the renewal email went, 7 days before expires_at; NULL until then.';
COMMENT ON TABLE public.pipeline_consents IS 'Applicants who were asked (not selected) or who asked (rented invite page) to be kept in mind for similar units. status: pending | consented | declined | expired. Service role only.';

-- status also allows 'expired'. The table was created without a check constraint on status;
-- if one exists under the conventional name it is rewritten with the full list, otherwise nothing.
DO $$
DECLARE cdef text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'pipeline_consents_status_check';
  IF cdef IS NULL THEN RETURN; END IF;
  IF cdef LIKE '%expired%' THEN RETURN; END IF;
  ALTER TABLE public.pipeline_consents DROP CONSTRAINT pipeline_consents_status_check;
  ALTER TABLE public.pipeline_consents ADD CONSTRAINT pipeline_consents_status_check CHECK (status IN ('pending', 'consented', 'declined', 'expired'));
END $$;

CREATE INDEX IF NOT EXISTS pipeline_consents_renew_token_idx ON public.pipeline_consents (renew_token);
CREATE INDEX IF NOT EXISTS pipeline_consents_expires_idx ON public.pipeline_consents (status, expires_at);

-- The timeline gains pipeline_invited, pipeline_renewal_sent and pipeline_removed. The check
-- constraint on events.type is recreated with the full list (matches lib/eventTypes.js and
-- db/events.sql). Guarded: only rewritten when the current constraint does not yet accept them.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%pipeline_removed%' THEN RETURN; END IF;
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
    'pipeline_removed'
  ));
END $$;
