-- db/profile-edits.sql
-- Tenant profile edits — "Edited after verification" marker.
--
-- Tenants can now update their application in place from /my-application (same RL, same
-- row). The KV record stamps updatedAt + profileRevision; these two columns mirror them into
-- Supabase so the realtor dashboard can compare the edit time against the active document
-- verification's analyzedAt and flag "Edited after verification".
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, the mirror retries the
-- upsert without these two columns (lib/supabaseBridge.upsertApplication), so nothing breaks —
-- the marker simply can't appear yet.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS profile_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_revision integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.applications.profile_updated_at IS 'Last tenant-side profile edit (from /api/application/manage update). NULL = never edited.';
COMMENT ON COLUMN public.applications.profile_revision IS 'Count of tenant-side profile edits.';

-- RLS: applications are written only with the service role (KV→Supabase bridge) and read by
-- realtors through the existing listing_applicants policies. No policy changes needed.
