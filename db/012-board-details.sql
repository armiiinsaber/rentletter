-- db/012-board-details.sql
-- The fields the board's forms ask for, typed once on the listing and the profile, and read by the
-- Form data view once a tenant is accepted (lib/boardDetails.js, lib/formData.js,
-- pages/api/listings/form-data.js, docs/form-data.md). Run once in the Supabase SQL editor.
-- IDEMPOTENT: every statement is IF NOT EXISTS or guarded, and no existing row is changed. The
-- application tolerates this file not having run: a listing or profile write that names one of
-- these columns retries without it (lib/realtorWrites.js OPTIONAL_LISTING_FIELDS, OPTIONAL_PROFILE),
-- and the Form data view reads the columns through select * and shows Not entered.
--
-- listings: every column nullable or defaulted, none required to create a listing, none a
-- criterion, none read by Fit (lib/fitScore.js), none shown to a tenant.
--   mls_number                 the board's listing number
--   listing_brokerage_name, listing_brokerage_address, listing_brokerage_phone
--   coop_brokerage_name        the cooperating brokerage
--   coop_commission            free text: the commission to the cooperating brokerage, as it is
--                              usually written ("half a month's rent plus HST")
--   possession_date            the start of the term
--   lease_term_months          the length of the term
--   utilities_heat, utilities_hydro, utilities_water   included, not included, or not set (null):
--                              an untouched listing reads Not entered, never Not included
--   parking_spaces, locker, furnished
--   deposit_last_month, deposit_key          Ontario: a rent deposit of at most one month's rent,
--                                            applied to the last month, and a refundable key deposit
--   deposit_security, deposit_pet            British Columbia: each at most half a month's rent
--   The write refuses a deposit above the province's cap and clears the deposits the province does
--   not allow (lib/boardDetails.js normalizeBoardDetails); the columns themselves hold any integer.
--
-- An earlier version of this file created utilities_heat, utilities_hydro and utilities_water as
-- boolean NOT NULL DEFAULT false. Where it ran, ADD COLUMN IF NOT EXISTS leaves that shape in place,
-- so this file also relaxes the three columns: a guarded block drops NOT NULL and the default from
-- each one, and only where they are present. No row is changed: a false stored by the old default
-- cannot be told apart from a chosen Not included, so the data stays as it is.
--
-- profiles: beside brokerage and license_number (the RECO registration number), which exist.
--   brokerage_address          prefills the listing's brokerage address
--   board                      trreb, mississauga, hamilton, ottawa, greater_vancouver,
--                              fraser_valley or other
--
-- events.type gains form_data_opened: the realtor opened the Form data view for a listing.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS mls_number text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS listing_brokerage_name text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS listing_brokerage_address text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS listing_brokerage_phone text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS coop_brokerage_name text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS coop_commission text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS possession_date date;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS lease_term_months integer;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS utilities_heat boolean;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS utilities_hydro boolean;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS utilities_water boolean;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS parking_spaces integer;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS locker text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS furnished boolean;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deposit_last_month integer;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deposit_key integer;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deposit_security integer;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS deposit_pet integer;

-- The three utility columns where an earlier version of this file made them NOT NULL DEFAULT false.
-- Guarded: NOT NULL is dropped only where it is set, the default only where one exists, so a fresh
-- database or a second run changes nothing. No row is updated.
DO $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['utilities_heat', 'utilities_hydro', 'utilities_water'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.listings'::regclass AND attname = col AND NOT attisdropped AND attnotnull) THEN
      EXECUTE format('ALTER TABLE public.listings ALTER COLUMN %I DROP NOT NULL', col);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.listings'::regclass AND attname = col AND NOT attisdropped AND atthasdef) THEN
      EXECUTE format('ALTER TABLE public.listings ALTER COLUMN %I DROP DEFAULT', col);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.listings.mls_number IS 'The board''s listing number. Board details (lib/boardDetails.js): optional, never a criterion, never read by Fit, never shown to a tenant.';
COMMENT ON COLUMN public.listings.coop_commission IS 'The commission to the cooperating brokerage as it is usually written, free text.';
COMMENT ON COLUMN public.listings.possession_date IS 'The start of the term, as entered. Nothing is derived from it.';
COMMENT ON COLUMN public.listings.utilities_heat IS 'Heat: true included, false not included, null not set. The same for utilities_hydro and utilities_water.';
COMMENT ON COLUMN public.listings.deposit_last_month IS 'Ontario: a rent deposit of at most one month''s rent, applied to the last month (lib/boardDetails.js depositRules).';
COMMENT ON COLUMN public.listings.deposit_key IS 'Ontario: a refundable key deposit.';
COMMENT ON COLUMN public.listings.deposit_security IS 'British Columbia: a security deposit of at most half a month''s rent.';
COMMENT ON COLUMN public.listings.deposit_pet IS 'British Columbia: a pet damage deposit of at most half a month''s rent.';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS brokerage_address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS board text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_board_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_board_check CHECK (board IS NULL OR board IN ('trreb', 'mississauga', 'hamilton', 'ottawa', 'greater_vancouver', 'fraser_valley', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.brokerage_address IS 'The realtor''s brokerage address: prefills a new listing''s brokerage address (lib/boardDetails.js).';
COMMENT ON COLUMN public.profiles.board IS 'The realtor''s board: trreb, mississauga, hamilton, ottawa, greater_vancouver, fraser_valley or other.';

-- The check constraint on events.type is recreated with the full list (matches lib/eventTypes.js
-- and db/events.sql). Guarded: only rewritten when the current constraint does not yet accept
-- form_data_opened, and skipped entirely where db/events.sql has not run.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%form_data_opened%' THEN RETURN; END IF;
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
    'form_data_opened'
  ));
END $$;
