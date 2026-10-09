# Fit v2

Fit is one number out of 5 on each applicant's card, the checklist, the landlord report and the
PDF. It describes the applicant now, from three pillars, over the pillars that could be assessed.
Code: lib/fitScore.js (the number), lib/referenceStore.js (the reference outcome on the
confirmation), lib/reportSnapshot.js (the frozen copy), db/009-drop-min-years-at-job.sql.
Tests: tests/fitScore.test.mjs, tests/fitV2.test.mjs, tests/fitForbidden.test.mjs.

## The three pillars

| Pillar | What it reads | Not assessed when |
| --- | --- | --- |
| Ability (weight 0.5) | this unit's rent against the primary applicant's current income (stated, matched on documents, or confirmed), plus liquid savings as months of rent when a bank statement printed a closing balance | no rent, no income, or no income fact inside 24 months |
| Truth (weight 0.3) | how far each fact is confirmed: stated 2.0, matches documents 4.0, confirmed at the source 4.5 (reserved, feeds nothing yet), confirmed by the realtor 5.0; income counts twice, employer and identity once | nothing is confirmed beyond what was stated |
| Conduct (weight 0.2) | the previous landlord's answers the product already captures (rent on time, damage, would rent again), read one month at a time across the tenancy they describe; the realtor's own calls; the length of a stated tenancy when a landlord is named | no reference outcome, no call and no tenancy inside 24 months |

Absolute income beyond this unit's rent never enters: $170,000 and $900,000 at the same rent are
the same Ability. Years at the job enter nothing. A co applicant's or a guarantor's income enters
nothing; it is shown beside the primary's.

Every pillar carries a value and a coverage flag, assessed or not assessed, and the facts it read,
each with a date. The card's expansion, the checklist, the landlord report and the PDF show them.

## Missing is not scored

A pillar with no data is excluded. The score is the weighted mean over the pillars present, and
every surface says so: "Fit 4.4 on 2 of 3" with one line naming what was not assessed. Absence is
never a zero and never a lower number: an applicant with no rental history and strong ability
scores at least as high as the same applicant with a good history (tests/fitV2.test.mjs).

## Now over then

Every dated fact in Ability and Conduct carries a recency weight: the last 12 months full, 12 to
24 months half (the fact is pulled halfway toward the middle of the scale), older than 24 months
never scored, shown as context with its date. Late payments 30 months ago beside eight recent
months on time score the same as the eight months alone. The card states the basis in one line
from named facts: "Current income confirmed. Rent paid on time, last 8 months."

## Two guardrails

1. Ability alone is never a number. While Ability is the only assessed pillar the score is null,
   every surface shows "Not enough to score yet", and the card names the one thing that would
   complete it (documents, a confirmation, or a landlord reference).
2. A guarantor is the listing's setting (listings.pref_guarantor_accepted, the same for every
   applicant). No per applicant guarantor prompt exists and Fit never reads one.

## Credit and parties stay outside

A credit report the applicant shared is read for its short list of facts and shown under the
reserved label "credit shared by applicant" (docs/credit-shared.md); Fit is byte identical with
and without it. The people on an application (docs/parties.md) have their own facts and documents;
Fit is byte identical with zero, one or two parties. The reserved source labels "ID confirmed",
"income from bank deposits" and "credit shared by applicant" (lib/stateLabels.js) are never a Fit
label and never a Fit fact.

## Flags, outside the score

A contradiction between documents, an unreadable document, a name on the documents that did not
match, an income or employer that differs, a profile edited after its documents: each is a check
docs item on the card and the checklist, with the realtor's next step. None is subtracted. A
contradiction keeps the documents from confirming a fact, so Truth may read not assessed and the
label reads check docs; the number stays where the stated facts put it.

## Labels

stated, docs match, check docs, verified. Verified only ever means the realtor confirmed the
employer themselves. The realtor's confirmations dated before an edit do not count; those dated
after do.

## Forbidden inputs

No file whose name says fit, score or scorecard reads citizenship, nationality, place of origin,
time in Canada, an arrival date, age, a date of birth, family or marital status, the number of
occupants, the kind of income, years at the job, student status, the absence of a credit history,
any credit report field, or any party's income. tests/fitForbidden.test.mjs fails on the first
one. No free text enters the score.

## The criterion that went

"Min years at job" is gone from the New listing sheet, the edit sheet, the criteria model, every
read and write, the mockups and the film. db/009-drop-min-years-at-job.sql drops the column and
any index on it, idempotently. A listing older than the migration that still carries a value is
read by nothing.

## Snapshots

A landlord report already sent keeps the Fit it froze, in the words it was sent with. Only a new
render uses v2 (tests/fitV2.test.mjs).

## Legal basis, one line each

1. Ontario Regulation 290/98 under the Human Rights Code: a rent to income ratio is never the sole
  reason, so Ability alone never shows a number, and income is read together with references,
  rental history and what the realtor confirmed.
2. OHRC Policy on Human Rights and Rental Housing: a lack of rental or credit history must not be
  viewed negatively, so a missing pillar is excluded, never scored; a requirement of employment
  history falls hardest on newcomers, so job tenure is gone; a guarantor may be asked for only
  when the same is asked of everyone, so it is a listing setting.
3. BC Human Rights Code: the same grounds are protected in British Columbia; the forbidden inputs
  scan covers every surface in both provinces.
4. The product's own rule: the score describes the applicant now, so every dated fact is weighted
  by recency and nothing older than 24 months is scored.
