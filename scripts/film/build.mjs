// scripts/film/build.mjs
// Encodes the film from the frames scripts/film/capture.mjs wrote, with the ElevenLabs narration
// and the music bed ducked under the voice. Writes public/film/rentletter-film.mp4 and
// public/film/poster.jpg. The frames and the two audio files stay out of git; only the MP4 and the
// poster are committed.
//
//   node scripts/film/build.mjs
//
// ffmpeg: $FFMPEG, else node_modules/ffmpeg-static, else whatever is on PATH. Same for ffprobe.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'out/film');
const PUB = path.join(ROOT, 'public/film');
const MP4 = path.join(PUB, 'rentletter-film.mp4');
const POSTER = path.join(PUB, 'poster.jpg');
const NARRATION = path.join(PUB, 'narration.mp3');
const BED = path.join(PUB, 'bed.mp3');
const MAX_BYTES = 20 * 1024 * 1024;

const bin = (envVar, pkg, sub, fallback) => {
  if (process.env[envVar] && existsSync(process.env[envVar])) return process.env[envVar];
  try { const require = createRequire(path.join(ROOT, 'package.json')); const m = require(pkg); const p = sub ? sub(m) : m; if (p && existsSync(p)) return p; } catch (e) { /* not installed here */ }
  return fallback;
};
const FFMPEG = bin('FFMPEG', 'ffmpeg-static', (m) => m, 'ffmpeg');
const FFPROBE = bin('FFPROBE', 'ffprobe-static', (m) => m.path, 'ffprobe');
const run = (file, args) => execFileSync(file, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString();
const probe = (f, entries) => run(FFPROBE, ['-v', 'error', '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', f]).trim();
const mb = (f) => (statSync(f).size / 1048576).toFixed(2);

const manifest = JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const { fps, frames } = manifest;
const seconds = manifest.totalFrames / fps;
for (const f of [NARRATION, BED]) if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }
mkdirSync(PUB, { recursive: true });

// ── the picture: one concat list, each image held for its own frames ──
const list = [];
for (const f of frames) { list.push(`file '${f.file.replace(/'/g, "'\\''")}'`); list.push(`duration ${(f.frames / fps).toFixed(6)}`); }
list.push(`file '${frames[frames.length - 1].file.replace(/'/g, "'\\''")}'`);
const listFile = path.join(OUT, 'concat.txt');
writeFileSync(listFile, list.join('\n'));

const encodePicture = (crf) => {
  const picture = path.join(OUT, 'picture.mp4');
  run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=${fps},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', picture]);
  return picture;
};

// ── the sound: the voice at its own level, the bed twenty under and ducked below the voice ──
// Measured against the bed on its own: this pulls it about 12 dB down while the voice runs.
const DUCK = 'sidechaincompress=threshold=0.012:ratio=16:attack=200:release=600:makeup=1:level_sc=1';
const mux = (picture, out) => {
  const filter = [
    `[2:a]atrim=0:${seconds.toFixed(3)},asetpts=N/SR/TB,volume=-20dB,afade=t=in:st=0:d=2,afade=t=out:st=${(seconds - 3).toFixed(3)}:d=3[bed]`,
    `[1:a]asplit=2[voice][key]`,
    `[bed][key]${DUCK}[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
  ].join(';');
  run(FFMPEG, ['-y', '-i', picture, '-i', NARRATION, '-i', BED, '-filter_complex', filter, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
  return out;
};

let crf = 24;
let picture = encodePicture(crf);
mux(picture, MP4);
while (statSync(MP4).size > MAX_BYTES && crf < 34) {
  crf += 3;
  console.log(`${mb(MP4)}MB is over the cap, encoding again at crf ${crf}`);
  picture = encodePicture(crf);
  mux(picture, MP4);
}
run(FFMPEG, ['-y', '-ss', '40', '-i', MP4, '-frames:v', '1', '-q:v', '3', POSTER]);

console.log(JSON.stringify({
  mp4: path.relative(ROOT, MP4),
  crf,
  duration: probe(MP4, 'format=duration'),
  size: `${mb(MP4)}MB`,
  video: probe(MP4, 'stream=codec_name,width,height,r_frame_rate').replace(/\n/g, ' '),
  poster: path.relative(ROOT, POSTER),
  posterSize: `${mb(POSTER)}MB`,
  ffmpeg: FFMPEG,
}, null, 1));
