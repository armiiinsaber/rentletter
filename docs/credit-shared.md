# Credit shared by applicant

A credit report the applicant adds themselves, as one more optional document. Rentletter reads it
for a short list of facts, shows them to the realtor as plain text under the reserved label
"credit shared by applicant", and never scores them. No bureau is contacted, no API is called, and
Rentletter is not a consumer reporting agency: the tenant shares their own report from Equifax,
TransUnion, Borrowell, Credit Karma or a bank's app.

Code: lib/creditShared.js (the fields, the rejections, the row), lib/applicantAnalysis.js (the
prompt and the shaping), pages/api/upload/analyze-file.js and lib/realtorUpload.js (the refusals),
lib/fitScore.js readVerification (Fit ignores it), db/credit-shared.sql (the listing switch).

## Legal basis, one line each

- Asking is allowed: the Ontario Human Rights Commission's policy on human rights and rental
  housing says a landlord may request credit references and a credit check as part of selecting a
  tenant. In BC the Residential Tenancy Branch says the same of a credit check with consent.
- A lack of credit history never counts against anyone: the same OHRC policy says the absence of a
  credit history must not be treated as a negative. So "No credit report shared" reads in the same
  tone as any other optional item, never as a warning, and nothing in Fit changes either way.
- Income is never the sole criterion: Ontario Regulation 290/98 under the Human Rights Code
  permits income information, credit checks and references only together, never income alone.
  The credit row sits beside the income rows and moves none of them.
- Consent and purpose: the tenant adds the report themselves on their own upload step, under one
  sentence that names what is read and how long the file is held (CREDIT_CONSENT_LINE).
- Retention: the same 14 days as every other document (lib/documentRetention.js), the same private
  bucket, the same owning realtor, the same open log (pages/api/documents/open.js) and the same
  daily deletion (pages/api/cron/expire-documents.js).

## Exactly what is persisted

The document's `extracted` object holds these keys and no others (CREDIT_FIELDS,
tests/creditShared.test.mjs fails when any other key reaches the row):

| Field | What it is | Why it is kept |
| --- | --- | --- |
| applicantName | the name as printed | to confirm the report is the applicant's own; a mismatch is refused |
| provider | Equifax, TransUnion, Borrowell, Credit Karma, a bank | where the report came from, shown with the date |
| reportDate | as printed | shown; a report older than 90 days is refused |
| creditScore | the number | shown as a number, never as a band or a colour |
| scoreScale | the scale as printed, for example 300 to 900 | so the number reads correctly |
| openAccounts | a count | a fact the report states |
| collections | a count | a fact the report states |
| bankruptcyOrProposal | true, false or null | a fact the report states |
| latePayments | months in the last 24 months, YYYY-MM | a fact the report states; months only |
| addressMatches | true, false or null | the report's current address is compared in code with the application's address and only the verdict is kept |

Never kept: account numbers, balances per account, credit limits, inquiries, the address itself,
previous addresses, employer history, score bands, notes.

## Refusals

A credit report is refused, never stored and never staged, and `document_rejected` is recorded
with the reason, when: the name does not match the applicant (`name`), no name is legible
(`no_name`), no date is legible (`no_date`), the report is older than 90 days (`stale`), or the
tenant added the file from the credit report row and it does not read as a credit report
(`not_credit`). The tenant sees one plain sentence (CREDIT_REJECTIONS).

## Where the row shows

The applicant card (the label, the provider and the date), the screening checklist (every fact),
the document report, the landlord page, the landlord PDF and the paste text, all in the words of
creditLines. The listing switch "Ask for a credit report" only moves the credit row first on the
tenant's upload step.
