-- db/schema-reference.sql
-- REFERENCE ONLY. DO NOT RUN. Nothing in this file is idempotent and nothing in it is a migration.
--
-- The check constraints on public.listing_applicants as they exist in production, written down
-- so the application's vocabulary has something in the repository to be checked against. Three
-- features (set aside and restore, referral acceptance, mark finalist) failed silently for
-- months because the table's constraints lived only in the Supabase dashboard.
--
-- The single source of truth in code is lib/listingApplicantsVocabulary.js. Its values MUST
-- match this file. When a constraint changes, update both in the same commit and add the
-- migration that changes it to db/.
--
-- Constraints after db/listing-applicants-vocabulary.sql has run:

--   added_via          text   CHECK (added_via IN ('invite', 'lookup', 'referral'))
--                             'invite'   arrived through the listing's invite link (pages/api/applications/mirror.js)
--                             'lookup'   added by the realtor from an application number (pages/api/listings/add-applicant.js)
--                             'referral' arrived through an accepted referral (lib/referrals.js)

--   decision_priority  text   CHECK (decision_priority IN ('top', 'normal'))
--                             'top'      the realtor's finalist mark
--                             'normal'   everyone else (the application writes this, never NULL)

--   decision_status    text   CHECK (decision_status IN ('none', 'shortlist', 'reject'))
--                             'none'      active, ranked by fit (the default on insert)
--                             'shortlist' accepted by the constraint; the application does not write it
--                                         and reads it as active
--                             'reject'    set aside with an OHRC safe reason (decision_reason_code)

--   withdrawn_at       timestamptz, nullable (db/listing-applicants-vocabulary.sql)
--                             non NULL means the tenant withdrew. Reads treat it as withdrawn
--                             regardless of decision_status. Not a decision_status value.

-- Other columns the application writes on this table, for orientation (no check constraints):
--   decision_reason_code  text   one of lib/setAsideReasons.js codes, or NULL
--   decision_notes        text
--   decision_changed_at   timestamptz
--   reviewed_at           timestamptz   (db/reviewed-at.sql)
--   doc_verifications     jsonb
