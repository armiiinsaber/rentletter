// The wrapped text walk, part 5 of 5: the guided first run, the writing helper, an upload and who
// can open it, and the office's alone states, on the servers part 4 left; the last part takes the
// servers down
// (tests/helpers/typesetWalk.mjs describes the walk, its rules and how the parts run in order on
// the same fake stack). A WebKit walk fails, never skips, when the binary is missing.
import { test } from 'node:test';
import { requireWebkit, playwright as pw, haveChrome, chromeBin } from '../helpers/browsers.mjs';
import { typesetPart, PARTS } from '../helpers/typesetWalk.mjs';

const PART = 5;
const { walk } = typesetPart(PART);

test(`every page and state at 390 and 320, the wrapped text even and whole, in WebKit (part ${PART} of ${PARTS})`, { timeout: 900000 }, async () => {
  requireWebkit();
  await walk(pw.webkit, {}, 'webkit');
});
test(`the same in Chrome (part ${PART} of ${PARTS})`, { skip: haveChrome ? false : 'Chrome binary absent', timeout: 900000 }, () => walk(pw.chromium, { executablePath: chromeBin }, 'chrome'));
