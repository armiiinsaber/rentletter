# Rentletter against Apple's Human Interface Guidelines, September 2026

A read only audit of Rentletter as a web page on iPhone Safari, against the unofficial copy of the
Human Interface Guidelines for iOS 26 in github.com/danielimad/SKILLS (skill `apple-hig`, pages
crawled from developer.apple.com, most stamped 2025 12 16). Page names in the tables are the files
of that copy: `accessibility`, `buttons`, `typography`, `color`, `entering-data`, `text-fields`,
`virtual-keyboards`, `feedback`, `loading`, `alerts`, `modality`, `sheets`, `motion`, `layout`,
`voiceover`, `writing`, `dark-mode`, `undo-and-redo`.

## How it was measured

- Engine: Playwright WebKit (the engine inside Safari), iPhone user agent, touch, device pixel ratio 2.
- Widths: every screen at 390 by 844 and at 360 by 780. The two widths gave the same findings; where
  a number differs, the 390 value is quoted.
- Code: main at `a417ec8`, served by `next dev`. The realtor screens are the sandbox (`/demo/dashboard`),
  which renders the same components as the product. Nothing left the machine: every request outside
  localhost got a canned answer, and the sign in failure was a stubbed auth answer.
- Tap targets: every link, button, field, and control with a role. Each control smaller than 44 by 44
  was scrolled to the centre and hit tested pixel by pixel along both centre lines, so "hit" below is
  the area that really answers a tap, padding and neighbours included. Hit width is measured to at most 121.
- Text: every element that owns text, with its computed size, weight and family.
- Contrast: WCAG 2 ratio of the text colour against every background up the tree, composited, with
  opacity applied. The threshold is 4.5 to 1, or 3 to 1 at 24px, or at 18.66px bold.
- Fields: the attributes as rendered.
- Errors: each form submitted wrong, then the message, `aria` wiring and `document.activeElement` read.
- Focus: Tab pressed once to set keyboard modality, then every control focused and its outline,
  shadow, border and background compared with its unfocused state.
- Modals: opened, Tab pressed 25 times, then Escape, then a tap on the scrim.
- Text zoom at 200 percent, two ways. Safari page zoom, which lays the page out at half the width
  (195 by 422 at scale 4). Text only zoom, which doubles every font size at 390. The text that
  runs past the screen edge is measured from each text node's line boxes.
- Motion: `document.getAnimations()` at load and while scrolling the whole page, with reduced motion
  off and on, plus every stylesheet rule that carries a transition or an animation.

Screens walked:
- Tenant: apply steps 1 to 8, the two error states, done with documents, and the confirmation.
- Realtor:
  - Sign up, sign in, the sign in error, forgot password and reset password.
  - The dashboard, Pipeline, the new listing modal and the listing page.
  - The applicant card expanded, the screening checklist, the document viewer and the post kit.
  - The Mark rented sheet, the set aside sheet, the Next panel, and profile with branding.
- Landlord: the private report and the answered state.
- Marketing: the home page.

Screenshots are in `docs/hig-audit-2026-09/`, named `{screen}-{width}.jpg` (full page at 390, first
screen at 360), plus `zoom200-*`, `text200-*` and `modal-*`.

**Could not be measured:**
- The iPhone keyboard itself: the emulator shows no virtual keyboard, so the keyboard is inferred
  from `type` and `inputmode`.
- A sheet's scroll with the keyboard open.
- Safe area insets: the emulator reports `env(safe-area-inset-*)` as 0, so those rows come from the code.
- The pressed look under a real finger.
- VoiceOver speech output: names, roles and order were read from the DOM instead.

**Dark mode:** the app does not support it. No page or component outside `components/admin/AdminShell.js`
has a `prefers-color-scheme` rule, and the paper canvas renders in light under a dark system setting.
Noted only, as asked, with no recommendation.

## A. Findings

Severity: **must** blocks or seriously hinders a task, or fails WCAG AA or 44 by 44 on a primary
path. **should** is a clear gap with a workaround. **consider** is polish.

### Touch targets

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard, listing, profile, Pipeline | The Next bell is smaller than 44 by 44 | accessibility (Mobility, 44x44 pt), buttons | components/dashboard/AssistantBell.js:40 | box 34x34, hit 34x34 | must | small |
| Listing page | "All listings", the way back, is a text link 17px tall | accessibility, buttons | components/dashboard/ListingView.js:910 | box 86x17, hit 86x18 | must | small |
| New listing modal | Selects are 25px tall | accessibility | components/listings/ListingSetupModal.js:189, :195 | box 316x25, hit 121x26 | must | small |
| New listing modal | Checkboxes are 24px tall | accessibility | components/listings/ListingSetupModal.js:140 | box 316x24, hit 121x24 | must | small |
| New listing modal | Cancel and Create listing are under 44 tall | accessibility, buttons | components/listings/ListingSetupModal.js:267, :271 | Cancel 78x42, Create 116x40 | should | small |
| Set aside sheet | The reason select is 22px tall | accessibility | components/dashboard/ListingView.js:1248 | box 324x22, hit 121x22 | must | small |
| Apply steps 2 to 8 | Back and Edit are text buttons narrower than 44 | accessibility, buttons | components/tenant/ProfileFacts.js:127 (`.mp-link`, padding 0) | Back 34x44, Edit 26x44 (hit 28x44) | should | small |
| Apply step 6 | The two switches are 24 tall. The label beside each switch toggles on tap, but it is a plain span, not part of the control | accessibility, toggles | components/apply/fields.js:56, :60 | box 44x24, hit 44x24 | should | small |
| Sign in, sign up, forgot and reset password | Every link is 16px tall | accessibility | pages/signin.js:59, :79; pages/signup.js:161, :207; pages/forgot-password.js:52, :65; pages/reset-password.js:133 | hit 96x18 to 121x18, "Forgot your password?" 121x16 | should | small |
| Sign up | The terms checkbox row is under 44 tall | accessibility | pages/signup.js:199 | box 308x39, hit 121x40 | should | small |
| Home | Footer links are 18px tall | accessibility | pages/index.js:1093 | 8 links, box 161x18, hit 121x18 | should | small |
| Sandbox bar | "Reset sample" and "Use it for real" are 34 tall | accessibility | pages/demo/dashboard.js:66 | box 358x34, hit 121x34 | should | small |
| Listing page | Buttons sit inside a card header that is itself `role="button"`, so VoiceOver meets a button inside a button | voiceover, accessibility | components/dashboard/ListingView.js:742, :753 (inner buttons, for example :798) | 5 nested: Verify, Send again, Review documents, Request documents, Restore | should | medium |

### Text size and legibility

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Landlord report | Criteria labels on each applicant are 10px, under the 11pt minimum | typography, accessibility (default 17 pt, minimum 11 pt) | pages/r/[token].js:140 | 24 labels at 10px, in #86868b on white | must | small |
| New listing modal | Section labels are 10px | typography | components/listings/ListingSetupModal.js:36 | 4 labels at 10px | should | small |
| Profile and branding | Palette and font pairing cards use 9.5px to 10.5px | typography | components/dashboard/ProfileEditorBody.js:419, :425 | 33 text runs from 9.5 to 10.5px | should | small |
| Home | The hero product mockup renders text from 8.58px to 10.14px | typography | components/mockups/HeroDemo.js:80, :87, :101 | 15 text runs under 11px at 390 | consider | small |
| Every realtor screen, landlord, apply | Body copy uses the 14px token | typography (Body 17 pt default) | components/ui.js:21 (`--t-body-2: 14px`) | 14px body copy on 15 of 19 base screens; 16px is used only for the main value lines | should | medium |
| Sign in, sign up, forgot, reset | Auth labels are 12px, notices 13.5px, the error 13px | typography | components/auth/AuthShell.js:66, :72, :78 | label 12px, error 13px, notice 13.5px | should | small |
| Every screen | Sizes are fixed px, so the iPhone Larger Text setting does not reach the web page | typography (Dynamic Type), layout | components/ui.js:21 | 0 uses of `-apple-system-body` or `rem` in the type tokens | consider | large |
| Every screen | Line length stays short | typography | none | the longest multi line paragraph is 57 characters a line (profile), none over 80 | none, passes | none |

### Contrast

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Every screen | The secondary text colour fails AA on every surface it sits on | accessibility (4.5:1 up to 17 pt), color | components/theme.js:28 (`inkMute: '#86868b'`) | 3.41 on paper #faf8f3, 3.62 on white, 3.13 on #f2eee3. 243 failing text runs (each counted once, not again on overlays), on 29 of 33 screen states: field labels on every apply step, state words on applicant cards, landlord criteria, the Next panel lines, helper text | must | small |
| Apply, auth, new listing, set aside, profile | Placeholders use the browser default grey | accessibility, text-fields | no `::placeholder` rule in components/ui.js; fields at components/apply/fields.js:22, components/auth/AuthShell.js:51 | #a9a9a9 on #faf8f3 = 2.21 | should | small |
| Listing page, set aside row | The set aside reason line and the Restore control fail AA | accessibility | components/dashboard/ListingView.js:747, :751 | reason #8c8c90 on #f2eee3 = 2.88; Restore #2d7d4a on #f2eee3 = 4.37 at 14px bold | must | small |
| Home | The step numbers 01 to 04 are near invisible | accessibility | pages/index.js:540 | #e3ddd0 on #faf8f3 = 1.27 at 22px | should | small |
| Home | Mockup role lines and the avatar initials fail | accessibility | components/mockups/HeroDemo.js:35, :87 | #bcbcbf on white = 1.89; "PN" #a1c5ae on #2d7d4a = 2.67 | consider | small |
| Sign up | The terms error is set in brand red, which the house rules reserve for actions (errors use danger #a8161c) | color (same colour, one meaning) | pages/signup.js:213 | #d72027, 12px; 4.80 on paper, passes AA | should | small |
| Every screen with icons | Icons pass | accessibility | none | 0 icons under 3:1 | none, passes | none |

### Forms and keyboards

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Apply, all 8 steps | No field carries `autocomplete`, so Safari AutoFill cannot fill email, name, date of birth, phone, employer or job title | entering-data (get information from the system) | components/apply/fields.js:22 | 0 of 27 fields with `autocomplete` | must | small |
| Sign in, sign up, forgot, reset | Inputs are 15px, and Safari zooms the page when an input under 16px takes focus | text-fields, typography | components/auth/AuthShell.js:52 | 15px on 6 inputs | must | small |
| Profile, set aside sheet, home | The same focus zoom affects these fields | text-fields | components/dashboard/ProfileEditorBody.js:299; components/dashboard/ListingView.js:1248, :1255; pages/index.js:586 | profile 14px (5 fields), set aside reason and note 14px, home link field 15px | must | small |
| Profile | Field labels are not tied to their inputs, so Phone and RECO number have no accessible name | voiceover, text-fields | components/dashboard/ProfileEditorBody.js:298 (a label with no `htmlFor`) | 2 unnamed inputs, 4 unlinked labels | must | small |
| New listing modal, set aside sheet | The notes textareas are named only by their placeholder | text-fields (placeholders disappear) | components/listings/ListingSetupModal.js:236; components/dashboard/ListingView.js:1255 | 2 textareas with no name | must | small |
| Apply step 3 | "Years at this job" opens the full keyboard | virtual-keyboards (match the content) | pages/apply/[token].js:490 | type text, no `inputmode` | should | small |
| New listing modal | The landlord phone opens the full keyboard | virtual-keyboards | components/listings/ListingSetupModal.js:255 | type text, expected tel | should | small |
| Apply form | Errors sit under the field with `role="alert"` and `aria-invalid`, but focus stays on the page and the message is not tied to the field | entering-data, writing (errors next to the problem) | components/apply/fields.js:14, :23; pages/apply/[token].js:447 | after Continue: activeElement is body; `aria-describedby` null; message 52px under the field, in view | should | small |
| Sign in | A failed sign in shows a 13px message with no alert role, and neither field is marked invalid | feedback (show why a command failed), voiceover | pages/signin.js:62; components/auth/AuthShell.js:66 | no role, no live region, `aria-invalid` null on both fields, focus on body | must | small |
| Sign up | Passwords that differ give no message after leaving Confirm password. The button just stays disabled | entering-data (dynamically validate) | pages/signup.js:194 | 0 messages after blur; Create account disabled | should | small |
| New listing modal | Create listing is disabled until every required field is filled, with one summary line at the top | entering-data (disabled until ready is endorsed) | components/listings/ListingSetupModal.js:271 | summary 13px at 141px from the top | consider | small |

### Feedback

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Every screen | 36 distinct button styles have no pressed state at all. Most are inline styled, so they cannot carry `:active`: the auth submits, the landlord answers, the apply Continue and Submit, the sheet Confirm, Close on the viewer and the panel | buttons (always include a press state) | components/auth/AuthShell.js:57; pages/r/[token].js:167; components/tenant/ProfileFacts.js:129; components/ui.js:278; components/dashboard/DocumentViewer.js:22 | 27 of 170 styles matched a `:active` rule | should | medium |
| Every screen | The `:active` rules that exist (`.rl-btn`, `.dash-new`, the avatar) need a `touchstart` listener to show under a finger in iOS Safari. Only the swipe cards and ActionRow register one | buttons | components/ui.js:135; components/dashboard/HomeView.js:501; listeners only at components/motion/swipe.js:173, components/dashboard/ActionRow.js:34 | 2 listeners in the codebase. Not measurable on a device here | should | small |
| Landlord report | The two answer buttons disable while saving but keep their label | buttons (activity in the button), loading | pages/r/[token].js:167, :169 | label unchanged while busy | consider | small |
| Listing, my application, home | Deleting a listing, withdrawing an applicant, revoking an application and clearing a form use the browser's own `confirm()`. Its OK button has no destructive style and no clear title, though the product's own sheet exists | alerts (avoid OK, destructive style, Cancel) | components/dashboard/ListingView.js:300, :575; pages/my-application/[rl].js:99; pages/index.js:311 (sheet at components/ui.js:258) | 4 native confirms | should | small |
| Auth, apply, new listing, uploader | Network buttons show a loading state | loading | pages/signin.js:82; pages/apply/[token].js:627; components/listings/ListingSetupModal.js:274; components/tenant/DocumentUploader.js:151 | label changes while waiting | none, passes | none |

### Navigation

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Apply form | The steps are not in browser history. Back at step 3 leaves the form entirely | navigation-and-search, modality (retrace steps) | pages/apply/[token].js:109 (step kept in state only) | at step 3 of 8, Back landed on the previous site; the form was gone | must | medium |
| Email links, signed out | A link to one listing or applicant loses its target at sign in | navigation-and-search | pages/dashboard.js:39; pages/listing/[id].js:38 | `/dashboard?listing=abc&applicant=def&panel=documents` and `/listing/abc` both landed on `/signin?next=/dashboard` | must | small |
| Listing page | Opening a card, the post kit or the document viewer adds no history entry. Back from the viewer closes the whole listing | modality | components/dashboard/ListingView.js:119 | with the viewer open, Back landed on `/demo/dashboard` | consider | medium |
| Every screen | Other email links land in the right place | navigation-and-search | none | report, apply, upload, keep me in mind, confirm, my application and password reset each landed on their own page | none, passes | none |

### Modals and sheets

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| New listing modal | It has no dialog role, no name and no Escape, focus stays behind it, Tab walks out of it, and its confirm opens a second modal on top | modality, sheets (one at a time) | components/listings/ListingSetupModal.js:149, :282 | role null, aria-modal null; activeElement body; Escape did not close; Tab trace 0000001111111111111100000 (1 is inside) | must | medium |
| Set aside sheet | It has no dialog role, no name and no Escape, and focus stays behind it | modality, sheets | components/dashboard/ListingView.js:1237 | role null; activeElement body; Escape did not close; Tab trace 0000000110000000000110000 | must | small |
| Document viewer, Next panel | Focus is not moved into either, and Tab reaches the page behind | modality, voiceover | components/dashboard/DocumentViewer.js:22; components/dashboard/AssistantPanel.js:102 | viewer Tab trace all 0; panel 0000001111111110000000111; both close on Escape | should | small |
| Mark rented sheet | Focus moves in, but Tab leaves it | modality | components/ui.js:278 | focus on Cancel at open; Tab trace all 0 after the first press | should | small |
| New listing modal, set aside sheet | Height is set in `vh`, which in iOS Safari is the largest viewport and does not shrink for the keyboard | sheets (reasonable default size) | components/listings/ListingSetupModal.js:149 (`max-height: 90vh`); components/dashboard/ListingView.js:1237 | 90vh = 760px at 844. Keyboard behaviour could not be measured | should | small |
| Every modal | Nothing behind scrolls while a modal is open | modality | none | `window.scrollBy(0, 300)` moved nothing, in all 5 | none, passes | none |

### Safe areas

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| New listing modal, set aside sheet | With `viewport-fit=cover`, the bottom action row pins to the screen bottom with 16px padding and no home indicator inset | layout (respect key display features) | pages/_app.js:13; components/listings/ListingSetupModal.js:261; components/dashboard/ListingView.js:1237 | sticky bottom 0, padding 16px, no `env(safe-area-inset-bottom)`. The inset reads 0 in the emulator, so this row is from the code | should | small |
| Header, viewer, Next panel, confirm sheet, tenant header | These already use the insets | layout | components/ui.js:108, :321; components/dashboard/DocumentViewer.js:23; components/dashboard/AssistantPanel.js:102, :117; components/tenant/ProfileFacts.js:99 | env() present | none, passes | none |

### Motion

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard, listing, profile, home | The sticky header shrinks on scroll, animating padding, background and shadow. It runs with reduced motion on, and it breaks the house rules on scroll motion and on transform and opacity only | motion (make motion optional), accessibility | components/ui.js:111, :114, :178 | during scroll with reduced motion on: padding-top, padding-bottom, background-color, box-shadow and border-bottom-color transitions running | must | small |
| Every folding section | The fold and chevron transitions are not behind the reduced motion query, and the fold animates `grid-template-rows` | motion | components/ui.js:118, :121 | 2 rules outside `prefers-reduced-motion: no-preference` | should | small |
| Every other screen | Load animations stop under reduced motion | motion | lib/motion.js | 0 animations running with reduced motion on (apply cards, profile, sandbox dot) | none, passes | none |

### Accessibility structure and text zoom

| Screen | Finding | HIG page | File and line | Measurement | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| Apply, all 8 steps | No step has a heading. The step title is a div | voiceover (titles and headings) | pages/apply/[token].js:621 | 0 headings on steps 1 to 8 | must | small |
| Confirmation, keep me in mind | No heading on either page | voiceover | pages/my-application/confirm.js:43; pages/keep/[token].js:70 | 0 h1 or h2 | should | small |
| Realtor, auth, apply | No `main` landmark | voiceover (rotor) | components/dashboard/DashboardHeader.js:34; components/auth/AuthShell.js:16; pages/apply/[token].js:665 | main count 0 on 30 of 33 states (present on the landlord report, its answered state and the confirmation, pages/r/[token].js:85 and pages/my-application/confirm.js:47) | consider | small |
| Auth, new listing, set aside, profile, listing, home | Focus is invisible on inline styled fields: the global rule removes the outline and nothing replaces it | accessibility (Full Keyboard Access) | components/ui.js:95 | 12 control styles with no change on focus, out of 317 | must | small |
| Home at 200 percent | The headline and hero run past the screen edge | accessibility (enlarge text 200 percent), typography | pages/index.js:405; components/mockups/HeroDemo.js:86, :87 | page zoom at 195 wide: "applications." runs to x 260 (65px cut); mockup lines overlap the caption; 10 clipped runs, 15 overlaps | should | small |
| Dashboard and Pipeline at 200 percent | Listing card rents and summary lines are cut off | accessibility, typography | components/dashboard/HomeView.js:337, :357 | "$2,600" at x 203 to 259 on a 195 wide screen; summary lines to x 217 | must | small |
| Listing at 200 percent | Applicant names truncate, and long names never show in full | typography (keep truncation to a minimum) | components/dashboard/ListingView.js:759 | "Alexandra Papadopoulos Whitfield" needs 516px in a 271px box (text only zoom) and runs to x 327 (page zoom) | should | small |
| Landlord report, profile at 200 percent | The criteria labels and the font cards run past the edge | accessibility | pages/r/[token].js:138; components/dashboard/ProfileEditorBody.js:419 | "References" to x 211; font cards to x 246 | should | small |
| Every screen | No horizontal scroll at 390, 360 or 200 percent | layout | none | document width equals the viewport on all 66 states and all 22 zoom states | none, passes | none |

**Counts:**
- 60 findings: 22 must, 31 should, 7 consider.
- 8 rows record checks that passed. They are not findings and are not counted.

## B. Where the house rules differ from the HIG (notes, not findings)

- **Buttons are pills** (`--btn-radius: 999px`). The HIG's buttons are capsules too, so this agrees in shape. Heights follow the product's 44 and 52, not the HIG's 50, 34 and 28.
- **Fraunces for display and Inter for body.** The HIG steers the web to `-apple-system` and San Francisco. The brand faces stay.
- **The paper canvas `#faf8f3`** replaces the HIG's system background, and there is no dark mode.
- **Ink surfaces `#101012`** replace Liquid Glass materials. No blur or translucency is asked for.
- **One editorial red action per screen.** The HIG uses the accent colour for prominent buttons. Rentletter's red is its single primary action, not a system tint.
- **The red tick motif** stands in for SF Symbols progress styles and stays custom.
- **No green or amber status colours**, where the HIG uses system green and orange for status. One exception is found above under contrast: the green Restore control.
- **Motion never on scroll** is stricter than the HIG. The header shrink violates it and is listed as a finding for that reason.
- **Layout rules R1 to R4** are left exactly as they are. No finding asks to change them.

## C. Skipped native only rules

These were skipped because a browser cannot render or call them:
- SwiftUI and UIKit APIs.
- SF Symbols rendering and weights.
- Liquid Glass materials and scroll edge effects.
- Tab bars, toolbars, sidebars and split views as system components.
- Sheet detents and grabbers.
- Haptics.
- Keyboard layout guides and input accessory views.
- Dynamic Type text styles as an API.
- Live Activities, widgets, App Clips, Siri and Shortcuts.
- The rules for visionOS, watchOS, tvOS and macOS.

## D. The top ten fixes, in build order

Each group can be one build prompt.

**Group 1. Tokens, one prompt**
1. Raise `inkMute` in components/theme.js:28 so it passes AA on paper, white and #f2eee3. For example #6e6e73 gives 4.78 on paper and 5.07 on white. Also add one `::placeholder` colour in components/ui.js that passes 4.5 on the field background. This clears 243 contrast failures and every placeholder at once.
2. Set every input, select and textarea to 16px or more: the auth fields (components/auth/AuthShell.js:52), profile, the set aside note and the home link field. Put back a visible focus ring for fields in place of `input:focus { outline: none }` at components/ui.js:95. This stops Safari's zoom on focus and makes focus visible on the 12 bare control styles.

**Group 2. Tap targets, one prompt**

3. Bring every control under 44 by 44 up to 44 by 44:
   - the Next bell;
   - "All listings";
   - the new listing selects, checkboxes, Cancel and Create;
   - the set aside select;
   - the apply Back and Edit, and the step 6 switches (the label becomes part of the control);
   - the auth links and the terms row;
   - the home footer links;
   - the sandbox bar.

   Every one is a padding or min height change on the lines listed in section A.

**Group 3. Forms, one prompt**

4. Add `autocomplete` to the apply form:
   - `email`, `name`, `bday`, `tel`, `organization-title` and `organization` on the tenant fields;
   - `street-address` on the rental address.

   Also give "Years at this job" `inputmode="decimal"` and the landlord phone `type="tel"`.
5. Wire the errors:
   - Tie each message to its field with `aria-describedby`.
   - Move focus to the first invalid field on Continue.
   - Give the sign in error `role="alert"` and mark both fields invalid.
   - Show the password mismatch on leaving Confirm password.
   - Link the profile labels with `htmlFor`, and give the two textareas real labels.
   - Set the sign up terms error in danger, not brand red.

**Group 4. Sheets and modals, one prompt**

6. Give the new listing modal and the set aside sheet `role="dialog"`, `aria-modal`, a name and Escape to close. In every modal:
   - move focus in on open and keep Tab inside;
   - return focus to the control that opened it.

   Also replace the stacked confirm modal with a step inside the same sheet.
7. Size the sheets with `dvh` or `svh` instead of `vh`, and add `env(safe-area-inset-bottom)` to the bottom action rows of the new listing modal and the set aside sheet.

**Group 5. Navigation, one prompt**

8. Put the apply step in the URL (for example `?step=3`) so Back moves one step, not off the form. Make the signed out redirect carry the whole requested path, listing, applicant and panel included, in `next` (pages/dashboard.js:39, pages/listing/[id].js:38).

**Group 6. Motion and structure, one prompt**

9. Stop the header from animating on scroll (components/ui.js:111 to :115, :178): swap it with no transition, or use opacity only, behind the reduced motion query. Put the fold and chevron transitions (components/ui.js:118, :121) behind the query too.
10. Add a heading per apply step, headings on the confirmation and keep pages, and a `main` landmark in the realtor, auth and apply shells.

**Not tested:**
- The virtual keyboard, VoiceOver speech and the safe area insets on a real iPhone.
- Signed in production screens with real data: the sandbox renders the same components.
