// lib/mockupExport.js
// CLIENT-ONLY, admin-only (imported by pages/admin/mockups.js alone — never a user-facing route).
//
// STILLS   html-to-image → PNG at 2x/3x. It serializes the live DOM into an SVG <foreignObject>
//          with computed styles, so transform: scale(), inline SVG chrome, box-shadows and the
//          loaded Google webfonts (embedded as data URLs) all survive. UI controls are excluded
//          by class (.mk-ui).
// ZIP      a store-only ZIP writer (PNGs are already compressed) so "Download all" is ONE file.
// VIDEO    no dependency: the hero demo is driven deterministically step by step, its CSS
//          transitions are scrubbed with the Web Animations API, each needed frame is rasterized
//          (frames inside a hold are reused), then the frames are replayed at 30fps into a canvas
//          captureStream recorded by MediaRecorder — MP4/H.264 where the browser can mux it,
//          WebM (VP9) otherwise. One exact loop: first and last frame are the same instant.
import { toPng, toCanvas } from 'html-to-image';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const isUi = (node) => node?.classList?.contains?.('mk-ui');
const FILTER = (node) => !isUi(node);

// Webfont CSS for the export, built ONCE and passed as `fontEmbedCSS`. html-to-image's own
// font discovery cannot read the cross-origin Google Fonts stylesheet, so it fetches it and
// INSERTS the @font-face rules (multi-MB data URLs) into the page's first inline stylesheet —
// the first export works, every later one then re-parses that sheet and the renderer hangs.
// Doing it here keeps the page untouched and makes repeat exports fast.
let fontCssPromise = null;
const toDataUrl = async (url) => { const r = await fetch(url, { mode: 'cors' }); const b = await r.blob(); return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
export function fontEmbedCSS() {
  if (!fontCssPromise) {
    fontCssPromise = (async () => {
      const links = [...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.href);
      let css = '';
      for (const href of links) { try { css += await (await fetch(href)).text(); } catch (e) { /* ignore */ } }
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      const data = new Map(await Promise.all(urls.map(async (u) => [u, await toDataUrl(u).catch(() => u)])));
      return css.replace(/url\((https:[^)]+)\)/g, (_, u) => `url(${data.get(u) || u})`);
    })().catch(() => '');
  }
  return fontCssPromise;
}

async function opts(pixelRatio) {
  return { pixelRatio, filter: FILTER, cacheBust: false, backgroundColor: null, fontEmbedCSS: await fontEmbedCSS(), style: { borderRadius: '0', outline: 'none' } };
}
export async function renderPng(el, { pixelRatio = 2 } = {}) { return toPng(el, await opts(pixelRatio)); }
export async function renderCanvas(el, { pixelRatio = 2 } = {}) { return toCanvas(el, await opts(pixelRatio)); }

export function download(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const dataUrlToBlob = async (u) => (await fetch(u)).blob();
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ── store-only ZIP ──────────────────────────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export async function zipFiles(files /* [{ name, blob }] */) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const d = new Date(); const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff; const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name); const data = new Uint8Array(await f.blob.arrayBuffer()); const crc = crc32(data);
    const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name]);
    parts.push(local, data);
    central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// ── video ───────────────────────────────────────────────────────────────────────────────────
export function bestVideoType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const c = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4D0028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return c.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

// Plan which frame times need a fresh rasterization: only within `transitionMs` after a step
// change; the rest of a hold reuses the previous frame.
export function planFrames({ durations, transitionMs, fps }) {
  const loop = durations.reduce((a, b) => a + b, 0);
  const total = Math.round(loop / 1000 * fps);
  const frames = [];
  for (let i = 0; i < total; i++) {
    const t = i * 1000 / fps;
    let acc = 0, step = 0, tau = t;
    for (let s = 0; s < durations.length; s++) { if (t < acc + durations[s]) { step = s; tau = t - acc; break; } acc += durations[s]; }
    const fresh = i === 0 || tau <= transitionMs + 1000 / fps;
    frames.push({ i, t, step, tau, fresh });
  }
  return { frames, loop, total };
}

// Scrub every running CSS transition/animation under `root` to `tau` ms after its start.
function scrubAnimations(root, tau) {
  const anims = typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }) : [];
  for (const a of anims) { try { a.pause(); a.currentTime = Math.min(tau, (a.effect?.getTiming?.().duration) || tau); } catch (e) { /* ignore */ } }
  return anims;
}
function releaseAnimations(root) { const anims = typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }) : []; for (const a of anims) { try { a.play(); } catch (e) { /* ignore */ } } }
// Remove every (paused) transition so it drops out of getAnimations() — finish() on a PAUSED
// animation leaves it paused at its end and still enumerable, so the next scrub would rewind it
// and the previous step's crossfade would ghost through. cancel() removes it and the element
// snaps to its underlying (target) value.
function finishAnimations(root) { const anims = typeof root.getAnimations === 'function' ? root.getAnimations({ subtree: true }) : []; for (const a of anims) { try { a.cancel(); } catch (e) { /* ignore */ } } }
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Rasterize one loop. `setStep(n)` must re-render the scene to step n (React state); `stage`
// is the element to capture. Returns { blobs: Blob[] (one per frame, JPEG), width, height }.
export async function captureLoopFrames({ stage, setStep, durations, transitionMs, fps = 30, pixelRatio = 2, onProgress, stopAfter = Infinity }) {
  const { frames } = planFrames({ durations, transitionMs, fps });
  const blobs = []; let last = null; let width = 0, height = 0; let currentStep = -1;
  // Start exactly at the loop boundary: settle on the LAST step, then flip to step 0 so the
  // first frame is the beginning of the shortlist→review crossfade; the final frame (one loop
  // later) is that same instant → seamless.
  setStep(durations.length - 1); await nextPaint(); finishAnimations(stage); await nextPaint();
  for (const f of frames) {
    if (f.step !== currentStep) { currentStep = f.step; finishAnimations(stage); setStep(f.step); await nextPaint(); }
    if (f.fresh) {
      scrubAnimations(stage, f.tau); await nextPaint();
      const canvas = await renderCanvas(stage, { pixelRatio });
      width = canvas.width; height = canvas.height;
      last = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.93));
    }
    blobs.push(last);
    onProgress?.(f.i + 1, frames.length);
    if (f.i >= stopAfter) break;
  }
  releaseAnimations(stage);
  return { blobs, width, height, fps };
}

// ── Preferred: WebCodecs H.264 → MP4 (mp4-muxer). Explicit bitrate and a keyframe every
// second, encoded offline (no real-time replay), so faint crossfade tails never linger as
// encoder residue. Returns null when WebCodecs/H.264 isn't available → MediaRecorder fallback.
export async function encodeFramesMp4({ blobs, width, height, fps = 30, onProgress }) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  const w = width - (width % 2), h = height - (height % 2); // H.264 needs even dimensions
  const bitrate = Math.min(40_000_000, Math.max(6_000_000, Math.round(w * h * fps * 0.35)));
  let codec = null;
  for (const c of ['avc1.640028', 'avc1.64001F', 'avc1.4D0028', 'avc1.42E028', 'avc1.42E01F']) {
    try { const r = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' } }); if (r.supported) { codec = c; break; } } catch (e) { /* try next */ }
  }
  if (!codec) return null;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
  let failed = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  encoder.configure({ codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' });
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d');
  let lastBlob = null; const us = Math.round(1e6 / fps);
  for (let i = 0; i < blobs.length; i++) {
    if (failed) throw failed;
    if (blobs[i] !== lastBlob) { const bm = await createImageBitmap(blobs[i]); ctx.drawImage(bm, 0, 0); bm.close?.(); lastBlob = blobs[i]; }
    const frame = new VideoFrame(canvas, { timestamp: i * us, duration: us });
    encoder.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 20));
    onProgress?.(i + 1, blobs.length);
  }
  await encoder.flush(); encoder.close();
  if (failed) throw failed;
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), type: 'video/mp4', codec, bitrate };
}

// Fallback: replay frames into a canvas stream in real time and record with MediaRecorder.
// Frames are JPEG blobs (most consecutive ones are the SAME blob during a hold); bitmaps are
// decoded just-in-time with one distinct frame prefetched ahead, so memory stays ~2 frames.
// Bitrate scales with pixel rate (~0.5 bit/pixel/frame) so faint crossfade tails aren't
// 'skipped' by the encoder and left as residue; 1236² @30fps ≈ 23 Mbps → ~8 s ≈ 20 MB, still
// well inside social upload limits.
export async function encodeFrames({ blobs, width, height, fps = 30, bitsPerSecond, onProgress }) {
  bitsPerSecond = bitsPerSecond || Math.min(40_000_000, Math.max(8_000_000, Math.round(width * height * fps * 0.5)));
  const type = bestVideoType(); if (!type) throw new Error('This browser cannot record video (no MediaRecorder).');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  // distinct-frame prefetch
  const cache = new Map(); // blob → Promise<ImageBitmap>
  const get = (b) => { if (!cache.has(b)) cache.set(b, createImageBitmap(b)); return cache.get(b); };
  const nextDistinct = (i) => { for (let j = i + 1; j < blobs.length; j++) if (blobs[j] !== blobs[i]) return blobs[j]; return null; };
  let current = await get(blobs[0]);
  ctx.drawImage(current, 0, 0);
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitsPerSecond });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: type.split(';')[0] })); });
  rec.start(250);
  await new Promise((r) => setTimeout(r, 60));
  const t0 = performance.now(); const frameMs = 1000 / fps; let drawn = 0; let currentBlob = blobs[0];
  await new Promise((resolve) => {
    const tick = async () => {
      const idx = Math.min(blobs.length - 1, Math.floor((performance.now() - t0) / frameMs));
      while (drawn <= idx) {
        const b = blobs[drawn];
        if (b !== currentBlob) { const bm = await get(b); cache.delete(currentBlob); current?.close?.(); current = bm; currentBlob = b; const nd = nextDistinct(drawn); if (nd) get(nd); }
        ctx.drawImage(current, 0, 0); drawn++;
      }
      onProgress?.(drawn, blobs.length);
      if (drawn >= blobs.length && performance.now() - t0 >= blobs.length * frameMs) resolve(); else requestAnimationFrame(tick);
    };
    const nd = nextDistinct(0); if (nd) get(nd);
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 60));
  rec.stop();
  const blob = await done;
  current?.close?.();
  return { blob, type };
}
