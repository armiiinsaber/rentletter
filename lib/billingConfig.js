// lib/billingConfig.js — DISPLAY ONLY. Client-safe: no secrets, no logic that decides access
// or money. The amounts here are what the paywall PRINTS; what Stripe CHARGES is whatever the
// price objects say. Keep the two in step by hand when you change a price in the dashboard.
//
// Environment variables (server unless marked public):
//   STRIPE_SECRET_KEY                    server. sk_live_… / sk_test_…  — every Stripe API call
//   STRIPE_WEBHOOK_SECRET                server. whsec_… — verifies /api/stripe/webhook signatures
//   NEXT_PUBLIC_STRIPE_PRICE_MONTHLY     public. price_… for the monthly plan (CAD)
//   NEXT_PUBLIC_STRIPE_PRICE_ANNUAL      public. price_… for the annual plan (CAD)
//   NEXT_PUBLIC_SITE_URL                 public. https://rentletter.ca — success/cancel/portal returns
export const CURRENCY = 'CAD';
export const GRACE_DAYS = 7;
export const PLANS = {
  month: { key: 'month', label: 'Monthly', amount: 49.99, per: 'month', priceIdEnv: 'NEXT_PUBLIC_STRIPE_PRICE_MONTHLY' },
  year: { key: 'year', label: 'Annual', amount: 499.00, per: 'year', priceIdEnv: 'NEXT_PUBLIC_STRIPE_PRICE_ANNUAL' },
};
export const priceId = (interval) => (interval === 'year' ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL : process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY) || '';
export const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// "Saves $100.88 a year" — display arithmetic on the display constants.
export const annualSaving = () => Math.round((PLANS.month.amount * 12 - PLANS.year.amount) * 100) / 100;
