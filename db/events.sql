-- db/events.sql
-- The realtor's timeline: an APPEND ONLY record of what happened, and one read watermark per
-- realtor. Run once in the Supabase SQL editor. IDEMPOTENT: every statement is IF NOT EXISTS or
-- guarded, and nothing here touches existing rows. There is no backfill by design: the timeline
-- starts when this ships.
--
--   events        one row per thing that happened, written by the service role only
--                 (lib/events.js recordEvent). Realtors read their own rows under RLS.
--   event_reads   one row per realtor: last_read_at, set when the assistant panel opens.
--
-- The allowed `type` values below MUST match lib/eventTypes.js and db/schema-reference.sql.
-- Adding a type means all three change in the same commit.

CREATE TABLE IF NOT EXISTS public.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id      uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  application_id  uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  type            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_type_check') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (
      'applicant_applied',
      'documents_requested',
      'documents_uploaded',
      'verification_completed',
      'verification_failed',
      'document_stored',
      'document_opened',
      'document_deleted',
      'documents_expired',
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
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS events_profile_created_idx ON public.events (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.event_reads (
  profile_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: a realtor reads only their own rows. No client role may insert, update or delete on
-- either table: RLS is on, the only policies are SELECT, and the write privileges are revoked
-- outright. The service role bypasses RLS and is the only writer (lib/events.js).
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reads ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_reads FROM anon, authenticated;
REVOKE ALL ON public.events FROM anon;
REVOKE ALL ON public.event_reads FROM anon;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.event_reads TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'events_select_own') THEN
    CREATE POLICY events_select_own ON public.events FOR SELECT TO authenticated USING (profile_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_reads' AND policyname = 'event_reads_select_own') THEN
    CREATE POLICY event_reads_select_own ON public.event_reads FOR SELECT TO authenticated USING (profile_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE public.events IS 'Append only timeline of what happened for a realtor. Service role writes only; no update or delete path exists in the application.';
COMMENT ON TABLE public.event_reads IS 'One read watermark per realtor, set when the assistant panel opens.';
