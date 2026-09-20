-- db/listing-unit.sql
-- A unit or suite of its own on a listing, so the street and the unit are not typed into one line.
-- The column is optional: the app reads it when it is there and carries on when it is not
-- (lib/listingAddress.js joins it into the address; lib/realtorWrites.js retries the write without
-- it if the column is missing). Idempotent: safe to run more than once. Nothing is parsed out of
-- the addresses already stored, and no existing listing is changed.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN public.listings.unit IS
  'Unit or suite, stored on its own (for example 4B). Optional. Joined into the address for display by lib/listingAddress.js displayAddress; listings created before this column keep whatever the realtor typed into address.';
