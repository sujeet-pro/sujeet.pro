#!/usr/bin/env node
// Audio orchestrator (implementation plan, Stage 4.3).
//
//   node scripts/render-audio.mjs [--slug <slug>] [--force] [--articles-dir <dir>]
//
// Per article: validate audio/script.json -> lexicon -> per-paragraph cache keys ->
// one synthesizer call for all cache misses -> stitch WAVs in Node (PCM16 concat +
// paragraph/chapter silence) -> audio/.cache/stitched.wav -> two-pass FFmpeg loudnorm ->
// audio/episode.mp3 + audio/chapters.json -> generated.lock.json.
//
// Skips the whole article (no synthesis, no FFmpeg) when the lock's inputHash for both
// outputs matches and the outputs exist with the recorded outputHash, unless --force.
//
// Plain Node (P13): sp.config.ts and schema.ts load via native type stripping.
// Never run in CI (local Apple Silicon only).

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spConfig } from '../sp.config.ts';
import { AudioScriptSchema, AudioChaptersOutputSchema, GeneratedLockSchema } from '../src/lib/articles/schema.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNTH_PATH = path.join(REPO_ROOT, 'scripts/audio/synthesize_mlx.py');
const AUDIO = spConfig.audio;

// ---------------------------------------------------------------------------
// Pure helpers (exported so validate.mjs can recompute inputHash identically)
// ---------------------------------------------------------------------------

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** toolVersion = "mlx-audio@<pin>+synth.<sha256(synthesize_mlx.py)[0..16]>" */
export function computeToolVersion(synthSource = fs.readFileSync(SYNTH_PATH)) {
  const pin = /"mlx-audio==([^"]+)"/.exec(synthSource.toString('utf8'))?.[1];
  if (!pin) throw new Error(`cannot find the mlx-audio pin in ${SYNTH_PATH}`);
  return `mlx-audio@${pin}+synth.${sha256(synthSource).slice(0, 16)}`;
}

/** inputHash = sha256(JSON.stringify([raw script.json text, spConfig.audio, toolVersion])) */
export function computeAudioInputHash(scriptRaw, audioConfig, toolVersion) {
  return sha256(JSON.stringify([scriptRaw, audioConfig, toolVersion]));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-sensitive, single pass (longest key first; replacements are not re-scanned). */
export function applyLexicon(text, lexicon) {
  const keys = Object.keys(lexicon).filter(Boolean).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (keys.length === 0) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${keys.map(escapeRe).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  return text.replace(re, (m) => lexicon[m]);
}

export const chunkKey = ({ model, voice, langCode, speed, toolVersion, spokenText }) =>
  sha256(JSON.stringify([model, voice, langCode, speed, toolVersion, spokenText]));

// ---------------------------------------------------------------------------
// WAV (RIFF) I/O — mono PCM16 only
// ---------------------------------------------------------------------------

function readPcm16Wav(file, expectRate) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file}: not a RIFF/WAVE file`);
  }
  let fmt = null;
  let data = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (body + size > buf.length) throw new Error(`${file}: truncated '${id}' chunk`);
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24); // EXTENSIBLE -> SubFormat GUID's first 2 bytes
      fmt = {
        format,
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    off = body + size + (size & 1); // RIFF chunks are word-aligned
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt or data chunk`);
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16 || fmt.rate !== expectRate) {
    throw new Error(`${file}: expected mono PCM16 @ ${expectRate} Hz, got ${JSON.stringify(fmt)}`);
  }
  if (data.length % 2) throw new Error(`${file}: odd data length`);
  return data;
}

function wavHeader(dataBytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

function run(cmd, args, { input, onStdoutLine, streamStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
      if (!onStdoutLine) return;
      pending += d;
      let nl;
      while ((nl = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        if (line.trim()) onStdoutLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => {
      stderr += d;
      if (streamStderr) process.stderr.write(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (onStdoutLine && pending.trim()) onStdoutLine(pending);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with ${code}${streamStderr ? '' : `\n${stderr.slice(-4000)}`}`));
    });
    child.stdin.end(input ?? '');
  });
}

const counters = { synthCalls: 0, ffmpegRuns: 0 };

async function synthesize(chunks, { model, voice, langCode, speed, cacheDir }) {
  counters.synthCalls++;
  log(`synthesizer: ${chunks.length} chunk(s) to synthesize`);
  const req = { model, voice, langCode, speed, sampleRateHz: AUDIO.sampleRateHz, cacheDir, chunks };
  const seen = new Map();
  await run('uv', ['run', '--quiet', '--python', '3.12', SYNTH_PATH], {
    input: JSON.stringify(req),
    streamStderr: true,
    onStdoutLine: (line) => {
      const r = JSON.parse(line);
      seen.set(r.key, r);
      log(`  [${seen.size}/${chunks.length}] ${r.key.slice(0, 12)} ${r.samples} samples${r.cached ? ' (cached)' : ''}`);
    },
  });
  for (const c of chunks) if (!seen.has(c.key)) throw new Error(`synthesizer returned no result for ${c.key}`);
}

async function ffmpeg(args) {
  counters.ffmpegRuns++;
  return run('ffmpeg', ['-hide_banner', '-nostdin', ...args]);
}

function parseLoudnormJson(stderr) {
  const at = stderr.lastIndexOf('[Parsed_loudnorm');
  const start = stderr.indexOf('{', at);
  const end = stderr.indexOf('}', start);
  if (at < 0 || start < 0 || end < 0) throw new Error(`loudnorm JSON not found in ffmpeg stderr:\n${stderr.slice(-2000)}`);
  const j = JSON.parse(stderr.slice(start, end + 1));
  for (const k of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) {
    if (!Number.isFinite(Number(j[k]))) throw new Error(`loudnorm pass 1: bad ${k}=${j[k]}`);
  }
  return j;
}

// ---------------------------------------------------------------------------
// Per-article pipeline
// ---------------------------------------------------------------------------

const log = (msg) => process.stderr.write(`[render-audio] ${msg}\n`);

const OUT_MP3 = 'audio/episode.mp3';
const OUT_CHAPTERS = 'audio/chapters.json';

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return { schemaVersion: 1, artifacts: {} };
  return GeneratedLockSchema.parse(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
}

function writeLock(lockPath, lock) {
  const sorted = { schemaVersion: 1, artifacts: Object.fromEntries(Object.entries(lock.artifacts).sort(([a], [b]) => (a < b ? -1 : 1))) };
  GeneratedLockSchema.parse(sorted);
  const text = JSON.stringify(sorted, null, 2) + '\n';
  if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === text) return false;
  fs.writeFileSync(lockPath, text);
  return true;
}

function isFresh(articleDir, lock, inputHash) {
  return [OUT_MP3, OUT_CHAPTERS].every((rel) => {
    const e = lock.artifacts[rel];
    const p = path.join(articleDir, rel);
    return e && e.pipeline === 'audio' && e.inputHash === inputHash && fs.existsSync(p) && sha256(fs.readFileSync(p)) === e.outputHash;
  });
}

async function renderArticle(articleDir, { force, toolVersion }) {
  const slug = path.basename(articleDir);
  const scriptPath = path.join(articleDir, 'audio/script.json');
  const scriptRaw = fs.readFileSync(scriptPath, 'utf8');
  const parsed = AudioScriptSchema.safeParse(JSON.parse(scriptRaw));
  if (!parsed.success) throw new Error(`${slug}: audio/script.json invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  const script = parsed.data;
  const ids = script.chapters.map((c) => c.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${slug}: duplicate chapter id in audio/script.json`);

  const lockPath = path.join(articleDir, 'generated.lock.json');
  const lock = readLock(lockPath);
  const inputHash = computeAudioInputHash(scriptRaw, AUDIO, toolVersion);

  if (!force && isFresh(articleDir, lock, inputHash)) {
    log(`${slug}: up to date (inputHash ${inputHash.slice(0, 12)}); skipping`);
    return;
  }

  const sr = AUDIO.sampleRateHz;
  const voice = script.voice ?? AUDIO.voice;
  const speed = script.speed ?? AUDIO.speed;
  const { model, langCode } = AUDIO;
  const cacheDir = path.join(articleDir, 'audio/.cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  // 1. Lexicon + cache keys
  const plan = script.chapters.map((ch) => ({
    ch,
    paras: ch.paragraphs.map((p) => {
      const spokenText = applyLexicon(p.spoken ?? p.text, script.lexicon);
      return { key: chunkKey({ model, voice, langCode, speed, toolVersion, spokenText }), spokenText };
    }),
  }));

  // 2. One synthesizer call for all misses (deduped)
  const misses = new Map();
  for (const { paras } of plan) {
    for (const p of paras) {
      if (!fs.existsSync(path.join(cacheDir, `${p.key}.wav`))) misses.set(p.key, { key: p.key, text: p.spokenText });
    }
  }
  const total = plan.reduce((n, c) => n + c.paras.length, 0);
  log(`${slug}: ${total} paragraph(s), ${misses.size} cache miss(es)`);
  if (misses.size > 0) await synthesize([...misses.values()], { model, voice, langCode, speed, cacheDir });

  // 3. Stitch
  const paraGap = Buffer.alloc(Math.round((AUDIO.paragraphPauseMs * sr) / 1000) * 2);
  const chapGap = Buffer.alloc(Math.round((AUDIO.chapterPauseMs * sr) / 1000) * 2);
  const parts = [];
  let offset = 0; // samples
  const push = (b) => { parts.push(b); offset += b.length / 2; };
  const starts = [];
  plan.forEach(({ paras }, ci) => {
    if (ci > 0) push(chapGap);
    starts.push(offset);
    paras.forEach((p, pi) => {
      if (pi > 0) push(paraGap);
      push(readPcm16Wav(path.join(cacheDir, `${p.key}.wav`), sr));
    });
  });
  const totalSamples = offset;
  const pcm = Buffer.concat(parts);
  const stitched = path.join(cacheDir, 'stitched.wav');
  fs.writeFileSync(stitched, Buffer.concat([wavHeader(pcm.length, sr), pcm]));
  const durationSec = round3(totalSamples / sr);
  log(`${slug}: stitched ${totalSamples} samples (${durationSec}s)`);

  // 4. Two-pass loudnorm (P22: -ar on pass 2)
  // Kokoro speech has ~20 dB between true peak and integrated loudness, so with TP=-1.5 loudnorm cannot
  // apply linear gain and silently falls back to dynamic mode (lands ~1 dB under target). A gentle
  // peak limiter ahead of loudnorm (both passes) restores linear mode: measured -16.3 LUFS on a 99 s clip
  // vs -17.1 without it. Decision recorded in docs/implementation-plan.md 4.3.
  const pre = 'alimiter=limit=0.2:level=false:attack=5:release=50,';
  const ln = `loudnorm=I=${AUDIO.targetLufs}:TP=-1.5:LRA=11`;
  const p1 = parseLoudnormJson((await ffmpeg(['-i', stitched, '-af', `${pre}${ln}:print_format=json`, '-f', 'null', '-'])).stderr);
  log(`${slug}: loudnorm pass 1 I=${p1.input_i} TP=${p1.input_tp} LRA=${p1.input_lra} thresh=${p1.input_thresh} offset=${p1.target_offset}`);
  const mp3Path = path.join(articleDir, OUT_MP3);
  const tmpMp3 = path.join(cacheDir, 'episode.tmp.mp3');
  await ffmpeg([
    '-y', '-i', stitched,
    '-af', `${pre}${ln}:measured_I=${p1.input_i}:measured_TP=${p1.input_tp}:measured_LRA=${p1.input_lra}:measured_thresh=${p1.input_thresh}:offset=${p1.target_offset}:linear=true`,
    '-ar', String(sr), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', `${AUDIO.bitrateKbps}k`,
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
    tmpMp3,
  ]);
  fs.renameSync(tmpMp3, mp3Path);

  // 5. chapters.json (chapters are contiguous: endSec = next start, last = duration)
  const chaptersOut = AudioChaptersOutputSchema.parse({
    schemaVersion: 1,
    title: script.title,
    voice,
    model,
    durationSec,
    sampleRateHz: sr,
    chapters: plan.map(({ ch }, i) => ({
      id: ch.id,
      title: ch.title,
      startSec: round3(starts[i] / sr),
      endSec: i + 1 < starts.length ? round3(starts[i + 1] / sr) : durationSec,
      ...(ch.targetPage !== undefined && { targetPage: ch.targetPage }),
      ...(ch.targetSectionId !== undefined && { targetSectionId: ch.targetSectionId }),
      ...(ch.targetVisualId !== undefined && { targetVisualId: ch.targetVisualId }),
      transcript: ch.paragraphs.map((p) => p.text),
    })),
  });
  const chaptersPath = path.join(articleDir, OUT_CHAPTERS);
  fs.writeFileSync(chaptersPath, JSON.stringify(chaptersOut, null, 2) + '\n');

  // 6. Lock (generatedAt kept when an entry's hashes are unchanged)
  const now = new Date().toISOString();
  for (const rel of [OUT_MP3, OUT_CHAPTERS]) {
    const outputHash = sha256(fs.readFileSync(path.join(articleDir, rel)));
    const prev = lock.artifacts[rel];
    const same = prev && prev.inputHash === inputHash && prev.outputHash === outputHash && prev.toolVersion === toolVersion;
    lock.artifacts[rel] = { pipeline: 'audio', inputHash, outputHash, toolVersion, generatedAt: same ? prev.generatedAt : now };
  }
  const changed = writeLock(lockPath, lock);
  log(`${slug}: wrote ${OUT_MP3}, ${OUT_CHAPTERS}; lock ${changed ? 'updated' : 'unchanged'}`);
}

const round3 = (x) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { slug: null, force: false, articlesDir: path.join(REPO_ROOT, 'src/articles') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--slug') o.slug = argv[++i];
    else if (a === '--articles-dir') o.articlesDir = path.resolve(argv[++i]);
    else if (a === '-h' || a === '--help') {
      process.stdout.write('Usage: node scripts/render-audio.mjs [--slug <slug>] [--force] [--articles-dir <dir>]\n');
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
    if ((a === '--slug' || a === '--articles-dir') && !argv[i]) throw new Error(`${a} needs a value`);
  }
  return o;
}

function selectArticles({ slug, articlesDir }) {
  if (slug) {
    const dir = path.join(articlesDir, slug);
    if (!fs.existsSync(path.join(dir, 'audio/script.json'))) throw new Error(`${slug}: no audio/script.json in ${dir}`);
    return [dir];
  }
  return fs
    .readdirSync(articlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(articlesDir, d.name))
    .filter((dir) => {
      const manifest = path.join(dir, 'article.json');
      if (!fs.existsSync(manifest)) return false;
      if (JSON.parse(fs.readFileSync(manifest, 'utf8')).features?.audio !== true) return false;
      if (!fs.existsSync(path.join(dir, 'audio/script.json'))) throw new Error(`${path.basename(dir)}: features.audio is true but audio/script.json is missing`);
      return true;
    })
    .sort();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const toolVersion = computeToolVersion();
  const dirs = selectArticles(opts);
  if (dirs.length === 0) log('no articles with features.audio === true');
  log(`toolVersion ${toolVersion}`);
  for (const dir of dirs) await renderArticle(dir, { force: opts.force, toolVersion });
  log(`done: ${dirs.length} article(s), synthesizer calls=${counters.synthCalls}, ffmpeg runs=${counters.ffmpegRuns}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log(`ERROR: ${e.message}`);
    process.exit(1);
  });
}
