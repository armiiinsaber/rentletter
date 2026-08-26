-- db/stripe-lifecycle.sql
-- Stripe subscription lifecycle on profiles + the webhook's idempotency ledger. Run once in the
-- Supabase SQL editor, AFTER db/billing-and-promos.sql. IDEMPOTENT: every statement is
-- IF NOT EXISTS / guarded. No statement touches existing rows.
--
--   profiles.grace_ends_at       set by invoice.payment_failed (now() + 7 days); access continues
--                                until then (lib/entitlements.js), cleared when payment succeeds
--   profiles.billing_interval    'month' | 'year' | null — mirrors the subscription's price
--   profiles.current_period_end  mirrors Stripe
--   profiles.canceled_at         set when customer.subscription.deleted arrives (access ends)
--   stripe_events                one row per Stripe event id; the webhook inserts BEFORE it does
--                                anything else, so a replayed event is a no-op.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_interval text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_billing_interval_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_billing_interval_check CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx ON public.profiles (stripe_customer_id);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           text PRIMARY KEY,                  -- Stripe event id (evt_…): the idempotency key
  type         text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- Service role only: RLS on + no policies = anon/authenticated see nothing (same as promo_codes).
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM anon, authenticated;

COMMENT ON TABLE public.stripe_events IS 'Webhook idempotency ledger: one row per Stripe event id, inserted before any side effect.';
