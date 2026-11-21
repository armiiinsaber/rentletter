-- db/024-share-roles.sql
-- A tenant may share their profile with the listing agent of a unit, as well as with the realtor
-- who brought them in (lib/profileShares.js; pages/api/tenant/shares.js). Sharing is only ever
-- the tenant's own act, under their own session: this file adds what records it, and opens
-- nothing to anyone.
--   profile_shares.role     who the share is with: realtor ("Your realtor": the realtor of the
--                           listing the tenant applied to) or listing_agent ("Listing agent").
--                           Null reads as realtor: every share made before this file was one.
--                           A tenant can hold both at once for the same listing: the two rows
--                           differ by their recipient, and the one live share per tenant,
--                           realtor, purpose and listing index of db/019 is untouched.
--   profile_share_invites   a listing agent the tenant invited by email who has no account yet.
--                           It shares NOTHING: it holds the address the tenant typed and the
--                           listing, so the tenant's page can say when that realtor has joined
--                           and offer Share. Only the tenant's tap makes a share. status: sent,
--                           shared (the tenant shared once they joined), cancelled. One live
--                           invite per tenant, listing and address.
-- Run once in the Supabase SQL editor, after db/023-photo-log-actions.sql.
-- IDEMPOTENT: the column is ADD COLUMN IF NOT EXISTS (nullable, no default, so no existing row
-- is rewritten and each reads as realtor), its check is added only when no constraint of its
-- name exists, the table is CREATE TABLE IF NOT EXISTS with every check written inside it, the
-- indexes are CREATE INDEX IF NOT EXISTS, row level security is switched on (a second ENABLE is
-- a no op) and the REVOKE repeats without effect. No existing row is changed. A second run
-- changes nothing. Where db/019-profile-shares.sql has not run there is no share to give a role
-- to: the file says so and does nothing.
-- The events check is not rewritten: profile_share_approved and profile_share_revoked
-- (db/020) carry the role in their payload, and no new type is added.
-- The application tolerates this file not having run: a share with the tenant's realtor works as
-- before, and the profile page says sharing with a listing agent is not available yet.
--
-- Row level security is on for the new table and no policy is created: the browser roles read
-- and write nothing, and every privilege they might hold is revoked. Only the service role,
-- behind the tenant's own session, reaches it. profile_shares keeps the row level security,
-- the absence of policies and the trigger db/019 gave it.

DO $$
BEGIN
  IF to_regclass('public.profile_shares') IS NULL THEN
    RAISE NOTICE 'db/024: public.profile_shares is not there yet. Run db/019-profile-shares.sql, then this file again.';
    RETURN;
  END IF;

  ALTER TABLE public.profile_shares ADD COLUMN IF NOT EXISTS role text;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_shares_role_known') THEN
    ALTER TABLE public.profile_shares ADD CONSTRAINT profile_shares_role_known CHECK (role IS NULL OR role IN ('realtor', 'listing_agent'));
  END IF;
  COMMENT ON COLUMN public.profile_shares.role IS 'Who the share is with: realtor (the realtor of the listing the tenant applied to) or listing_agent. Null reads as realtor.';

  CREATE TABLE IF NOT EXISTS public.profile_share_invites (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
    listing_id         uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    email              text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
    status             text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'shared', 'cancelled')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    ended_at           timestamptz
  );
  CREATE UNIQUE INDEX IF NOT EXISTS profile_share_invites_one_live_idx ON public.profile_share_invites (tenant_profile_id, listing_id, email) WHERE status = 'sent';
  CREATE INDEX IF NOT EXISTS profile_share_invites_tenant_idx ON public.profile_share_invites (tenant_profile_id, created_at DESC);

  ALTER TABLE public.profile_share_invites ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.profile_share_invites FROM anon, authenticated;
END $$;
