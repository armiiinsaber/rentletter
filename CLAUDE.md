# Rentletter — context for every session

Rental application screening platform for Canadian realtors (Toronto launch).
Flow: realtor creates a listing → shares an invite link → tenants submit
standardized applications → realtor reviews/shortlists/documents decisions →
realtor sends a co-branded shortlist to their landlord client, including fit
against the landlord's stated preferences.

**Positioning:** Rentletter is the applicant-funnel and presentation layer
(12 applicants → top 3). It is NOT a verification or credit-check product, and
nothing may imply it replaces credit checks. The differentiator line —
"Rentletter organizes your applicants. Run credit checks wherever you already
do." — must survive in meaning on the homepage.

**Audiences:** Realtors are primary; everything is built for them. Solo
landlords/PMs are a quiet secondary audience reachable via one small footer
link, never in the hero. Tenants only ever see the application form via
invite links.

## Stack rules (hard constraints)

- Next.js **Pages Router**, plain **JavaScript**. No TypeScript, no App Router
  migration, no framework changes, no new UI/animation libraries.
- Styling lives in the pages (inline styles + `styled-jsx`). Fonts: Google
  Fonts, keep usage lean (Inter is the base face).
- Animate only `transform` and `opacity`. All motion behind
  `prefers-reduced-motion: no-preference` with fully static fallbacks. Content
  must render and read even if JS fails. IntersectionObserver + CSS only.
- `npm run build` must pass before any work is considered done.

## Do-not-touch list

- **`pages/api/**` and `lib/**`** — never modify.
- Any **fetch call's payload shape**, any **state field name**, any data
  structure. `listing.preferences.*` field names are load-bearing (share
  tokens and workspace sync depend on them) — never rename.
- **Business model logic in `pages/landlord.js`** must stay functionally
  identical: first 50 realtor signups are founders (free forever, green
  badge); later signups get a 7-day trial (amber countdown banner); lapsed
  trials see a red banner and a soft paywall hiding dashboard content.
  Restyle freely; never remove or weaken.
- If a change would touch an API file, a data shape, or a field name — stop
  and tell the user instead.

## OHRC compliance (legal red line)

Never add screening fields or copy touching gender, age, family status, race,
religion, disability, or income source. The HRTO warning copy in the landlord
preferences modal (`pages/landlord.js`) must remain. Fit indicators on the
shortlist page reference only legally screenable criteria.

## Brand tokens

- Paper `#faf8f3` (deep variant `#f2eee3`)
- Ink `#0f0f10` (soft `#3a3a3c`, mute `#86868b`)
- Rule `#e3ddd0`
- Signal red `#d72027` — brand accent and primary actions ONLY; errors and
  destructive actions use danger `#a8161c` (never brand red)
- Green `#2d7d4a` (founder badge, success, document-verified states)
- Instrument surfaces (`#101012` family in `components/theme.js`) — ink-black
  panels reserved for AI/verification/live-data moments; paper = human,
  instrument = machine, red = signal between them
- Identity: paper/ink/red, editorial confidence — Time-magazine-style red bar
  wordmark; the red tick-mark motif is the score/divider language (see
  `TickMeter` in `components/ui.js`)

## Copy tone rules

- Factual, trust-first, zero SaaS jargon, zero hype. Banned: "close faster",
  "supercharge", "win more" and the like.
- Every sentence states something the realtor concretely gets. Prefer fewer
  words.
- Design-target realtor: young and tech-savvy, 25–45 — uses ChatGPT/Claude
  casually and expects an AI-forward, fast product. Clarity fundamentals stay
  (obvious UX, generous tap targets, readable sizes); speed and density are
  tuned for this user.
