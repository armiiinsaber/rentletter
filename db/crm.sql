-- db/crm.sql
-- Founder's personal CRM (/admin/crm): realtor leads, the brokerages they belong to, and
-- append-only timestamped notes on both. FOUNDER-ONLY data — reached exclusively through the
-- admin session (/api/admin/crm) with the service-role client. No realtor or tenant ever reads
-- or writes these tables, and nothing here references realtor/tenant data.
--
-- Run once in Supabase (SQL editor). Safe/idempotent. Until it runs, /admin/crm shows a
-- designed "run the migration" state (lib/crmStore.js detects the missing tables).

CREATE TABLE IF NOT EXISTS public.crm_brokerages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  name_key    text NOT NULL UNIQUE,            -- lower(trim(name)); one record per firm
  website     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  brokerage_id             uuid REFERENCES public.crm_brokerages(id) ON DELETE SET NULL,
  email                    text,
  phone                    text,
  instagram                text,               -- handle without the @
  source                   text NOT NULL DEFAULT 'other'
                           CHECK (source IN ('referral', 'instagram', 'cold', 'other')),
  referred_by              text,               -- free text: who sent them
  stage                    text NOT NULL DEFAULT 'new'
                           CHECK (stage IN ('new', 'contacted', 'demo_booked', 'demo_done', 'follow_up_later', 'client', 'set_aside')),
  stage_changed_at         timestamptz NOT NULL DEFAULT now(),
  demo_at                  timestamptz,        -- the demo call (date + time)
  follow_up_at             date,               -- next follow-up
  follow_up_email_sent     boolean NOT NULL DEFAULT false,
  follow_up_email_sent_at  date,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_leads_stage_idx        ON public.crm_leads (stage);
CREATE INDEX IF NOT EXISTS crm_leads_brokerage_idx    ON public.crm_leads (brokerage_id);
CREATE INDEX IF NOT EXISTS crm_leads_follow_up_idx    ON public.crm_leads (follow_up_at);
CREATE INDEX IF NOT EXISTS crm_leads_demo_at_idx      ON public.crm_leads (demo_at);

-- Append-only notes: a note belongs to a lead OR a brokerage. Never updated, only added
-- (history after every call is the point), deletable from the record.
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  brokerage_id  uuid REFERENCES public.crm_brokerages(id) ON DELETE CASCADE,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR brokerage_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS crm_notes_lead_idx      ON public.crm_notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_notes_brokerage_idx ON public.crm_notes (brokerage_id, created_at DESC);

COMMENT ON TABLE public.crm_brokerages IS 'Founder CRM: brokerage entities. Service-role only (deny-all RLS).';
COMMENT ON TABLE public.crm_leads      IS 'Founder CRM: realtor leads in the sales pipeline. Service-role only (deny-all RLS).';
COMMENT ON TABLE public.crm_notes      IS 'Founder CRM: append-only timestamped notes on leads and brokerages. Service-role only (deny-all RLS).';

-- Deny-all RLS: no policies, so only the service role (which bypasses RLS) can touch these.
ALTER TABLE public.crm_brokerages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes      ENABLE ROW LEVEL SECURITY;
