-- db/listing-applicants-vocabulary.sql
-- Two changes to public.listing_applicants. Run once in the Supabase SQL editor. IDEMPOTENT:
-- both statements are guarded, so a second run is a no op and touches nothing.
--
--   1. withdrawn_at timestamptz   a tenant withdrawing is not a realtor rejecting them, so it is
--                                 its own field rather than a decision_status value. NULL means
--                                 not withdrawn. The application treats a non null withdrawn_at
--                                 as withdrawn regardless of decision_status.
--   2. added_via                  gains 'referral'. Applicants genuinely arrive by referral
--                                 (lib/referrals.js); the constraint simply predates the feature.
--
-- decision_status ('none', 'shortlist', 'reject') and decision_priority ('top', 'normal') are
-- deliberately NOT widened: they are correct and the application now speaks their language
-- (lib/listingApplicantsVocabulary.js). See db/schema-reference.sql for the full picture.

ALTER TABLE public.listing_applicants ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

COMMENT ON COLUMN public.listing_applicants.withdrawn_at IS 'Set when the tenant withdrew (recorded by the realtor). NULL = not withdrawn. Independent of decision_status.';

-- Widen added_via to include 'referral'. Guarded: only rewrites the check when the current one
-- does not already accept 'referral'. Finds the constraint by definition rather than by name so
-- it works whatever name the dashboard gave it.
DO $$
DECLARE
  cname text;
  cdef  text;
BEGIN
  SELECT conname, pg_get_constraintdef(oid) INTO cname, cdef
    FROM pg_constraint
   WHERE conrelid = 'public.listing_applicants'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%added_via%'
   LIMIT 1;

  IF cname IS NOT NULL AND cdef ILIKE '%referral%' THEN
    RETURN; -- already widened
  END IF;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.listing_applicants DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listing_applicants_added_via_check') THEN
    ALTER TABLE public.listing_applicants
      ADD CONSTRAINT listing_applicants_added_via_check
      CHECK (added_via IN ('invite', 'lookup', 'referral'));
  END IF;
END $$;
