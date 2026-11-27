// The wrapped text walk, part 6 of 7: the realtor's send sheet (components/dashboard/
// SendReportSheet.js) at 390, 320, 1440 and 1920, with every line at its longest and with the
// landlord's email and the signing name missing, and the listing page with three applicants in its
// two columns at every width (components/dashboard/ListingView.js), on the servers part 5 left
// (tests/helpers/typesetWalk.mjs describes the walk, its rules and how the parts run in order on
// the same fake stack). A WebKit walk fails, never skips, when the binary is missing.
import { test } from 'node:test';
import { requireWebkit, playwright as pw, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { typesetPart, PARTS } from '../helpers/typesetWalk.mjs';

const PART = 6;
const { walk } = typesetPart(PART);

test(`every page and state at 390 and 320, the wrapped text even and whole, in WebKit (part ${PART} of ${PARTS})`, { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test(`the same in Chrome (part ${PART} of ${PARTS})`, { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
