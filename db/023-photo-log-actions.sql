-- db/023-photo-log-actions.sql
-- The tenant's log says "Photo added" and "Photo removed" in its own words
-- (db/022-full-tenant-profile.sql; lib/tenantVault.js; pages/api/tenant/personal.js).
-- profile_access_log.action gains two values:
--   photo_added     the tenant added a photo to their profile, or replaced the one before
--   photo_removed   the tenant removed their photo, or the twelve month rule removed it with
--                   the rest of an idle profile's vault (pages/api/cron/expire-vault.js)
-- Until now a photo was written as document_added and document_deleted. Lines already written
-- keep the word they were written with: no row is changed.
-- Run once in the Supabase SQL editor, after db/022-full-tenant-profile.sql.
-- IDEMPOTENT: the one check constraint on profile_access_log.action is recreated with the full
-- list (every value db/018-profile-vault.sql listed, in order, and the two new ones), as db/012
-- and db/020 did for events.type. Guarded: it is rewritten only while the constraint in place
-- does not yet accept photo_removed, so a second run reads the constraint and returns; and the
-- file does nothing where db/018 has not run. The new list holds every value the old one held,
-- so no existing row can fail it. No row is changed, and no table, column, index, policy or
-- grant is touched: row level security stays on with no policy, and nothing is granted.
-- The application tolerates this file not having run: the photo is added or removed all the
-- same, and the line in the tenant's log is not written (lib/tenantVault.js logVault reports
-- the refused insert to the server log and carries on).

DO $$
DECLARE cname text; cdef text;
BEGIN
  IF to_regclass('public.profile_access_log') IS NULL THEN RETURN; END IF;
  SELECT conname, pg_get_constraintdef(oid) INTO cname, cdef
    FROM pg_constraint
    WHERE conrelid = 'public.profile_access_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%profile_exported%'
    ORDER BY conname LIMIT 1;
  IF cdef IS NOT NULL AND cdef LIKE '%photo_removed%' THEN RETURN; END IF;
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE public.profile_access_log DROP CONSTRAINT %I', cname); END IF;
  ALTER TABLE public.profile_access_log ADD CONSTRAINT profile_access_log_action_check CHECK (action IN (
    'profile_viewed',
    'document_opened',
    'share_requested',
    'share_approved',
    'share_declined',
    'share_revoked',
    'share_expired',
    'added_to_listing',
    'document_added',
    'document_deleted',
    'document_renewed',
    'document_expired',
    'check_recorded',
    'check_removed',
    'profile_exported',
    'photo_added',
    'photo_removed'
  ));
END $$;
