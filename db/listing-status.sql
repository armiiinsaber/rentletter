-- db/listing-status.sql
-- A listing can be rented or closed, and losing applicants can ask to be kept in mind. Run once
-- in the Supabase SQL editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded; nothing
-- touches existing rows. The application tolerates all of this being absent (the listing
-- columns are read with a fallback to 'active', the consents table is probed), so this can run
-- before or after the deploy.
--
--   listings.status          'active' | 'rented' | 'closed'. Written only by
--                            pages/api/listings/status.js (session, entitlement, ownership).
--   listings.closed_at       when it stopped taking applications (rented or closed); NULL again on reopen.
--   listings.rented_link_id  the listing_applicants row that got the unit, NULL for an outside winner.
--   public.pipeline_consents one row per applicant asked to be kept in mind: pending at send
--                            time, consented or declined from the /keep/{token} page, or
--                            consented from the rented invite page. Service role only.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS rented_link_id uuid REFERENCES public.listing_applicants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.listings.status IS 'active | rented | closed. pages/api/listings/status.js writes it.';
COMMENT ON COLUMN public.listings.closed_at IS 'When the listing stopped taking applications. NULL while active.';
COMMENT ON COLUMN public.listings.rented_link_id IS 'The listing_applicants row that got the unit; NULL for a winner outside Rentletter.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_status_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_status_check CHECK (status IN ('active', 'rented', 'closed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pipeline_consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL,
  listing_id     uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  email          text NOT NULL,
  token          text NOT NULL UNIQUE,
  status         text NOT NULL DEFAULT 'pending',
  consented_at   timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz DEFAULT now()
);

COMMENT ON TABLE public.pipeline_consents IS 'Applicants who were asked (not selected) or who asked (rented invite page) to be kept in mind for similar units. status: pending | consented | declined. Service role only.';

ALTER TABLE public.pipeline_consents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pipeline_consents_profile_status_idx ON public.pipeline_consents (profile_id, status);
CREATE INDEX IF NOT EXISTS pipeline_consents_token_idx ON public.pipeline_consents (token);

-- The timeline gains applicant_not_selected (one per message sent). The check constraint on
-- events.type is recreated with the full list (matches lib/eventTypes.js and db/events.sql).
-- Guarded: only rewritten when the current constraint does not yet accept the new type.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%applicant_not_selected%' THEN RETURN; END IF;
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
