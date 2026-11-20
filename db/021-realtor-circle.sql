-- db/021-realtor-circle.sql
-- The realtor circle and the brokerage record (docs/design/profile-and-circle.md section 4.8,
-- Phases 10 and 11). A realtor finds another realtor by name or brokerage, asks to connect, and
-- the two are connected only when the other accepts. A realtor adds their brokerage, and its
-- broker of record confirms it by an emailed link, after which the office reviews it. Written by
-- lib/circle.js and lib/brokerage.js behind the realtor's session, the entitlement and an
-- explicit check of whose row it is (pages/api/circle), by the broker of record's single use
-- link (pages/api/brokerage/confirm.js), by the office (pages/api/admin/brokerages.js) and, for
-- a realtor who joined through an invite link, by lib/signupSource.js recordSignupSource.
-- Run once in the Supabase SQL editor, after db/020-share-events.sql.
-- IDEMPOTENT: every table is CREATE TABLE IF NOT EXISTS with its checks written inside it, every
-- index is CREATE INDEX IF NOT EXISTS, the three profile columns are ADD COLUMN IF NOT EXISTS
-- (nullable, no default, so no existing row is rewritten), row level security is switched on (a
-- second ENABLE is a no op), the REVOKE repeats without effect, the connections for realtors who
-- already joined through an invite link are inserted with ON CONFLICT DO NOTHING (one row per
-- pair, so a second run adds none and never brings back a connection someone removed), and the
-- check on events.type is rewritten only while it does not yet accept brokerage_disputed, as
-- db/012 and db/020 did. A second run changes nothing. No existing row is changed.
-- The application tolerates this file not having run: the Circle screen says it is not available
-- yet, a signup through an invite link is credited as before and connects nobody, and no
-- timeline line is written (lib/events.js logs the refused insert and carries on).
--
-- brokerages
--   legal_name, address, phone, broker_of_record_name, broker_of_record_email (lower case),
--   hst_number: what the realtor typed. registration_number: for the office.
--   status               unconfirmed, confirmed, disputed, suspended. confirmed is set only by
--                        the office, and only after the broker of record has confirmed.
--   confirm_token_hash   the SHA 256 of the single use link sent to the broker of record. The
--                        link itself is never stored. confirm_sent_at, confirm_expires_at: when
--                        it was sent and when it stops working.
--   broker_confirmed_at  when the broker of record confirmed by the link. confirmed_at: when the
--                        office reviewed it and the record became confirmed.
--   created_by           the realtor who entered it.
-- brokerage_members      which realtor is with which brokerage. One active row per realtor;
--                        changing brokerage ends one row and starts another.
-- profiles.circle_findable   false: this realtor does not appear in the circle search. Null or
--                        true: they do, by name and brokerage and nothing else.
-- profiles.does_rentals, profiles.service_areas   what the realtor says about their own work.
--                        Null: not said. Nothing about a realtor's person is collected.
-- circle_connections     ONE ROW PER PAIR of realtors, whoever asked: the unique index is on the
--                        pair in a fixed order, so a second row for the same two realtors is
--                        refused whichever way round it is written.
--   status               pending (asked), accepted (both agreed), declined, removed, blocked.
--   requester_id         who asked last. addressee_id: who is asked. Only the addressee accepts.
--   answered_at          when it was accepted or declined; accepted always carries it.
--   blocked_by           which of the two blocked the other; set whenever status is blocked.
-- No table here holds a score, a rank, a count of followers or a note about anyone.
--
-- Row level security is on for the three new tables and no policy is created: the browser roles
-- read and write nothing, and every privilege they might hold is revoked. Only the service role,
-- behind the checks named above, reaches them. The three profile columns sit under the policies
-- profiles already has (a realtor reads and updates their own row and no other); search is
-- answered by the server as a name, a brokerage and what the realtor said about their work.

DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'db/021: public.profiles is not there yet. Run the base schema, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS circle_findable boolean;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS does_rentals boolean;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_areas text[];

  CREATE TABLE IF NOT EXISTS public.brokerages (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name               text NOT NULL,
    address                  text NOT NULL,
    phone                    text,
    broker_of_record_name    text NOT NULL,
    broker_of_record_email   text NOT NULL CHECK (broker_of_record_email = lower(broker_of_record_email)),
    registration_number      text,
    hst_number               text,
    status                   text NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed', 'disputed', 'suspended')),
    confirm_token_hash       text UNIQUE,
    confirm_sent_at          timestamptz,
    confirm_expires_at       timestamptz,
    broker_confirmed_at      timestamptz,
    confirmed_at             timestamptz,
    created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brokerages_confirmed_by_broker_first CHECK (status <> 'confirmed' OR (broker_confirmed_at IS NOT NULL AND confirmed_at IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS brokerages_created_by_idx ON public.brokerages (created_by);
  CREATE INDEX IF NOT EXISTS brokerages_status_idx ON public.brokerages (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS public.brokerage_members (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brokerage_id  uuid NOT NULL REFERENCES public.brokerages(id) ON DELETE RESTRICT,
    profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'disputed')),
    joined_at     timestamptz NOT NULL DEFAULT now(),
    left_at       timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS brokerage_members_one_active_idx ON public.brokerage_members (profile_id) WHERE status = 'active';
  CREATE INDEX IF NOT EXISTS brokerage_members_brokerage_idx ON public.brokerage_members (brokerage_id);

  CREATE TABLE IF NOT EXISTS public.circle_connections (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    addressee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'removed', 'blocked')),
    blocked_by     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    answered_at    timestamptz,
    CONSTRAINT circle_connections_not_self CHECK (requester_id <> addressee_id),
    CONSTRAINT circle_connections_accepted_has_time CHECK (status <> 'accepted' OR answered_at IS NOT NULL),
    CONSTRAINT circle_connections_blocked_by_one_of_them CHECK ((status = 'blocked') = (blocked_by IS NOT NULL) AND (blocked_by IS NULL OR blocked_by IN (requester_id, addressee_id)))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS circle_connections_pair_idx
    ON public.circle_connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
  CREATE INDEX IF NOT EXISTS circle_connections_addressee_idx ON public.circle_connections (addressee_id, status);
  CREATE INDEX IF NOT EXISTS circle_connections_requester_idx ON public.circle_connections (requester_id, status);

  ALTER TABLE public.brokerages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.brokerage_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.circle_connections ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.brokerages, public.brokerage_members, public.circle_connections FROM anon, authenticated;

  -- A realtor who already joined through another realtor's invite link (db/017) is in that
  -- realtor's circle, connected since the day they joined. Only where db/017 has run.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'invited_by') THEN
    EXECUTE 'INSERT INTO public.circle_connections (requester_id, addressee_id, status, created_at, answered_at)
             SELECT p.invited_by, p.id, ''accepted'', COALESCE(p.created_at, now()), COALESCE(p.created_at, now())
             FROM public.profiles p WHERE p.invited_by IS NOT NULL AND p.invited_by <> p.id
             ON CONFLICT DO NOTHING';
  END IF;

  -- The realtor's timeline gains six types (lib/eventTypes.js, db/events.sql).
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF;
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%brokerage_disputed%' THEN RETURN; END IF;
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
    'profile_share_revoked',
    'circle_connection_requested',
    'circle_connected',
    'circle_connection_removed',
    'brokerage_added',
    'brokerage_confirmed',
    'brokerage_disputed'
  ));
END $$;
