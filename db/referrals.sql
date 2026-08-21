-- db/referrals.sql
-- Realtor → realtor applicant handoff, gated by the applicant's consent.
--
-- JUNCTION MODEL (no change to listing_applicants): a referral never re-links Realtor 1's
-- application row to Realtor 2's listing. On consent, a DERIVED application is minted (new RL,
-- new owner token, facts from the tenant's current profile) and mirrored into `applications`
-- with referral_meta. When Realtor 2 assigns it to one of their listings it becomes an ordinary
-- listing_applicants row with added_via = 'referral', scored against that listing's rent.
--
-- `referrals` is the durable attribution record (who referred whom, when, outcome). KV is
-- canonical for the live flow (consent tokens, status); this table mirrors it. Until it runs,
-- the feature works KV-only (lib/referrals.js detects the missing table).
--
-- Run once in Supabase (SQL editor). Safe/idempotent.

CREATE TABLE IF NOT EXISTS public.referrals (
  id                          uuid PRIMARY KEY,
  status                      text NOT NULL,                 -- pending | approved | declined | expired | revoked
  from_profile_id             uuid NOT NULL,                 -- Realtor 1 (profiles.id)
  from_listing_id             uuid,                          -- listing the applicant was on
  from_link_id                uuid,                          -- listing_applicants.id (source junction row)
  source_application_number   text NOT NULL,                 -- Realtor 1's RL (never shown to Realtor 2)
  to_email                    text NOT NULL,                 -- Realtor 2 (may not have an account yet)
  to_name                     text,
  to_profile_id               uuid,                          -- set when Realtor 2 signs in / signs up
  note                        text,
  applicant_email_key         text NOT NULL,                 -- sha256 prefix; no tenant PII in this table
  referred_application_number text,                          -- the DERIVED RL minted on approval
  verification_summary        jsonb,                         -- extracted facts + analyzedAt; never documents
  assigned_listing_id         uuid,
  assigned_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  decided_at                  timestamptz,
  expires_at                  timestamptz,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_from_idx ON public.referrals (from_profile_id);
CREATE INDEX IF NOT EXISTS referrals_to_email_idx ON public.referrals (lower(to_email));
CREATE INDEX IF NOT EXISTS referrals_to_profile_idx ON public.referrals (to_profile_id);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;   -- service role only

-- Provenance on the derived application row (optional column; bridge retries without it).
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS referral_meta jsonb;
COMMENT ON COLUMN public.applications.referral_meta IS 'Set on applications minted by a consented referral: {id, fromName, fromBrokerage, approvedAt, note, factsSource, verification}. No documents.';
