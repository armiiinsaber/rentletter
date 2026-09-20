-- db/999-application-state-rollback.sql
-- DO NOT RUN as part of the setup. This UNDOES db/001, db/002, db/003 and db/004: it drops the state
-- columns, the five new tables and their rows, the triggers and the enums. Nothing that existed
-- before those three files is touched: listings.status, decision_status, decision_priority,
-- withdrawn_at and every document row stay as they are, and the application carries on reading
-- them (lib/application-state.js falls back to those columns when the state column is absent).
-- IDEMPOTENT: every statement is IF EXISTS.
-- Before running: the rows in closings and application_events are lost. Export them first if
-- they matter.

DROP TRIGGER IF EXISTS listings_refuse_client_state ON public.listings;
DROP TRIGGER IF EXISTS listing_applicants_refuse_client_state ON public.listing_applicants;
DROP FUNCTION IF EXISTS public.refuse_client_state_write();

ALTER TABLE IF EXISTS public.applicant_documents DROP COLUMN IF EXISTS application_party_id;
ALTER TABLE IF EXISTS public.applicant_documents DROP COLUMN IF EXISTS applicant_person_id;

DROP TABLE IF EXISTS public.application_events;
DROP FUNCTION IF EXISTS public.application_events_refuse_update();
DROP TABLE IF EXISTS public.closings;
DROP FUNCTION IF EXISTS public.closings_fill_monthly_rent();
DROP TABLE IF EXISTS public.income_sources;
DROP FUNCTION IF EXISTS public.income_sources_refuse_occupant();
DROP TABLE IF EXISTS public.application_parties;

ALTER TABLE IF EXISTS public.applications DROP COLUMN IF EXISTS applicant_person_id;
DROP TABLE IF EXISTS public.applicant_people;

DROP INDEX IF EXISTS public.listing_applicants_listing_state_idx;
ALTER TABLE IF EXISTS public.listing_applicants DROP COLUMN IF EXISTS state;
ALTER TABLE IF EXISTS public.listings DROP COLUMN IF EXISTS state;

DROP TYPE IF EXISTS public.application_actor_type;
DROP TYPE IF EXISTS public.income_source_kind;
DROP TYPE IF EXISTS public.application_party_role;
DROP TYPE IF EXISTS public.listing_state;
DROP TYPE IF EXISTS public.application_state;
