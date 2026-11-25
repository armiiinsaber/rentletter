# Rentletter: context for every session

Rental application platform for Canadian realtors and tenants (Ontario and
BC). A tenant builds one profile and applies to listings with it. A realtor
creates a listing, shares an invite link, reviews the applications with the
documents read and matched, and sends the landlord a report under their own
brand.

**Positioning:** Rentletter is a rental application platform for realtors and
tenants in Ontario and BC. A tenant builds one profile and reuses it. A realtor
gets the application, the documents read and matched, and a report for the
landlord. Realtors connect through the Circle. Rentletter is building
verification into the product. Until it ships, no screen inside the app may
tell a realtor, a landlord or a tenant that a specific applicant has been
verified or background checked unless that check actually happened for that
applicant. Marketing copy may describe the product direction.

**Audiences:** Realtors are primary; everything is built for them. Solo
landlords and property managers are a quiet secondary audience, never in the
hero. They have no page or link of their own: they are reached through two
sections of the FAQ (`pages/faq.js`: For landlords renting it yourself, For
property managers), which the homepage links to as FAQ. Tenants have a
profile page, a document vault, their applications and sharing controls, as
well as the application form.

## Stack rules (hard constraints)

- Next.js **Pages Router**, plain **JavaScript**. No TypeScript, no App Router
  migration, no framework changes, no new UI/animation libraries.
- Styling: the one stylesheet (`GlobalStyle`) lives in `components/ui.js` and
  the tokens in `components/theme.js`; pages and components add inline styles
  and `styled-jsx` on top. Fonts: Inter (the base face) and Fraunces (display),
  served from `public/fonts`. Google Fonts load only for a realtor's own brand
  fonts (`lib/brandFonts.js`) and on the founder office's commitment page.
- Motion, the goal: animate only `transform` and `opacity`. All motion behind
  `prefers-reduced-motion: no-preference` with fully static fallbacks. Content
  must render and read even if JS fails. IntersectionObserver + CSS only.
  Known exceptions in the code today. They are debt to fix, not allowed, and
  never a pattern to copy:
  - `components/ui.js`: the site header transitions `box-shadow`,
    `border-color` and `padding` (`.rl-header`, `.rl-header-inner`) and the FAQ
    accordion transitions `grid-template-rows` (`.rl-acc`), all outside the
    reduced motion query; `.rl-btn` transitions `box-shadow`, `background` and
    `border-color`, and `.rl-card-lift` transitions `box-shadow`.
  - `components/dashboard/ListingView.js`: `.lv-fold` transitions
    `grid-template-rows`.
  - `components/Sheet.js`: the page behind a sheet transitions `scale` and
    `border-radius`.
  - `components/mockups/HeroDemo.js`: transitions `box-shadow`, `border-color`
    and `max-height`.
  - `components/admin/AdminShell.js` and `pages/admin/crm.js`: transitions of
    `background`, `border-color`, `color` and `box-shadow`.
  - Motion driven by script, not by IntersectionObserver and CSS: the door
    mark (`components/brand/DoorMark.js`, one requestAnimationFrame clock),
    the swipes (`components/motion/swipe.js`), the homepage hero tilt
    (`pages/index.js`) and route transitions (`components/nav/RouteFrame.js`,
    the View Transitions API).
- `npm run build` must pass before any work is considered done.

## Do-not-touch list

- **`lib/**` and `pages/api/**`**: a prompt names the files there that may be
  edited. Any file there that the prompt does not name needs the user's
  approval first: stop and ask.
- **Data shapes and field names** change only when the prompt says so.
- **Database changes** are new idempotent files in `db/` that the user runs by
  hand, verified in `scripts/verify-migrations.mjs`, and the app must work
  when a file has not run.
- **The entitlement checks** (`lib/entitlements.js`, `lib/billingOff.js`,
  `lib/requireEntitlement.js`). `getEntitlement(profile)` is the one place
  that decides whether a realtor may use the product, from `profile.plan`:
  founding, trialing, trial_expired, paid, past_due (with a grace period) or
  none. `requireEntitlement` applies it on every realtor write route under
  `pages/api` and answers 402 when the product is locked (three unlock routes
  are exempt by name, `tests/routes/entitlementScan.test.mjs`). A locked
  realtor sees the paywall (`components/dashboard/Paywall.js`) in place of the
  dashboard, the listing page and Circle. `billingOff()` reads `BILLING_OFF`:
  left unset, billing is off in production and on everywhere else. Billing is
  off in production today: the checks still run, every signed in realtor is
  entitled, no paywall, trial or plan shows on screen, and `/billing` goes to
  the dashboard. Restyle freely; never remove or weaken the entitlement
  checks.

## Standing rules

- Never print secrets or `.env` values, and never read `.env` files.
- Tests never touch real Supabase, real mail or the real Anthropic API.
- `owner_token` never reaches the realtor side.
- The strength score never reaches a realtor.
- The tenant's vault ID is never opened by a realtor through a share and
  never shown back to the tenant (`lib/tenantVault.js`,
  `lib/profileShareStore.js`). An ID uploaded with an application is viewable
  by the owning realtor for 14 days (View ID on the screening checklist,
  `lib/documentRetention.js`), as built.
- `lib/tenantProfileStore.js` is the only file that touches `tenant_profiles`
  (the founder office's count in `lib/adminData.js` reads no row), and
  `lib/profileShareStore.js` is the only realtor reader of a profile.
- Never loosen a test or raise a timeout.
- No em dash, en dash or hyphen as punctuation, in copy, comments or commit
  messages.
- Layout: no line break may leave one word or a few words alone on the next
  line. Check changed copy at 320 and 390 and at the desktop widths 1440 and
  1920, in WebKit and in Chrome.
- Never delete anything outside `.next-fake-*` and `.next-walk-*`.

## OHRC compliance (legal red line)

Never add screening fields or copy touching gender, age, family status, race,
religion, disability, or income source. The HRTO warning copy in the listing
form (`components/listings/ListingSetupModal.js`) must remain. Fit indicators
on the shortlist page reference only legally screenable criteria.

A date of birth is collected only for the age of majority rule in
`lib/applyAge.js`: it is read on the tenant's device and only the answer is
sent. The kind of income must never reach a landlord: the report page, the
PDF, the pasted text and the snapshot they are built from carry the amount
alone (`lib/parties.js` landlordPartyFacts, landlordFacts;
`tests/incomeKindLandlord.test.mjs`).

## Brand tokens

- Paper `#faf8f3` (deep variant `#f2eee3`)
- Ink `#0f0f10` (soft `#3a3a3c`, mute `#6b6b70`)
- Rule `#e3ddd0`
- Signal red `#d72027`: brand accent and primary actions ONLY; errors and
  destructive actions use danger `#a8161c` (never brand red). Used today for
  the wordmark's bar, primary action buttons, the focus ring and the text
  selection, the red tick on a confirmed or done state and on the TickMeter,
  the rank numerals on the landlord report, the text links on the sign in and
  sign up pages, the Trial ended badge, and on the realtor's Listings view the
  red dot that marks what needs the realtor (a status board tile, a listing
  card, Circle in the sidebar and the tab bar) and the current stage of a
  listing card's strip.
- Done `#1e6670` (tint `#e9f1f2`): a done state on the tenant's own profile
  only (`components/tenant/ProfileLayout.js`), never a control or a notice.
  No green, amber or gold token exists (`tests/noGreenAmber.test.mjs`);
  everywhere else a done state is ink or the red tick.
- Instrument surfaces (`#101012` family in `components/theme.js`): ink-black
  panels reserved for AI/verification/live-data moments; paper = human,
  instrument = machine, red = signal between them
- Identity: paper/ink/red, editorial confidence. Time-magazine-style red bar
  wordmark; the red tick-mark motif is the score/divider language (see
  `TickMeter` in `components/ui.js`)

## Copy tone rules

- Factual, trust-first, zero SaaS jargon, zero hype. Banned: "close faster",
  "supercharge", "win more" and the like. One approved exception, the owner's
  decision of November 23, 2026: the homepage's Where we fit line, "A full
  background check on every applicant." then, in grey, "Read and organized, so
  you close sooner with confidence." The same two sentences also appear on
  the join page (`pages/join/index.js`) and in the brand kit
  (`scripts/brand/kit.mjs`). The ban holds everywhere else.
- Every sentence states something the realtor concretely gets. Prefer fewer
  words.
- Design-target realtor: young and tech-savvy, 25 to 45, uses ChatGPT/Claude
  casually and expects an AI-forward, fast product. Clarity fundamentals stay
  (obvious UX, generous tap targets, readable sizes); speed and density are
  tuned for this user.
