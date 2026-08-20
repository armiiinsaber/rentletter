-- db/employment-income.sql
-- Employment type / registered business name (self-employed) and after-tax income.
--
-- The tenant application now captures: an employment type (full-time | part-time | contract |
-- self-employed), the registered business name when self-employed (also stored in `employer`
-- so every existing employer display shows it), and an after-tax income figure — estimated by
-- lib/taxEstimate.js or stated by the tenant (net_income_source says which).
-- annual_income remains GROSS and is the only income figure the scorecard uses.
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, the KV→Supabase mirror
-- retries without these columns (lib/supabaseBridge.upsertApplication); KV-backed views (share
-- links, exports) show the fields immediately, the Supabase-backed dashboard after the SQL runs.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS net_income integer,
  ADD COLUMN IF NOT EXISTS net_income_source text;

COMMENT ON COLUMN public.applications.employment_type IS 'full-time | part-time | contract | self-employed | NULL (not stated)';
COMMENT ON COLUMN public.applications.business_name IS 'Registered business name when self-employed (own or family business). Mirrored into employer too.';
COMMENT ON COLUMN public.applications.net_income IS 'After-tax annual income (display only; never scored). annual_income is gross.';
COMMENT ON COLUMN public.applications.net_income_source IS 'estimated (lib/taxEstimate) | stated (tenant overwrote the estimate)';
