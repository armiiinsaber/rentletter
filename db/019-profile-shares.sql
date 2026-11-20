-- db/019-profile-shares.sql
-- Shares: a tenant's permission for ONE named realtor to read their profile
-- (docs/design/profile-and-circle.md section 4.4). A share is a grant to read, never a copy: one
-- row per tenant, realtor, purpose and listing, approved only by the tenant, ended by the tenant
-- at any time, and ending on its own when its time is up. Written by lib/profileShares.js for the
-- tenant's own session (pages/api/tenant/shares.js); read for a realtor by the one reader,
-- lib/profileShareStore.js, which writes a line to the tenant's log (db/018 profile_access_log)
-- with every read. Run once in the Supabase SQL editor, after db/018-profile-vault.sql.
-- IDEMPOTENT: the table is CREATE TABLE IF NOT EXISTS with every check written inside it, the
-- indexes are CREATE INDEX IF NOT EXISTS, the function is CREATE OR REPLACE and its trigger is
-- DROP ... IF EXISTS followed by its CREATE, the foreign key on the log is added only when no
-- constraint of its name exists, row level security is switched on (a second ENABLE is a no op)
-- and the REVOKE repeats without effect. No existing row is changed. A second run changes nothing.
-- Where db/tenant-profiles.sql has not run there is nothing to share: the file says so and does
-- nothing. Where db/018 has not run the table is still made, and the log's foreign key is added
-- by a later run of this file.
-- The application tolerates this file not having run: one tap apply still sends the application
-- and makes no share, the tenant's page lists no shares, and a realtor's view answers that
-- nothing is shared.
--
-- profile_shares
--   tenant_profile_id     whose profile. recipient_profile_id: the one realtor who may read it.
--                         Both are fixed when the row is made: the trigger below refuses a change
--                         to either, from any role. A profile moves to another realtor only by a
--                         new row, which the tenant is asked about again.
--   purpose               application (the tenant applied to this realtor's listing with their
--                         profile) or pass_on (a later file's flow).
--   status                pending, approved, declined, revoked, expired. approved always carries
--                         approved_at. Only the tenant's own session sets approved or revoked.
--   scope                 what the share shows: facts, checks, documents, and nothing else.
--   documents_until       until when the realtor may open the tenant's stored documents: 14 days
--                         from approval for an application. Null: never.
--   expires_at            when the share ends on its own. Null for an application, which lasts
--                         while the application is open (checked at every read).
--   ended_at              when it ended: revoked by the tenant, or expired.
--   handoff_id            a later file's table; no foreign key yet.
-- No column can hold a Fit score, a rank or a note: a share points at a profile and says nothing
-- about the tenant.
--
-- Row level security is on and no policy is created: the browser roles read and write nothing,
-- and every privilege they might hold is revoked. Only the service role, behind the tenant's
-- session or the realtor's session and an explicit check that the realtor is the row's
-- recipient, reaches the table.

DO $$
BEGIN
  IF to_regclass('public.tenant_profiles') IS NULL THEN
    RAISE NOTICE 'db/019: public.tenant_profiles is not there yet. Run db/tenant-profiles.sql, then this file again.';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.profile_shares (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_profile_id     uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
    recipient_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    purpose               text NOT NULL CHECK (purpose IN ('application', 'pass_on')),
    requested_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    handoff_id            uuid,
    listing_id            uuid REFERENCES public.listings(id) ON DELETE SET NULL,
    status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'revoked', 'expired')),
    consent_token_hash    text UNIQUE,
    consent_expires_at    timestamptz,
    scope                 text[] NOT NULL DEFAULT ARRAY['facts', 'checks'],
    approved_at           timestamptz,
    approved_via          text CHECK (approved_via IS NULL OR approved_via IN ('session', 'email_link')),
    documents_until       timestamptz,
    expires_at            timestamptz,
    ended_at              timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profile_shares_scope_known CHECK (scope <@ ARRAY['facts', 'checks', 'documents']),
    CONSTRAINT profile_shares_approved_has_time CHECK (status <> 'approved' OR approved_at IS NOT NULL),
    CONSTRAINT profile_shares_pass_on_has_requester CHECK (purpose <> 'pass_on' OR requested_by IS NOT NULL),
    CONSTRAINT profile_shares_not_self CHECK (requested_by IS NULL OR requested_by <> recipient_profile_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS profile_shares_one_live_idx
    ON public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid))
    WHERE status IN ('pending', 'approved');
  CREATE INDEX IF NOT EXISTS profile_shares_recipient_idx ON public.profile_shares (recipient_profile_id, status);
  CREATE INDEX IF NOT EXISTS profile_shares_tenant_idx ON public.profile_shares (tenant_profile_id, created_at DESC);

  ALTER TABLE public.profile_shares ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.profile_shares FROM anon, authenticated;

  -- The log's share_id (db/018) now has a table to point at. A share that is removed leaves its
  -- log lines, pointing at none.
  IF to_regclass('public.profile_access_log') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_access_log_share_id_fkey') THEN
    ALTER TABLE public.profile_access_log ADD CONSTRAINT profile_access_log_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.profile_shares(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Whose profile and who may read it never change once the row exists, whatever the role.
CREATE OR REPLACE FUNCTION public.profile_shares_keep_parties() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_profile_id IS DISTINCT FROM OLD.tenant_profile_id OR NEW.recipient_profile_id IS DISTINCT FROM OLD.recipient_profile_id THEN
    RAISE EXCEPTION 'profile_shares: the tenant and the recipient of a share never change';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF to_regclass('public.profile_shares') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS profile_shares_keep_parties ON public.profile_shares;
    CREATE TRIGGER profile_shares_keep_parties BEFORE UPDATE ON public.profile_shares
      FOR EACH ROW EXECUTE FUNCTION public.profile_shares_keep_parties();
  END IF;
END $$;
