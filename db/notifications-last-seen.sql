-- db/notifications-last-seen.sql
-- Notification center (realtor dashboard) — DERIVED approach.
--
-- Notifications are computed on-load from existing timestamps in listing_applicants:
--   * NEW application  -> listing_applicants.created_at
--   * WITHDRAWAL       -> decision_status = 'withdrawn' AND decision_changed_at
-- The ONLY new state is a per-realtor "last seen the bell" marker. No new table, no
-- new writes on the tenant/mirror path.
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, /api/notifications
-- degrades gracefully (shows recent activity as unread; "mark seen" won't persist).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_last_seen timestamptz;

-- RLS: profiles already restricts a realtor to their own row, so the existing
-- "update own profile" policy covers writing this column. No extra policy needed.
