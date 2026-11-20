-- db/020-share-events.sql
-- The realtor's timeline says when a tenant shared their profile and when they stopped
-- (docs/design/profile-and-circle.md Phase 5; lib/profileShares.js; db/019-profile-shares.sql).
-- events.type gains two values:
--   profile_share_approved   a tenant applied to the realtor's listing with their profile, and
--                            the share was made by that act
--   profile_share_revoked    the tenant stopped sharing
-- Each is written on that applicant's timeline by the service role (lib/events.js recordEvent),
-- and its payload names the tenant and the listing and holds no fact from the profile.
-- Run once in the Supabase SQL editor, after db/019-profile-shares.sql.
-- IDEMPOTENT: the check constraint on events.type is recreated with the full list (matches
-- lib/eventTypes.js and db/events.sql), as db/012-board-details.sql did. Guarded: it is only
-- rewritten when the current constraint does not yet accept profile_share_revoked, so a second
-- run reads the constraint and returns; and it is skipped entirely where db/events.sql has not
-- run. The new list holds every value the old one held, so no existing row can fail it. No row
-- is changed, and no table, column, index, policy or grant is touched.
-- The application tolerates this file not having run: the share is made or stopped all the
-- same, the tenant's own log has its line, and the timeline line is not written (lib/events.js
-- logs the refused insert and carries on).

DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%profile_share_revoked%' THEN RETURN; END IF;
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
    'reference_answered',
    'form_data_opened',
    'profile_share_approved',
    'profile_share_revoked'
  ));
END $$;
