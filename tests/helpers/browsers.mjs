// The browsers the walk files drive. WebKit is Safari's engine and the founder tests in Safari,
// so a WebKit walk never skips: when playwright-core or its WebKit binary is missing the walk
// FAILS with the install line. Chrome is the second engine; its walk skips when the app is not
// on this machine, as before.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let pw = null; try { pw = await import('playwright-core'); } catch (e) { pw = null; }
let version = '';
try { version = createRequire(import.meta.url)('playwright-core/package.json').version; } catch (e) { version = ''; }

export const playwright = pw;
export const webkitBin = pw ? pw.webkit.executablePath() : '';
export const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const haveWebkit = !!pw && !!webkitBin && existsSync(webkitBin);
export const haveChrome = !!pw && existsSync(chromeBin);

// The message a laptop without WebKit sees. The version pins the browser build playwright-core
// expects: a newer `npx playwright install` puts a build this copy of playwright-core does not look for.
export function webkitMissingMessage() {
  const pin = version ? `@${version}` : '';
  if (!pw) return `playwright-core is not installed. Run: npm install, then npx playwright${pin} install webkit`;
  return `The WebKit binary is missing at ${webkitBin || '(no path)'}. Install it with: npx playwright${pin} install webkit`;
}

// Call first in every WebKit walk: throws (the test fails) instead of skipping.
export function requireWebkit() {
  if (!haveWebkit) throw new Error(webkitMissingMessage());
  return pw.webkit;
}
