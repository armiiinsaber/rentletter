# Parties on one application

Couples, roommates and students with a parent guarantor apply as one application with several
people on it. The primary fills the application and invites each other person by name and
email. Each party gets their own link to their own short form (identity, employment and income,
documents, consent), their own standing (invited, in progress, submitted, declined, withdrawn)
and their own 14 day document hold. The primary never sees a party's income or documents, and a
party never sees the primary's.

Code: lib/parties.js (the roles, the words, the labels), lib/partyStore.js (the rows, the emails,
the recipients), pages/api/party/manage.js (the primary invites and lists), pages/api/party/self.js
(the party's own form, decline and withdraw), pages/party/[token].js (the party's page),
components/tenant/PartiesCard.js (the invite card), db/008-application-parties-invites.sql.

## Legal basis, one line each

- Same requirement for everyone: a guarantor is a listing level setting ("Guarantor accepted",
  listings.pref_guarantor_accepted) applied to every applicant on the listing. The OHRC's policy
  on rental housing says a guarantor may be asked for only when the same is asked of all tenants.
- Roles only: the form asks which role a person has on the lease, never the relationship between
  people, never family status, never who lives with whom (OHRC and the BC Human Rights Code list
  marital status and family status as protected grounds; the occupant role is kept in the enum
  and offered on no screen).
- Income stored, not scored: each party's income goes to income_sources with its kind
  (employment, self_employed, other) and is shown to the realtor. Fit reads the primary's
  application alone and is byte identical with zero, one or two parties (tests/parties.test.mjs).
  Ontario Regulation 290/98 permits income information only together with other screening
  information, never as a sole criterion, and the kind of income is never a rank or a filter.
- Consent per person: each party submits their own form under one consent sentence
  (PARTY_CONSENT_LINE) that names what goes where and for how long documents are held. A party
  can decline from the email or withdraw from their own page; the primary is told either way.
- Privacy by credential: each person holds their own token and it reaches only their own URL.
  The primary's owner_token opens /my-application; a party's party_token opens /party/{token};
  neither opens the other's page or documents (pages/api/party/self.js answers 401 to the wrong
  token, pages/api/application/manage.js the same).
- Retention: the same 14 day hold (lib/documentRetention.js), the same private bucket, the same
  open log (pages/api/documents/open.js, with the party's document marked application_party_id),
  the same daily deletion (pages/api/cron/expire-documents.js).

## The data per role

| Role | Kept | Why |
| --- | --- | --- |
| primary | the application as before (public.applications) | the application body |
| co_applicant | full_name, email, phone, employment_type, job_title, employer or business_name, years_at_job, annual_income, income_sources (kind, amount), doc_verifications, status and its dates, consented_at | their own identity, employment and income, read and shown beside the primary's |
| guarantor | the same as a co applicant, plus address | the address is kept for the lease and used nowhere else |
| occupant | nothing: no screen offers the role | the household question was removed for OHRC reasons |

Never kept for any party: a relationship to anyone, a family status, a date of birth, an age,
anything a document shows beyond the fields lib/applicantAnalysis.js reads for the primary.

## Standing and state

A party's progress is recorded in application_events with actor_type applicant and the reason
party_invited, party_submitted, party_declined or party_withdrawn, on the application's own row
and without moving its state (lib/applicationTransitions.js recordPartyProgress). The one state
a party can cause is docs_pending: when a party submits their form their document request is
minted and a submitted application moves to docs_pending; the reminders go to that party; their
upload moves it back to submitted. Mark rented, not selected, withdraw and reconsider act on the
whole application, and every party with an email receives the same tenant facing email the
primary does (pages/api/listings/status.js, lib/reconsiderInvite.js).
