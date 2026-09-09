-- db/retention-runs.sql
-- One row per retention run (lib/retention.js runRetention), dry or enforce. Run once in the
-- Supabase SQL editor. IDEMPOTENT: every statement is IF NOT EXISTS or guarded. The application
-- tolerates this file not having run: the run is logged, one warning says the table is absent,
-- nothing else changes.
--
-- Service role only: row level security is on and no policy is created, so the anon and
-- authenticated roles can neither read nor write it; the service role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.retention_runs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at                    timestamptz NOT NULL DEFAULT now(),
  mode                      text NOT NULL CHECK (mode IN ('dry', 'enforce')),
  applications_considered   integer NOT NULL DEFAULT 0,
  applications_deleted      integer NOT NULL DEFAULT 0,
  oldest_application_number text,
  details                   jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.retention_runs IS 'Every retention run: twelve months after last activity, never on an active listing (lib/retention.js).';
COMMENT ON COLUMN public.retention_runs.mode IS 'dry (default, nothing deleted) or enforce (RETENTION_ENFORCE=true).';
COMMENT ON COLUMN public.retention_runs.details IS 'cutoff, junction and held document counts, the oldest ten application numbers with their last activity.';

CREATE INDEX IF NOT EXISTS retention_runs_ran_at_idx ON public.retention_runs (ran_at DESC);

ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role reads or writes this table.
