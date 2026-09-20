-- scripts/verify-migrations.baseline.sql
-- The schema that exists BEFORE db/001, for scripts/verify-migrations.mjs only. It is loaded into a
-- throwaway in memory Postgres (PGlite) and never into Supabase. Do not run it anywhere else.
--
-- db/schema-reference.sql is comments from its first line to its last (line 2 says REFERENCE ONLY,
-- DO NOT RUN), so loading it creates nothing. This file builds the tables it documents, column
-- for column, and before them the smallest stand ins for what Supabase itself provides. After
-- this file the script runs the repo's own db/listing-applicants-vocabulary.sql,
-- db/listing-status.sql and db/documents.sql, so withdrawn_at, status, closed_at, rented_link_id
-- and applicant_documents come from the real migrations and not from a copy.

-- ── STUBS: what Supabase provides ────────────────────────────────────────────────
-- STUB 1. The three API roles. db/002 revokes from and grants to anon and authenticated, its
-- policies are TO authenticated, and its state guard reads current_user.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- STUB 2. The auth schema and auth.uid(), which every policy calls. Supabase reads the signed
-- in user from the request's JWT claims; here it is a setting the script sets by hand.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- STUB 3. storage.buckets, because db/documents.sql line 18 registers the private bucket in it.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

-- STUB 4. public.profiles. The reference names only its two policies (db/schema-reference.sql
-- lines 160 and 161), not its columns; the migrations need its primary key and nothing else.
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  full_name  text,
  created_at timestamptz DEFAULT now()
);

-- ── THE DOCUMENTED TABLES (db/schema-reference.sql) ────────────────────────────────
-- public.listings, lines 67 to 102. status, closed_at and rented_link_id come from
-- db/listing-status.sql, which the script runs after this file.
CREATE TABLE public.listings (
  id                                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id                          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                                text NOT NULL DEFAULT 'New listing',
  address                             text,
  monthly_rent                        integer,
  bedrooms                            text,
  allows_pets                         text DEFAULT 'any',
  allows_smoking                      text DEFAULT 'no',
  parking_included                    text DEFAULT 'no',
  landlord_name                       text,
  landlord_email                      text,
  landlord_phone                      text,
  pref_min_annual_income              integer,
  pref_rent_to_income_max_pct         integer DEFAULT 30,
  pref_min_years_at_job               numeric,
  pref_employment_full_time           boolean DEFAULT true,
  pref_employment_contract            boolean DEFAULT true,
  pref_employment_self_employed       boolean DEFAULT false,
  pref_employment_part_time           boolean DEFAULT false,
  pref_earliest_move_in               date,
  pref_latest_move_in                 date,
  pref_min_lease_term_months          integer DEFAULT 12,
  pref_max_occupants                  integer,
  pref_smoking_allowed                boolean DEFAULT false,
  pref_pets_policy                    text DEFAULT 'case-by-case',
  pref_parking_spots                  integer,
  pref_requires_landlord_reference    boolean DEFAULT true,
  pref_requires_employer_verification boolean DEFAULT true,
  pref_guarantor_accepted             boolean DEFAULT true,
  pref_notes                          text,
  invite_token                        text,
  invite_url                          text,
  share_token                         text,
  created_at                          timestamptz DEFAULT now(),
  updated_at                          timestamptz DEFAULT now()
);

-- public.applications, lines 126 to 137. The body columns the migrations never read are typed
-- as the application writes them (lib/applicationMap.js kvAppToRow).
CREATE TABLE public.applications (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_number text NOT NULL UNIQUE,
  full_name          text,
  email              text,
  phone              text,
  employer           text,
  job_title          text,
  years_at_job       text,
  annual_income      integer,
  net_income         integer,
  net_income_source  text,
  employment_type    text,
  business_name      text,
  co_applicant       jsonb,
  scorecard          jsonb,
  created_at         timestamptz DEFAULT now()
);

-- public.listing_applicants, lines 105 to 124, with the three check constraints of lines 15 to
-- 27. withdrawn_at comes from db/listing-applicants-vocabulary.sql, which the script runs next.
CREATE TABLE public.listing_applicants (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id           uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  application_id       uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  decision_status      text NOT NULL DEFAULT 'none' CHECK (decision_status IN ('none', 'shortlist', 'reject')),
  decision_priority    text NOT NULL DEFAULT 'normal' CHECK (decision_priority IN ('top', 'normal')),
  decision_reason_code text,
  decision_notes       text,
  decision_changed_at  timestamptz,
  added_via            text DEFAULT 'invite' CHECK (added_via IN ('invite', 'lookup', 'referral')),
  created_at           timestamptz DEFAULT now(),
  reviewed_at          timestamptz,
  doc_verifications    jsonb,
  ai_insight           text,
  docs_submitted_at    timestamptz,
  docs_verified        boolean,
  confirmations        jsonb NOT NULL DEFAULT '{}',
  last_sent_at         timestamptz,
  UNIQUE (listing_id, application_id)
);

-- Row level security as production has it, lines 158 to 162 (applications: on, with no policy).
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY listings_all_own ON public.listings FOR ALL USING (profile_id = auth.uid());
CREATE POLICY listing_applicants_all_own ON public.listing_applicants FOR ALL USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.profile_id = auth.uid()));
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (id = auth.uid());

-- STUB 5. Supabase grants the API roles table privileges on the public schema by default, and
-- row level security does the narrowing. Without this the state guard in db/002 section 9 could
-- not be reached from the authenticated role at all.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
