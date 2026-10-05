-- db/008-application-parties-invites.sql
-- The people on one application get their own invite, their own form and their own standing
-- (lib/parties.js, lib/partyStore.js, docs/parties.md). Run once in the Supabase SQL editor,
-- after db/002-application-state-tables.sql. IDEMPOTENT: every statement is IF NOT EXISTS or
-- guarded, and no existing row is changed. The application tolerates this file not having run:
-- the party routes answer 503 and the realtor's card shows no parties.
--
-- What db/002 already holds on application_parties: the role, the name, the contact, the
-- employment and income columns and the document report. What was missing for an invited party:
--   party_token   text, unique. The party's own credential, the only thing in their URL
--                 (/party/{token}). Never the primary's owner_token, never shown to the realtor.
--   status        invited, in_progress, submitted, declined, withdrawn. The party's own standing;
--                 the application's state is not moved by it (lib/application-state.js).
--   invited_at, started_at, submitted_at, declined_at, withdrawn_at, consented_at
--   address       the guarantor's address, kept for the lease and used nowhere else.
-- OHRC and BC Code: nothing here records a relationship, a family status or who lives with whom.
-- A role on the lease is all that is kept.
--
-- listings.pref_guarantor_accepted: the realtor's switch "Guarantor accepted", a listing level
-- setting applied to every applicant (the OHRC's same requirement for all tenants). No earlier
-- file under db/ creates it (db/schema-reference.sql documents it alone), so it is added here:
-- boolean NOT NULL DEFAULT false, a no op where the column already exists.
--
-- events.type gains party_invited, party_submitted, party_declined and party_withdrawn: the
-- realtor's timeline rows for a party's progress.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS pref_guarantor_accepted boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.listings.pref_guarantor_accepted IS 'Guarantor accepted: the primary may invite a guarantor on this listing, the same for every applicant (lib/parties.js). Never a criterion, never read by Fit.';

ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS party_token text;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited';
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS declined_at timestamptz;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS consented_at timestamptz;
ALTER TABLE public.application_parties ADD COLUMN IF NOT EXISTS address text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_parties_status_check') THEN
    ALTER TABLE public.application_parties ADD CONSTRAINT application_parties_status_check CHECK (status IN ('invited', 'in_progress', 'submitted', 'declined', 'withdrawn'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS application_parties_token_idx ON public.application_parties (party_token) WHERE party_token IS NOT NULL;

COMMENT ON COLUMN public.application_parties.party_token IS 'The party''s own credential, the only thing in /party/{token}. Never the primary''s owner_token, never shown to the realtor.';
COMMENT ON COLUMN public.application_parties.status IS 'invited, in_progress, submitted, declined or withdrawn: the party''s own standing. The application''s state is not moved by it.';
COMMENT ON COLUMN public.application_parties.address IS 'The guarantor''s address, kept for the lease and used nowhere else.';

-- The check constraint on events.type is recreated with the full list (matches lib/eventTypes.js
-- and db/events.sql). Guarded: only rewritten when the current constraint does not yet accept
-- party_withdrawn, and skipped entirely where db/events.sql has not run.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%party_withdrawn%' THEN RETURN; END IF;
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
    'party_invited',
    'party_submitted',
    'party_declined',
    'party_withdrawn',
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
