-- db/report-snapshots.sql
-- Every send of the landlord report freezes a snapshot: the landlord opens a private page built
-- from it, answers per applicant, and the realtor sees the answer. Run once in the Supabase SQL
-- editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded; nothing touches existing
-- rows. The application tolerates the table being absent (send-report falls back to today's
-- behaviour with one server log line), so this can run before or after the deploy.
--
--   token     32 characters from the id alphabet (lib/applicationIds.js), the page's only credential.
--   payload   the frozen report (lib/reportSnapshot.js buildSnapshot): screenable facts only.
--   answers   { "<rank>": { "answer": "meet" | "pass", "at": iso } } written by /api/report/answer.

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  profile_id uuid not null,
  token text not null unique,
  payload jsonb not null,
  sent_to_name text,
  sent_to_email text,
  answers jsonb not null default '{}'::jsonb,
  opened_count int not null default 0,
  last_opened_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

comment on table public.report_snapshots is 'One frozen landlord report per send. Opened by /r/{token}; answers from /api/report/answer. Service role only.';

alter table public.report_snapshots enable row level security;

create index if not exists report_snapshots_listing_created_idx on public.report_snapshots (listing_id, created_at desc);
create index if not exists report_snapshots_token_idx on public.report_snapshots (token);

-- The timeline gains report_opened and landlord_answered. The check constraint on events.type is
-- recreated with the full list (matches lib/eventTypes.js and db/events.sql). Guarded: only
-- rewritten when the current constraint does not yet accept the new types.
DO $$
DECLARE cdef text;
BEGIN
  IF to_regclass('public.events') IS NULL THEN RETURN; END IF; -- db/events.sql has not run yet
  SELECT pg_get_constraintdef(oid) INTO cdef FROM pg_constraint WHERE conname = 'events_type_check';
  IF cdef IS NOT NULL AND cdef LIKE '%landlord_answered%' THEN RETURN; END IF;
  IF cdef IS NOT NULL THEN ALTER TABLE public.events DROP CONSTRAINT events_type_check; END IF;
  ALTER TABLE public.events ADD CONSTRAINT events_type_check CHECK (type IN (
    'applicant_applied',
    'documents_requested',
    'documents_uploaded',
    'documents_nudged',
    'verification_completed',
    'verification_failed',
    'document_stored',
    'document_opened',
    'document_deleted',
    'documents_expired',
    'retention_run',
    'report_generated',
    'report_sent',
    'report_opened',
    'landlord_answered',
    'applicant_set_aside',
    'applicant_restored',
    'applicant_withdrew',
    'applicant_marked_finalist',
    'applicant_confirmed',
    'applicant_not_selected',
    'referral_received',
    'referral_accepted',
    'invite_link_created',
    'profile_edited_after_verification',
    'listing_created',
    'listing_updated',
    'branding_updated'
  ));
END $$;
