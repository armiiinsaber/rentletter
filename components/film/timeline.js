// components/film/timeline.js
// The film's clock math and shot list. Everything in the film is a PURE FUNCTION of time `t`
// (seconds): camera, which screen the laptop shows, how far each beat has progressed. No CSS
// transitions anywhere — so a frame at t renders identically whether the clock is running,
// the founder is scrubbing, or the exporter is stepping through 30 frames a second.
export const FILM_DURATION = 43;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// progress of t through [a, b], 0..1
export const P = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
// easings — unhurried by default
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
// piecewise-linear keyframes with per-segment easing: [[t, value], ...]
export function kf(t, frames, ease = easeInOut) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]; const [t0, v0] = frames[i - 1];
    if (t <= t1) return t1 === t0 ? v1 : lerp(v0, v1, ease(P(t, t0, t1)));
  }
  return frames[frames.length - 1][1];
}
// a value that fades in over [a, a+d] and out over [b-d, b]
export const window_ = (t, a, b, d = 0.6) => Math.min(P(t, a, a + d), 1 - P(t, b - d, b));

// ── WORLD: a fixed 1000 × 562 design space. The laptop sits centre, the phone enters right. ──
export const WORLD = { w: 1000, h: 562 };
export const LAPTOP = { x: 180, y: 52, w: 640 };                // screen ≈ x 190 to 810, y 100 to 490
export const PHONE = { x: 760, y: 118, w: 212 };                 // where the phone lands
export const LAPTOP_DESIGN = 560;                                // scene design width (mockups use 560)
export const PHONE_DESIGN = 330;

// ── CAMERA: look-at point (x, y) in world units + zoom. Strictly 2D (pan + push) — no
// perspective or yaw anywhere, so the exporter's flat SVG rasterization and live DOM render the
// same pixels. Moves happen in the narration pauses; holds are flat segments.
const CAM = {
  x: [[0, 500], [3, 500], [4.3, 500], [6.6, 500], [7.6, 866], [11, 866], [12.2, 500], [16, 500], [17, 500], [20, 500], [21, 500], [25, 500], [26.3, 500], [30, 500], [31, 500], [38, 500], [39, 500], [41, 500]],
  y: [[0, 290], [3, 288], [4.3, 290], [6.6, 290], [7.6, 318], [11, 318], [12.2, 296], [16, 296], [17, 262], [20, 262], [21, 298], [25, 298], [26.3, 296], [30, 296], [31, 298], [38, 298], [39, 292], [41, 300]],
  z: [[0, 0.90], [3, 0.98], [4.3, 1.30], [6.6, 1.30], [7.6, 1.22], [11, 1.22], [12.2, 1.26], [16, 1.26], [17, 1.40], [20, 1.40], [21, 1.32], [25, 1.32], [26.3, 1.16], [30, 1.16], [31, 1.30], [38, 1.30], [39, 1.02], [41, 0.84]],
};
// Narrow (portrait) stages use the same look-at points with a tighter zoom and gentler yaw, so the
// framing adapts instead of the whole composition shrinking.
const NARROW_ZOOM = [[0, 1.45], [38, 1.45], [39, 1.12], [41, 0.98]];          // pull further out at the end so the wordmark has room
const NARROW_X = [[19.9, 0], [21, 44], [25, 44], [26.3, 0]];                   // the verification table reads from its right-hand columns
// ── OPENING (0–3 s): one continuous pull. Starts tight on the top applicant's score in the
// ranked list (tick meter + number, world ≈ x 669–777, y 200–220 — measured), holds while the
// score resolves, then pulls back through the list to the full laptop, landing EXACTLY on the
// CAM keyframe at t = 3 so nothing after it moves. Zoom is interpolated in log space (constant
// perceived speed) with an ease-in-out, so it neither snaps at the start nor overshoots the end.
const INTRO = { from: { x: 722, y: 211, z: 6.0 }, hold: 0.55, end: 3 };
// 9:16 sees 1.78× more height per unit of zoom, so the tall opening starts tighter and looks a
// little lower — the row stays cropped on the score instead of reaching up into the header.
const INTRO_STORY_FROM = { x: 723, y: 214, z: 6.2 };   // centred on ticks + pill (world x 669 to 777): they span 16 to 84% of the width
function introCamera(t, track, from = INTRO.from) {
  const to = { x: kf(3, track.x), y: kf(3, track.y), z: kf(3, track.z) };
  const k = easeInOut(P(t, INTRO.hold, INTRO.end));
  return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), z: Math.exp(lerp(Math.log(from.z), Math.log(to.z), k)) };
}

// ── STORY (9:16): its own look-at/zoom track, composed for a tall frame instead of cropping the
// wide one, with READABLE content kept out of the Reels UI zones (top ~10%, right ~15%,
// bottom ~20%). The device stays centred — every look-at is the device's own centre — and the
// protection comes from zoom: the laptop screen's text (≈ 582 world wide) at z 1.2 spans
// 15–85% of the width, so it clears the right-hand control column while the bezel is free to
// sit in the margin; the phone at z 2.5 spans 21–79% × 22–78%; the end card frames laptop +
// wordmark + tagline as one centred group (laptop at ~44% height, the words right beneath,
// group bottom ≈ 70%). Visible world = (1000/z) × (1778/z). Same shot times as CAM.
const STORY = {
  x: [[0, 500], [3, 500], [6.6, 500], [7.6, 866], [11, 866], [12.2, 500], [39, 500], [41, 500]],
  y: [[0, 285], [3, 285], [6.6, 285], [7.6, 314], [11, 314], [12.2, 285], [39, 285], [41, 370]],
  z: [[0, 1.2], [3, 1.2], [6.6, 1.2], [7.6, 2.5], [11, 2.5], [12.2, 1.2], [39, 1.2], [41, 1.15]],
};
export function camera(t, { narrow = false, story = false } = {}) {
  if (story) return t < INTRO.end ? introCamera(t, STORY, INTRO_STORY_FROM) : { x: kf(t, STORY.x), y: kf(t, STORY.y), z: kf(t, STORY.z) };
  if (t < INTRO.end) { const c = introCamera(t, CAM); return { x: c.x + (narrow ? kf(t, NARROW_X) : 0), y: c.y + (narrow ? 6 : 0), z: c.z * (narrow ? kf(t, NARROW_ZOOM) : 1) }; }
  const z = kf(t, CAM.z) * (narrow ? kf(t, NARROW_ZOOM) : 1);
  return { x: kf(t, CAM.x) + (narrow ? kf(t, NARROW_X) : 0), y: kf(t, CAM.y) + (narrow ? 6 : 0), z };
}

// ── WHAT THE LAPTOP SHOWS, over time (opacity per screen; crossfades ~0.7s) ──
export const SCREENS = ['intro', 'listing', 'ranked', 'verify', 'report', 'studio', 'report2'];
export function screenOpacity(t) {
  return {
    intro: 1 - P(t, 2.2, 2.85),                            // the settled ranked list the film opens on
    listing: P(t, 2.2, 2.85) * (1 - P(t, 11.2, 11.9)),     // = 1 by 2.85 s → the 3 s frame is unchanged
    ranked: window_(t, 11.2, 20.4, 0.7),
    verify: window_(t, 19.9, 25.6, 0.6),
    report: window_(t, 25.0, 30.8, 0.6),
    studio: window_(t, 30.3, 38.2, 0.6),
    report2: P(t, 37.7, 38.4),
  };
}

// ── PHONE presence: rises in during the hand-off, leaves as the camera pulls back ──
export function phonePose(t) {
  const enter = easeOut(P(t, 6.4, 7.6)); const leave = easeInOut(P(t, 11, 12.2));
  const k = enter * (1 - leave);
  return { k, dy: (1 - enter) * 90 + leave * 70, tilt: -4 + enter * 4 - leave * 3, scale: 0.92 + k * 0.08 };
}

// ── OVERLAYS ──
export function overlays(t) {
  return {
    wordmarkIntro: Math.min(P(t, 2.3, 2.6), 1 - P(t, 2.6, 3.4)),   // subtle, bottom-left; in only once the pull-back has cleared the list (by 2.3 s that corner is off the screen); identical to before from 2.6 s on
    endWordmark: P(t, 39.6, 40.8),
    endTagline: P(t, 40.6, 41.8),
  };
}

// Beat progress values handed to the screens (each 0..1, eased where it should feel organic).
export function beats(t) {
  return {
    // opening: the list is already ranked; the top score resolves under the tight camera
    intro: { arrive: [1, 1, 1, 1, 1], sort: 1, top: easeOut(P(t, 0.9, 1.5)), select: 0, askBtn: 0, press: 0, asked: 0, score: easeOut(P(t, 0.15, 1.05)) },
    listing: { linkBtn: easeOut(P(t, 3.9, 4.5)), link: easeOut(P(t, 4.9, 5.6)), sent: easeOut(P(t, 5.9, 6.5)) },
    apply: { fields: [P(t, 7.6, 8.1), P(t, 8.3, 8.8), P(t, 9.0, 9.5), P(t, 9.7, 10.2)].map(easeOut), estimate: easeOut(P(t, 10.1, 10.5)), progress: lerp(0.22, 0.33, easeInOut(P(t, 7.6, 10.4))), cont: easeInOut(P(t, 10.5, 10.9)) },
    ranked: {
      arrive: [P(t, 11.7, 12.3), P(t, 12.0, 12.6), P(t, 12.3, 12.9), P(t, 12.6, 13.2), P(t, 12.9, 13.5)].map(easeOut),
      sort: easeInOut(P(t, 13.7, 15.4)), top: easeOut(P(t, 15.3, 15.9)),
      select: easeOut(P(t, 16.3, 16.9)), askBtn: easeOut(P(t, 17.2, 17.7)), press: window_(t, 18.3, 18.9, 0.15), asked: easeOut(P(t, 18.8, 19.4)),
    },
    verify: { rows: [P(t, 20.6, 21.1), P(t, 21.2, 21.7), P(t, 21.8, 22.3), P(t, 22.4, 22.9)].map(easeOut), badge: easeOut(P(t, 23.0, 23.5)), del: [P(t, 23.7, 24.2), P(t, 23.95, 24.45), P(t, 24.2, 24.7)].map(easeInOut), deleted: easeOut(P(t, 24.5, 25.0)) },
    report: { mast: easeOut(P(t, 25.4, 26.0)), brand: easeInOut(P(t, 25.9, 26.7)), rows: [P(t, 26.4, 26.9), P(t, 26.9, 27.4), P(t, 27.4, 27.9)].map(easeOut), logo: easeOut(P(t, 28.3, 28.9)), foot: easeOut(P(t, 29.0, 29.5)) },
    studio: { swatch: kf(t, [[31.3, 0], [31.9, 1], [32.5, 1], [33.0, 2]], easeInOut), gen: window_(t, 32.9, 34.2, 0.3), concepts: [P(t, 33.8, 34.3), P(t, 34.3, 34.8), P(t, 34.8, 35.3)].map(easeOut), pick: easeOut(P(t, 35.7, 36.2)), font: kf(t, [[36.2, 0], [36.7, 1], [37.2, 2]], (k) => (k < 0.5 ? 0 : 1)), land: easeOut(P(t, 37.4, 38.0)) },
    report2: { logo: easeOut(P(t, 37.9, 38.6)) },   // her generated mark lands in her masthead (colour + font come straight from the studio's end state)
  };
}
