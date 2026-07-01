-- db/verification-dedupe.sql
-- RUN MANUALLY in the Supabase SQL editor. NOT executed by the app.
-- Purpose: root-cause the document-verification attribution bug — an applicant showing
-- verification that belongs to a different applicant. The suspected cause is DUPLICATE
-- junction rows: the same application linked to the same listing more than once, which is
-- only possible if listing_applicants is missing UNIQUE(listing_id, application_id).
--
-- NOTE: listing_applicants.id is the primary key, so it is ALWAYS unique — two rows can never
-- literally share the same linkId. The real duplication is two DIFFERENT rows (different ids)
-- with the SAME (listing_id, application_id). fetchListingApplicants then returns the same
-- person twice, and analysis saved on one of the two rows makes attribution ambiguous.

------------------------------------------------------------------------------------------------
-- STEP 1 — DETECTION (read-only; safe to run anytime)
------------------------------------------------------------------------------------------------

-- 1a. Does the unique constraint already exist?  (Empty result on both = MISSING.)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'listing_applicants'::regclass and contype = 'u';

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'listing_applicants'
  and indexdef ilike '%unique%';

-- 1b. Duplicate junction rows: same application linked to the same listing more than once.
--     (Any rows here = duplicates that can cause the attribution bug.)
select listing_id,
       application_id,
       count(*)                          as row_count,
       array_agg(id order by created_at) as link_ids,
       array_agg((doc_verifications is not null) order by created_at) as has_doc_verif_per_row
from listing_applicants
group by listing_id, application_id
having count(*) > 1
order by row_count desc, listing_id;

-- 1c. Where document analysis actually landed (which junction rows hold doc_verifications).
--     Cross-check against 1b: if a duplicated application has doc_verifications on one row,
--     that is the row to KEEP.
select id as link_id, listing_id, application_id,
       (doc_verifications is not null)                                as has_doc_verif,
       jsonb_array_length(coalesce(doc_verifications, '[]'::jsonb))   as analysis_runs,
       (ai_insight is not null)                                       as has_insight,
       decision_status, created_at
from listing_applicants
where doc_verifications is not null or ai_insight is not null
order by listing_id, application_id, created_at;

------------------------------------------------------------------------------------------------
-- STEP 2 — DE-DUPLICATE existing rows (RUN ONLY IF Step 1b returns duplicates)
-- Keeps, per (listing_id, application_id), the single richest row — one that has analysis,
-- then a real decision, then an insight, then the oldest — and deletes the rest.
-- BACK UP / review Step 1 output before running.
------------------------------------------------------------------------------------------------

with ranked as (
  select id,
         row_number() over (
           partition by listing_id, application_id
           order by (doc_verifications is not null)                                    desc,
                    (decision_status is not null and decision_status <> 'none')         desc,
                    (ai_insight is not null)                                            desc,
                    created_at                                                          asc
         ) as rn
  from listing_applicants
)
delete from listing_applicants la
using ranked r
where la.id = r.id
  and r.rn > 1;

------------------------------------------------------------------------------------------------
-- STEP 3 — ADD the missing unique constraint (RUN AFTER Step 2 succeeds, if 1a showed none)
-- This makes the onConflict('listing_id,application_id') upsert in linkApplicantToListing()
-- work correctly and prevents future duplicate junction rows.
------------------------------------------------------------------------------------------------

alter table listing_applicants
  add constraint listing_applicants_listing_application_uniq
  unique (listing_id, application_id);

-- Verify it now exists:
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'listing_applicants'::regclass and contype = 'u';
