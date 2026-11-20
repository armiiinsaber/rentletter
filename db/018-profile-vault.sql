-- db/018-profile-vault.sql
-- The tenant's vault: documents a tenant keeps in their own profile, the facts read from them,
-- and the tenant's own log (docs/design/profile-and-circle.md sections 4.1, 4.2, 4.3, 4.5, 7).
-- Written and read by lib/tenantVault.js alone, for the tenant's own session
-- (pages/api/tenant/vault.js) and for the daily expiry (pages/api/cron/expire-vault.js). No
-- realtor route or library reads any of it: a realtor reaches a profile only through a share the
-- tenant approved, and shares are a later file.
-- Run once in the Supabase SQL editor, after db/015-profile-verified-email.sql.
-- IDEMPOTENT: the bucket is INSERT ... ON CONFLICT DO NOTHING, the column is ADD COLUMN IF NOT
-- EXISTS, the tables are CREATE TABLE IF NOT EXISTS, the indexes CREATE INDEX IF NOT EXISTS,
-- row level security is switched on (a second ENABLE is a no op) and the REVOKE repeats without
-- effect. Every constraint is written inside its CREATE TABLE, so a second run adds none. No
-- existing row is changed: the new column is nullable with no default. A second run changes
-- nothing. Where db/tenant-profiles.sql has not run there is no profile to hang a vault on: the
-- file says so and does nothing.
-- The application tolerates this file not having run: the profile page says documents are not
-- available yet, an upload is refused before anything is read or stored, the expiry job finds
-- nothing, and the consent time is kept in the profile's KV record.
--
-- The bucket tenant-vault: private, 10MB a file, images and PDF. No storage policy for anon or
-- authenticated: the service role is the only reader and writer. Encrypted at rest by the storage
-- provider, as applicant-documents is. Path {tenant_profile_id}/{uuid}.{ext}: no filename, no
-- email, never an owner token.
--
-- tenant_profiles.vault_consent_at   when the tenant agreed that Rentletter keeps their documents
--                                    in their profile and reads them. Null: not agreed, and an
--                                    upload is refused.
--
-- tenant_profile_documents   one row per stored file, written only after the read of that file
--                            succeeded. kind has no credit value: a credit report cannot be
--                            stored here. expires_at is 14 days after upload for an ID and 90
--                            days for the rest (lib/tenantVaultRules.js). A deleted row keeps
--                            its dates and its kind for 30 days with the file gone and the
--                            content hash cleared, so the reconcile can prove the object is
--                            gone; then the row is removed.
-- tenant_profile_checks      one row per fact read from a document, one per kind and profile.
--                            The kinds are a closed list (lib/profileFacts.js
--                            PROFILE_CHECK_KINDS): no date of birth, age, photo, ID number,
--                            status in Canada, type of income or family. When its document goes
--                            the check stays, with source_document_id null.
-- profile_access_log         the tenant's own log: what happened to their profile and when. In
--                            this file's time only the tenant and the system write to it; views
--                            by a realtor arrive with shares. share_id carries no foreign key
--                            yet: the shares table is a later file, which adds it.
--                            action is section 4.5's list and two more that section 4.2 names:
--                            document_renewed and document_expired.
--
-- Row level security is on for all three tables and no policy is created: the browser roles can
-- read and write nothing, and every privilege they might hold is revoked. Only the service role,
-- behind the tenant's session on the server, reaches them.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-vault', 'tenant-vault', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NULL THEN
    RAISE NOTICE 'db/018: public.tenant_profiles is not there yet. Run db/tenant-profiles.sql, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS vault_consent_at timestamptz;
  COMMENT ON COLUMN public.tenant_profiles.vault_consent_at IS 'When the tenant agreed that Rentletter keeps their documents in their profile and reads them (lib/tenantProfileStore.js recordVaultConsent). Null: not agreed.';

  CREATE TABLE IF NOT EXISTS public.tenant_profile_documents (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
    storage_path       text NOT NULL UNIQUE,
    kind               text NOT NULL CHECK (kind IN ('id', 'income', 'employment', 'other')),
    mime               text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'application/pdf')),
    bytes              integer NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
    content_hash       text,
    uploaded_at        timestamptz NOT NULL DEFAULT now(),
    read_at            timestamptz,
    expires_at         timestamptz NOT NULL,
    renewed_at         timestamptz,
    deleted_at         timestamptz,
    deleted_by         text CHECK (deleted_by IS NULL OR deleted_by IN ('tenant', 'expiry', 'profile_delete', 'admin')),
    object_removed     boolean NOT NULL DEFAULT false,
    CONSTRAINT tenant_profile_documents_deleted_whole CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
  );
  CREATE INDEX IF NOT EXISTS tenant_profile_documents_profile_idx ON public.tenant_profile_documents (tenant_profile_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS tenant_profile_documents_expiry_idx ON public.tenant_profile_documents (expires_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS tenant_profile_documents_deleted_idx ON public.tenant_profile_documents (deleted_at) WHERE deleted_at IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.tenant_profile_checks (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
    kind               text NOT NULL CHECK (kind IN ('identity_name_matches', 'identity_document_current', 'income_annual_gross', 'employer_name', 'employment_start')),
    value              jsonb NOT NULL,
    agrees_with_typed  boolean,
    source_kind        text NOT NULL CHECK (source_kind IN ('id', 'income', 'employment')),
    source_document_id uuid REFERENCES public.tenant_profile_documents(id) ON DELETE SET NULL,
    read_at            timestamptz NOT NULL DEFAULT now(),
    fresh_until        timestamptz NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tenant_profile_checks_value_object CHECK (jsonb_typeof(value) = 'object'),
    CONSTRAINT tenant_profile_checks_no_fit_result CHECK (NOT (value ?| ARRAY['fit', 'fitScore', 'fit_score', 'score', 'scorecard', 'criteria', 'rank', 'ranking'])),
    CONSTRAINT tenant_profile_checks_one_per_kind UNIQUE (tenant_profile_id, kind)
  );

  CREATE TABLE IF NOT EXISTS public.profile_access_log (
    id                 bigserial PRIMARY KEY,
    tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
    share_id           uuid,
    actor_type         text NOT NULL CHECK (actor_type IN ('realtor', 'tenant', 'system')),
    actor_profile_id   uuid,
    actor_label        text,
    action             text NOT NULL CHECK (action IN (
                         'profile_viewed', 'document_opened', 'share_requested', 'share_approved', 'share_declined',
                         'share_revoked', 'share_expired', 'added_to_listing', 'document_added', 'document_deleted',
                         'document_renewed', 'document_expired', 'check_recorded', 'check_removed', 'profile_exported')),
    document_id        uuid,
    at                 timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS profile_access_log_profile_idx ON public.profile_access_log (tenant_profile_id, at DESC);

  ALTER TABLE public.tenant_profile_documents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tenant_profile_checks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.tenant_profile_documents, public.tenant_profile_checks, public.profile_access_log FROM anon, authenticated;
  REVOKE ALL ON SEQUENCE public.profile_access_log_id_seq FROM anon, authenticated;
END $$;
