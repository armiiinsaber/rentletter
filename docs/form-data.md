# Form data

Realtors in Ontario retype the same rental data into the board's tools for every deal. Rentletter
is where they type it once. The listing carries the fields the board's forms ask for, under a
collapsed Board details section on the New listing and Listing setup sheets, every one optional.
Once a tenant is accepted, the listing page offers Form data: every value grouped the way an
Ontario agreement to lease is organized, each value with Copy, each group with Copy group, and
Copy all at the top as clean labeled text, ready to paste into whatever forms tool the realtor uses.

Why we never reproduce the form itself, in one line: the Agreement to Lease is OREA's copyrighted
form, so Rentletter never draws it, copies its wording or names it on a screen; it outputs its own
data under plain group names and the realtor pastes those values into the tool they already use.

Code: lib/boardDetails.js (the fields, the province's deposit rules, the Details rows),
lib/formData.js (the groups and the copy text), components/listings/ListingSetupModal.js (the
Board details section), components/dashboard/ProfileEditorBody.js (the profile fields),
components/dashboard/FormDataSheet.js (the view), pages/api/listings/form-data.js (the read),
db/012-board-details.sql (the columns and the event type).

## Who can open it

The Form data view is a realtor read behind the same gate as every realtor write: the session,
requireEntitlement and an explicit ownership check on the listing row (pages/api/listings/form-data.js).
Another realtor's listing answers 403, an unknown one 404. It answers 409 until an applicant holds
the listing (accepted, agreement signed, deposit received, lease signed or moved in,
lib/application-state.js HOLDING_STATES); the button on the listing page appears at the same moment.
Every open writes one form_data_opened event on the listing's timeline. The applicant row is read
by named columns, so owner_token never leaves the server; the response carries the groups alone.

## What never appears

No document, no credit fact, no Fit number, no check docs item, no income of anyone, nothing about a
protected ground. A guarantor appears as name, address and phone only. Only what an agreement to
lease needs.

## The groups, in order, and where each value comes from

Empty values show "Not entered" on the screen and are skipped by every copy button. A group with
nothing entered is left out of Copy all.

### Landlord
- Name: listings.landlord_name (Listing setup, Landlord client)
- Email: listings.landlord_email
- Phone: listings.landlord_phone

### Tenants
The accepted applicant first, then every co applicant whose form is in (application_parties,
role co_applicant, status submitted). A single tenant is labelled Tenant; several are Tenant 1,
Tenant 2 and so on.
- Tenant name: applications.full_name, or application_parties.full_name
- Tenant email: applications.email, or application_parties.email
- Tenant phone: applications.phone, or application_parties.phone
- Tenant current address (the primary only): applications.prev_address, the address they gave as
  where they live now. A co applicant's form has no address field.

### Guarantor
The guarantor whose form is in, if any. Never their income, employer or documents.
- Name: application_parties.full_name
- Address: application_parties.address (the one field a guarantor's form asks for the lease)
- Phone: application_parties.phone

### Premises
- MLS number: listings.mls_number
- Address: listings.address
- Unit: listings.unit
- Parking: listings.parking_spaces as "N spaces"; when none is typed, "Included" if
  listings.parking_included is yes
- Locker: listings.locker

### Term
- Start: listings.possession_date, written as a long date
- Length: listings.lease_term_months as "N months"

### Rent and deposits
- Monthly rent: listings.monthly_rent
- Ontario (the realtor's profile province): Last month's rent deposit (listings.deposit_last_month,
  at most one month's rent, applied to the last month) and Key deposit (listings.deposit_key,
  refundable). The Residential Tenancies Act allows no other deposit, so no other is offered.
- British Columbia: Security deposit (listings.deposit_security) and Pet damage deposit
  (listings.deposit_pet), each at most half a month's rent under the Residential Tenancy Act.
- The write refuses a deposit above the province's cap and clears the deposits the province does
  not allow (lib/boardDetails.js normalizeBoardDetails); the sheet shows the province's deposits
  alone.

### Utilities and inclusions
- Heat, Hydro, Water: listings.utilities_heat, utilities_hydro, utilities_water, each "Included"
  or "Not included" when the realtor set it, and "Not entered" (skipped by every copy) when they
  did not: the columns are nullable with no default, so an untouched listing never reads
  "Not included"
- Furnished: listings.furnished, Yes or No, the same three states

### Brokerages and commission
- Listing brokerage: listings.listing_brokerage_name, prefilled from profiles.brokerage
- Listing brokerage address: listings.listing_brokerage_address, prefilled from
  profiles.brokerage_address
- Listing brokerage phone: listings.listing_brokerage_phone, prefilled from profiles.phone
- Listing salesperson: profiles.full_name
- RECO registration number: profiles.license_number
- Cooperating brokerage: listings.coop_brokerage_name
- Commission to the cooperating brokerage: listings.coop_commission, free text, since it is often
  "half a month's rent plus HST"

## The profile fields

Brokerage name (profiles.brokerage) and the RECO registration number (profiles.license_number)
were already on the profile. db/012 adds the brokerage address (profiles.brokerage_address) and the
board (profiles.board: TRREB, Mississauga, Hamilton, Ottawa, Greater Vancouver, Fraser Valley or
Other). The brokerage name, address and phone prefill a new listing's brokerage fields. The board
is kept for the realtor's own reference and goes into no group.

## The copy text

Copy all writes one block per group with something entered: the group title on its own line, then
one "Label: value" line per entered value, a blank line between groups. Copy group writes one
block. Copy on a value writes the value alone. lib/formData.js formDataText, groupText and
itemLine produce the three, and tests/formData.test.mjs holds the exact text for the fixture.

## Before the migration has run

The listing and profile writes retry without the column the database names
(lib/realtorWrites.js writeListing and updateOwnProfile), so a listing is still created and a
profile still saved; the Form data view reads the rows through select * and shows Not entered for
every board value; the event write is refused by the constraint and logged, never thrown.
