-- db/reference-responses.sql
-- Reference outcome capture. The applicant's previous landlord answers six fixed, closed
-- questions by link; the answers live on the screening checklist. Run once in the Supabase SQL
-- editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded; nothing touches existing
-- rows. The application tolerates this table being absent (the read is probed and skipped, the
-- Ask by email control still renders and the request route answers 503 until it exists).
--
--   public.reference_responses  one row per request sent. pending at send time, answered from
--                               /ref/{token} (POST /api/references/answer), expired after 14 days.
--                               token is the only credential: random, single use. answers is the
--                               closed answer set (lib/referenceQuestions.js), never free text.
--                               Service role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.reference_responses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_applicant_id uuid NOT NULL REFERENCES public.listing_applicants(id) ON DELETE CASCADE,
  profile_id           uuid NOT NULL,
  token                text NOT NULL UNIQUE,
  sent_to              text NOT NULL,
  status               text NOT NULL DEFAULT 'pending',
  answers              jsonb,
  sent_at              timestamptz DEFAULT now(),
  answered_at          timestamptz,
  expires_at           timestamptz NOT NULL
);

COMMENT ON TABLE public.reference_responses IS 'Previous landlord reference requests and their closed answers (lib/referenceQuestions.js). status: pending | answered | expired. Service role only.';
COMMENT ON COLUMN public.reference_responses.answers IS 'Closed answers only: { rented, when, rentOnTime, damage, notice, again } or { rented: no, notTheirTenant: true }. Never free text.';

ALTER TABLE public.reference_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reference_responses_status_check') THEN
    ALTER TABLE public.reference_responses ADD CONSTRAINT reference_responses_status_check CHECK (status IN ('pending', 'answered', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reference_responses_link_idx ON public.reference_responses (listing_applicant_id);
CREATE INDEX IF NOT EXISTS reference_responses_token_idx ON public.reference_responses (token);

-- The timeline gains reference_requested and reference_answered. The check constraint on
-- events.type is recreated with the full list (matches lib/eventTypes.js and db/events.sql).
-- Guarded: only rewritten when the current constraint does not yet accept the new types.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%reference_answered%' THEN RETURN; END IF;
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
    'pipeline_removed',
    'reference_requested',
    'reference_answered'
  ));
END $$;
