// tests/helpers/lanes.mjs  Which lane each browser walk runs in (scripts/walk-lanes.mjs). The route
// walks (tests/routes/*Webkit.test.mjs) run in two lanes at once, each lane one walk at a time with
// its own turn (tests/helpers/devServer.mjs), its own shared build (tests/helpers/fakeBuild.mjs)
// and its walks' own servers and ports; the split keeps the two lanes about as long as each other.
//   TOGETHER   the walks whose checks are about timing (the back swipe's rounds, the taps, the edge
//              drags, the zoom), in one lane together, so the other lane is the only load beside them
//   SHARED     walks that share a server's port and folder: one lane
//   AFTER      a walk that could not be made reliable beside another lane runs alone after the
//              lanes (none today)
// A walk file not named here runs in lane b. tests/lanes.test.mjs holds the rules.
// The split, from the serial run's turns in WebKit on 2026-11-26 (1043s in all): lane a 521s, lane
// b 522s, each lane besides paying its one build (about 20s).
export const LANES = Object.freeze({
  a: Object.freeze([
    'backWebkit', 'tapsWebkit', 'edgeWebkit', 'zoomWebkit',
    'pillsWebkit', 'appWebkit', 'homeWebkit', 'wordmarkWebkit', 'resetWebkit',
  ]),
  b: Object.freeze([
    'onePlaceWebkit', 'wideWebkit', 'shellWebkit', 'nativeWebkit', 'listingsDeskWebkit', 'revealWebkit', 'doorRolloutWebkit',
    'reconsiderWebkit', 'mlsWebkit', 'docsFirstWebkit', 'brandKitWebkit', 'logoWebkit', 'profileCircleWebkit', 'fitWebkit',
    'doorWebkit', 'integrityWebkit', 'billingOffWebkit', 'officeWebkit', 'partiesWebkit', 'creditWebkit', 'dashboardWebkit',
    'applyWebkit',
  ]),
});
export const AFTER = Object.freeze([]);
export const TOGETHER = Object.freeze(['backWebkit', 'tapsWebkit', 'edgeWebkit', 'zoomWebkit']);
export const SHARED = Object.freeze([['brandKitWebkit', 'docsFirstWebkit']]);
export const FALLBACK = 'b';
const nameOf = (file) => String(file).split('/').pop().replace(/\.test\.mjs$/, '');
// The lane of a walk file: 'a', 'b', or 'after'.
export function laneOf(file) {
  const name = nameOf(file);
  if (AFTER.includes(name)) return 'after';
  for (const [lane, names] of Object.entries(LANES)) if (names.includes(name)) return lane;
  return FALLBACK;
}
