// The wrapped text walk, part 8 of 9: the phone's shell in the installed app (fix/phone-shell): every
// realtor view (Listings, Pipeline, Shared with you, Circle, Profile and a listing) under the fixed
// top bar and over the tab bar and its fade, with a phone's safe areas, at the top, scrolled halfway
// and scrolled to the end, light and dark, at 390; then the Profile's logo actions as one group,
// with the AI studio open and with the question before a removal, light and dark, at 390, 320, 1440
// and 1920, on the servers part 7 left (tests/helpers/typesetWalk.mjs describes the walk, its rules
// and how the parts run in order on the same fake stack). A WebKit walk fails, never skips, when
// the binary is missing.
import { test } from 'node:test';
import { requireWebkit, playwright as pw, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { typesetPart, PARTS } from '../helpers/typesetWalk.mjs';

const PART = 8;
const { walk } = typesetPart(PART);

test(`every page and state at 390 and 320, the wrapped text even and whole, in WebKit (part ${PART} of ${PARTS})`, { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test(`the same in Chrome (part ${PART} of ${PARTS})`, { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
