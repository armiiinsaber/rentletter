# The explainer, two and a half minutes

Sent to a realtor the day before a booked demo call. It explains the product and the vocabulary,
then asks them two questions to bring to the call. It does not sell and it does not replace the
call.

Every claim here is one the product can back today. Rentletter does not verify anyone: the realtor
does, and the word verified only appears on a card after their own call. Nothing claims a speed the
realtor cannot see on screen.

## The beats

| # | On screen | Spoken words | Seconds |
| --- | --- | --- | --- |
| 1 | Not a product screen. A mail list on a laptop: four attachments, two of them opened. A phone beside it with three sent texts to the same applicant. A landlord's message at the top of the list, unread. | Here is how a rental gets screened today. Applications arrive as PDFs in your inbox. You text each applicant twice for the documents they forgot. Your landlord asks who is good, and you are still reading. | 14 |
| 2 | The listing page at 1280, the invite link row. The link is copied, the Post kit opens under it. Cut to the apply form on a phone at 390: the ink banner reads You are applying to 210 Carlaw Ave, Unit 4, the step row reads Step 3 of 7, Employment, and a finger taps Continue. | Rentletter gives each listing one link. Post it anywhere you already post. The tenant fills the same application on their phone, the same questions every time, and adds their documents at the end. No PDFs come back to your inbox. | 16 |
| 3 | The apply form's last step at 390: the document card, the set rows ticking off as a pay stub and an employment letter land. Cut to the listing page, Applicants: three cards drawing in, the meters filling on mount, Priya Sharma at the top. | Every application lands on the listing page as a card. The name, a number, and one line saying where that person stands. The cards sit best fit first. | 12 |
| 4 | One card held still and enlarged: the meter, the number 4.8, the label verified. Then the listing's Details fold open behind it, showing the criteria rows: minimum income, maximum rent share, landlord reference required. | The number is how this applicant's income and record fit this unit's rent and the criteria you set. It is not a credit score, and it is not an opinion about the person. | 13 |
| 5 | The expanded card, the document panel: the line Documents, 4 read, income and employer on the letter. The fold What the documents say opens: Said and Docs rows with red ticks. The Documents held list below it, each row reading Deleted in 9 days. | When documents arrive they are read and matched to what the applicant typed. Income on the pay stubs, the employer on the letter, the name on the ID. The files are held for you for fourteen days, then they are deleted. | 16 |
| 6 | The screening checklist in the expanded card: the Employer row reading Said Sunnybrook Health Sciences Centre, Docs matched. A tap on Ask by email on the Previous landlord row. A tap on the employer pill, which flips to Confirmed and the date. | Then you do the part that counts. You call the employer. You call the last landlord. You tick what you confirmed. The checklist keeps the two apart: what they said, and what the documents say. | 13 |
| 7 | The card header at rest: the label changes from docs match to verified as the last tick lands. The pill reads Confirmed, September 8, and the tooltip under it names the realtor. | Rentletter does not verify anyone. You do. The word verified appears after your call, and every tick carries your name and the date. | 11 |
| 8 | The Landlord section on the listing page: the red button reads Send to Marco. Cut to the landlord's page on a phone: the realtor's name and logo at the top, then one paragraph per applicant with the criteria rows under each. | When you are ready, send your landlord a private page. One paragraph for each applicant, in your words and your branding, with the criteria rows underneath. | 12 |
| 9 | The landlord's page: the two buttons under the first applicant, Wants to meet and Not for me. A tap on Wants to meet. Cut back to the realtor's listing page: the line Landlord, wants to meet, September 9 appears on that card. | Two buttons sit under each one. Wants to meet, or not for me. When your landlord taps one, it shows up on that applicant's card. | 12 |
| 10 | The listing page: Mark rented, then the Who got it sheet with the winner selected. Cut to the dashboard: the Rented divider under the listings, and the Pipeline card with one row reading asked September 9, no answer yet and one row with an Invite control. | Mark the unit rented, and everyone who did not get it hears back. The ones who ask to be kept in mind stay in your pipeline, ready for the next unit you list. | 13 |
| 11 | The dashboard at rest at 390: the greeting card, the listings, the pipeline. Then the canvas alone with the two questions set in the page's own type, held while they are spoken. | We do not run credit checks, and we do not decide for you. We organize what came in and we keep the record of what you did. Before we talk, two questions. How many rentals did you close last month, and how many applicants did the last one get. | 18 |

Total: 150 seconds.

## The spoken track, for ElevenLabs

Here is how a rental gets screened today. Applications arrive as PDFs in your inbox. You text each applicant twice for the documents they forgot. Your landlord asks who is good, and you are still reading.

Rentletter gives each listing one link. Post it anywhere you already post. The tenant fills the same application on their phone, the same questions every time, and adds their documents at the end. No PDFs come back to your inbox.

Every application lands on the listing page as a card. The name, a number, and one line saying where that person stands. The cards sit best fit first.

The number is how this applicant's income and record fit this unit's rent and the criteria you set. It is not a credit score, and it is not an opinion about the person.

When documents arrive they are read and matched to what the applicant typed. Income on the pay stubs, the employer on the letter, the name on the ID. The files are held for you for fourteen days, then they are deleted.

Then you do the part that counts. You call the employer. You call the last landlord. You tick what you confirmed. The checklist keeps the two apart: what they said, and what the documents say.

Rentletter does not verify anyone. You do. The word verified appears after your call, and every tick carries your name and the date.

When you are ready, send your landlord a private page. One paragraph for each applicant, in your words and your branding, with the criteria rows underneath.

Two buttons sit under each one. Wants to meet, or not for me. When your landlord taps one, it shows up on that applicant's card.

Mark the unit rented, and everyone who did not get it hears back. The ones who ask to be kept in mind stay in your pipeline, ready for the next unit you list.

We do not run credit checks, and we do not decide for you. We organize what came in and we keep the record of what you did. Before we talk, two questions. How many rentals did you close last month, and how many applicants did the last one get.

## The screens the film needs

Sandbox routes, so every frame renders from the fixture with no account and no real person.

1. Beat 1 is the only frame that is not a product screen: a mail list, a phone with three sent texts, a landlord's unread message.
2. `/demo/dashboard?listing=demo-carlaw` at 1280, the header card, the invite link row with Copy, and the Post kit fold open.
3. `/apply/demo0000000000000001` at 390, step 3 of 7, Employment, the fields filled, the ink banner above.
4. `/apply/demo0000000000000001` at 390, the last step, the document card with two files added and their rows ticked in the set.
5. `/demo/dashboard?listing=demo-carlaw` at 1280, the Applicants section at rest: Priya Sharma verified, Alexandra Papadopoulos Whitfield docs match, Sofia Russo with no documents yet.
6. The same page, one card enlarged and still: the meter, 4.8, the label verified.
7. The same page, the Details fold open, showing the criteria rows: minimum income, maximum rent share, landlord reference required.
8. `/demo/dashboard?listing=demo-carlaw&applicant=demo-link-1&panel=documents` at 390, the document panel line, the What the documents say fold open, the Documents held list under it.
9. The same expanded card, the screening checklist: the Employer row, the Ask by email control on Previous landlord, and the employer pill mid tap as it turns to Confirmed with the date.
10. The same card header before and after the last tick, so the label moves from docs match to verified.
11. `/demo/dashboard?listing=demo-carlaw` at 1280, the Landlord section with the red Send to Marco button and the sent line under it.
12. `/r/DEMO-demo-carlaw` at 390, the landlord's page: the realtor's name and logo, one paragraph per applicant, the criteria rows, the two buttons.
13. The same page with Wants to meet tapped, then `/demo/dashboard?listing=demo-carlaw` showing the answer line on that applicant's card.
14. `/demo/dashboard?listing=demo-carlaw`, the Mark rented control and the Who got it sheet with the winner selected.
15. `/demo/dashboard` at 390, the Rented divider under the listings and the Pipeline card with a pending row and an Invite row.
16. `/demo/dashboard` at 390 at rest, then the paper canvas alone carrying the two closing questions in the page's own type.
