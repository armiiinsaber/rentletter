# The tenant profile, the realtor circle and handoffs

Status: design only. No application code, no migration in db/, no SQL run.
Date: November 17, 2026.
Branch: design-profile-and-circle.

## 0. Summary

Three features ship as one ecosystem.

* The tenant profile: one profile per tenant, with documents read once, owned and deletable by the tenant.
* The realtor circle: the realtors you trust, who does rentals, your handoff history, what you are owed.
* Handoffs: a tenant or a whole rental job passes from one realtor to another, as a favour or under a formal referral fee paid brokerage to brokerage.

About half of this exists today in an earlier form.
A tenant profile per email exists. A consented realtor to realtor referral exists. A consent to be kept in mind exists.
The design keeps those and changes them where they break a hard rule. It does not build a second system beside them.

The ten decisions the design makes:

1. `tenant_profiles` is the one profile. `applicant_people` is never started and is retired.
2. A share is a grant to read, never a copy. One row per tenant and recipient. Only the tenant can approve it.
3. What a share shows is built from a fixed list of checked facts. The Fit score and the sending realtor's opinion are not in that list and have no column to travel in.
4. The existing referral shares household size and carries a free text note about the tenant. Both are removed.
5. Documents in a standing profile live 90 days, the ID image 14 days, the facts read from them until the profile ends. A credit report never enters the standing profile.
6. A tenant's delete is a hard delete with one legal exception: a completed deal's record at the brokerage.
7. A formal referral fee is a record between two brokerages. An agent's own name is never the payee.
8. A realtor cannot take part in a formal referral until their brokerage record is complete and its broker of record has confirmed it by email.
9. Payments are designed on Stripe Connect and refuse to run live while `BROKERAGE_PAYMENTS_ENABLED` is false.
10. Messages exist only as rows under a handoff. There is no table a general chat could be built on.

## 1. Inventory: what exists, and where the design overlaps or conflicts

Each entry: what it is, where it is, what the design does with it.

### 1.1 Tenant accounts and /my-application

What exists:

* One profile per email, signed in by magic link, no password. `pages/my-application.js:1-11`.
* The table `tenant_profiles`: id, email, email_key, facts, applications, profile_revision. `db/tenant-profiles.sql:20-30`.
* The store: KV first, Supabase as the durable copy, a 2 year TTL in KV. `lib/tenantProfileStore.js:1-36`.
* The session: a 30 day httpOnly cookie `rl_tenant`. `lib/tenantProfileStore.js:38-40`, `:238`.
* The magic link: 15 minutes, single use, stored hashed. `lib/tenantProfileStore.js:200-217`. The link's GET writes nothing. `pages/api/tenant/verify.js:1-4`.
* The routes: `pages/api/tenant/profile.js:1-11`, `prefill.js:1-2`, `sync-application.js:1-5`, `request-link.js:1-5`.
* One page per submitted application, the snapshot one realtor received. `pages/my-application/[rl].js:1-7`.
* Reuse today: the apply page asks `/api/tenant/prefill` when a session exists. `pages/apply/[token].js:142`.

Reuse: all of it. This is the profile. The design adds to this table and this page.

Conflicts:

* The profile holds typed facts only. The page says so: "Your profile holds the facts you typed, never documents." `pages/my-application.js:303`. The new profile holds documents. That sentence and the privacy policy must change in the same release.
* `tenant_profiles.applications` holds each application's owner token. `db/tenant-profiles.sql:25`, `:33`. Hard rule 7 says owner_token never reaches the realtor side. So no realtor facing read may ever select this column. Section 4.9 says how.
* KV is canonical and carries a 2 year TTL. A delete must clear KV and Supabase, and must stop a late KV write from bringing a profile back. Section 4.6.
* A profile is created without proof of the email: any submission attaches to the profile of the email typed. `lib/tenantProfileStore.js:143`. That is safe today because the profile holds only what the same person typed. It is not safe for a profile that holds documents. Section 3.1 adds a verified step before anything sensitive is stored.

### 1.2 applications.profile_revision and tenant_profile_id

What exists:

* `applications.tenant_profile_id`: the back link from a snapshot to its profile, set lazily. `db/tenant-profiles.sql:39-41`.
* `applications.profile_revision` and `profile_updated_at`: a count and a time of the tenant's edits to that one application. `db/profile-edits.sql:13-18`.
* `tenant_profiles.profile_revision`: a count of edits to the profile. `db/tenant-profiles.sql:27`.

Conflict: two columns share the name `profile_revision` and mean different things.
The one on `applications` counts edits to the snapshot. It does not say which profile revision the form was filled from.
Neither column, nor `tenant_profile_id`, says whether the form was prefilled.
That is why `lib/kpis.js` cannot count true reuse today.

The design leaves both columns as they are and adds new ones with new names. Section 5.

### 1.3 applicant_people

What exists:

* A table for "one portable person per verified email", with a constraint that its facts never hold a Fit result. `db/002-application-state-tables.sql:34-57`.
* `applications.applicant_person_id` and `applicant_documents.applicant_person_id`. `db/002-application-state-tables.sql:59`, `:204`.
* No code writes any of them.

Conflict: it is a second answer to the same question `tenant_profiles` answers.
Two person tables keyed by the same email hash would drift.

Decision: `tenant_profiles` wins, because it is written, read and tested today.
`applicant_people` keeps two good ideas, and both move over:

* `email_verified_at`: becomes a column on `tenant_profiles`.
* The check that facts never hold a Fit key: becomes a check on `tenant_profiles.facts` and on every new jsonb column.

`applicant_people` and its two foreign key columns stay empty and are dropped in the last phase, by a migration you run.

### 1.4 The Pipeline consent for future listings

What exists:

* `pipeline_consents`: one row per applicant and realtor, pending, consented, declined or expired. `db/listing-status.sql:31-46`, `db/pipeline.sql:15-34`.
* The tap that is the consent, on `/keep/{token}`. The page writes nothing on load. `pages/keep/[token].js:1-6`.
* The ask from a rented invite link. `pages/api/pipeline/consent.js:1-9`.
* 60 days, one renewal email. `db/pipeline.sql:2-4`, `lib/pipeline.js:139-147`.
* A single use prefill token for the invite. `lib/pipeline.js:104-125`, `pages/apply/[token].js:32`.

Overlap: a pipeline consent is a tenant saying "this one realtor may keep my application and invite me again".
A profile share is a tenant saying "this one realtor may read my profile".
They are the same shape: one tenant, one realtor, a tap, an expiry, a renewal.

Decision: keep Pipeline as it is for the realtor who already holds the application.
It is not widened to cover another realtor. A pipeline consent never lets realtor A show the tenant to realtor B.
The share table in section 4.4 is modelled on it: a page that writes nothing on load, a tap, an expiry.
When a profile exists, the Pipeline invite prefills from the profile instead of the old application row, and records that it did.

### 1.5 The existing realtor referral system

What exists:

* Realtor 1 asks, the applicant gets a consent email, a 7 day single use link. `lib/referrals.js:4-23`, `:130`.
* The consent page shows who would receive what, with Approve and Decline weighted the same. `pages/refer/[token].js:1-5`.
* On approval a derived application is minted for Realtor 2 with a new number and a new owner token. `lib/referrals.js:6-8`, `:176`.
* Realtor 2 attaches it to a listing, and it is scored there. `lib/referrals.js:253`, `pages/api/referrals/assign.js:1-2`.
* The tenant can revoke. `lib/referrals.js:277`.
* The record: `referrals`, service role only. `db/referrals.sql:16-40`. Provenance on the application: `referral_meta`. `db/referrals.sql:43-45`.
* Events `referral_received` and `referral_accepted`. `lib/referrals.js:209`, `:269`, `lib/eventTypes.js:34-35`.
* The invite to a realtor with no account is a signup link with `?ref=1`. `pages/signup.js:26`. It is stored as `realtor_referral` and counts as a referral. `lib/signupSource.js:14`, `lib/kpis.js:147`.

Reuse: the lifecycle, the consent page, the hashed token, the revoke, the events. This is the tenant pass on of cycle step 4.

Conflicts with the hard rules:

* Rule 3. The shared fields include "Household & pets": the number of occupants and whether there is a co tenant. `lib/referrals.js:101`. Household size is a proxy for family status. The apply form already dropped the household question (`lib/parties.js:24-25`, `db/007-drop-other-occupants.sql`), yet this list still reads it. It is removed.
* Rule 2. The referral carries a free text `note` from Realtor 1 about the applicant. `db/referrals.sql:26`. A note can carry a ranking ("my strongest applicant") or a protected ground. It is removed for tenant shares. Section 6.1.
* Rule 2. The summary that travels is built from Realtor 1's junction row and includes `verified` and `reason`. `lib/referrals.js:116-128`. Those are Realtor 1's read on Realtor 1's listing. In the new design the facts come from the tenant's own profile checks, never from a realtor's row.
* Rule 1 holds today: consent is per recipient, by email. It keeps holding. But the recipient today is an email address that may belong to nobody yet (`to_email`, `db/referrals.sql:23`). The new share names a realtor profile. A realtor with no account must join first.
* No fee, no brokerage, no agreement. Those are new.
* The routes use `requireEntitlement` directly and check ownership through the RLS client. `pages/api/referrals/create.js:19`, `:27`. Newer routes use `withRealtor` and an explicit check (`lib/realtorRoute.js:1-6`). New handoff routes use the newer pattern.

Decision: `referrals` is superseded by `profile_shares` (the consent) and `handoffs` (the realtor to realtor record).
Existing referral rows are read as history and never migrated in place. `/refer/{token}` keeps working for links already sent, then redirects to the new consent page.

### 1.6 The party system

What exists:

* Co applicants and guarantors as parties on one application, each with their own invite, form, documents and standing. `lib/parties.js:1-15`, `db/002-application-state-tables.sql:63-87`, `db/008-application-parties-invites.sql`.
* Up to 3 parties. `lib/parties.js:27`.
* The party token never reaches the realtor's browser. `lib/partyStore.js:12`.
* A role on the lease is all that is asked: no relationship, no family status. `lib/parties.js:7-9`.
* A party's consent line: details go to the listing realtor, documents held 14 days. `lib/parties.js:43`.

Overlap: a co applicant is also a person who could have a profile.

Decision: a profile belongs to one person. Parties stay per application.
A party who has their own profile can fill their party form from it with one tap, and that reuse is recorded the same way.
A share of the primary's profile never includes a party. A pass on of a tenant with parties asks each party for their own approval, or passes the primary alone.
Nothing in the profile records who a person applies with.

### 1.7 documentStore retention

What exists:

* Documents are stored only after the AI read succeeds, in a private bucket, at `{profile_id}/{listing_applicant_id}/{uuid}.{ext}`. `lib/documentStore.js:1-10`, `:44`, `db/documents.sql:7-13`.
* 14 days, one constant. `lib/documentRetention.js:4`.
* The expiry cron and a storage reconcile. `lib/documentStore.js:164`, `:195`.
* The realtor opens a file through a 60 second signed URL. Session, entitlement, ownership, an event. `pages/api/documents/open.js:1-6`.
* Applications are deleted 12 months after last activity. `lib/retention.js:1-15`. The policy says both numbers. `pages/privacy.js:62-63`.

Conflict: this is the centre of hard rule 4.
Today a file belongs to one realtor and one application, and dies in 14 days.
A standing profile needs a file that belongs to the tenant and outlives one application.
The storage path, the table and the promise in the policy are all built on the first model.

Decision: a second, separate store for the tenant's own files. Section 4.2 and section 7.
The realtor's 14 day store keeps working unchanged for documents a realtor uploads or requests for one listing.
`lib/documentStore.js` is the model for the new store: store after read, no filename in the path, absent table tolerated, a reconcile job.

### 1.8 lib/kpis.js

What exists:

* `profileReuse`: counts tenants, by the email on their applications, on two or more listings. Labelled "applied twice (reuse not yet tracked)". `lib/kpis.js:125-142`.
* `referralShare`: of realtors who signed up in a month, the share whose first touch matches a closed list. `lib/kpis.js:144-155`.
* The data loader. `lib/kpiStore.js:32`.
* The first touch word. `lib/signupSource.js:12-23`, `db/013-kpi-daily.sql`.

Overlap: the design must feed both. Section 5 and section 8.

Conflict: the first touch list is closed in three places: the regex in `lib/signupSource.js:23`, the regex in `lib/kpis.js:147`, and the CHECK in `db/013-kpi-daily.sql`.
A realtor who joins through a handoff needs a new word in all three.

### 1.9 Other things the design leans on

* The realtor write gate: method, session, entitlement, then an explicit ownership check. `lib/realtorRoute.js:1-6`, `lib/requireEntitlement.js:7`, `lib/ownApplicant.js:6`, `lib/realtorWrites.js:1-6`.
* The deal steps after a yes: `closings`, and the states accepted through moved_in. `db/002-application-state-tables.sql:132-156`, `lib/application-state.js:15-35`.
* The realtor's brokerage as text on the profile: `profiles.brokerage`, `license_number`, `brokerage_address`. `db/012-board-details.sql:34-35`, `:85`. And per listing: `coop_brokerage_name`, `coop_commission`. `db/012-board-details.sql:14-15`.
* Stripe for subscriptions: a small REST client and a signed webhook. `lib/stripe.js:24`, `:38`, `lib/billing.js:24`. Nothing for Connect.
* A server side flag that is off by default in production: `BILLING_OFF`. `lib/billingOff.js:1-8`. `BROKERAGE_PAYMENTS_ENABLED` follows the same pattern, stricter.
* The tenant's view log: `/api/application/manage` returns `lookups` from the KV key `auditlog:{RL}`. `pages/api/application/manage.js:85`, `:98-99`. No code writes that key. The tenant is shown a log that is always empty. "See every view" needs a real writer. Section 4.5.
* The shared credit report: stored as a short list of facts, never scored, never called verified. `lib/creditShared.js:1-9`.
* The word "verified" is reserved: it is said only when a realtor confirmed something themselves. `lib/creditShared.js:8-9`, `lib/parties.js:12`. Section 6.2 deals with this.

### 1.10 A constraint on the build

CLAUDE.md says `pages/api/**` and `lib/**` are never modified.
This design needs changes to existing files in both, for example the submit path, the tenant profile store and the referral library.
New files alone cannot do it.
Each phase in section 12 names the existing files it must touch, so you can approve them one phase at a time.

## 2. The words

* Profile: the tenant's standing record. Typed facts, the vault, the checks.
* Vault: the tenant's own documents, in their own bucket.
* Check: one fact read from a vault document, with its source and its date.
* Share: a tenant's approval for one named realtor to read the profile for a set time.
* Pass on: a realtor asking a tenant to share their profile with a realtor in the circle.
* Job: a rental request. A landlord who needs a unit leased, or a tenant client who needs a place.
* Handoff: the record of a tenant or a job moving from one realtor to another, with its terms.
* Circle: a realtor's accepted connections.
* Brokerage: the legal entity a realtor is registered with. The only party to a formal fee.

## 3. User flows

Each consent screen's purpose is stated. None of this is final copy.

### 3.1 The tenant

Build the profile.

1. The tenant signs in by magic link, as today. The click proves the email. `email_verified_at` is set.
2. The profile page shows three parts: your facts, your documents, who can see this.
3. Before the first upload, a consent screen.
   Purpose: to get the tenant's agreement that Rentletter will keep these documents in their profile, read them with AI, and keep the facts it reads. It states how long each is kept, that no realtor sees anything until the tenant applies or approves a share, and that delete removes all of it.
4. The tenant uploads ID, proof of income, proof of employment.
5. Each file is read once. The facts read are shown to the tenant first, in plain words, before anyone else can see them.
6. The tenant can correct a typed fact, remove a file, or remove a check they think is wrong. A removed check is gone, not hidden.
7. The profile shows what a realtor would see, exactly, on one screen. Nothing a realtor sees is hidden from the tenant.

Apply with one tap.

1. The tenant opens an invite link while signed in.
2. One screen: the listing, the realtor, and the list of what will be sent.
   Purpose: to get the tenant's agreement to send this profile to this realtor for this listing. It names the realtor and the brokerage, lists the facts and the documents, and says the realtor can open the documents for 14 days.
3. One tap sends it. An application snapshot is made, as today. It records that it came from the profile (section 5).
4. A share row is written for that realtor, purpose `application`, so the documents open from the vault. No file is copied.
5. Anything the listing asks that the profile lacks is asked on a short form before the tap.

See every view.

1. The profile lists every share: who, since when, until when, for what.
2. Under each, every time that realtor opened the profile or a document, with the date.
3. Each share has one button: stop sharing.

Approve a pass on.

1. The tenant gets an email: realtor A would like to pass your profile to realtor B at brokerage C.
2. The link opens a page that writes nothing on load.
   Purpose: to get the tenant's agreement to this one share with this one named realtor. It names both realtors and the recipient's brokerage, lists exactly what the recipient will see, says the recipient may add the tenant to one of their own listings and that the tenant will be told and can withdraw, gives the end date, and says the Fit score and realtor A's notes are not sent.
3. Approve and Decline are the same size. Decline tells realtor A only that the answer was no.
4. Approval creates one share for realtor B. It does not let B share with anyone.

Revoke and delete.

1. Stop sharing ends one share at once. The realtor's next read is refused.
2. Delete my profile asks once, and states the one thing it cannot remove (section 7.4).
   Purpose: to make sure the tenant knows the delete is permanent and what happens to applications in progress.
3. On confirm, everything in section 7.4 runs. The tenant gets one last email saying it is done.

### 3.2 The sending realtor

Pass on a tenant.

1. On an applicant who was not selected, the realtor taps Pass on.
2. The realtor picks one person from their circle. The picker shows each connection's name, brokerage and live listings: area and rent. It shows nothing about the tenant.
3. The realtor chooses the terms: no fee, or a formal fee.
4. A confirmation screen.
   Purpose: to tell the realtor that the tenant will be asked first, that the tenant sees both names, and that the Fit score, the checklist notes and the realtor's own opinion do not travel.
5. The tenant is asked (3.1). The realtor sees pending, approved or declined, and nothing else.
6. On approval the handoff appears in both realtors' circles.

Hand off a job.

1. From the circle, the realtor taps Hand off a job.
2. They describe the job: landlord or tenant client, area, unit type, rent, timing, a short description of the work.
3. They pick one recipient and the terms: no fee, or a percentage of the receiving brokerage's commission, or a flat amount.
4. A formal fee is offered only if the realtor's brokerage record is complete and confirmed. If it is not, the screen says what is missing.
5. The client's name and contact are entered but stay sealed.
   Purpose of the attestation: the realtor states that the client agreed to be introduced to another realtor. Without the tick the job cannot be sent.
6. The recipient sees the job without the client's contact, and the terms.
7. On acceptance the contact is unsealed, the thread opens, and for a formal fee the agreement is produced (3.4).

After the close.

1. The sender sees the handoff move to closed, then the fee as due.
2. The sender's brokerage is the payee. The invoice is in the handoff.
3. The sender marks it received, or the system does once a payment clears (when payments are on).

### 3.3 The receiving realtor

1. A connection request or a handoff arrives by email and in the circle.
2. A realtor with no account joins first. The signup records the first touch as `handoff` or `circle_invite`.
3. For a pass on, the recipient sees the tenant only after the tenant approves.
4. The profile view shows checked facts with their source and date. No score, no rank, no note from the sender.
5. The recipient may add the tenant to one of their live listings. The tenant is told which listing and can withdraw.
   From there it is an ordinary application: the recipient's own Fit, checklist and landlord report.
6. For a job, the recipient accepts or declines the terms.
   Purpose of the acceptance screen: to record that this realtor, for their brokerage, agrees to these terms. For a formal fee it shows the full agreement text and both brokerages.
7. The recipient creates or links a listing to the handoff and works it in Rentletter as usual.
8. When an application on that listing reaches lease signed, the handoff is marked closed.
9. For a formal fee the recipient enters the commission their brokerage earned. The fee is computed and the invoice produced.
10. The recipient's brokerage pays the sender's brokerage outside Rentletter and marks it paid, or pays in the app when payments are on.

### 3.4 The brokerage

1. A realtor enters their brokerage: legal name, address, broker of record name and email, phone, and optionally the HST number.
2. The broker of record gets an email with a link.
   Purpose of that page: to confirm that this brokerage exists, that this realtor is registered with it, and that the brokerage agrees to receive referral agreements and invoices from Rentletter on its agents' behalf. It also lets the broker say "this is not our agent".
3. On confirmation the brokerage record is `confirmed` and the realtor can take part in formal referrals.
4. Each referral agreement and each invoice is emailed to the broker of record of both brokerages, with the PDF.
5. The broker of record has no account and no dashboard. Every link they get is single purpose and expires.
6. When payments are on, the brokerage connects its own Stripe account through Stripe's hosted onboarding. The realtor cannot do this for them.
7. If a realtor leaves the brokerage, the broker of record can say so from any agreement email. Open fees stay with the brokerage.

## 4. The data model

Conventions, the same as db/002 and db/013:

* Every statement is IF NOT EXISTS or guarded by name. A second run changes nothing.
* Every new table has RLS on and no policy. Only the service role reads or writes.
* No public policy is proposed anywhere in this design. Every read goes through a server route that checks the session and ownership first.
* The application must tolerate each file not having run.
* All money is integer cents. All times are timestamptz.

The SQL below is a draft. It lives in this document only.

### 4.1 The profile: changes to tenant_profiles

```sql
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS wants jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS vault_consent_at timestamptz;
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.tenant_profiles ADD COLUMN IF NOT EXISTS expiry_notice_sent_at timestamptz;

-- wants: what the tenant is looking for. Three keys only: areas (text[]), max_rent_cents, move_in.
-- Never the Fit score, never a protected ground or a proxy for one.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_no_fit_result') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_no_fit_result CHECK (
      NOT (COALESCE(facts, '{}'::jsonb) ?| ARRAY['fit','fitScore','fit_score','score','scorecard','criteria','rank','ranking'])
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profiles_wants_keys') THEN
    ALTER TABLE public.tenant_profiles ADD CONSTRAINT tenant_profiles_wants_keys CHECK (
      jsonb_typeof(wants) = 'object' AND (wants - ARRAY['areas','max_rent_cents','move_in']) = '{}'::jsonb
    );
  END IF;
END $$;
```

Notes:

* `email_verified_at` is set when a magic link is consumed for that email. A vault upload is refused while it is null.
* `expires_at` is 12 months after `last_active_at`. Section 7.
* `facts` keeps its shape. A new whitelist in code, `PROFILE_FACT_KEYS`, decides which keys a share may show (section 6.3). The form still has keys such as `numberOfOccupants`, `smoker` and `coApplicantRelationship` (`lib/tenantProfile.js:16-33`). None of them is in the whitelist.
* Events: `profile_created`, `profile_email_verified`, `profile_expiry_notice_sent`, `profile_expired`. These go to the tenant's own log (4.5), not the realtor timeline.

### 4.2 The vault: tenant_profile_documents

A new private bucket, `tenant-vault`. Path: `{tenant_profile_id}/{uuid}.{ext}`. No filename, no email, never an owner token.

```sql
CREATE TABLE IF NOT EXISTS public.tenant_profile_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
  storage_path       text NOT NULL UNIQUE,
  kind               text NOT NULL CHECK (kind IN ('id','income','employment','other')),
  mime               text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  bytes              integer NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
  content_hash       text,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  read_at            timestamptz,
  expires_at         timestamptz NOT NULL,
  renewed_at         timestamptz,
  deleted_at         timestamptz,
  deleted_by         text CHECK (deleted_by IS NULL OR deleted_by IN ('tenant','expiry','profile_delete','admin'))
);
CREATE INDEX IF NOT EXISTS tenant_profile_documents_profile_idx ON public.tenant_profile_documents (tenant_profile_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_profile_documents_expiry_idx ON public.tenant_profile_documents (expires_at) WHERE deleted_at IS NULL;
ALTER TABLE public.tenant_profile_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_profile_documents FROM anon, authenticated;
```

Notes:

* `kind` has no `credit` value. A credit report cannot be stored here. Section 7.3.
* A row is written only after the AI read of that file succeeds, as today.
* `expires_at` is set by kind: 14 days for `id`, 90 days for the rest.
* A deleted row keeps its metadata for 30 days with `storage_path` pointing at nothing, so the reconcile job can prove the object is gone. Then the row is removed.
* Events to the tenant's log: `vault_document_added`, `vault_document_read`, `vault_document_renewed`, `vault_document_deleted`, `vault_document_expired`.

### 4.3 The checks: tenant_profile_checks

One row per fact read from a document.

```sql
CREATE TABLE IF NOT EXISTS public.tenant_profile_checks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN (
                       'identity_name_matches',
                       'identity_document_current',
                       'income_annual_gross',
                       'employer_name',
                       'employment_start'
                     )),
  value              jsonb NOT NULL,
  agrees_with_typed  boolean,
  source_kind        text NOT NULL CHECK (source_kind IN ('id','income','employment')),
  source_document_id uuid REFERENCES public.tenant_profile_documents(id) ON DELETE SET NULL,
  read_at            timestamptz NOT NULL DEFAULT now(),
  fresh_until        timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_profile_checks_value_object CHECK (jsonb_typeof(value) = 'object'),
  CONSTRAINT tenant_profile_checks_one_per_kind UNIQUE (tenant_profile_id, kind)
);
ALTER TABLE public.tenant_profile_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_profile_checks FROM anon, authenticated;
```

Notes:

* The list of kinds is closed in the database. A new kind needs a migration and a review against rule 3.
* What is never a kind: date of birth, age, a photo, an ID number, citizenship or immigration status, the type of income (employment, assistance, pension, support), marital or family status, an address history beyond what the tenant typed.
* `identity_name_matches` holds `{ "matches": true }`. It does not hold the name on the ID, the number or the date of birth.
* `income_annual_gross` holds `{ "cents": 8400000 }` and nothing about where the money comes from.
* When the source document is deleted or expires, the check stays, with `source_document_id` null. The share view then says "read from a document on DATE, document no longer held".
* `fresh_until` is 90 days after `read_at` for income and employment, 12 months for identity. A stale check is still shown, with its date. It is never shown as current.
* Events to the tenant's log: `profile_check_recorded`, `profile_check_removed`.

### 4.4 The shares: profile_shares

```sql
CREATE TABLE IF NOT EXISTS public.profile_shares (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_profile_id     uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
  recipient_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose               text NOT NULL CHECK (purpose IN ('application','pass_on')),
  requested_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  handoff_id            uuid,
  listing_id            uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','revoked','expired')),
  consent_token_hash    text UNIQUE,
  consent_expires_at    timestamptz,
  scope                 text[] NOT NULL DEFAULT ARRAY['facts','checks'],
  approved_at           timestamptz,
  approved_via          text CHECK (approved_via IS NULL OR approved_via IN ('session','email_link')),
  documents_until       timestamptz,
  expires_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_shares_scope_known CHECK (scope <@ ARRAY['facts','checks','documents']),
  CONSTRAINT profile_shares_approved_has_time CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CONSTRAINT profile_shares_pass_on_has_requester CHECK (purpose <> 'pass_on' OR requested_by IS NOT NULL),
  CONSTRAINT profile_shares_not_self CHECK (requested_by IS NULL OR requested_by <> recipient_profile_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_shares_one_live_idx
  ON public.profile_shares (tenant_profile_id, recipient_profile_id, purpose, COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS profile_shares_recipient_idx ON public.profile_shares (recipient_profile_id, status);
ALTER TABLE public.profile_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_shares FROM anon, authenticated;
```

How this enforces rule 1:

* The recipient is a column, fixed at creation, and never updated. There is no update path for it in code, and a trigger refuses a change to it.
* A row is born `pending`. The only code that sets `approved` is the tenant's: the tenant session route, or the single use token on the consent page.
* No realtor route can write `status`. A test scans every route under a realtor session for a write to this table and allows exactly one: the insert of a `pending` row.
* Every realtor read of a profile runs one function: find a share where `recipient_profile_id` is the signed in realtor, `status` is `approved`, and `expires_at` is in the future. No row, no read.
* A recipient who wants a third realtor to see the tenant must create a new `pending` row for that realtor. The tenant is asked again. That is the only way a profile moves.
* Revoke sets `status = 'revoked'` and `ended_at`. The read check fails on the next request.

Defaults:

* A pass on share lasts 30 days from approval. `scope` is facts and checks. Documents are not in scope until the tenant is on one of the recipient's listings.
* An application share lasts while the application is open. `documents_until` is 14 days after approval, matching today's promise.
* A pending ask expires in 7 days, as today (`lib/referrals.js:38`).

Events on the realtor timeline: `profile_share_requested`, `profile_share_approved`, `profile_share_declined`, `profile_share_revoked`, `profile_share_expired`. The payload carries the tenant's first name and the other realtor's name, nothing else.

### 4.5 The view log: profile_access_log

```sql
CREATE TABLE IF NOT EXISTS public.profile_access_log (
  id                 bigserial PRIMARY KEY,
  tenant_profile_id  uuid NOT NULL REFERENCES public.tenant_profiles(id) ON DELETE CASCADE,
  share_id           uuid REFERENCES public.profile_shares(id) ON DELETE SET NULL,
  actor_type         text NOT NULL CHECK (actor_type IN ('realtor','tenant','system')),
  actor_profile_id   uuid,
  actor_label        text,
  action             text NOT NULL CHECK (action IN (
                       'profile_viewed','document_opened','share_requested','share_approved','share_declined',
                       'share_revoked','share_expired','added_to_listing','document_added','document_deleted',
                       'check_recorded','check_removed','profile_exported')),
  document_id        uuid,
  at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_access_log_profile_idx ON public.profile_access_log (tenant_profile_id, at DESC);
ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_access_log FROM anon, authenticated;
```

Notes:

* The read function in 4.4 writes the log row in the same call that returns the data. A read that cannot be logged is refused.
* `actor_label` is the realtor's name and brokerage at the time, so the tenant's log still reads correctly after a realtor leaves.
* This replaces the KV key `auditlog:{RL}` that nothing writes (`pages/api/application/manage.js:85`).
* The log is deleted with the profile.

### 4.6 The delete record: profile_deletions

```sql
CREATE TABLE IF NOT EXISTS public.profile_deletions (
  email_key      text PRIMARY KEY,
  deleted_at     timestamptz NOT NULL DEFAULT now(),
  objects_removed integer NOT NULL DEFAULT 0,
  shares_ended    integer NOT NULL DEFAULT 0,
  applications_scrubbed integer NOT NULL DEFAULT 0,
  applications_kept     integer NOT NULL DEFAULT 0,
  completed_at   timestamptz
);
ALTER TABLE public.profile_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_deletions FROM anon, authenticated;
```

Notes:

* It holds a hash of the email and counts. No name, no email, no fact.
* Its job: for 30 days, any write that would recreate a profile for that email hash from a stale KV record is refused. A new sign in by the tenant clears the row and starts a fresh, empty profile.
* `completed_at` is set only when every step in 7.4 has finished. A delete that is not complete is retried by a cron and shown in the office.

### 4.7 True reuse: changes to applications

```sql
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_source text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_profile_id uuid;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS prefill_profile_revision integer;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS email_verified_at_submit timestamptz;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS reused_checks text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_source_check') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_source_check CHECK (
      prefill_source IS NULL OR prefill_source IN ('none','profile','previous_application','pipeline_invite','pass_on')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_profile_pair') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_profile_pair CHECK (
      (prefill_source IS NOT NULL AND prefill_source IN ('profile','pass_on') AND prefill_profile_id IS NOT NULL AND prefill_profile_revision IS NOT NULL AND prefill_profile_revision >= 0)
      OR ((prefill_source IS NULL OR prefill_source NOT IN ('profile','pass_on')) AND prefill_profile_id IS NULL AND prefill_profile_revision IS NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_prefill_record_whole') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_prefill_record_whole CHECK (
      (reused_checks IS NULL OR prefill_profile_id IS NOT NULL)
      AND (prefill_source IS NOT NULL OR email_verified_at_submit IS NULL)
    );
  END IF;
END $$;
```

Built as `db/014-prefill-record.sql`. Two points where the first draft of this section was wrong, now matching the migration:

* `prefill_profile_id` carries no foreign key. The draft had `REFERENCES tenant_profiles ON DELETE SET NULL` beside a check that a profile source always names its profile. The two contradict: deleting a profile would null the id, break the check, and the delete would be refused. A tenant's delete must never be stopped by an application already sent, so the check stays and the foreign key goes. The id is a random uuid that names nobody once the profile is gone.
* The pair check is strict both ways: a profile source always names a profile and a revision, and no other source ever does.

Section 5 says what each value means and who writes it.

### 4.8 Brokerages and the circle

```sql
CREATE TABLE IF NOT EXISTS public.brokerages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name               text NOT NULL,
  address                  text NOT NULL,
  phone                    text,
  broker_of_record_name    text NOT NULL,
  broker_of_record_email   text NOT NULL CHECK (broker_of_record_email = lower(broker_of_record_email)),
  registration_number      text,
  hst_number               text,
  status                   text NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed','confirmed','disputed','suspended')),
  confirm_token_hash       text UNIQUE,
  confirm_sent_at          timestamptz,
  confirmed_at             timestamptz,
  created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brokerage_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brokerage_id  uuid NOT NULL REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','left','disputed')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS brokerage_members_one_active_idx ON public.brokerage_members (profile_id) WHERE status = 'active';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS does_rentals boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_areas text[];

CREATE TABLE IF NOT EXISTS public.circle_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','removed','blocked')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  answered_at    timestamptz,
  CONSTRAINT circle_connections_not_self CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS circle_connections_pair_idx
  ON public.circle_connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE TABLE IF NOT EXISTS public.circle_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_key     text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  handoff_id    uuid,
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','joined','expired','reported')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS circle_invites_once_idx ON public.circle_invites (inviter_id, email_key) WHERE status = 'sent';

ALTER TABLE public.brokerages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokerage_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brokerages, public.brokerage_members, public.circle_connections, public.circle_invites FROM anon, authenticated;
```

Notes:

* `profiles.brokerage`, `license_number` and `brokerage_address` stay and prefill the brokerage form. They are not the legal record.
* A realtor has at most one active membership. Changing brokerage ends one row and starts another. History is kept.
* `circle_invites` stores a hash of the invitee's email, not the email. The address is used once to send the mail and is not kept.
* The circle has no public directory. A realtor finds another only by typing their exact email, or from a past handoff.
* `service_areas` is free text about where the realtor works. Nothing about a realtor's person is collected.
* Events on the realtor timeline: `circle_invite_sent`, `circle_connection_requested`, `circle_connected`, `circle_connection_removed`, `brokerage_added`, `brokerage_confirmed`, `brokerage_disputed`.

### 4.9 Handoffs

```sql
CREATE TABLE IF NOT EXISTS public.handoffs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                   text NOT NULL CHECK (kind IN ('tenant','job')),
  from_profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  to_profile_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  from_brokerage_id      uuid REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  to_brokerage_id        uuid REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  status                 text NOT NULL DEFAULT 'offered' CHECK (status IN (
                           'awaiting_tenant','offered','accepted','declined','withdrawn','expired','closed','fell_through')),
  fee_kind               text NOT NULL DEFAULT 'none' CHECK (fee_kind IN ('none','percent','flat')),
  fee_percent_bps        integer CHECK (fee_percent_bps IS NULL OR (fee_percent_bps > 0 AND fee_percent_bps <= 5000)),
  fee_flat_cents         bigint CHECK (fee_flat_cents IS NULL OR fee_flat_cents > 0),
  -- a job
  job_client_side        text CHECK (job_client_side IS NULL OR job_client_side IN ('landlord','tenant')),
  job_area               text,
  job_unit               text,
  job_rent_cents         bigint,
  job_timing             text,
  job_summary            text CHECK (job_summary IS NULL OR char_length(job_summary) <= 600),
  client_contact         jsonb,
  client_consent_attested_at timestamptz,
  -- a tenant
  share_id               uuid REFERENCES public.profile_shares(id) ON DELETE SET NULL,
  from_listing_id        uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  -- the outcome
  to_listing_id          uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  closed_link_id         uuid REFERENCES public.listing_applicants(id) ON DELETE SET NULL,
  offered_at             timestamptz NOT NULL DEFAULT now(),
  offer_expires_at       timestamptz,
  accepted_at            timestamptz,
  closed_at              timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoffs_not_self CHECK (from_profile_id <> to_profile_id),
  CONSTRAINT handoffs_fee_shape CHECK (
    (fee_kind = 'none' AND fee_percent_bps IS NULL AND fee_flat_cents IS NULL)
    OR (fee_kind = 'percent' AND fee_percent_bps IS NOT NULL AND fee_flat_cents IS NULL)
    OR (fee_kind = 'flat' AND fee_flat_cents IS NOT NULL AND fee_percent_bps IS NULL)),
  CONSTRAINT handoffs_fee_needs_brokerages CHECK (
    fee_kind = 'none' OR (from_brokerage_id IS NOT NULL AND to_brokerage_id IS NOT NULL AND from_brokerage_id <> to_brokerage_id)),
  CONSTRAINT handoffs_job_needs_attestation CHECK (
    kind <> 'job' OR client_contact IS NULL OR client_consent_attested_at IS NOT NULL),
  CONSTRAINT handoffs_tenant_has_no_job_fields CHECK (
    kind <> 'tenant' OR (client_contact IS NULL AND job_summary IS NULL))
);
CREATE INDEX IF NOT EXISTS handoffs_from_idx ON public.handoffs (from_profile_id, status);
CREATE INDEX IF NOT EXISTS handoffs_to_idx ON public.handoffs (to_profile_id, status);

CREATE TABLE IF NOT EXISTS public.handoff_messages (
  id            bigserial PRIMARY KEY,
  handoff_id    uuid NOT NULL REFERENCES public.handoffs(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handoff_messages_thread_idx ON public.handoff_messages (handoff_id, id);

CREATE TABLE IF NOT EXISTS public.handoff_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id       uuid NOT NULL REFERENCES public.handoffs(id) ON DELETE RESTRICT,
  kind             text NOT NULL CHECK (kind IN ('agreement','invoice')),
  number           text NOT NULL UNIQUE,
  storage_path     text NOT NULL UNIQUE,
  content_hash     text NOT NULL,
  terms            jsonb NOT NULL,
  accepted_by_from uuid,
  accepted_by_to   uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.handoff_fees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id            uuid NOT NULL UNIQUE REFERENCES public.handoffs(id) ON DELETE RESTRICT,
  payee_brokerage_id    uuid NOT NULL REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  payer_brokerage_id    uuid NOT NULL REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  commission_cents      bigint CHECK (commission_cents IS NULL OR commission_cents >= 0),
  fee_cents             bigint NOT NULL CHECK (fee_cents >= 0),
  tax_cents             bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  status                text NOT NULL DEFAULT 'due' CHECK (status IN ('due','marked_paid','confirmed_paid','disputed','void')),
  due_at                timestamptz NOT NULL,
  marked_paid_at        timestamptz,
  marked_paid_by        uuid,
  confirmed_paid_at     timestamptz,
  confirmed_paid_by     uuid,
  reminders_sent        integer NOT NULL DEFAULT 0,
  last_reminder_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handoff_fees_two_brokerages CHECK (payee_brokerage_id <> payer_brokerage_id)
);

ALTER TABLE public.handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.handoffs, public.handoff_messages, public.handoff_documents, public.handoff_fees FROM anon, authenticated;
```

How this enforces the rules:

* Rule 5. `handoff_fees` has no column for a person. The payee and the payer are brokerage ids, and a check refuses the same brokerage on both sides. A fee cannot be created for a handoff without two brokerages, by constraint. The route also requires both brokerages to be `confirmed`.
* Rule 2. `handoffs` has no column that could hold a score, and a tenant handoff may not have `job_summary` or `client_contact`, by constraint. A tenant handoff carries a pointer to a share and nothing about the tenant.
* Messages. A message cannot exist without a handoff: `handoff_id` is NOT NULL with a foreign key. There is no conversation table and no recipient column. The route allows a write only from one of the handoff's two realtors, and only while the handoff is `accepted` or `closed` for less than 90 days.
* The agreement and the invoice are produced by the server from `terms`, stored in a private bucket `handoff-documents`, and hashed. An agreement is never edited. A change of terms is a new handoff.
* `ON DELETE RESTRICT` on the realtor and brokerage keys: a realtor's account cannot be hard deleted while a fee is open. Section 9.4.

Events on the realtor timeline: `handoff_offered`, `handoff_accepted`, `handoff_declined`, `handoff_withdrawn`, `handoff_expired`, `handoff_message_sent`, `handoff_closed`, `handoff_fell_through`, `handoff_agreement_issued`, `handoff_invoice_issued`, `handoff_fee_due`, `handoff_fee_marked_paid`, `handoff_fee_confirmed`, `handoff_fee_disputed`, `handoff_fee_reminder_sent`.

Each new event type must be added in three places together: `lib/eventTypes.js`, the CHECK on `events.type`, and `db/events.sql`. That pattern exists (`db/pipeline.sql:39-83`).

### 4.10 Payments

```sql
CREATE TABLE IF NOT EXISTS public.brokerage_payment_accounts (
  brokerage_id        uuid PRIMARY KEY REFERENCES public.brokerages(id) ON DELETE RESTRICT,
  stripe_account_id   text NOT NULL UNIQUE,
  livemode            boolean NOT NULL,
  charges_enabled     boolean NOT NULL DEFAULT false,
  payouts_enabled     boolean NOT NULL DEFAULT false,
  onboarded_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.handoff_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id               uuid NOT NULL REFERENCES public.handoff_fees(id) ON DELETE RESTRICT,
  stripe_object_id     text NOT NULL UNIQUE,
  livemode             boolean NOT NULL,
  amount_cents         bigint NOT NULL CHECK (amount_cents > 0),
  status               text NOT NULL CHECK (status IN ('created','processing','succeeded','failed','refunded')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.refuse_live_brokerage_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.livemode AND COALESCE(current_setting('app.brokerage_payments_enabled', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'brokerage payments are off: a live payment row is refused';
  END IF;
  RETURN NEW;
END $$;
-- attached BEFORE INSERT OR UPDATE to both tables above

ALTER TABLE public.brokerage_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brokerage_payment_accounts, public.handoff_payments FROM anon, authenticated;
```

Section 10 describes the flow and the flag.

### 4.11 The first touch words

`profiles.signup_source` gains two words: `handoff` and `circle_invite`.
The CHECK from db/013 is dropped by name and added again with the longer list, guarded.
`lib/signupSource.js` and `lib/kpis.js` gain the same two words. Section 8.

### 4.12 owner_token and the realtor side

* `tenant_profiles.applications` holds owner tokens. The one function that builds a share view takes `facts` and the check rows as arguments. It is never handed the profile row.
* The database gives it no way to slip: the share read uses a SQL view, `tenant_profile_shareable`, that selects `id`, `facts`, `wants` and `email_verified_at` and nothing else. Realtor facing code reads the view, never the table.
* A pass on no longer mints an application at approval. Today it does, with a new owner token (`lib/referrals.js:6-8`). In the new design an application exists only once the recipient adds the tenant to a listing, and its owner token goes to the tenant's profile and email, as for any application.
* A test asserts that no response to a realtor session contains a key named like an owner token or a 32 character value from the owner token alphabet.

## 5. The record for true reuse

What is written on every submitted application:

| Column | Meaning |
|---|---|
| `prefill_source` | Where the answers came from. `none`: typed fresh. `profile`: filled from the standing profile. `previous_application`: filled from one old application by its owner token, the legacy path. `pipeline_invite`: filled from the realtor's Pipeline invite. `pass_on`: made from the profile after a pass on. |
| `prefill_profile_id` | The profile it was filled from. Set for `profile` and `pass_on`. |
| `prefill_profile_revision` | That profile's `profile_revision` at the moment of filling. |
| `email_verified_at_submit` | When the tenant last proved this email, if a tenant session for the same email was present at submit. Null otherwise. |
| `reused_checks` | The kinds of check that were live in the profile and sent with this application. Empty when only typed facts were reused. |

Who decides the value. The server, never the browser.

1. When the apply page asks for a prefill, the server returns the form and a single use ticket. The ticket is stored server side with the source, the profile id and the revision.
2. The apply page sends the ticket back with the submission.
3. The submit path reads the ticket, checks it belongs to this session, writes the five columns, and deletes the ticket.
4. No ticket means `none`. A browser cannot claim a reuse that did not happen.

The definition `lib/kpis.js` then uses:

* True profile reuse, all time: the number of distinct `prefill_profile_id` with at least one submitted application where `prefill_source` is `profile` or `pass_on` and `email_verified_at_submit` is not null.
* The stricter number, shown beside it: the same, and `reused_checks` is not empty. That is a tenant who reused documents, not only typed answers.
* `tracked` turns true once the columns exist. Until then the old count and its label stay.
* The loader in `lib/kpiStore.js:32` adds the new columns to its read of `applications` and tolerates their absence.

SQL equivalent:

```sql
SELECT count(DISTINCT a.prefill_profile_id)
FROM applications a
JOIN listing_applicants la ON la.application_id = a.id AND la.state <> 'draft'
WHERE a.prefill_source IN ('profile','pass_on')
  AND a.email_verified_at_submit IS NOT NULL;
```

Open point for you (section 11): the target of 100 was set against the loose count. Decide which of the two numbers the tile shows.

## 6. How the rules are enforced

### 6.1 Rule 1: the tenant approves every share

Covered in 4.4. In short:

* Recipient fixed in the row. Approval only from the tenant's session or token. One read function. One log.
* Limits on asking: at most 2 pending asks per tenant at a time across all realtors, and one ask per realtor and tenant in 30 days. A decline closes that pair for 30 days.
* The consent page writes nothing on load, as `/keep` does today.

### 6.2 Rule 2: checked facts travel, Fit does not

* The share view is built from `tenant_profile_checks` and whitelisted keys of `tenant_profiles.facts`. It has no access to `listing_applicants`, where the score, the checklist, the decision and the realtor's notes live.
* The CHECK constraints refuse Fit keys in `facts`.
* A tenant handoff has no free text. The sending realtor cannot write a word about the tenant. This removes today's `note`.
* What the recipient is told about the sender's listing: its label, and that the tenant applied there. Not the outcome wording, not the reason.
* The recipient computes their own Fit only after the tenant is on their listing, from that listing's own criteria, as today.
* Test: a share payload is scanned for every key in `fitForbidden` and for the words score, rank, top, best, strongest.

A vocabulary point that needs your decision.
The codebase reserves "verified" for something a realtor confirmed themselves (`lib/creditShared.js:8-9`).
A fact read by AI from a document today reads "docs match".
Your brief says what travels is verified facts, "this is true".
The design keeps the existing honesty: each travelling fact carries its source in words.

* "Read from a pay document on DATE. Agrees with what the tenant typed."
* "ID read on DATE. The name matches."

It does not say "verified" unless a realtor confirmed it, and a realtor's confirmation never travels.
If you want the single word "verified" on the share, that is a wording decision with legal weight. It is in the lawyer questions.

### 6.3 Rule 3: no protected ground, no proxy

Controls, in the order data moves:

1. Collection. The profile asks nothing new about the person. `wants` has three keys, fixed by constraint: areas, maximum rent, move in date. Bedroom count is not asked, because it leads to household size.
2. Extraction. The check kinds are a closed list in the database. Date of birth, photo, ID number, status in Canada, the type of income and anything about family are not kinds and cannot be stored as checks.
3. The income check stores an amount. It does not store whether the money is employment, assistance, pension or support. Receipt of public assistance is a protected ground in Ontario housing, and lawful source of income is one in BC.
4. Display. `PROFILE_FACT_KEYS` lists the typed facts a share may show: name, email, phone, employer, job title, employment type, time at job, gross income, current address and tenure, landlord reference, move in date. It leaves out pets (free text that can name a service animal, which is disability; the tenant's own profile keeps the answer for their next application), age, date of birth, smoker, number of occupants, and every co applicant field including the relationship.
5. The ID image. A realtor in the circle never sees it. It is shown only to the realtor of a listing the tenant applied to, for 14 days, as today. The image shows a face, a date of birth and often a place of birth, so it never rides on a pass on.
6. Filtering. No realtor can search, sort or filter tenants. There is no tenant directory. A realtor sees a tenant only when that tenant applied to them or approved a share to them.
7. Matching. "A connected realtor with a matching unit" is matched on listings, not on people. The sender's picker shows which connections have live listings in an area and rent band. The tenant's facts are not an input to it.
8. Inference. No model is asked to summarise, describe or classify a tenant for a share. The share is the list of facts and nothing generated.
9. Free text. None about a tenant between realtors. The job description field is about the work and is limited to 600 characters. The thread under a handoff is free text between two professionals. It cannot be fully policed. It carries a standing line stating that nothing about a person's protected characteristics belongs there, and it is not attached to any tenant share.
10. The circle. A realtor's card holds a name, a brokerage, areas served and whether they do rentals. Nothing else.
11. Tests. The existing forbidden key scan is extended to every new table, payload and screen. The share payload has a snapshot test: its keys are exactly the whitelist.

### 6.4 Rule 7: gates and RLS

* Every realtor write: `withRealtor` (session, entitlement), then an explicit ownership check in the route. For a handoff the check is: the signed in user is `from_profile_id` or `to_profile_id`, and the action is one that side may take.
* Every realtor read of a tenant: the share check in 4.4.
* Every tenant write: the tenant session, and the profile id from the session, never from the request body.
* Every brokerage action: a single use hashed token, one purpose, an expiry.
* Every new table: RLS on, no policy, REVOKE from anon and authenticated. The migration verifier asserts both for each table.
* The entitlement scan test (`tests/entitlementScan`) is extended to the new route folders.

## 7. Retention

### 7.1 The recommendation

| What | Kept for | Tenant control |
|---|---|---|
| ID image in the vault | 14 days from upload | Delete now |
| Income and employment documents in the vault | 90 days from upload | Renew for 90 more with one tap, or delete now |
| A credit report | Never in the vault | Shared per listing as today |
| Checks read from documents | Until the profile ends | Remove any one, at any time |
| Freshness of a check | Income and employment 90 days, identity 12 months | Upload again to refresh |
| Typed facts | Until the profile ends | Edit or delete |
| The profile | 12 months after last activity, one notice 30 days before | Sign in to keep it, or delete now |
| A realtor's access to vault documents after an application | 14 days from the application | Stop sharing |
| A pass on share | 30 days from approval | Stop sharing |
| The view log | With the profile | Deleted with it |

### 7.2 Why these numbers

* 14 days for the ID image keeps today's promise for the most sensitive file. What lasts is one fact: the name matched, on a date.
* 90 days for income documents matches how long a pay stub means anything. A search for a home usually ends inside it.
* The facts outliving the files is the point of "read and checked once". A fact with a date is small and useful. A stored file is large and dangerous.
* 12 months for the profile matches the application rule already in the policy (`pages/privacy.js:62`).
* The realtor's 14 day window does not change. From the realtor's chair nothing is new.

### 7.3 The trade offs, and the other options

Option A, recommended: the table above.

* For: real reuse of documents inside one search. The ID image is still short lived.
* Against: Rentletter now holds income documents for up to 90 days without a specific realtor asking. That is a larger breach surface than today and needs the policy rewritten.
* Against: a realtor on day 20 sees "ID read on DATE, the name matches" and no image. Some will ask for the ID again. That request uses today's 14 day flow.

Option B, the cautious one: every vault file 14 days, facts kept.

* For: the document promise in the policy barely changes.
* Against: after two weeks a realtor cannot open any document. Reuse is of facts only. Realtors who insist on seeing the pay stub will ask again, and the tenant starts over on the part that hurts most.

Option C, the generous one: every vault file 12 months.

* For: the smoothest reuse.
* Against: a year of ID images and pay stubs for every tenant. The worst outcome in a breach, and the hardest to defend to a regulator. Not recommended.

The credit report stays out under every option.
A standing store of credit information that Rentletter passes to third parties is the clearest route to being a consumer reporting agency under Ontario's Consumer Reporting Act.
Until a lawyer answers question 8 in section 11.1, the tenant shares their own report per listing, as `lib/creditShared.js` does now.

### 7.4 What delete removes

One action by the tenant. In this order, each step idempotent, the whole run recorded in `profile_deletions`:

1. Every share is set to revoked. From this moment every realtor read is refused.
2. Every vault object is removed from storage, then its row.
3. Every check is removed.
4. The view log is removed.
5. Every open application made from this profile is withdrawn and scrubbed.
   Open means any state before accepted. The row stays, so the realtor's list does not break, in state withdrawn_by_applicant. Its facts, its document read results and its party rows are emptied. Any realtor held documents under it are purged through the existing path (`lib/documentStore.js:86`).
   The realtor sees: "This applicant deleted their profile on DATE."
6. Pipeline consents for this email are set to declined and their application link cleared.
7. Tenant handoffs that point at this tenant lose their share pointer. The handoff record between the two realtors stays, with no tenant in it.
8. The profile row is deleted. KV keys for the profile, its sessions and its indexes are deleted (`lib/tenantProfileStore.js:15-23` lists them).
9. `profile_deletions.completed_at` is set and the tenant is emailed.

There are no copies at other realtors to chase, because a share was a grant to read, never a copy.
The only copies are application snapshots, and step 5 scrubs them.

The one exception, stated to the tenant before they confirm:
an application that reached accepted or later is a record of a trade.
The brokerage is required to keep its trade records, and Rentletter's copy is that realtor's working record.
Those applications are not scrubbed. They age out under the 12 month rule.
Whether Rentletter may keep them over a tenant's deletion request, and for how long, is lawyer question 7.

Backups: a deleted profile leaves the live database at once and leaves backups when they rotate. The policy must state the rotation period. You need to confirm it from the Supabase plan.

### 7.5 Expiry jobs

* A daily cron removes expired vault files and their rows, the same shape as `pages/api/cron/expire-documents.js`.
* The same cron sends the 30 day profile notice and runs the profile expiry, which is the delete in 7.4.
* A weekly reconcile lists the `tenant-vault` bucket against the table and removes any object with no row, as `reconcileStorage` does (`lib/documentStore.js:195`).
* Each run is recorded, dry run by default, enforced by an env flag, as `lib/retention.js:7-9` does.

## 8. How each piece feeds the commitment

Profile reuse, target 100.

* Fed by section 5. Every one tap application writes the record. Every pass on that reaches a listing writes it too.
* A Pipeline invite filled from the tenant's profile is recorded as `profile`. It counts toward profile reuse only when the tenant's email is proved at submit, that is, when they are signed in with that address. The invite link alone does not prove it.
* A Pipeline invite filled from an old application row is recorded as `pipeline_invite` and never counts: that is the realtor reusing, not the tenant.

Referral share, target one third.

* A realtor who joins from a handoff email lands on `/signup?h={code}`. The first touch is stored as `handoff`.
* A realtor who joins from a plain connection invite lands on `/signup?c={code}`. The first touch is stored as `circle_invite`.
* Both words are added to `REFERRAL_SOURCE` in `lib/kpis.js:147`, so both count as referrals.
* The code is used to connect the two realtors and is not stored in `signup_source`. The word is.
* The existing `realtor_referral` word keeps working for links already sent.

Active realtors, target 30.

* A receiving realtor becomes active the month a passed on tenant lands on one of their listings as an application. No change to the definition.

Rentals closed, target 50.

* A handed off job that closes is an accepted application on the receiving realtor's listing. It counts once, for the receiving realtor. No change to the definition.
* A new office tile is worth adding later: handoffs closed, and fees tracked. Not part of the commitment.

## 9. Threat model

### 9.1 A realtor misusing a shared profile

| Threat | Control |
|---|---|
| Forwards the profile to a third realtor | No forward exists. A new share needs the tenant. The recipient is fixed in the row. |
| Screenshots or copies the facts out | Cannot be prevented. Limited by showing facts and no documents on a pass on, by the log the tenant sees, and by terms the realtor accepts. |
| Keeps reading after the tenant revokes | The read check runs on every request. Signed document URLs live 60 seconds. |
| Uses a share to contact the tenant about other things | The terms forbid it. The tenant can report a realtor from the share. Three reports suspend the realtor's circle features pending review. |
| Asks again and again until the tenant gives in | Two pending asks per tenant. One ask per realtor and tenant in 30 days. |
| Uses the circle picker to learn about tenants | The picker shows listings, never tenants. |
| Infers a protected ground from a document | The ID image never travels on a pass on. The income check carries no source type. |
| Sends their ranking in words | No free text on a tenant handoff. The thread is tied to a job, not a tenant. |
| A Rentletter insider reads vaults | Service role only, access through routes, every read logged, the office shows counts and never contents. |

### 9.2 Revoke and delete

* Revoke: one row changes. The next read fails. Nothing to chase.
* Delete: section 7.4. The run is resumable and its completion is recorded.
* The stale cache risk: KV holds profiles for 2 years. Delete clears KV first, and `profile_deletions` blocks a late write for 30 days.
* The realtor's own notes about a tenant stay with the realtor's application row and are scrubbed with it in step 5.

### 9.3 A realtor leaves Rentletter

* Suspended or cancelled account: every share where they are the recipient is revoked at once by the same job. Tenants see "access ended" in their log.
* Offered handoffs are withdrawn. Accepted ones without a fee are closed as withdrawn and the other realtor is told.
* Accepted ones with a fee stay open: the agreement is between brokerages. The broker of record of the leaving realtor's brokerage is emailed and can name another agent or settle.
* The account cannot be hard deleted while a fee is open (`ON DELETE RESTRICT`). It is disabled instead.

### 9.4 A realtor changes brokerage

* The agreement names the two brokerages as they were at acceptance, and stores their details inside `terms`. It never changes.
* A fee already agreed stays owed to or by the old brokerage.
* The realtor's membership row ends and a new one starts. The new brokerage must be confirmed before the realtor can make a new formal referral.
* A handoff accepted but not closed at the time of the move is flagged to both realtors and both brokers of record. Which brokerage earns the commission is theirs to settle. Rentletter does not decide it. Lawyer question 4.

### 9.5 Abuse of the circle

| Threat | Control |
|---|---|
| Spam invites | 10 invites a day and 50 a month per realtor. One live invite per address. The invite mail has a "do not email me" link that blocks further invites to that address from anyone. |
| Harvesting who is on Rentletter | No directory. Looking up an email gives the same answer whether or not it has an account. |
| A fake brokerage to collect fees | A brokerage is unconfirmed until its broker of record confirms by email. A formal fee needs two confirmed brokerages. The office reviews each new brokerage against RECO's public register before it can be confirmed, by hand, in the first months. |
| A realtor names themselves broker of record | The office review. Also a flag when the broker of record's email matches the realtor's own, or is a free mail address. |
| Two accounts handing off to each other to invent a fee | Same brokerage on both sides is refused by constraint. A fee needs a close on a real listing with an application that reached lease signed. |
| A fee dispute | Either side can mark disputed. Reminders stop. Both brokers of record are told. Rentletter shows the record and does not rule. |
| A handoff used to dump unwanted clients on someone | The recipient must accept. Declines are private. A realtor can remove a connection and block. |
| A job handoff that leaks a client's contact | Contact is sealed until acceptance, and the sender must attest to the client's consent. |
| A tenant impersonated to approve a share | Approval needs the tenant's session or the single use link sent to the verified email. |

### 9.6 Money

* The flag. Section 10.
* A webhook that is forged: signature check, as `lib/stripe.js:38` does today, with a separate secret.
* A webhook from live mode while the flag is false: ignored and logged.
* A fee amount tampered with in the browser: the amount is computed on the server from the handoff terms and the commission the payer entered, and shown to both sides before anything is charged.

## 10. Payments between brokerages

### 10.1 The flag

`BROKERAGE_PAYMENTS_ENABLED`. Server side only. Never prefixed `NEXT_PUBLIC`. False unless it is exactly the string `true`.

While it is false:

* One module is the only place that talks to Stripe for brokerage money. Every function in it calls one guard first.
* The guard reads the flag and the key. If the flag is false and the key is not a test key, it throws before any network call.
* If the flag is false and a request would create a charge or a transfer in live mode, it is refused with a clear error, and the refusal is logged.
* In production with the flag false, the pay button is not rendered and the pay route answers that payments are off. Test mode payments run only outside production.
* The webhook route ignores any event whose `livemode` is true.
* The database trigger in 4.10 refuses a live row.
* It uses its own keys: `BROKERAGE_STRIPE_SECRET_KEY` and `BROKERAGE_STRIPE_WEBHOOK_SECRET`. It never falls back to the subscription keys, so a live subscription key can never move brokerage money.

Tests that must exist before the module merges:

* With the flag false and a live looking key, every exported function throws and no fetch is made.
* With the flag unset, the same.
* With the flag set to anything but `true`, the same.
* A scan: no file outside the module mentions the Connect endpoints.

Turning it on is three separate acts: the lawyer's sign off recorded in the repo, the env var set by you in Vercel, and the database setting set by you.

### 10.2 The design, in test mode

* Each brokerage connects its own Stripe account through Stripe's hosted onboarding. Stripe does the identity and business checks.
* The link to onboard is sent to the broker of record, not the agent.
* When a fee is due, the payer brokerage gets a hosted Checkout page for the invoice amount.
* The payment method offered first is bank debit, since these are business payments of hundreds to thousands of dollars.
* The charge is a destination charge to the payee brokerage's connected account. Rentletter's platform fee is zero unless you decide otherwise.
* Funds settle from the payer's bank to the payee's Stripe balance and pay out to the payee's bank. Rentletter does not hold a balance of its own for these funds.
* On success the webhook sets the fee to confirmed_paid and writes the event.
* A failed or returned debit sets the fee back to due and tells both sides.
* Refunds are not offered in the app. A dispute is settled between the brokerages.

### 10.3 While payments are off

This is the product at launch.

1. The invoice is issued with the payee brokerage's details.
2. The payer brokerage pays by its usual means.
3. The payer marks it paid. The payee confirms.
4. Reminders go to the payer's realtor and broker of record at 7, 14 and 30 days after due, then stop.
5. "What you are owed" in the circle is the sum of fees that are due or marked paid and not confirmed, for the realtor's brokerage.

## 11. Questions

### 11.1 For a lawyer

1. RECO and TRESA: may a registrant's brokerage pay or receive a referral fee for a residential lease to or from another Ontario brokerage under a written agreement produced by a third party platform? What must that agreement contain?
2. Must the broker of record of each brokerage sign each referral agreement, or is acceptance by the agent on the brokerage's behalf enough when the brokerage has confirmed its record once?
3. May the fee be stated as a percentage of the receiving brokerage's commission, and is there any cap or disclosure duty to the client (landlord or tenant) about the referral fee?
4. When an agent changes brokerage between acceptance and close, which brokerage is party to the agreement and entitled to the fee? Can the platform's agreement settle that in advance?
5. A favour with no fee: is any written record or disclosure still required when one registrant passes a client to another?
6. A job handoff shares a client's name and contact with another registrant. Is the sending agent's attestation of the client's consent enough under PIPEDA and TRESA, or must the client consent directly to Rentletter?
7. PIPEDA and a tenant's deletion request: may Rentletter keep an application that reached accepted, as the brokerage's trade record, after the tenant deletes their profile? For how long? Who is the accountable organisation for that copy, Rentletter or the brokerage?
8. Ontario's Consumer Reporting Act: does a standing profile with income and identity facts, shown to realtors with the tenant's approval, make Rentletter a consumer reporting agency? Does the answer change if a credit report is added to the profile? Does it change if facts are labelled "verified"?
9. PIPEDA consent for a share between realtors: is one tap on a page that names the recipient, the facts and the end date valid, meaningful consent? Does the consent need renewing if the recipient changes brokerage?
10. The standing vault: is consent at first upload enough to hold income documents for 90 days and an ID image for 14 days with no specific realtor request? What must the privacy policy say, and must existing tenants be told?
11. Human rights: does a profile that follows a tenant between landlords create a risk of discrimination claims against Rentletter, even with no protected ground stored? Is showing the amount of income without its source enough to meet the Ontario rule on receipt of public assistance and the BC rule on lawful source of income?
12. The BC Human Rights Code and BC's Personal Information Protection Act: what changes if a tenant or a realtor is in BC? Does BC's real estate regulator have its own rule on referral fees that differs from Ontario's?
13. FINTRAC: with destination charges on Stripe Connect, where Rentletter never holds the funds, is Rentletter a money services business? Does a platform fee change the answer?
14. Real estate trust accounts: must a referral fee between brokerages pass through a brokerage's trust or general account in a way that a card or bank debit through Stripe would break?
15. HST: is a referral fee between two brokerages a taxable supply, and must the invoice Rentletter produces meet the CRA's invoice rules, including the payee's registration number?
16. The agreement and the invoice are produced by Rentletter. Does that expose Rentletter to liability if a fee is not paid or the agreement is defective? What disclaimer is needed?
17. CASL: are the pass on request to a tenant, the circle invite to a realtor and the brokerage confirmation to a broker of record commercial electronic messages that need consent or an exemption?
18. AI reading of documents for a standing profile: any duty to disclose automated processing, or to offer a human review of a check the tenant disputes?
19. Minors and capacity: any duty to confirm a tenant is an adult before holding their ID, given that age is never stored?
20. Breach: with a vault, what are the notification duties and what security safeguards would a regulator expect for stored ID images?
21. Age and Ontario's Human Rights Code s. 4. Section 4 gives a 16 or 17 year old who has withdrawn from parental control a right to equal treatment in renting, and makes their lease enforceable as if they were 18. The rule built (`lib/applyAge.js`):
    * In Ontario, an applicant or co applicant qualifies at 18 or over. At 16 or 17 they qualify if they answer yes to one plain question: "Have you withdrawn from parental control?" It is asked only when their date of birth makes them 16 or 17, and nothing further is asked about why.
    * In British Columbia the rule is the age of majority, 19.
    * A guarantor must be of the age of majority in both provinces (18 and 19), since a guarantor is not renting the home.
    * The date of birth never leaves the tenant's device. The applicant's yes is stored beside the age confirmation on their application. It is never shown to the realtor, the landlord or in any report; the realtor sees nothing about age at all.

    Does this meet s. 4? May a platform take the tenant's own yes as enough, or must anything more be asked or kept? Is refusing a guarantor under 18 in Ontario lawful? Does s. 4 reach a co applicant the same way as the applicant?
22. A photo on a rental profile. A tenant may add one photo of themselves to their profile (optional, their own choice, deletable). It is shown to a realtor only through a share the tenant approved, is never read by Fit, a document check or any AI step, and is kept off the report a realtor sends a landlord. A face shows race, colour, sex, age and often creed or disability, all protected grounds in housing under the Ontario Human Rights Code and the BC Human Rights Code. Does offering the photo, even as the tenant's choice, expose Rentletter, the realtor or the landlord to a discrimination claim? Does the answer change if the photo were placed on the landlord report? Is wording beside the upload enough, or must anything be said to the realtor who views it? The About me field is free text in the tenant's own words, with the line "You never need to mention family, religion or health": is that line itself a problem, and is there a duty to screen what a tenant writes?
23. Voluntary prepaid rent. A tenant may state on their profile that they are open to prepaying rent, as a number of months from 1 to 12, shown as "Offered by the tenant" and never as a deposit or a requirement. In Ontario, RTA s. 105 limits a rent deposit to one month and s. 134 bars a landlord from requiring other amounts; s. 106 sets how a rent deposit is held and applied. Is an unsolicited offer by the tenant to prepay lawful for a landlord to accept, and does showing the offer on a platform make it "required" in substance, or a deposit under s. 106? Under the BC Residential Tenancy Act (ss. 17 to 20: security deposit of half a month, no other deposits, no requiring post dated or advance payments beyond the Act), may a BC landlord accept prepaid rent a tenant offers, and should the field be hidden for BC listings? Does suggesting the offer only to tenants who have not shared a Canadian credit report raise a human rights concern (newcomers), given that it is never suggested by age, study, citizenship or origin?
24. About me in another language. A tenant may write About me in any language. When it is not English, an AI service prepares an English version (a faithful translation and nothing more), the tenant reads it and approves, changes or removes it, and only an approved version is shown to a realtor, with the tenant's original under it and the label "Translated from Persian, approved by the tenant". Before approval the realtor reads the original alone, with the label "Written in Persian". The English version is never read by Fit, a score or any other step. Does an AI prepared English version, approved by the tenant, raise any issue under PIPEDA or the Human Rights Code? Could showing a realtor the language a tenant wrote in support a claim of discrimination on the ground of ancestry, place of origin or ethnic origin, and should the label be dropped or changed?
25. The kind of income on the realtor's own card. A co applicant or guarantor answers "This income is from" with one of three choices: Employment, Self employment, Other (`lib/application-state.js` INCOME_KIND, asked on `pages/party/[token].js`). The applicant states an employment type (full time, part time, contract, self employed). The realtor's own card and checklist show these beside the amount, for example "Income $85,000 a year (Employment)" (`lib/parties.js` partyFacts). Nothing a landlord receives carries the kind: the report page, the PDF, the pasted text and the frozen snapshot show the amount alone (`lib/parties.js` landlordPartyFacts, `tests/incomeKindLandlord.test.mjs`), and Fit reads none of it. The realtor acts for the landlord and may advise on who to choose. May the realtor's card show the kind of income at all, under the Ontario rule on receipt of public assistance and the BC rule on lawful source of income? Should the party form's "This income is from" field be collected at all, when no landlord output uses it and Fit does not read it? The employer or business name is free text typed by the applicant or the party, and the landlord report prints it as typed. Does a free text employer name that happens to name a benefit program instead of an employer create a problem under the same two rules, and if so what must change: the field, the report, or both? Until this is answered the name stays on landlord outputs as it is.
26. The date of birth and how long it is kept. A date of birth is asked only to apply the age of majority rule in question 21 (`lib/applyAge.js`). As built it is read on the tenant's device and is not sent: the request carries only the answer, a yes that the rule is met and, in Ontario at 16 or 17, the yes to the s. 4 question. Those answers are stored on the application. The `applications` table still has the columns `age` and `date_of_birth` from before this rule; nothing writes them now, and rows written before the change may still hold a value. Is anything here kept longer than needed for the purpose? Must the old values be deleted and the two columns dropped, and by when? How long may the stored yes be kept once the application is closed?

### 11.2 For Armin

I have assumed Armin decides product, data and risk.

1. Retention: option A, B or C in section 7.3? The design assumes A.
2. Is the profile free for tenants forever? The design assumes yes, and that nothing about a tenant is ever sold.
3. The word on a travelling fact: "read from a document on DATE", or "verified"? The design assumes the first.
4. Which number is the profile reuse tile: tenants who reused answers, or tenants who reused documents?
5. May existing files under `pages/api/**` and `lib/**` be changed for this build, phase by phase as listed in section 12?
6. Should the old referral links keep working forever, or stop 30 days after the new flow ships?
7. Does the tenant approve a pass on by email link alone, or must they sign in? The design allows the link, since the address is the one they proved.
8. Who reviews new brokerages in the office, and how fast?
9. Does a deleted profile's accepted application stay with the realtor, pending the lawyer's answer? The design assumes yes.
10. Is BC in scope for the first release, or Ontario only with BC rules already respected?

### 11.3 For Shervin

I have assumed Shervin decides brokerage practice, market and pricing. Move any of these if that is wrong.

1. The default formal fee. The design suggests 25 percent of the receiving brokerage's commission, editable from 5 to 50.
2. Is a flat fee needed at launch, or percentage only?
3. Can a realtor outside Rentletter receive a handoff? The design says no: they join first, free, and count as a referral signup.
4. Does a tenant pass on ever carry a fee, or are fees for job handoffs only? The design allows both.
5. Will brokers of record accept a one time confirmation by email, or do they expect to sign each agreement?
6. When is a deal "done" for the fee: lease signed, or keys? The design uses lease signed.
7. When is the fee due: at close, or when the receiving brokerage is paid its commission? The design uses 30 days after close.
8. Does Rentletter take a platform fee on a referral payment once payments are on? The design assumes zero.
9. Should the circle show a realtor's record with you, such as handoffs sent, accepted and closed? The design shows your own history with each person and no public score.
10. Which five brokerages would you ask to try formal referrals first?

## 12. The build plan

Small branches, in order. Each ships on its own with tests.
Model names as you gave them: Opus 5.5 for interface and layout, Fable 5.1 for data, privacy, scoring and payments.
Every phase ends with the full gate you already use.

| # | Branch | Builds | Depends on | Model | You run by hand |
|---|---|---|---|---|---|
| 1 | feat/profile-reuse-record | The five columns in 4.7. The server ticket. The write at submit. `lib/kpis.js` true reuse with `tracked`. The Pipeline invite prefilled from the profile. | Nothing | Fable 5.1 | db/014. Approve edits to the submit path, `lib/kpis.js`, `lib/kpiStore.js`. |
| 2 | feat/profile-verified-email | `email_verified_at`, `last_active_at`, the Fit key constraint on facts, the shareable view, the fact whitelist with tests. | 1 | Fable 5.1 | db/015. Approve edits to `lib/tenantProfileStore.js`. |
| 3 | feat/profile-vault-data | The `tenant-vault` bucket, documents, checks, the read after upload, expiry and reconcile crons in dry run. | 2. Armin question 1. Lawyer questions 8 and 10. | Fable 5.1 | db/016. Add the cron to Vercel. Set the enforce flag when ready. |
| 4 | feat/profile-vault-screens | The profile page: documents, checks, "what a realtor sees", the upload consent screen. The policy and the tenant copy. | 3 | Opus 5.5 | Review the new policy text with the lawyer before merge. |
| 5 | feat/profile-shares-data | `profile_shares`, `profile_access_log`, the one read function, the application share at one tap apply, the realtor's document open from the vault. | 3 | Fable 5.1 | db/017. |
| 6 | feat/profile-one-tap | The one tap apply screen, the shares list and the view log on the profile, stop sharing. | 4, 5 | Opus 5.5 | Nothing. |
| 7 | feat/profile-delete | The delete run in 7.4, `profile_deletions`, the resume cron, the realtor's "deleted" line, profile expiry and its notice. | 5. Lawyer question 7. | Fable 5.1 | db/018. Confirm the backup rotation period. |
| 8 | feat/pass-on-data | The pass on ask, the consent token, limits, the move off `referrals`, removal of household and note, the redirect from `/refer`. | 5 | Fable 5.1 | db/019. Approve edits to `lib/referrals.js` and the referral routes. |
| 9 | feat/pass-on-screens | Pass on from an applicant, the tenant consent page, the recipient's profile view, add to a listing. | 8 | Opus 5.5 | Nothing. |
| 10 | feat/brokerage-and-circle-data | Brokerages, members, the confirmation link, connections, invites, limits, the two first touch words. | Lawyer questions 1 and 2. | Fable 5.1 | db/020. Approve edits to `lib/signupSource.js`, `lib/kpis.js`, `pages/signup.js`. |
| 11 | feat/circle-screens | The circle: connections, who does rentals, the brokerage form, the broker of record page, the office review list. | 10 | Opus 5.5 | Review the first brokerages in the office. |
| 12 | feat/handoff-data | Handoffs of both kinds, accept and decline, sealed client contact, messages, the events. | 8, 10 | Fable 5.1 | db/021. |
| 13 | feat/handoff-screens | Hand off a job, the offer and acceptance screens, the thread, the history in the circle. | 11, 12 | Opus 5.5 | Nothing. |
| 14 | feat/handoff-close-and-fees | The close on lease signed, the commission entry, the agreement and invoice PDFs, fee states, reminders cron, "what you are owed". | 12. Lawyer questions 1 to 5 and 15. Shervin questions 1, 6, 7. | Fable 5.1, with Opus 5.5 for the two PDF layouts | db/022. Add the reminders cron. Approve the agreement text from the lawyer. |
| 15 | feat/brokerage-payments-test | The Stripe Connect module behind the flag, onboarding, Checkout, the webhook, the trigger, every refusal test. Test mode only. | 14. Lawyer questions 13 and 14 before it is ever turned on. | Fable 5.1 | db/023. Create a Stripe test platform. Add the two test env vars. Leave `BROKERAGE_PAYMENTS_ENABLED` unset. |
| 16 | chore/retire-applicant-people | Drop `applicant_people` and its two foreign key columns. Remove the KV `auditlog` read. | 7 | Fable 5.1 | db/024. |

Order notes:

* Phases 1 to 7 are the tenant profile. They deliver cycle steps 1 to 3 and feed profile reuse with no circle at all.
* Phases 8 and 9 deliver step 4 and replace a flow that breaks rule 3 today. If time is short, the removal of household size and the note from the existing referral can ship alone, first, as a fix.
* Phases 10 to 14 deliver steps 5 to 7 with payments off.
* Phase 15 can wait as long as the lawyer needs. Nothing depends on it.

## 13. What this design does not do

* No general chat, no feed, no public realtor profiles, no ratings of realtors.
* No search of tenants by anyone.
* No credit report in the profile.
* No fee paid to an agent.
* No live money movement.
* No change to Fit, the checklist or the landlord report.
* No verification product. Rentletter reads documents the tenant gives it and says what it read and when. Credit checks stay where the realtor already runs them.
