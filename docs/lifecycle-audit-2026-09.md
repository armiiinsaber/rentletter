# Rentletter lifecycle audit, September 2026

A read only map of the product as it exists at main `7632396`, from the first touch to every ending, for the tenant, the realtor and the landlord. Every step names the file and line that does it. Every screen was walked in WebKit at 390 by 844 with an iPhone user agent, on the sandbox (`/demo/dashboard`, the same components as the product) and the sandbox tokens each public page accepts. Where a step could not be exercised, the row says so.

Method notes:
- "Seen": the step was on screen in the walk, or a test drives it (the test title is quoted).
- "Not exercised": the code exists and is cited, but no walk or test reached it here.
- Emails were read from their template files. No email was sent.
- No SQL was run. No file outside `docs/` changed.

One thing found before anything else: the WebKit binary the walks use had been replaced by a newer build on this machine (playwright-core 1.62.1 looks for `webkit-2336`; only `webkit-2359` was present). With it missing, every WebKit walk in `npm test` skips silently instead of failing. It was reinstalled for this audit. That is gap E39.

## Part A. The tenant

### A1. First touch

| Step | Where | What the tenant sees | Email | Next |
| --- | --- | --- | --- | --- |
| Invite link `/apply/{token}` | pages/apply/[token].js:280 to :320 resolves through pages/api/invite/resolve.js:16, lib/inviteResolve.js:56 | "Rental application", the unit, the rent, "Goes to Sarah Chen · Demo Realty", the OHRC line (seen) | none | Continue |
| Short link `/a/{code}` | pages/a/[code].js:1 to :6, lib/shortLink.js:14 (90 day TTL) | 302 to the long link (seen: `/a/DEMO1` landed on the form) | none | same as above |
| QR | components/dashboard/ListingView.js, "Save QR" in the post kit (seen at 390) | the same link | none | same |
| Post kit blurb | components/dashboard/ListingView.js:228 (`kitOpen`), "Copy short link", "Copy description", "Copy instagram bio", "Copy saved reply" (seen) | realtor side only | none | none |
| Link to a rented listing | lib/inviteResolve.js:56, pages/apply/[token].js:295, :659 | "This unit has been rented." and "Want Sarah Chen to keep you in mind for similar units?" with an email field (seen) | none | Tap "Yes, keep me in mind": pages/api/pipeline/consent.js writes a consented row for 60 days (:36 to :44). Seen: "Done. Sarah Chen will be in touch if something fits." |
| Link to a closed (deleted) listing | lib/inviteResolve.js:56 to :59: closed and a missing row both answer rented | the same rented page | none | same |
| Link to a paused or draft listing | lib/application-state.js listing states `paused` and `draft` exist, but nothing on screen or in a route sets them: components/dashboard/ListingView.js has only Mark as rented (:305), Reopen (:1183) and Delete (:1189) | not reachable | none | none. Not exercised: no way to make one. |
| Expired or regenerated link | pages/api/listings/invite.js:54 (reuse), :83 (the old KV record deleted on regenerate), lib/shortLink.js:6 (old code deleted) | "This link is no longer active" with "Please use the exact link the listing realtor sent you." (seen: a bad token) and "This invite link has expired or is no longer active. Please contact the listing realtor for a new link." (seen: a bad short code) | none | Go to Rentletter |

### A2. The apply form

Steps and fields (pages/apply/[token].js:76 to :85, fields in components/apply/fields.js):

| Step | Fields | Required |
| --- | --- | --- |
| 1 Where to send it | email | email |
| 2 About you | full name, date of birth, phone | all three. The date stays on the device; only "age of majority confirmed" is stored (lib/applicationMap.js:32, pages/apply/[token].js:254). Seen: "You must be 18 or over (Ontario age of majority) to apply on your own. The date stays on this device." |
| 3 Employment | employment type, job title, employer, years at this job, annual income before tax | income, employer, job title |
| 4 Rental history | rental situation, current address, time there, current rent, landlord name, email, phone | none |
| 5 Your move | desired move in date | move in date |
| 6 Household and pets | total occupants, smoking or vaping, other occupants, pets, co tenant (name and income, no relationship: pages/apply/[token].js:557 to :562) | none |
| 7 References | two names, relationships, contacts | none |
| 8 Review | every step with Edit, one Submit (pages/apply/[token].js:589) | |

Behaviour:

| Case | Where | What happens |
| --- | --- | --- |
| Submit | pages/apply/[token].js:352 to :376: POST /api/generate writes `app:{RL}` to KV, then the done state | "You are all set, Priya." (seen) |
| The chain after submit | :378 to :430: tag (pages/api/invite/tag.js), mirror (pages/api/applications/mirror.js:72 links the application to the listing and mints the document request at :85), sync to the profile (pages/api/tenant/sync-application.js), the confirmation email (pages/api/send.js) | all four run in the background and are "non fatal" (:401): the page already says done |
| Dropped connection during the chain | :401 logs and continues; nothing retries; the done page stays | The tenant sees success and gets no email. The realtor never sees the application (no junction row). Gap E1. |
| Dropped connection during generate | :364, :431: the error shows and the form stays | recoverable |
| Browser back | the step lives in React state only (:109); nothing is pushed to history | Back leaves the form. Gap E17. |
| Same person, same listing, twice | pages/api/generate.js issues a new number each time; lib/supabaseBridge.js:44 to :51 links once per application id, so two applications make two rows; lib/duplicates.js:1 to :5 marks the later one by phone, email, or name and employer, and the card says "Same phone as Sofia Russo" (seen) | The prefilled form warns: "Your saved profile was already submitted for this same address" (pages/apply/[token].js:791) and "This creates a new application for this unit. Your earlier one is unchanged." (seen) |
| Two listings of the same realtor | separate junction rows; the profile lists both (pages/api/tenant/profile.js:56 to :80) | works as designed |

### A3. Documents at apply

| Step | Where | What the tenant is told |
| --- | --- | --- |
| Adding | pages/apply/[token].js:717 to :741, components/tenant/DocumentUploader.js, one file per request (pages/api/upload/analyze-file.js), then pages/api/upload/finalize.js | "Two minutes. Your realtor sees a matched application instead of a waiting one." and "Held for Sarah Chen's review for 14 days, then deleted. Do not upload anything showing your SIN." (seen) |
| Skipping | :741 "Skip for now" (seen) | "You can add documents any time from your confirmation email." (:724) |
| Adding later | the confirmation email carries the upload link (pages/api/send.js:102 to :103); the request record lives 7 days (lib/docRequest.js:25) | after 7 days the link answers "This upload link has expired or is no longer active. Please ask the listing realtor for a new link." (pages/api/upload/resolve.js:17; seen on the invalid state). Only the realtor can mint a new one (pages/api/applicants/request-documents.js). Gap E9. |
| The two nudge emails | lib/nudges.js:15 to :16 (48 hours, 5 days), :40 never a third; pages/api/cron/nudges.js daily | "Your application for {unit} is in. It is waiting on your documents…", "This is the last reminder.", "Two minutes, held for 14 days for {realtor}'s review, then deleted." (lib/nudges.js:49 to :60). Tested: "runNudges: sends one and two, stamps nudgedAt, records the event, prunes the set, never a third". |
| The 14 day deletion | pages/api/cron/expire-documents.js daily at 03:00, lib/documentStore.js:156 marks `deleted_by` expired | The tenant hears nothing at deletion. The cron sends no email (pages/api/cron/expire-documents.js has no send). They were told in advance on the done page, in the request email (pages/api/applicants/request-documents.js:101 to :105) and in the nudges. |
| Re adding after deletion | no tenant path. The realtor requests again (pages/api/applicants/request-documents.js, `renew` at :68), which emails a fresh link | Gap E9 |

### A4. After submitting

| Can the tenant… | Where | Answer |
| --- | --- | --- |
| See the application | /my-application/{RL} with the owner key or the profile session (pages/my-application/[rl].js:1 to :7), facts by section (seen) | yes |
| See who viewed it | pages/api/application/manage.js:93 `lookups`; "Lookup history · 3" (seen) | yes, a log of realtor lookups by hashed IP |
| Check status | pages/api/tenant/profile.js:33, lib/application-state.js:452 to :455: Submitted, Not selected for this unit, Withdrawn | three words only. Accepted, shortlisted, reconsidered all read "Submitted". Gap E4. |
| Edit | manage.js:112 `update`, flagged to the realtor as edited after documents (lib/editedAfter.js:6, ListingView.js:904) | yes. "Edits change what Sarah sees for 15 Logan Ave, Unit 2." (seen) |
| Withdraw | no tenant action. The realtor records a withdrawal (ListingView.js:634 → pages/api/applicants/withdraw.js) | no. Gap E5. |
| Revoke | manage.js:164 `revoke`, :174 `unrevoke`; "Revoke application" (seen) | yes: the realtor's lookups are refused, the rows stay |
| Add a co applicant or guarantor | co tenant only at apply (pages/apply/[token].js:558); no guarantor anywhere; db/002 has `application_parties` with no route | no. Gap E6. |
| Ask a question or reach the realtor | the profile shows the realtor's name and brokerage (pages/api/tenant/profile.js:76 to :77); no address, no link, no message | no. Gap E7. |

### A5. References

| Step | Where | What each party sees |
| --- | --- | --- |
| The realtor asks | ScreeningChecklist.js "Ask by email" → pages/api/references/request.js; refused within 5 days of a pending ask (lib/referenceStore.js:27); 14 day expiry | the checklist row |
| The reference | pages/ref/[token].js: six closed questions, every one with "Prefer not to say", no free text (seen); answered and expired states (seen) | "Six questions about Priya Sharma's tenancy with you." |
| The tenant | pages/api/references/request.js:5: "The tenant is never emailed" | told once, at apply: "The listing realtor may ask them about the tenancy itself" (pages/apply/[token].js:523). They never learn that it happened or what was answered. Gap E8. |

### A6. Ending 1, accepted

| Step | Where | State |
| --- | --- | --- |
| Marked the winner | pages/api/listings/status.js:49 to :55, :68 (`rentedCascade` moves them to accepted) | done |
| Told | nothing. status.js emails the not selected only (:95 to :111); the winner's row is used for the cascade and nothing else | **Missing.** Gap E2. |
| Agreement to lease, deposit, lease, keys | db/002 has `closings` and the states agreement_signed, deposit_received, lease_signed, moved_in (lib/application-state.js); no route writes any of them (grep of pages and lib finds no `from('closings')`) | **Missing.** Gap E3. |
| On the tenant's page | reads "Submitted" (lib/application-state.js:452) | Gap E4 |

### A7. Ending 2, not selected

| Step | Where | What happens |
| --- | --- | --- |
| The email | pages/api/listings/status.js:95 to :111 when the realtor keeps "Let the others know…" on (seen in the Who got it sheet); lib/listingState.js:56 to :67 | "{unit} went to another applicant. Thank you for applying. If you would like {realtor} to keep your application in mind for similar units in the next 60 days, tap Keep me in mind. Otherwise nothing else happens, and your documents are already deleted or will be within 14 days." From "{realtor} via Rentletter", reply to the realtor. |
| Who does not get it | lib/listingState.js:35 to :47: withdrawn and set aside rows are skipped | A set aside applicant is told nothing when the unit goes. Gap E10. |
| Keep and decline | pages/keep/[token].js: "Keep your application in mind for similar units for 60 days?" with Yes and No thanks (seen), answered and expired states (seen); pages/api/pipeline/answer.js flips once | tested: "POST /api/pipeline/answer: yes and no flip once; expired and already answered are refused" |
| Reconsider | lib/realtorWrites.js:129 to :156, entered only while the listing is live; the re invite lib/reconsiderInvite.js:30, once per applicant per listing (:58) | "{address}: still interested?" with the tenant's own link. Tested: tests/routes/reconsiderInvite.test.mjs. |
| Reconsidered, then lose again | they are shortlisted (active), so status.js includes them again: a second not selected email and a second pending consent row, since :100 to :104 insert without checking for an existing row | Gap E11 |

### A8. Ending 3, stays in Pipeline

| Question | Where | Answer |
| --- | --- | --- |
| What they consented to | the email line above; the rented invite page: "No account is created. Your email is kept for 60 days for this purpose only." (seen) | similar units from this realtor, 60 days (lib/listingState.js:7) |
| What they receive | only when the realtor taps Invite in Pipeline (components/dashboard/PeopleList.js:31 → pages/api/pipeline/invite.js): "{address}: a unit you might like", "Your application from before is already filled in" (lib/pipelineState.js:110 to :120), a prefill link good for 14 days | nothing automatic |
| Day 53 | pages/api/cron/pipeline.js, lib/pipeline.js:137 to :141: one renewal, 7 days before the end, once | "Your keep me in mind with {realtor} ends on {date}. Tap below to keep it for another 60 days, or do nothing and it ends there." Seen: `/keep/demo-renew`. |
| Day 60 | lib/pipeline.js: rows past expires_at are set expired by the cron | no email at the end; the row leaves the list |
| Can they leave | before consent: No thanks. After consent: no link, no page. The realtor can remove them (pages/api/pipeline/remove.js) | Gap E12 |

### A9. Silent endings

| State | Who sets it | The tenant is told |
| --- | --- | --- |
| withdrawn_by_applicant | the realtor, "Withdrew" (ListingView.js:634 → pages/api/applicants/withdraw.js) after a browser `confirm()` | nothing. Their page reads "Withdrawn" (lib/application-state.js:455). |
| withdrawn_by_realtor | nobody: no route or screen writes it (grep of lib and pages) | not reachable |
| expired | nobody: no route or cron writes it | not reachable |
| fell_through | the cascade on reopen or on renting to someone else (lib/application-state.js `reopenCascade`, `rentedCascade`) | nothing |

### A10. Privacy

| Request | Today |
| --- | --- |
| A copy of their data | on screen, every fact they wrote (pages/my-application/[rl].js, lib/tenantProfile.js:237); no export, no file |
| Deletion | the policy promises it by email to info@rentletter.ca (pages/privacy.js:64, :73, :75). There is no self serve delete and no admin tool for one tenant: pages/api/admin/realtors.js deletes by realtor; lib/adminData.js:170 never touches `app:{RL}`. Gap E13. |
| Automatic deletion | documents at 14 days (lib/documentRetention.js:4); applications 12 months after last activity, dry run until `RETENTION_ENFORCE=true` (lib/retention.js:8, :117). Gap E14. |
| Consent without verification | pages/api/pipeline/consent.js:36 to :44 stores any email typed on a rented link as consented, with no confirmation email. Gap E15. |

## Part B. The realtor

### B1. Sign up and set up

| Step | Where | Seen or tested |
| --- | --- | --- |
| Sign up | pages/signup.js:96 to :102, email confirmation on, "Check your email." (:139) | walk: the form |
| Confirm and land | pages/auth/callback.js → /dashboard; a promo cookie from /join/{code} is redeemed here (pages/join/[code].js:1 to :6) | not exercised (needs a real email) |
| Onboarding | pages/dashboard.js:67 → pages/onboarding.js: the display name only | tested: "a fresh profile with no name goes to onboarding" |
| Province | asked at the first listing (components/listings/ListingSetupModal.js:177) | seen in the modal |
| Signature | asked at the first send (ListingView.js:497, sheet :1197) | seen: "Sign the report as" |
| Branding | hinted at the first send or landlord view (ListingView.js:1326, lib/justInTime.js); set on /profile (seen) | seen |
| Password reset | pages/forgot-password.js:30 redirects to `/reset-password`; pages/reset-password.js handles the code, the hash and `token_hash` | tested: "password reset in WebKit at 390 with a stubbed Supabase" |
| The two Supabase redirect URLs | `${origin}/reset-password` (pages/forgot-password.js:30) and `${origin}/auth/callback` (pages/signup.js:96) must be in the project's Redirect URLs | not verifiable from the code |

### B2. Entitlement and Stripe

| Question | Where | Answer |
| --- | --- | --- |
| What a new realtor gets | db/billing-and-promos.sql:18: `plan` defaults to `none`; lib/entitlements.js:42 to :43: `none` cannot use the product. A trial exists only through a promo code (db/billing-and-promos.sql:129) or the one time grandfather (db/stripe-lifecycle.sql:47 to :50, accounts before 2026 08 27) | A plain sign up lands on the paywall: "Choose a plan to open your workspace." (components/dashboard/Paywall.js:14). There is no automatic trial in the code. Gap E16. |
| What is gated | every write route through lib/requireEntitlement.js or lib/realtorRoute.js; reads are not | 402 with `payment_required` (tested: "create: 401 without a session, 402 for a lapsed profile") |
| At the gate | components/dashboard/HomeView.js:225, :262: the Paywall replaces the dashboard | not exercised in the sandbox (no lapsed sandbox profile) |
| Payment fails | lib/billing.js:111 to :114: 7 days of grace; lib/entitlements.js:26 to :31 | "Your last payment didn't go through." (Paywall.js:12) |
| Lapses | lib/billing.js:84: plan none, canceled | the `none` paywall |
| Manage billing | pages/billing.js:62 → pages/api/billing/portal.js | reachable while locked |

### B3. New listing

| Step | Where |
| --- | --- |
| Criteria and unit | components/listings/ListingSetupModal.js; the unit column db/listing-unit.sql |
| Invite row, short link, QR, post kit, regenerate | ListingView.js:1083 (Copy), :1165 (Regenerate), :228 (post kit); pages/api/listings/invite.js |
| Edit after applicants exist | pages/api/listings/update.js; Fit is recomputed at read time (lib/supabaseBridge.js:130 `withLiveScore`), so a changed criterion re ranks silently |
| Pause | none. Gap E18. |
| Withdraw | only as Delete (ListingView.js:1189 → lib/realtorWrites.js closes then removes); no keep the record and close. The invite link then answers rented. |
| Delete | a browser `confirm()` (ListingView.js:312); every held document purged first (lib/realtorWrites.js `deleteListing`) |

### B4. Applicants arriving

| Piece | Where | Note |
| --- | --- | --- |
| Notifications | lib/notificationsFeed.js:60, :64, :73: new, withdrawn, documents | derived on load, no push |
| The Next list | lib/actions.js:30 kinds: landlord_answered, check_docs, mismatch, edited, verify, waiting, request, ready, sent_waiting, pipeline_fit (seen: the bell "9+") | |
| Duplicates | lib/duplicates.js | one line, nothing merged |
| The card and Fit | components/dashboard/ListingView.js:728 onward; lib/fitScore.js | |
| Labels | lib/fitScore.js:183: `verified` only when the realtor confirmed the employer; `docs match`, `check docs`, `stated` | lib/applicantSynthesis.js:68 says "Verified income" only on that confirmation. The rule holds. |
| Document viewer and its log | pages/api/documents/open.js:45 records document_opened per open; the viewer is components/dashboard/DocumentViewer.js:22 | "Only you can view these. Each view is logged." (seen) |

### B5. The screening checklist

components/dashboard/ScreeningChecklist.js: Identity, Income, Employer, Previous landlord, References, Rent share (:106 to :108); the guidance "Use a number you find yourself, not one the applicant gave." (:26); confirmations through pages/api/applicants/confirm.js:15 (id, employer, landlord, reference); the reference answers attach from lib/referenceStore.js and show "Answered Sep 21" (seen). Notes exist only on Set aside (ListingView.js:557 to :558, `decision_notes`); there is no free note on a checklist row.

### B6. The landlord

| Step | Where |
| --- | --- |
| Send | pages/api/listings/send-report.js:69 to :99: the snapshot frozen for 90 days, the PDF attached, `last_sent_at` set, report_sent recorded. Tested: "the send freezes the snapshot, mails the PDF with every active applicant…" |
| The page | pages/r/[token].js, answers to pages/api/report/answer.js (seen: "You want to meet them" after a tap) |
| The PDF | pages/api/report/pdf.js for the landlord; pages/api/listings/report-pdf.js for the realtor |
| The answer on the card | lib/reportSnapshotStore.js:51 to :60 attaches the latest snapshot's answer; "Landlord: wants to meet · Sep 9" on the card; the Next list puts landlord_answered first (lib/actions.js:44) |
| Never answers | lib/actions.js:67: "sent_waiting" after 5 days. Nothing goes to the landlord again. |

### B7. Deciding

| Action | Where | Seen or tested |
| --- | --- | --- |
| Shortlist | the finalist mark, pages/api/applicants/decision.js; "Shortlist" on a reconsidered card | tested: "reconsidered to accepted is refused with 409; reconsidered to shortlisted to accepted is allowed" |
| Set aside, restore | ListingView.js:557 to :558 with a screenable reason (lib/setAsideReasons.js); Restore (seen) | |
| Mark rented | the Who got it sheet (seen); pages/api/listings/status.js | tested: "mark rented: the winner, everyone not selected, and the listing agree" |
| Not selected email | status.js:95 to :111, on by default | |
| Reopen | status.js:68 `reopenCascade`; seen: "1 verified · 6 not selected" after Reopen | |
| Reconsider and the dead end | ListingView.js Reconsider pill, "Reconsider them first." under Confirm | tested: tests/routes/reconsiderWebkit.test.mjs |

### B8. After rented

| Piece | Where | Note |
| --- | --- | --- |
| Pipeline | components/dashboard/PeopleList.js; seen: "Tomas Reyes asked Sep 26 · no answer yet", "jordan.lee@example.com Asked to hear about similar units" | |
| Invite to a new listing | PeopleList.js:31 → pages/api/pipeline/invite.js, once per listing (lib/pipeline.js:85) | tested: "invite: refusals, the prefill token in KV, the invites entry, the email" |
| Retention cron | pages/api/cron/retention.js, dry run unless `RETENTION_ENFORCE=true` | tested: "dry run logs the counts, records the run and deletes nothing" |
| Closing steps | none exist (A6) | Gap E3 |

### B9. Account

| Question | Where | Answer |
| --- | --- | --- |
| Brokerage seats | no seat, team or brokerage id anywhere in lib, pages or components (the only `brokerage` is a text field on the profile) | missing. Gap E19. |
| Change email | no `updateUser({ email })` outside the password reset (pages/reset-password.js:99) | not possible. Gap E20. |
| Delete the account | only the founder, pages/api/admin/realtors.js (typed email confirmation) | no self serve. Gap E21. |
| Export data | none | Gap E21 |
| Tenants' data when a realtor leaves | lib/adminData.js:104 `cascadePreview`, :173 `deleteRealtors` with `deleteOrphanApplications`; `app:{RL}` in KV is never touched (:170) | the founder decides per deletion; nothing tells the tenants |

### B10. Failure paths

| Where | What the realtor hits |
| --- | --- |
| ListingView.js:290, :297, :320, :339, :451: "Could not update the listing.", "Could not delete the listing.", "Could not create invite link.", "Could not add that application number." | one line, no retry control, no reason |
| ListingView.js:312 (delete), :634 → the browser `confirm()` (withdraw) | the browser's own dialog, "OK" with no destructive style |
| pages/signin.js:62 | the sign in error has no alert role and neither field is marked invalid |
| pages/api/listings/status.js:114 | an email that fails to send is logged; the realtor's answer still says `recipients` and `notified` counts, so a partial send reads as a number, not a name |
| pages/api/listings/send-report.js | tested: "503 without RESEND_API_KEY; 400 without a landlord email" |
| The Who got it sheet | Confirm shows "Working…" (components/ui.js:266 onward) while it waits; the Reconsider sheet the same |

## Part C. The landlord

| Case | Where | Seen |
| --- | --- | --- |
| The page | pages/r/[token].js:30 to :36; the six applicants each with "I'd like to meet them" and "Not for me" | seen |
| Answering | pages/api/report/answer.js:35 to :43; the tap flips one rank and the realtor's card shows it | seen: "You want to meet them" |
| The PDF | pages/api/report/pdf.js, "Download PDF" (seen) | |
| Expired (90 days) | pages/r/[token].js:35: "This report has expired"; pages/api/report/answer.js:37 answers 410 | not exercised (no sandbox token for it) |
| Unknown token | 404 (seen: `/r/nope`) | |
| A report for a listing that was reopened | the snapshot is frozen and stays answerable until its own expiry; nothing on the page says the listing changed. An answer lands on a card that may now read not selected or fell through (lib/reportSnapshotStore.js:51 attaches the latest snapshot's answers regardless). | Gap E22 |

## Part D. Every email and every cron

| Trigger | Recipient | Subject | Template | From | Twice? | Tested |
| --- | --- | --- | --- | --- | --- | --- |
| Application submitted | tenant | Your Rentletter application | pages/api/send.js:17, sent :195 | Rentletter | once per submission | tests/routes/submit.test.mjs "generate, tag, mirror, send" |
| Realtor requests documents | tenant | {realtor}: upload your documents for your rental application | pages/api/applicants/request-documents.js:101 to :105 | Rentletter (:102), not the realtor | yes, on every request or renew | tests/routes/applicationState.test.mjs (the route, not the mail) |
| 48 hours, 5 days without documents | tenant | {unit}: documents for your application | lib/nudges.js:49 | {realtor} via Rentletter | at most two | tests/nudges.test.mjs |
| Unit rented | each not selected applicant | {unit}: an update from {realtor} | lib/listingState.js:56 | {realtor} via Rentletter | again on every later rented event | tests/listingStatus.test.mjs "the message…" |
| Reconsider | the applicant | {address}: still interested? | lib/reconsiderInvite.js:30 | {realtor} via Rentletter | once per applicant per listing | tests/routes/reconsiderInvite.test.mjs |
| Invite from Pipeline | the person | {address}: a unit you might like | lib/pipelineState.js:110 | {realtor} via Rentletter | once per listing | tests/pipeline.test.mjs |
| 7 days before consent ends | the person | Still looking? | lib/pipelineState.js:121 | {realtor} via Rentletter | once | tests/pipeline.test.mjs |
| Ask a reference | the previous landlord | (lib/referenceQuestions.js:68) | lib/referenceQuestions.js:68 | {realtor} via Rentletter | refused within 5 days, then again | tests/references.test.mjs |
| Send the report | the landlord | (pages/api/listings/send-report.js:25) | pages/api/listings/send-report.js:25 | reportFrom (:85) | every send, a new snapshot each time | tests/routes/sendReport.test.mjs |
| Profile link | tenant | Your Rentletter profile link | lib/tenantEmails.js:30 | Rentletter | every request, 3 per 15 minutes | not tested |
| Email change | tenant, new address | Confirm your new Rentletter email | lib/tenantEmails.js:47 | Rentletter | every request | not tested |
| Referral (feature flag off, seen: "Referrals between realtors are paused.") | applicant, then the two realtors | pages/api/referrals/create.js:40, lib/referralEmails.js:17 to :48 | Rentletter | once per referral | tests/features.test.mjs (the gate) |

No email exists for: accepted, fell through, withdrawn, documents deleted, consent expired, or a landlord who has not answered.

| Cron | Schedule (vercel.json) | Does | Live or dry |
| --- | --- | --- | --- |
| /api/cron/expire-documents | 03:00 daily | deletes held files past 14 days, marks rows expired, records documents_expired | live |
| /api/cron/retention | 03:30 daily | applications 12 months after last activity, never under an active listing; every run recorded | dry run unless RETENTION_ENFORCE=true |
| /api/cron/nudges | 13:00 UTC daily | the 48 hour and 5 day reminders | live |
| /api/cron/pipeline | 13:30 UTC daily | the renewal 7 days before the end; rows past the end set expired | live |

All four are bearer gated by CRON_SECRET (lib/documentStore.js `cronGate`).

## Part E. Gaps, ranked

Severity then effort. "Must" is a broken promise, a silent loss, or a house rule. Rows E36 to E39 are house rule checks.

| # | Gap | Who | What they experience | Where it should happen | Severity | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | The submit chain after generate is fire and forget: if tag or mirror fails, the application never reaches the listing | tenant, realtor | the tenant sees "You are all set", the realtor never sees them | pages/apply/[token].js:378 to :401: retry, or hold the done state until mirror answers | must | small |
| E2 | The winner is never told | tenant | silence after the yes | pages/api/listings/status.js:49 to :68, beside the not selected send | must | small |
| E3 | The closing does not exist: agreement, deposit, lease, keys have states and a table but no route, no screen, no email | realtor, tenant | the product stops at "rented" | new routes over `closings` (db/002) with lib/application-state.js asserting each step; the deposit check already caps at one month's rent | must | large |
| E4 | The tenant's status reads "Submitted" for shortlisted, accepted and reconsidered | tenant | no way to know where they stand | lib/application-state.js:452 to :455 (the three words) and :459 `tenantStatusFor` | must | small |
| E16 | A plain sign up has no trial: `plan` defaults to `none` and the paywall opens at once | realtor | "Choose a plan to open your workspace." before seeing anything | db/billing-and-promos.sql:18, or the auth callback; CLAUDE.md says a 7 day trial | must | small |
| E36 | pages/api/events/read.js:9 to :12 writes the realtor's read watermark with `requireRealtor` and no `requireEntitlement` | house rule | a locked realtor can still write one row | pages/api/events/read.js | must (house rule) | small |
| E37 | pages/api/referrals/claim.js:12 writes claims with `requireRealtor` and no `requireEntitlement` (the feature is flagged off) | house rule | same | pages/api/referrals/claim.js | must (house rule) | small |
| E38 | Household: total occupants and other occupants are collected and stored (lib/applicationMap.js:55 to :56) and shown to the realtor; they are not scored, and family status is a protected ground | tenant | asked a question that can only be a proxy | pages/apply/[token].js step 6; keep pets and smoking, drop the count or justify it against an occupancy bylaw on screen | must (OHRC) | small |
| E39 | The WebKit walks skip silently when the binary is missing (tests/routes/*Webkit.test.mjs `skip` when `haveWebkit` is false); it was missing on this machine today | the team | a green `npm test` with no Safari coverage | the walk files: fail, not skip, in CI | must | small |
| E10 | A set aside applicant is never told the unit went | tenant | silence | lib/listingState.js:35 to :47 `notSelectedRecipients` | should | small |
| E5 | A tenant cannot withdraw | tenant | they must email the realtor, who taps Withdrew | pages/api/application/manage.js beside `revoke`; the state machine already allows withdrawn_by_applicant from every open state | should | medium |
| E7 | No way to reach the realtor from the tenant's page | tenant | a name and a brokerage, no address | pages/api/tenant/profile.js:76 to :77 could carry the realtor's email as reply to | should | small |
| E9 | Documents can only be added within 7 days of the request; after that only the realtor can renew | tenant | a dead link and no button | pages/upload/[token].js:83: an "ask for a new link" tap that notifies the realtor | should | medium |
| E11 | A second rented event inserts a second pending consent row and sends a second not selected email to the same person | tenant, realtor | duplicates in Pipeline | pages/api/listings/status.js:100 to :104: check for an existing row per email and listing | should | small |
| E12 | No way to leave the Pipeline after consenting | tenant | they wait for day 60 or ask the realtor | a No thanks link in the invite and renewal emails (lib/pipelineState.js:110, :121) to pages/api/pipeline/answer.js | should | small |
| E13 | A tenant deletion request has no tool | founder | by hand in KV and Supabase | an admin action over `app:{RL}`, `applications`, `listing_applicants`, documents and consents | should | medium |
| E14 | Retention is a dry run, so the 12 month promise is not kept yet | tenant, founder | data outlives the policy | RETENTION_ENFORCE (pages/api/cron/retention.js) once one dry run has been read | should | small |
| E15 | Consent on a rented link is stored for any typed email with no confirmation | the person whose email was typed | 60 days of contact they did not ask for | pages/api/pipeline/consent.js:44: store pending and confirm by email, as the not selected path does | should | small |
| E17 | Browser back leaves the apply form | tenant | the form is gone | pages/apply/[token].js:109: the step in the URL | should | medium |
| E18 | No pause: a listing is live, rented or deleted | realtor | showings paused means deleting or ignoring | the `paused` state exists in lib/application-state.js; a control beside Mark as rented in ListingView.js:1183 | should | medium |
| E20 | A realtor cannot change their email | realtor | a new account | components/dashboard/ProfileEditorBody.js with `supabase.auth.updateUser({ email })` | should | small |
| E21 | A realtor cannot delete their account or export their data | realtor | an email to the founder | pages/profile.js; the cascade in lib/adminData.js:173 already exists | should | medium |
| E22 | A landlord can still answer a frozen report after the listing was reopened, and the answer lands on a card whose state moved on | landlord, realtor | a stale yes | pages/r/[token].js:33 to :36: read the listing's state and say so; pages/api/report/answer.js:37 refuse after a reopen | should | small |
| E23 | An accepted applicant who falls through is told nothing | tenant | silence | pages/api/listings/status.js reopen path | should | small |
| E24 | withdrawn_by_realtor and expired exist and nothing sets them | realtor | two states with no meaning yet | decide: remove from the map or add the actions | should | small |
| E25 | Editing criteria after applicants exist re ranks silently | realtor | the order changes with no note | pages/api/listings/update.js: record which criteria changed; the timeline already has listing_updated | should | small |
| E26 | The request documents email comes from "Rentletter", every other tenant email from the realtor | tenant | two senders for one process | pages/api/applicants/request-documents.js:102 | should | small |
| E27 | A partially failed not selected send answers with counts only | realtor | "3 of 5 notified" with no names | pages/api/listings/status.js:114: return who was not reached | should | small |
| E28 | The delete and withdraw confirmations are the browser's own dialog | realtor | "OK" with no destructive style | ListingView.js:312, :634: the confirm sheet already exists (components/ui.js:266) | should | small |
| E29 | The sign in error has no alert role and no invalid marks | realtor | a screen reader hears nothing | pages/signin.js:62 | should | small |
| E30 | No note to the tenant when documents are deleted at 14 days | tenant | told in advance only | pages/api/cron/expire-documents.js | consider | small |
| E31 | The tenant never learns a reference was asked or answered | tenant | a call from their old landlord they did not expect | pages/api/references/request.js: one line to the tenant | consider | small |
| E32 | A landlord who never answers is only a "sent_waiting" item after 5 days | realtor | no nudge to the landlord | lib/actions.js:67 | consider | medium |
| E33 | Consent expiry sends nothing at day 60 | tenant | the renewal at day 53 is the last word | lib/pipeline.js | consider | small |
| E34 | A guarantor cannot be added; `application_parties` has no route | tenant, realtor | a co tenant only | pages/apply/[token].js step 6 | consider | large |
| E35 | No tenant facing data export | tenant | copy from the screen | pages/my-application/[rl].js | consider | medium |

## Part F. Proposals, only where clearly better

Six things already work but produce a problem named above. Everything else stays.

| # | Problem (Part E) | Current way | Proposed way | Cost | What breaks | Leave as is |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | E1 | The done page shows after generate; tag, mirror and the email run after it and never retry (pages/apply/[token].js:352 to :401) | Show done after mirror answers, or keep the done page and retry mirror three times with backoff and show "Your application is saved and on its way" until it lands | small | nothing; the page waits about a second longer | acceptable only if the mirror failure rate is measured and near zero, which nothing measures today |
| F2 | E2, E23, E4 | Only the not selected get an email; the tenant's page has three words (lib/application-state.js:452) | One "where you stand" line per state on the tenant's page, and two emails: accepted, and fell through, both in the realtor's name through the same template family as lib/listingState.js:56 | small | none | if the realtor always phones the winner, E2 is tolerable; E4 is not |
| F3 | E11, E15 | status.js inserts a pending consent per rented event; the rented invite page stores consent outright | One consent row per email and listing (upsert), and every consent starts pending and is confirmed by a tap on /keep | small | the rented invite page needs a "check your email" line | the duplicate rows are only a Pipeline nuisance today |
| F4 | E28 | The browser's `confirm()` (ListingView.js:312, :634) | The confirm sheet at components/ui.js:266, already used for Who got it | small | none | acceptable, the actions do work |
| F5 | E16 | `plan` defaults to `none` | Set `plan = 'trial'` and `trial_ends_at = now() + 7 days` when the profile is created, as CLAUDE.md describes | small | the paywall copy for `none` becomes rare | if the intent has changed to "pay first", update CLAUDE.md instead |
| F6 | E39 | The walk files skip when the binary is missing | Fail in CI when `CI` is set and the binary is absent; skip only on a laptop | small | none | the risk is a silent green build |

Not proposed: replacing the state machine, the Fit score, the report snapshot, the document retention, the Pipeline model or any screen. They work, and no gap above is caused by their design.

## What could not be exercised

- A real sign up, email confirmation and the auth callback (needs a real inbox).
- The paywall and the 402 gate on screen (the sandbox has no lapsed profile; the route test covers the 402).
- Stripe checkout, the portal and the webhook (tests cover the state machine; no live call).
- An expired landlord report, an expired invite record, a paused or draft listing (nothing can make one).
- Any real email delivery. Every email was read from its template.
- The crons against production data.
