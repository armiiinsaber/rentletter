// scripts/brand/motionEncode.mjs
// Turns animation frames that are already rendered (raw RGBA pixels, straight alpha) into the
// brand kit's motion files. Nothing is drawn here: the renderer hands over the pixels and this
// module only encodes them.
//   encodeGif({ width, height, frames, loop })               a Buffer: an animated GIF, written in
//       plain JavaScript. Frames are { rgba, ms }. One global palette: the exact colours when all
//       frames hold 256 or fewer, otherwise a median cut seeded with every colour that covers more
//       than 0.5% of the pixels, so the flat token colours stay exact. After the first frame only
//       the rectangle that changed is written. Delays add up to the input to the centisecond, and
//       no frame shows for less than 2 centiseconds. loop writes NETSCAPE2.0 (forever); without
//       it the GIF plays once and rests on its last frame.
//   encodeMp4({ width, height, fps, frames, bitrate })       a Promise of a Buffer: an H.264 MP4
//       with the index up front (fast start), encoded by WebCodecs in headless Google Chrome and
//       muxed there with mp4-muxer.
//   encodeWebmAlpha({ width, height, fps, frames, bitrate }) a Promise of a Buffer: a transparent
//       VP9 WebM. Chrome encodes two VP9 streams (the colour, and the alpha carried as the luma of
//       a second stream) and this module writes the container: each colour frame in a Block, its
//       alpha frame in BlockAdditional with BlockAddID 1, AlphaMode 1 on the track.
//   withChrome(async (enc) => { await enc.mp4(...); await enc.webmAlpha(...) })
//       one Chrome session for several videos. encodeMp4 and encodeWebmAlpha alone open and close
//       their own.
// Both videos put a keyframe on the first frame, at least every 2 seconds, and at the start of
// every hold (the same frames in both WebM streams).
// The videos need Google Chrome in /Applications and playwright-core. WebCodecs only exists in a
// secure context, so the page comes from a local http server on 127.0.0.1, opened as localhost,
// and the page fetches the frame bytes from that server one at a time.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// The browser build of mp4-muxer: a script that defines the global Mp4Muxer.
const MUXER_JS = createRequire(import.meta.url).resolve('mp4-muxer');
const APP = 'Rentletter motionEncode';

const asBuffer = (b) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  return Buffer.from(u.buffer, u.byteOffset, u.byteLength);
};
const sameBytes = (a, b) => a.length === b.length && asBuffer(a).equals(asBuffer(b));

function checkSize(name, width, height) {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width < 65536 && height < 65536)) {
    throw new Error(`${name}: width and height must be whole numbers from 1 to 65535 (got ${width} by ${height}).`);
  }
}
function checkFrame(name, buf, bytes, i) {
  if (buf.length !== bytes) throw new Error(`${name}: frame ${i} holds ${buf.length} bytes, expected ${bytes}.`);
  return buf;
}

// ── GIF ──────────────────────────────────────────────────────────────────────────────────────

export function encodeGif({ width, height, frames, loop = true }) {
  checkSize('encodeGif', width, height);
  if (!frames?.length) throw new Error('encodeGif: no frames.');
  const n = width * height;
  // Identical consecutive frames become one frame, their durations summed.
  const shown = [];
  frames.forEach((f, i) => {
    const rgba = checkFrame('encodeGif', asBuffer(f.rgba), n * 4, i);
    const ms = Number(f.ms);
    if (!(ms >= 0 && Number.isFinite(ms))) throw new Error(`encodeGif: frame ${i} has no valid ms.`);
    const last = shown[shown.length - 1];
    if (last && last.rgba.equals(rgba)) last.ms += ms;
    else shown.push({ rgba, ms });
  });
  const { palette, lut } = gifPalette(shown, n);
  // Each frame as palette indices. Two frames that index the same merge here too.
  const indexed = [];
  for (const f of shown) {
    const d = f.rgba, idx = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) idx[i] = lut[(d[p] << 16) | (d[p + 1] << 8) | d[p + 2]];
    const last = indexed[indexed.length - 1];
    if (last && sameBytes(last.idx, idx)) last.ms += f.ms;
    else indexed.push({ idx, ms: f.ms });
  }
  const timed = gifDelays(indexed);

  const bits = Math.max(1, Math.ceil(Math.log2(palette.length)));
  const out = [];
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  out.push(Buffer.from('GIF89a', 'latin1'), Buffer.from([...u16(width), ...u16(height), 0xf0 | (bits - 1), 0, 0]));
  const table = Buffer.alloc(3 << bits);
  palette.forEach((c, i) => { table[i * 3] = c >> 16; table[i * 3 + 1] = (c >> 8) & 255; table[i * 3 + 2] = c & 255; });
  out.push(table);
  if (loop) out.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([3, 1, 0, 0, 0]));
  const lzw = makeLzw(Math.max(2, bits));
  let prev = null;
  for (const f of timed) {
    // The whole screen first, then only the rectangle that differs from the frame on screen.
    // A frame with no change (a hold longer than the GIF delay field) writes one pixel.
    let rect = [0, 0, width - 1, height - 1];
    if (prev) rect = changedRect(prev, f.idx, width, height) || [0, 0, 0, 0];
    const [x0, y0, x1, y1] = rect;
    // Graphic control: disposal 1 (leave the frame in place), no transparency.
    out.push(Buffer.from([0x21, 0xf9, 4, 0x04, ...u16(f.cs), 0, 0]));
    out.push(Buffer.from([0x2c, ...u16(x0), ...u16(y0), ...u16(x1 - x0 + 1), ...u16(y1 - y0 + 1), 0]));
    out.push(lzw(crop(f.idx, width, x0, y0, x1, y1)));
    prev = f.idx;
  }
  out.push(Buffer.from([0x3b]));
  return Buffer.concat(out);
}

// Durations to GIF delays. Each frame ends at its cumulative input time rounded to the
// centisecond, so rounding errors carry forward and the total stays exact. A frame that would
// show for less than 2 centiseconds is dropped and its time goes to the next frame shown
// (browsers stretch a delay of 0 or 1 to 10). The last frame always shows: the GIF rests on it.
function gifDelays(list) {
  const cs = (ms) => Math.round(Math.round(ms * 1000) / 10000);
  const shown = [];
  let ms = 0, at = 0;
  for (const f of list) {
    ms += f.ms;
    const end = cs(ms);
    if (end - at >= 2) { shown.push({ idx: f.idx, cs: end - at }); at = end; }
  }
  const total = cs(ms), last = list[list.length - 1].idx;
  if (!shown.length) shown.push({ idx: last, cs: Math.max(2, total) });
  else if (shown[shown.length - 1].idx !== last) {
    const tail = shown[shown.length - 1], rest = total - at, need = 2 - rest;
    if (tail.cs - need >= 2) { tail.cs -= need; shown.push({ idx: last, cs: 2 }); }
    else { tail.idx = last; tail.cs += rest; }
  }
  // A dropped frame can leave two equal frames side by side: they merge.
  const merged = [];
  for (const f of shown) {
    const m = merged[merged.length - 1];
    if (m && sameBytes(m.idx, f.idx)) m.cs += f.cs;
    else merged.push({ ...f });
  }
  // The delay field holds 65535 at most: a longer hold continues in frames that change nothing.
  const timed = [];
  for (const f of merged) {
    let left = f.cs;
    while (left > 65535) { const take = left - 65535 >= 2 ? 65535 : 65533; timed.push({ idx: f.idx, cs: take }); left -= take; }
    timed.push({ idx: f.idx, cs: left });
  }
  return timed;
}

// The palette and a lookup from 24 bit colour to palette index. Alpha is ignored: GIF frames
// arrive opaque.
function gifPalette(frames, n) {
  const hist = new Uint32Array(1 << 24);
  for (const { rgba: d } of frames) for (let p = 0, end = n * 4; p < end; p += 4) hist[(d[p] << 16) | (d[p + 1] << 8) | d[p + 2]]++;
  const colours = [], counts = [];
  for (let c = 0; c < hist.length; c++) if (hist[c]) { colours.push(c); counts.push(hist[c]); }
  let palette;
  if (colours.length <= 256) {
    palette = colours.map((c, i) => i).sort((a, b) => counts[b] - counts[a] || colours[a] - colours[b]).map((i) => colours[i]);
  } else {
    palette = medianCut(colours, counts, frames.length * n);
  }
  const exact = new Map(palette.map((c, i) => [c, i]));
  const lut = new Uint8Array(1 << 24);
  for (const c of colours) lut[c] = exact.has(c) ? exact.get(c) : nearest(palette, c);
  return { palette, lut };
}

function nearest(palette, c) {
  const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i], dr = (p >> 16) - r, dg = ((p >> 8) & 255) - g, db = (p & 255) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Every colour that covers more than 0.5% of all pixels is kept exactly. The rest share the
// remaining entries through a median cut weighted by pixel counts: the box with the largest
// squared error splits at the weighted median of its widest channel, until the palette is full.
function medianCut(colours, counts, total) {
  const seeds = [], rest = [];
  for (let i = 0; i < colours.length; i++) (counts[i] > total * 0.005 ? seeds : rest).push(i);
  seeds.sort((a, b) => counts[b] - counts[a] || colours[a] - colours[b]);
  const palette = seeds.map((i) => colours[i]);
  const room = 256 - palette.length;
  const box = (items) => {
    let w = 0;
    const s = [0, 0, 0], q = [0, 0, 0];
    for (const i of items) {
      const c = colours[i], k = counts[i], ch = [c >> 16, (c >> 8) & 255, c & 255];
      w += k;
      for (let j = 0; j < 3; j++) { s[j] += ch[j] * k; q[j] += ch[j] * ch[j] * k; }
    }
    const err = [0, 1, 2].map((j) => q[j] - (s[j] * s[j]) / w);
    const mean = (Math.round(s[0] / w) << 16) | (Math.round(s[1] / w) << 8) | Math.round(s[2] / w);
    return { items, w, err, sse: err[0] + err[1] + err[2], mean };
  };
  const boxes = rest.length ? [box(rest)] : [];
  while (boxes.length < room) {
    let pick = -1;
    for (let b = 0; b < boxes.length; b++) if (boxes[b].items.length > 1 && (pick < 0 || boxes[b].sse > boxes[pick].sse)) pick = b;
    if (pick < 0) break;
    const { items, w, err } = boxes[pick];
    const axis = err[0] >= err[1] && err[0] >= err[2] ? 0 : err[1] >= err[2] ? 1 : 2;
    const shift = 16 - axis * 8;
    const sorted = items.slice().sort((a, b) => ((colours[a] >> shift) & 255) - ((colours[b] >> shift) & 255) || colours[a] - colours[b]);
    let cut = 0, acc = 0;
    while (cut < sorted.length && acc < w / 2) acc += counts[sorted[cut++]];
    cut = Math.min(Math.max(cut, 1), sorted.length - 1);
    boxes.splice(pick, 1, box(sorted.slice(0, cut)), box(sorted.slice(cut)));
  }
  const have = new Set(palette);
  for (const b of boxes) if (!have.has(b.mean)) { have.add(b.mean); palette.push(b.mean); }
  return palette;
}

function changedRect(a, b, w, h) {
  let x0 = w, y0 = -1, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let l = -1;
    for (let x = 0; x < w; x++) if (a[row + x] !== b[row + x]) { l = x; break; }
    if (l < 0) continue;
    let r = l;
    for (let x = w - 1; x > l; x--) if (a[row + x] !== b[row + x]) { r = x; break; }
    if (y0 < 0) y0 = y;
    y1 = y;
    if (l < x0) x0 = l;
    if (r > x1) x1 = r;
  }
  return y0 < 0 ? null : [x0, y0, x1, y1];
}

function crop(idx, w, x0, y0, x1, y1) {
  const cw = x1 - x0 + 1, out = new Uint8Array(cw * (y1 - y0 + 1));
  for (let y = y0; y <= y1; y++) out.set(idx.subarray(y * w + x0, y * w + x1 + 1), (y - y0) * cw);
  return out;
}

// GIF LZW: variable code size from minSize + 1 up to 12 bits, a clear code when the table holds
// 4096 entries. The table is keyed by (prefix code, next index) and reset by bumping a stamp.
function makeLzw(minSize) {
  const stamp = new Uint32Array(1 << 20), code = new Uint16Array(1 << 20);
  let gen = 0;
  return (indices) => {
    const clear = 1 << minSize, eoi = clear + 1;
    let next = eoi + 1, size = minSize + 1, acc = 0, nbits = 0;
    let buf = new Uint8Array(4096), len = 0;
    const emit = (c) => {
      acc |= c << nbits;
      nbits += size;
      while (nbits >= 8) {
        if (len === buf.length) { const g = new Uint8Array(len * 2); g.set(buf); buf = g; }
        buf[len++] = acc & 255;
        acc >>>= 8;
        nbits -= 8;
      }
    };
    gen++;
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (prefix << 8) | k;
      if (stamp[key] === gen) { prefix = code[key]; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear);
        next = eoi + 1;
        size = minSize + 1;
        gen++;
      } else {
        if (next >= 1 << size) size++;
        stamp[key] = gen;
        code[key] = next++;
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (nbits > 0) {
      if (len === buf.length) { const g = new Uint8Array(len + 1); g.set(buf); buf = g; }
      buf[len++] = acc & 255;
    }
    // Sub blocks of at most 255 bytes, then the zero block.
    const out = Buffer.alloc(len + Math.ceil(len / 255) + 2);
    let o = 0;
    out[o++] = minSize;
    for (let p = 0; p < len; p += 255) {
      const take = Math.min(255, len - p);
      out[o++] = take;
      out.set(buf.subarray(p, p + take), o);
      o += take;
    }
    out[o++] = 0;
    return out.subarray(0, o);
  };
}

// ── CHROME ───────────────────────────────────────────────────────────────────────────────────

// About 8 Mbps for 1024 by 1024, in proportion to the pixel count. The frames are flat colours.
const defaultBitrate = (w, h) => Math.max(1_000_000, Math.round((8_000_000 * w * h) / (1024 * 1024)));
// Keyframes: the first frame, one at least every 2 seconds, and the first frame of every hold (a
// frame that then repeats for a fifth of a second or more). The encoders skip repeated frames
// outright, so a hold would otherwise keep whatever small errors its first frame was coded with
// against the moving frame before it, for as long as it lasts.
function keyPlan(frames, fps) {
  const gop = Math.max(1, Math.round(fps * 2)), hold = Math.max(2, Math.round(fps / 5));
  const repeat = frames.map((f, i) => i > 0 && sameBytes(asBuffer(f), asBuffer(frames[i - 1])));
  const keys = frames.map(() => 0);
  let last = 0;
  for (let i = 0; i < frames.length; i++) {
    let holds = i > 0 && !repeat[i];
    for (let k = 1; holds && k < hold; k++) holds = i + k < frames.length && repeat[i + k];
    if (i === 0 || i - last >= gop || holds) { keys[i] = 1; last = i; }
  }
  return keys;
}

// H.264 codec strings, the smallest level that fits the frame size and macroblock rate first,
// High profile before Main before Baseline.
function h264Codecs(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16), rate = mbs * fps;
  const levels = [[0x1f, 3600, 108000], [0x20, 5120, 216000], [0x28, 8192, 245760], [0x2a, 8704, 522240], [0x32, 22080, 589824], [0x33, 36864, 983040], [0x34, 36864, 2073600]];
  const fit = levels.filter(([, f, r]) => mbs <= f && rate <= r).map(([l]) => l.toString(16).toUpperCase());
  const use = fit.length ? fit : ['34'];
  return [...use.map((l) => `avc1.6400${l}`), ...use.map((l) => `avc1.4D00${l}`), ...use.map((l) => `avc1.42E0${l}`)];
}
const VP9_CODECS = ['vp09.00.10.08', 'vp09.00.40.08', 'vp09.00.41.08', 'vp09.00.50.08', 'vp09.00.51.08'];

// Runs inside the page. Fetches frame i from frameUrl/i, encodes it at a constant frame rate,
// as a keyframe where keys[i] is 1, and posts the result to outUrl: the finished MP4 when mux is
// set, otherwise every chunk's bytes back to back (the return value indexes them). With quantizer
// set, a constant quantizer is tried before the bitrate.
async function pageEncode(o) {
  const { frameUrl, outUrl, count, fps, width, height, codecs, bitrate, keys, format, mux, quantizer } = o;
  let config = null;
  for (const codec of codecs) {
    const base = { codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' };
    if (codec.startsWith('avc1')) base.avc = { format: 'avc' };
    for (const c of quantizer === undefined ? [base] : [{ ...base, bitrateMode: 'quantizer' }, base]) {
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch (e) { /* the next option */ }
    }
    if (config) break;
  }
  if (!config) throw new Error(`No supported encoder among ${codecs.join(', ')} at ${width} by ${height}.`);
  const perFrame = {};
  if (config.bitrateMode === 'quantizer') perFrame[config.codec.startsWith('avc1') ? 'avc' : 'vp9'] = { quantizer };
  let failed = null;
  const chunks = [];
  // mp4-muxer stamps Date.now() into the file as its creation time. The kit's fixed date goes in
  // instead, so the same frames give the same bytes.
  let muxer = null;
  if (mux) {
    const now = Date.now;
    Date.now = () => Date.UTC(2026, 0, 1);
    try { muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' }); } finally { Date.now = now; }
  }
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (muxer) { muxer.addVideoChunk(chunk, meta); return; }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ key: chunk.type === 'key' ? 1 : 0, t: chunk.timestamp, data });
    },
    error: (e) => { failed = e; },
  });
  encoder.configure(config);
  const time = (i) => Math.round((i * 1e6) / fps);
  const load = async (i) => {
    const r = await fetch(`${frameUrl}/${i}`);
    if (!r.ok) throw new Error(`Frame ${i}: HTTP ${r.status}`);
    return r.arrayBuffer();
  };
  let pending = load(0);
  for (let i = 0; i < count; i++) {
    const data = await pending;
    if (i + 1 < count) pending = load(i + 1);
    const frame = new VideoFrame(data, { format, codedWidth: width, codedHeight: height, timestamp: time(i), duration: time(i + 1) - time(i) });
    encoder.encode(frame, { keyFrame: keys[i] === 1, ...perFrame });
    frame.close();
    while (encoder.encodeQueueSize > 4 && !failed) await new Promise((r) => setTimeout(r, 1));
    if (failed) throw failed;
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  let body;
  const index = [];
  if (muxer) {
    muxer.finalize();
    body = muxer.target.buffer;
  } else {
    body = new Uint8Array(chunks.reduce((s, c) => s + c.data.byteLength, 0));
    let at = 0;
    for (const c of chunks) { body.set(c.data, at); at += c.data.byteLength; index.push([c.key, c.t, c.data.byteLength]); }
  }
  const r = await fetch(outUrl, { method: 'POST', body });
  if (!r.ok) throw new Error(`Posting the result: HTTP ${r.status}`);
  return { codec: config.codec, index };
}

async function openChrome() {
  if (!existsSync(CHROME)) throw new Error(`Google Chrome is needed for the videos and was not found at ${CHROME}.`);
  const jobs = new Map();
  let jobSeq = 0;
  const server = createServer((req, res) => {
    const end = (status, body, type = 'application/octet-stream') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...(body ? { 'content-length': body.length } : {}) });
      res.end(body);
    };
    if (req.method === 'GET' && req.url === '/') return end(200, Buffer.from('<!doctype html><meta charset="utf-8"><title>motionEncode</title>'), 'text/html; charset=utf-8');
    const m = /^\/job\/(\d+)\/([a-z]+)(?:\/(\d+))?$/.exec(req.url || '');
    const job = m && jobs.get(Number(m[1]));
    if (!job) return end(404);
    if (req.method === 'GET') {
      let body = null;
      try { body = job.serve(m[2], Number(m[3])); } catch (e) { job.error = e; return end(500); }
      return body ? end(200, body) : end(404);
    }
    if (req.method === 'POST') {
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => { job.results.set(m[2], Buffer.concat(parts)); end(200, Buffer.from('ok'), 'text/plain'); });
      return undefined;
    }
    return end(405);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser = null;
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.addScriptTag({ path: MUXER_JS });
    if (!(await page.evaluate(() => typeof VideoEncoder === 'function' && typeof Mp4Muxer === 'object'))) throw new Error('This Chrome page has no WebCodecs or mp4-muxer did not load.');
    // Runs pageEncode once per stream of a job, the streams side by side. serve(stream, i)
    // returns the bytes of frame i for that stream.
    const run = async (serve, streams) => {
      const id = ++jobSeq;
      const job = { serve, results: new Map(), error: null };
      jobs.set(id, job);
      try {
        const done = await Promise.all(streams.map((s) => page.evaluate(pageEncode, { ...s, frameUrl: `/job/${id}/${s.stream}`, outUrl: `/job/${id}/out${s.stream}` })));
        if (job.error) throw job.error;
        return streams.map((s, i) => ({ ...done[i], bytes: job.results.get(`out${s.stream}`) }));
      } catch (e) {
        throw job.error || e;
      } finally {
        jobs.delete(id);
      }
    };
    const enc = {
      async mp4({ width, height, fps = 60, frames, bitrate }) {
        checkSize('encodeMp4', width, height);
        if (width % 2 || height % 2) throw new Error(`encodeMp4: H.264 needs even dimensions (got ${width} by ${height}).`);
        if (!frames?.length) throw new Error('encodeMp4: no frames.');
        const bytes = width * height * 4;
        const serve = (stream, i) => (stream === 'f' && i < frames.length ? checkFrame('encodeMp4', asBuffer(frames[i]), bytes, i) : null);
        const [r] = await run(serve, [{ stream: 'f', count: frames.length, fps, width, height, codecs: h264Codecs(width, height, fps), bitrate: bitrate || defaultBitrate(width, height), keys: keyPlan(frames, fps), format: 'RGBX', mux: true }]);
        return r.bytes;
      },
      async webmAlpha({ width, height, fps = 60, frames, bitrate }) {
        checkSize('encodeWebmAlpha', width, height);
        if (!frames?.length) throw new Error('encodeWebmAlpha: no frames.');
        const n = width * height, chroma = Math.ceil(width / 2) * Math.ceil(height / 2);
        const serve = (stream, i) => {
          if (i >= frames.length) return null;
          const rgba = checkFrame('encodeWebmAlpha', asBuffer(frames[i]), n * 4, i);
          if (stream === 'c') return bleed(rgba, width, height);
          if (stream !== 'a') return null;
          // The alpha as an I420 frame: alpha in the luma plane, both chroma planes at 128.
          const out = Buffer.alloc(n + 2 * chroma, 128);
          for (let p = 0, j = 3; p < n; p++, j += 4) out[p] = rgba[j];
          return out;
        };
        const common = { count: frames.length, fps, width, height, codecs: VP9_CODECS, bitrate: bitrate || defaultBitrate(width, height), keys: keyPlan(frames, fps), mux: false };
        // The alpha draws the outline, so it is coded at a constant quantizer of 8 (of 63) where
        // Chrome allows it: at a bitrate, rate control codes the first keyframe coarsely and edge
        // alpha came back up to 64 levels off; at 8 it stays within 5, for about 10% more bytes.
        const [colour, alpha] = await run(serve, [{ ...common, stream: 'c', format: 'RGBX' }, { ...common, stream: 'a', format: 'I420', quantizer: 8 }]);
        const split = (r) => {
          let at = 0;
          return r.index.map(([key, t, len]) => { const data = r.bytes.subarray(at, at + len); at += len; return { key: key === 1, t, data }; });
        };
        const c = split(colour), a = split(alpha);
        if (c.length !== frames.length || a.length !== frames.length) throw new Error(`encodeWebmAlpha: ${frames.length} frames went in, the encoders returned ${c.length} colour and ${a.length} alpha frames.`);
        return writeWebm({ width, height, fps, colour: c, alpha: a });
      },
    };
    return { enc, close: async () => { await browser.close().catch(() => {}); await new Promise((r) => server.close(r)); } };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
    throw e;
  }
}

export async function withChrome(fn) {
  const chrome = await openChrome();
  try {
    return await fn(chrome.enc);
  } finally {
    await chrome.close();
  }
}

export const encodeMp4 = (opts) => withChrome((enc) => enc.mp4(opts));
export const encodeWebmAlpha = (opts) => withChrome((enc) => enc.webmAlpha(opts));

// Fully transparent pixels take the colour of the nearest visible pixel (a breadth first fill
// from every pixel with alpha above 0), so chroma subsampling and the codec's blocks never pull
// a dark fringe into the edges. The colour stream is then opaque.
function bleed(rgba, w, h) {
  const n = w * h, out = Buffer.from(rgba);
  const queue = new Int32Array(n), seen = new Uint8Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3]) { seen[i] = 1; queue[tail++] = i; }
  if (tail === 0) out.fill(0);
  while (head < tail) {
    const i = queue[head++], x = i % w, s = i * 4;
    for (let k = 0; k < 4; k++) {
      let j;
      if (k === 0) j = x > 0 ? i - 1 : -1;
      else if (k === 1) j = x < w - 1 ? i + 1 : -1;
      else if (k === 2) j = i - w;
      else j = i + w;
      if (j < 0 || j >= n || seen[j]) continue;
      seen[j] = 1;
      const d = j * 4;
      out[d] = out[s]; out[d + 1] = out[s + 1]; out[d + 2] = out[s + 2];
      queue[tail++] = j;
    }
  }
  for (let p = 3; p < n * 4; p += 4) out[p] = 255;
  return out;
}

// ── WEBM ─────────────────────────────────────────────────────────────────────────────────────
// EBML elements as { id, body }, body a list of byte arrays and elements. Sizes are minimal
// EBML variable length integers. Times are in milliseconds (TimecodeScale 1000000).

const el = (id, body) => ({ id, body });
const ebmlId = (id) => { const b = []; for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v % 256); return Buffer.from(b); };
function vint(n) {
  let len = 1;
  while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
  const b = Buffer.alloc(len);
  for (let i = len - 1, v = n; i >= 0; i--, v = Math.floor(v / 256)) b[i] = v % 256;
  b[0] |= 0x80 >> (len - 1);
  return b;
}
function uintBytes(v, fixed = 0) {
  const b = [];
  for (let x = v; x > 0; x = Math.floor(x / 256)) b.unshift(x % 256);
  while (b.length < Math.max(1, fixed)) b.unshift(0);
  return Buffer.from(b);
}
function intBytes(v) {
  let len = 1;
  while (len < 8 && (v < -(2 ** (8 * len - 1)) || v >= 2 ** (8 * len - 1))) len++;
  const b = Buffer.alloc(len);
  b.writeIntBE(v, 0, Math.min(len, 6));
  return b;
}
const uint = (id, v, fixed) => el(id, [uintBytes(v, fixed)]);
const sint = (id, v) => el(id, [intBytes(v)]);
const text = (id, s) => el(id, [Buffer.from(s, 'utf8')]);
const float = (id, v) => { const b = Buffer.alloc(8); b.writeDoubleBE(v); return el(id, [b]); };
function bodySize(e) {
  if (e.size === undefined) e.size = e.body.reduce((s, k) => s + (k instanceof Uint8Array ? k.length : fullSize(k)), 0);
  return e.size;
}
const fullSize = (e) => ebmlId(e.id).length + vint(bodySize(e)).length + bodySize(e);
function serialize(e, parts) {
  parts.push(ebmlId(e.id), vint(bodySize(e)));
  for (const k of e.body) if (k instanceof Uint8Array) parts.push(k); else serialize(k, parts);
}

// colour[i] and alpha[i] are { key, data } for frame i. A Block has no keyframe flag (that bit is
// SimpleBlock only): a frame that needs another carries a ReferenceBlock to the frame before it,
// and a keyframe carries none. A frame counts as a keyframe only when both streams are keyframes
// there. A Cluster starts at every such keyframe and at least every 5 seconds.
function writeWebm({ width, height, fps, colour, alpha }) {
  const count = colour.length;
  const at = (i) => Math.round((i * 1000) / fps);
  const duration = (count * 1000) / fps;
  const clusters = [];
  let cluster = null;
  for (let i = 0; i < count; i++) {
    const t = at(i), key = colour[i].key && alpha[i].key;
    if (!cluster || key || t - cluster.t >= 5000) { cluster = { t, key, blocks: [] }; clusters.push(cluster); }
    const head = Buffer.alloc(4);
    head[0] = 0x81;
    head.writeInt16BE(t - cluster.t, 1);
    const kids = [el(0xa1, [head, colour[i].data]), el(0x75a1, [el(0xa6, [uint(0xee, 1), el(0xa5, [alpha[i].data])])])];
    if (i === count - 1) kids.push(uint(0x9b, Math.max(1, Math.round(duration) - t)));
    if (!key) kids.push(sint(0xfb, at(i - 1) - t));
    cluster.blocks.push(el(0xa0, kids));
  }
  const header = el(0x1a45dfa3, [uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), text(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2)]);
  const info = el(0x1549a966, [uint(0x2ad7b1, 1000000), text(0x4d80, APP), text(0x5741, APP), float(0x4489, duration)]);
  const video = el(0xe0, [uint(0xb0, width), uint(0xba, height), uint(0x53c0, 1)]);
  const track = el(0xae, [uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), uint(0x9c, 0), uint(0x23e383, Math.round(1e9 / fps)), uint(0x55ee, 1), text(0x86, 'V_VP9'), video]);
  const tracks = el(0x1654ae6b, [track]);
  // SeekHead positions are written as 8 byte integers, so its size is known before the positions.
  const hasCues = clusters.some((c) => c.key);
  const seekTo = [0x1549a966, 0x1654ae6b, ...(hasCues ? [0x1c53bb6b] : [])].map((id) => ({ id, pos: uint(0x53ac, 0, 8) }));
  const seekHead = el(0x114d9b74, seekTo.map((s) => el(0x4dbb, [el(0x53ab, [ebmlId(s.id)]), s.pos])));
  const clusterEls = clusters.map((c) => el(0x1f43b675, [uint(0xe7, c.t), ...c.blocks]));
  let pos = fullSize(seekHead);
  const where = { [0x1549a966]: pos };
  pos += fullSize(info);
  where[0x1654ae6b] = pos;
  pos += fullSize(tracks);
  const cuePoints = [];
  clusters.forEach((c, i) => {
    if (c.key) cuePoints.push(el(0xbb, [uint(0xb3, c.t), el(0xb7, [uint(0xf7, 1), uint(0xf1, pos)])]));
    pos += fullSize(clusterEls[i]);
  });
  where[0x1c53bb6b] = pos;
  const cues = el(0x1c53bb6b, cuePoints);
  for (const s of seekTo) s.pos.body[0].writeBigUInt64BE(BigInt(where[s.id]));
  const segment = el(0x18538067, [seekHead, info, tracks, ...clusterEls, ...(hasCues ? [cues] : [])]);
  const parts = [];
  serialize(header, parts);
  serialize(segment, parts);
  return Buffer.concat(parts);
}
