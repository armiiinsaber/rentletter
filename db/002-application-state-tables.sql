-- db/002-application-state-tables.sql
-- The data foundation under lib/application-state.js. Run SECOND, after
-- db/001-application-state-enums.sql, in the Supabase SQL editor.
-- IDEMPOTENT: every statement is IF NOT EXISTS, CREATE OR REPLACE, or guarded. No existing row
-- is changed here (the backfill is db/003-application-state-backfill.sql), no existing column is
-- renamed or dropped, and the application runs the same before and after this file.
-- Undo: db/999-application-state-rollback.sql.
--
-- WORDS. One application on one listing is a public.listing_applicants row: that row carries the
-- state, and closings and application_events hang off it (listing_applicant_id, the same name
-- public.applicant_documents uses). public.applications is the application body a tenant filled
-- in: the people on it (application_parties) hang off that.
--
-- OWNERSHIP. Every new table carries the model of the table it hangs off:
--   closings, application_events          hang off listing_applicants: a realtor reads only the
--                                         rows on their own listings, and nobody but the service
--                                         role writes.
--   application_parties, income_sources,  hang off applications, which has no realtor policy:
--   applicant_people                      RLS on, no policy, service role only. A realtor reaches
--                                         them through a route that checks ownership first.
--
-- OHRC. Screenable facts only. No column here records a protected ground or a proxy for one.
-- income_sources.kind says how to read an amount and is never a score input, a rank or a filter.

-- ── 1. The state columns ─────────────────────────────────────────────────────────
-- Nullable until the backfill has run: a NULL state reads as the mapping from the columns that
-- came before it (lib/application-state.js applicationStateOf and listingStateOf).
ALTER TABLE public.listing_applicants ADD COLUMN IF NOT EXISTS state public.application_state;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS state public.listing_state;
COMMENT ON COLUMN public.listing_applicants.state IS 'Where this application stands on this listing. Written only through lib/applicationTransitions.js, which asserts the move against lib/application-state.js and records it in application_events.';
COMMENT ON COLUMN public.listings.state IS 'draft, live, paused, rented or withdrawn. Written beside listings.status (active maps to live, closed maps to withdrawn), which the screens still read.';
CREATE INDEX IF NOT EXISTS listing_applicants_listing_state_idx ON public.listing_applicants (listing_id, state);

-- ── 2. applicant_people: one portable person per verified email ─────────────────────
-- Holds durable, screenable facts. Never a Fit result: the score belongs to one application on
-- one listing and is computed there. A row exists only once the email has been verified.
-- Documents are NOT copied here: public.applicant_documents points at the person (section 6), so
-- when the 14 day expiry deletes a document row the reference goes with it. A person never
-- extends the life of a file.
CREATE TABLE IF NOT EXISTS public.applicant_people (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text NOT NULL,
  email_key          text NOT NULL UNIQUE,
  email_verified_at  timestamptz NOT NULL,
  full_name          text,
  phone              text,
  facts              jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts_updated_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applicant_people_email_lower CHECK (email = lower(email)),
  CONSTRAINT applicant_people_facts_object CHECK (jsonb_typeof(facts) = 'object'),
  CONSTRAINT applicant_people_no_fit_result CHECK (NOT (facts ?| ARRAY['fit', 'fitScore', 'fit_score', 'score', 'scorecard', 'criteria']))
);
CREATE UNIQUE INDEX IF NOT EXISTS applicant_people_email_idx ON public.applicant_people (email);
COMMENT ON TABLE public.applicant_people IS 'A portable applicant, keyed by a verified email. Durable screenable facts only, never a Fit result, never a document. Service role only.';
COMMENT ON COLUMN public.applicant_people.email_key IS 'sha256 of the normalised email, first 32 hex characters (the same key lib/tenantProfileStore.js emailKey makes).';

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS applicant_person_id uuid REFERENCES public.applicant_people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS applications_applicant_person_idx ON public.applications (applicant_person_id);
COMMENT ON COLUMN public.applications.applicant_person_id IS 'The verified person behind this application. NULL until their email has been verified.';

-- ── 3. application_parties: everyone on one application ─────────────────────────────
-- primary, co_applicant, guarantor, occupant. A guarantor is a party on the application, not a
-- second application. The income and document columns are the ones a primary has
-- (public.applications and public.listing_applicants). An occupant carries none of them.
-- Stored, not scored: nothing here is an input to the Fit score.
CREATE TABLE IF NOT EXISTS public.application_parties (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id     uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  role               public.application_party_role NOT NULL,
  full_name          text NOT NULL,
  email              text,
  phone              text,
  employer           text,
  job_title          text,
  years_at_job       text,
  employment_type    text,
  business_name      text,
  annual_income      integer CHECK (annual_income IS NULL OR annual_income >= 0),
  net_income         integer CHECK (net_income IS NULL OR net_income >= 0),
  net_income_source  text CHECK (net_income_source IS NULL OR net_income_source IN ('estimated', 'stated')),
  doc_verifications  jsonb,
  docs_submitted_at  timestamptz,
  docs_verified      boolean,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_parties_occupant_no_income CHECK (
    role <> 'occupant' OR (
      employer IS NULL AND job_title IS NULL AND years_at_job IS NULL AND employment_type IS NULL
      AND business_name IS NULL AND annual_income IS NULL AND net_income IS NULL
      AND net_income_source IS NULL AND doc_verifications IS NULL AND docs_submitted_at IS NULL
      AND docs_verified IS NULL
    )
  )
);
CREATE INDEX IF NOT EXISTS application_parties_application_idx ON public.application_parties (application_id);
CREATE UNIQUE INDEX IF NOT EXISTS application_parties_one_primary_idx ON public.application_parties (application_id) WHERE role = 'primary';
COMMENT ON TABLE public.application_parties IS 'The people on one application: primary, co_applicant, guarantor, occupant. Stored, not scored. Service role only.';

-- ── 4. income_sources: the amounts behind a party's income ─────────────────────────
CREATE TABLE IF NOT EXISTS public.income_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_party_id  uuid NOT NULL REFERENCES public.application_parties(id) ON DELETE CASCADE,
  kind                  public.income_source_kind NOT NULL,
  payer                 text,
  annual_amount         integer NOT NULL CHECK (annual_amount >= 0),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS income_sources_party_idx ON public.income_sources (application_party_id);
COMMENT ON TABLE public.income_sources IS 'One row per income amount a party lists. Service role only.';
COMMENT ON COLUMN public.income_sources.kind IS 'How to read the amount. Never a score input, never a rank, never a filter: every dollar counts the same whatever its kind.';

-- An occupant carries no income.
CREATE OR REPLACE FUNCTION public.income_sources_refuse_occupant() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.application_parties p WHERE p.id = NEW.application_party_id AND p.role = 'occupant') THEN
    RAISE EXCEPTION 'An occupant carries no income.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS income_sources_refuse_occupant ON public.income_sources;
CREATE TRIGGER income_sources_refuse_occupant BEFORE INSERT OR UPDATE ON public.income_sources
  FOR EACH ROW EXECUTE FUNCTION public.income_sources_refuse_occupant();

-- ── 5. closings: what happens after a yes, in Ontario's order ───────────────────────
-- Agreement to lease signed, the rent deposit delivered, the standard lease signed, keys. The
-- only deposit is last month's rent, so the amount can never be more than one month's rent on
-- the listing: monthly_rent_cents is filled from the listing by the trigger below on every
-- write (a caller cannot set it), and the check constraint compares the two.
CREATE TABLE IF NOT EXISTS public.closings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_applicant_id  uuid NOT NULL UNIQUE REFERENCES public.listing_applicants(id) ON DELETE CASCADE,
  monthly_rent_cents    bigint,
  agreement_signed_at   timestamptz,
  agreement_signed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deposit_received_at   timestamptz,
  deposit_received_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deposit_amount_cents  bigint,
  lease_sent_at         timestamptz,
  lease_sent_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lease_signed_at       timestamptz,
  lease_signed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  keys_at               timestamptz,
  keys_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closings_deposit_within_one_month CHECK (
    deposit_amount_cents IS NULL
    OR (deposit_amount_cents > 0 AND monthly_rent_cents IS NOT NULL AND deposit_amount_cents <= monthly_rent_cents)
  ),
  CONSTRAINT closings_deposit_after_agreement CHECK (deposit_received_at IS NULL OR agreement_signed_at IS NOT NULL),
  CONSTRAINT closings_lease_after_deposit CHECK (lease_signed_at IS NULL OR deposit_received_at IS NOT NULL),
  CONSTRAINT closings_keys_after_lease CHECK (keys_at IS NULL OR lease_signed_at IS NOT NULL)
);
COMMENT ON TABLE public.closings IS 'One row per accepted application: the agreement, the rent deposit, the lease and the keys, each with when and who. A realtor reads their own; the service role writes.';
COMMENT ON COLUMN public.closings.deposit_amount_cents IS 'The rent deposit (last month''s rent). Never more than one month''s rent on the listing.';

CREATE OR REPLACE FUNCTION public.closings_fill_monthly_rent() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT l.monthly_rent::bigint * 100 INTO NEW.monthly_rent_cents
  FROM public.listing_applicants la JOIN public.listings l ON l.id = la.listing_id
  WHERE la.id = NEW.listing_applicant_id;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS closings_fill_monthly_rent ON public.closings;
CREATE TRIGGER closings_fill_monthly_rent BEFORE INSERT OR UPDATE ON public.closings
  FOR EACH ROW EXECUTE FUNCTION public.closings_fill_monthly_rent();

-- ── 6. application_events: the append only audit of every move ─────────────────────
-- One row per transition, written by lib/applicationTransitions.js in the same call that moves
-- the state. actor is an id (the realtor's profile id, the application id, or the job's name),
-- never a name or an email. reason is a short code written by the application, never free text.
-- The rows go when the application goes (retention deletes everything about a person).
CREATE TABLE IF NOT EXISTS public.application_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_applicant_id  uuid NOT NULL REFERENCES public.listing_applicants(id) ON DELETE CASCADE,
  from_state            public.application_state,
  to_state              public.application_state NOT NULL,
  actor                 text,
  actor_type            public.application_actor_type NOT NULL,
  reason                text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_events_application_idx ON public.application_events (listing_applicant_id, created_at);
COMMENT ON TABLE public.application_events IS 'Append only audit: every move of listing_applicants.state writes one row. No update path exists: the trigger below refuses one from any role.';

CREATE OR REPLACE FUNCTION public.application_events_refuse_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'application_events is append only.';
END $$;
DROP TRIGGER IF EXISTS application_events_refuse_update ON public.application_events;
CREATE TRIGGER application_events_refuse_update BEFORE UPDATE ON public.application_events
  FOR EACH ROW EXECUTE FUNCTION public.application_events_refuse_update();

-- ── 7. Documents point at people; people never hold documents ───────────────────────
-- Both nullable, both SET NULL: deleting a person or a party never deletes a document row out
-- from under the expiry job (the row is how the job finds the file in the private bucket), and
-- the 14 day expiry deletes the row, and with it the reference, exactly as before.
ALTER TABLE public.applicant_documents ADD COLUMN IF NOT EXISTS applicant_person_id uuid REFERENCES public.applicant_people(id) ON DELETE SET NULL;
ALTER TABLE public.applicant_documents ADD COLUMN IF NOT EXISTS application_party_id uuid REFERENCES public.application_parties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS applicant_documents_person_idx ON public.applicant_documents (applicant_person_id) WHERE applicant_person_id IS NOT NULL;

-- ── 8. Row level security ────────────────────────────────────────────────────────
ALTER TABLE public.applicant_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

-- Hanging off applications (no realtor policy): nothing for anon or authenticated at all.
REVOKE ALL ON public.applicant_people FROM anon, authenticated;
REVOKE ALL ON public.application_parties FROM anon, authenticated;
REVOKE ALL ON public.income_sources FROM anon, authenticated;

-- Hanging off listing_applicants: a realtor reads the rows on their own listings, nothing more.
REVOKE ALL ON public.closings FROM anon, authenticated;
REVOKE ALL ON public.application_events FROM anon, authenticated;
GRANT SELECT ON public.closings TO authenticated;
GRANT SELECT ON public.application_events TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'closings' AND policyname = 'closings_select_own') THEN
    CREATE POLICY closings_select_own ON public.closings FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.listing_applicants la JOIN public.listings l ON l.id = la.listing_id
              WHERE la.id = listing_applicant_id AND l.profile_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_events' AND policyname = 'application_events_select_own') THEN
    CREATE POLICY application_events_select_own ON public.application_events FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.listing_applicants la JOIN public.listings l ON l.id = la.listing_id
              WHERE la.id = listing_applicant_id AND l.profile_id = auth.uid())
    );
  END IF;
END $$;

-- ── 9. The state columns are written by the service role only ───────────────────────
-- listings_all_own and listing_applicants_all_own let a signed in realtor write their own rows
-- from the browser. Those policies stay as they are, but a state can only be moved by the
-- server, where lib/application-state.js asserts the move: from the browser roles a new row may
-- only take a starting state, and an existing state cannot be changed.
CREATE OR REPLACE FUNCTION public.refuse_client_state_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS NOT NULL AND NEW.state::text NOT IN ('draft', 'submitted', 'live') THEN
      RAISE EXCEPTION 'A new row cannot start in state %.', NEW.state;
    END IF;
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'The state is moved by the server only.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS listing_applicants_refuse_client_state ON public.listing_applicants;
CREATE TRIGGER listing_applicants_refuse_client_state BEFORE INSERT OR UPDATE ON public.listing_applicants
  FOR EACH ROW EXECUTE FUNCTION public.refuse_client_state_write();
DROP TRIGGER IF EXISTS listings_refuse_client_state ON public.listings;
CREATE TRIGGER listings_refuse_client_state BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.refuse_client_state_write();
