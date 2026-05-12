# RentLetter.ca

AI cover letter generator for Toronto renters. Same architecture as DepositBack with email delivery + downloadable PDF/Word + editable result.

## What's built

- ✅ Landing page (warm cream + black + orange, Fraunces serif headlines)
- ✅ Two-tier pricing ($9.99 single / $19.99 unlimited)
- ✅ 16-field form (now includes email)
- ✅ **Stripe payment verification** — Claude API only fires AFTER paid session confirmed
- ✅ **Claude Sonnet 4.5** for letter generation (better tone than Haiku)
- ✅ **Editable result page** — textarea instead of read-only display
- ✅ **localStorage persistence** — reload the page, letter stays
- ✅ **Email delivery** via Resend with PDF + Word attachments
- ✅ **Direct PDF / Word downloads** from result page
- ✅ Mobile responsive

## Setup (30 minutes)

### 1. Push to GitHub
Create a new private repo called `rentletter`, push everything inside this folder.

### 2. Set up Stripe Payment Links

Create TWO products in Stripe Dashboard → Products:
- **Single Letter** — $9.99 CAD one-time
- **Unlimited 30 days** — $19.99 CAD one-time

For each, create a Payment Link with:
- After payment URL: `https://rentletter.ca/?paid=true&session_id={CHECKOUT_SESSION_ID}`
- ⚠️ The `{CHECKOUT_SESSION_ID}` literal is REQUIRED — Stripe replaces it with the real ID

Copy both payment link URLs into `pages/index.js` lines 6–7.

### 3. Set up Resend (email)
- Sign up at resend.com (free tier = 3,000 emails/month)
- Add and verify domain `rentletter.ca` (DNS records in their dashboard)
- Once verified, you can send from `hello@rentletter.ca`
- Copy your API key

### 4. Deploy to Vercel
Import the GitHub repo. Add these environment variables:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your existing Anthropic key |
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe → Developers → API keys |
| `RESEND_API_KEY` | `re_...` from Resend |

### 5. Buy domain
- Namecheap: `rentletter.ca` (~$15 CAD/yr)
- Add domain in Vercel → Settings → Domains
- Add DNS A record in Namecheap pointing to Vercel

### 6. Test end-to-end
1. Fill form with real email
2. Hit pay → Stripe checkout (use a real card, refund yourself after)
3. Redirect to `/?paid=true&session_id=cs_live_...`
4. Letter generates (15–20 sec)
5. Lands on result page
6. Email arrives in 30 seconds with both PDF + Word attached
7. Reload the page → letter still there
8. Edit the letter → click Download PDF → file uses your edits

## Files

```
rentletter/
├── pages/
│   ├── index.js              ← Landing + form + editable result
│   └── api/
│       ├── generate.js       ← Sonnet 4.5 + Stripe verification
│       ├── send.js           ← Email with PDF + Word attachments
│       └── download.js       ← Direct PDF / Word download
├── package.json              ← Includes resend, docx, pdf-lib
├── next.config.js
└── README.md
```

## Launch sequence

1. **Tonight:** Ship + test end-to-end
2. **Day 1:** Post on r/TorontoRenting, r/Toronto4Rent — "Just built this after losing 8 apartments"
3. **Day 2:** Reply to live threads on r/Toronto where people ask how to stand out
4. **Day 3:** Facebook groups (Toronto Apartments for Rent 50K, GTA Renters 30K)
5. **Day 4:** TikTok testimonial video (Arcads format that worked before)
