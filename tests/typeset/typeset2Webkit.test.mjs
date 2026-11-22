// The wrapped text walk, part 2 of 3: the writes, and then the alone states up to the tenant's own
// profile, on the servers part 1 left (tests/helpers/typesetWalk.mjs describes the walk, its rules
// and how the parts run in order on the same fake stack). A WebKit walk fails, never skips, when
// the binary is missing.
import { test } from 'node:test';
import { requireWebkit, playwright as pw, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { typesetPart, PARTS } from '../helpers/typesetWalk.mjs';

const PART = 2;
const { walk } = typesetPart(PART);

test(`every page and state at 390 and 320, the wrapped text even and whole, in WebKit (part ${PART} of ${PARTS})`, { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test(`the same in Chrome (part ${PART} of ${PARTS})`, { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
