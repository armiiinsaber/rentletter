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
landlords/PMs are a quiet secondary audience reachable via one small footer
link, never in the hero. Tenants have a profile page, a document vault, their
applications and sharing controls, as well as the application form.

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

- **`lib/**` and `pages/api/**`**: a prompt names the files there that may be
  edited. Any file there that the prompt does not name needs the user's
  approval first: stop and ask.
- **Data shapes and field names** change only when the prompt says so.
- **Database changes** are new idempotent files in `db/` that the user runs by
  hand, verified in `scripts/verify-migrations.mjs`, and the app must work
  when a file has not run.
- **Business model logic in `pages/dashboard.js`** must stay functionally
  identical: first 50 realtor signups are founders (free forever, green
  badge); later signups get a 7-day trial (amber countdown banner); lapsed
  trials see a red banner and a soft paywall hiding dashboard content.
  Restyle freely; never remove or weaken.

## Standing rules

- Never print secrets or `.env` values, and never read `.env` files.
- Tests never touch real Supabase, real mail or the real Anthropic API.
- `owner_token` never reaches the realtor side.
- The strength score never reaches a realtor.
- The ID is never shown back.
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
religion, disability, or income source. The HRTO warning copy in the landlord
preferences modal (`pages/dashboard.js`) must remain. Fit indicators on the
shortlist page reference only legally screenable criteria.

## Brand tokens

- Paper `#faf8f3` (deep variant `#f2eee3`)
- Ink `#0f0f10` (soft `#3a3a3c`, mute `#86868b`)
- Rule `#e3ddd0`
- Signal red `#d72027`: brand accent and primary actions ONLY; errors and
  destructive actions use danger `#a8161c` (never brand red)
- Green `#2d7d4a` (founder badge, success, document-verified states)
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
  you close sooner with confidence." The ban holds everywhere else.
- Every sentence states something the realtor concretely gets. Prefer fewer
  words.
- Design-target realtor: young and tech-savvy, 25 to 45, uses ChatGPT/Claude
  casually and expects an AI-forward, fast product. Clarity fundamentals stay
  (obvious UX, generous tap targets, readable sizes); speed and density are
  tuned for this user.
