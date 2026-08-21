-- db/tenant-profiles.sql
-- Unified tenant profile — ONE profile per email, the durable "portable rental identity".
--
-- MODEL: the profile is the SOURCE; submitted applications are SNAPSHOTS. Editing the profile
-- never rewrites an application a realtor already received (that would shift ranked lists and
-- invalidate the "edited after verification" marker). Profile facts flow to FUTURE applications.
-- A new submission refreshes the profile facts (they were just reviewed + confirmed).
--
-- STORAGE: Upstash KV is written first and read first (tprofile:{emailKey}); this table is the
-- DURABLE copy (KV records carry TTLs). Service-role only — tenants reach it through the
-- magic-link session in /api/tenant/*, never directly; realtors never read it (they get snapshots).
--
-- BACKFILL is LAZY, not bulk: a profile is created the first time its email requests a recovery
-- link (every mirrored application with that email is attached) or the next time that email
-- submits an application. applications.tenant_profile_id is back-filled at that moment.
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, the feature works KV-only
-- (lib/tenantProfileStore.js detects the missing table and skips the durable write).

CREATE TABLE IF NOT EXISTS public.tenant_profiles (
  id               uuid PRIMARY KEY,
  email            text NOT NULL UNIQUE,
  email_key        text NOT NULL UNIQUE,         -- sha256(email) prefix; KV key material
  facts            jsonb,                         -- flat apply-form shape (no listing fields)
  applications     jsonb NOT NULL DEFAULT '[]',   -- [{ applicationNumber, ownerToken, submittedAt, listingAddress }]
  facts_updated_at timestamptz,
  profile_revision integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tenant_profiles IS 'Tenant portable profile (one per email). Service-role only. Source for future applications; never rewrites submitted snapshots.';
COMMENT ON COLUMN public.tenant_profiles.applications IS 'Owner tokens are the per-application credential the tenant already holds. Never exposed realtor-side.';

-- Deny-all RLS: only the service role (which bypasses RLS) touches this table.
ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;

-- Back-link from a submitted snapshot to its profile (set lazily on attach).
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS tenant_profile_id uuid REFERENCES public.tenant_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS applications_tenant_profile_id_idx ON public.applications (tenant_profile_id);
-- Lazy backfill looks applications up by email.
CREATE INDEX IF NOT EXISTS applications_email_idx ON public.applications (lower(email));
