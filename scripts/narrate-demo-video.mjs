// Generates the demo video's narration with Gemini text-to-speech (Interactions API,
// https://aistudio.google.com/docs/speech-generation): one request per turn, each turn
// trimmed and fitted to its section, then laid on a timeline as long as the video. Also
// writes captions timed to the real audio, for compose-demo-video.mjs --narration.
//
//   node scripts/narrate-demo-video.mjs --script <narration.json> --out <dir>
//
// narration.json: { model, voice, style, duration, turns: [{ id, at, max, text }] }
// (`at` = start in seconds, `max` = the longest the turn may run). No key is read here:
// the environment's network proxy adds it to requests to generativelanguage.googleapis.com.
// Generated turns are cached by text and style, so re-runs only call the API for changes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const opts = {};
for (let i = 2; i < process.argv.length; i += 2)
  opts[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!opts.script || !opts.out) throw new Error('usage: --script <narration.json> --out <dir>');
const script = JSON.parse(readFileSync(resolve(opts.script), 'utf8'));
const OUT = resolve(opts.out);
const TTS = join(OUT, 'tts');
mkdirSync(TTS, { recursive: true });
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_TEMPO = 1.08;

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const duration = (file) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
      .toString()
      .trim(),
  );

/** One TTS request (curl goes through the environment's proxy, which adds the key). */
function speak(text, style, file, tries = 0) {
  const body = {
    model: script.model,
    input: [
      {
        type: 'user_input',
        content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }],
      },
    ],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: { speech_config: [{ voice: script.voice }] },
  };
  const req = `${file}.request.json`;
  writeFileSync(req, JSON.stringify(body));
  const raw = execFileSync(
    'curl',
    ['-s', '-m', '180', '-H', 'Content-Type: application/json', '-X', 'POST', ENDPOINT, '-d', `@${req}`],
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString();
  const res = JSON.parse(raw);
  if (res.error) {
    // Rate limited (10 requests a minute on Tier 1): wait as asked, then try again.
    const wait = /retry in (\d+(?:\.\d+)?)s/i.exec(res.error.message ?? '');
    if (wait && tries < 6) {
      const ms = (Number(wait[1]) + 2) * 1000;
      process.stdout.write(`  rate limited: waiting ${Math.round(ms / 1000)} s\n`);
      execFileSync('sleep', [String(ms / 1000)]);
      return speak(text, style, file, tries + 1);
    }
    throw new Error(`TTS failed: ${res.error.status ?? res.error.code} ${res.error.message}`);
  }
  const audio = (res.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'audio')
    .at(-1);
  if (!audio?.data) throw new Error(`TTS returned no audio (status ${res.status})`);
  writeFileSync(file, Buffer.from(audio.data, 'base64'));
}

/** Trims silence at both ends, so the turn starts on its mark and its length is honest. */
function trim(src, dst, tempo = 1) {
  // Even loudness per turn, so no sentence sounds closer or further than the others.
  const t = `${tempo === 1 ? '' : `,atempo=${tempo.toFixed(3)}`},loudnorm=I=-18:TP=-2:LRA=7`;
  ff([
    '-i',
    src,
    '-af',
    `silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse${t}`,
    '-ar',
    '48000',
    '-ac',
    '1',
    dst,
  ]);
}

const report = [];
const placed = [];
for (const [n, turn] of script.turns.entries()) {
  const tag = `${String(n + 1).padStart(2, '0')}-${turn.id}`;
  let style = script.style;
  let fitted = join(TTS, `${tag}.fit.wav`);
  let len = Infinity;
  let tempo = 1;
  for (const attempt of [0, 1]) {
    if (attempt === 1) style = `${script.style} Speak a little faster, keeping it natural.`;
    const key = createHash('sha256')
      .update(`${script.model}|${script.voice}|${style}|${turn.text}`)
      .digest('hex')
      .slice(0, 12);
    const raw = join(TTS, `${tag}.${key}.wav`);
    if (!existsSync(raw)) {
      process.stdout.write(`tts ${tag}${attempt ? ' (faster)' : ''}\n`);
      speak(turn.text, style, raw);
    }
    trim(raw, fitted);
    len = duration(fitted);
    if (len <= turn.max) break;
    if (attempt === 1 && len / turn.max <= MAX_TEMPO) {
      tempo = len / turn.max + 0.005;
      trim(raw, fitted, tempo);
      len = duration(fitted);
    }
  }
  const fits = len <= turn.max + 0.02;
  report.push({
    id: turn.id,
    at: turn.at,
    max: turn.max,
    seconds: +len.toFixed(2),
    tempo: +tempo.toFixed(3),
    fits,
  });
  placed.push({ ...turn, file: fitted, seconds: len });
}
console.table(report);
const over = report.filter((r) => !r.fits);
if (over.length) {
  console.error(
    `turns too long for their sections: ${over.map((r) => r.id).join(', ')} (shorten their text)`,
  );
  process.exit(1);
}

// ---- The narration track: every turn at its mark, silence between, as long as the video.
const inputs = placed.flatMap((p) => ['-i', p.file]);
const delays = placed.map((p, i) => `[${i}]adelay=${Math.round(p.at * 1000)}:all=1[d${i}]`).join(';');
const mix = `${placed.map((_, i) => `[d${i}]`).join('')}amix=inputs=${placed.length}:normalize=0,apad,atrim=0:${script.duration}`;
ff([
  ...inputs,
  '-filter_complex',
  `${delays};${mix},aformat=channel_layouts=stereo[v]`,
  '-map',
  '[v]',
  '-ar',
  '48000',
  join(OUT, 'narration-raw.wav'),
]);
ff([
  '-i',
  join(OUT, 'narration-raw.wav'),
  '-af',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-ar',
  '48000',
  join(OUT, 'narration.wav'),
]);
ff(['-i', join(OUT, 'narration.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', join(OUT, 'narration.mp3')]);

// ---- Captions: each turn's sentences, timed in proportion to their length.
const captions = [];
for (const p of placed) {
  const plain = p.text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = plain.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [plain];
  const total = sentences.reduce((a, x) => a + x.length, 0);
  let t = p.at;
  for (const x of sentences) {
    const d = (p.seconds * x.length) / total;
    captions.push({ from: +t.toFixed(2), to: +(t + d).toFixed(2), text: x });
    t += d;
  }
}
writeFileSync(join(OUT, 'captions.json'), JSON.stringify(captions, null, 1));
const srtTs = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(
  join(OUT, 'stand-in-studio-demo-narrated.srt'),
  captions.map((c, i) => `${i + 1}\n${srtTs(c.from)} --> ${srtTs(c.to)}\n${c.text}\n`).join('\n'),
);
console.log(`narration: ${placed.length} turns → ${join(OUT, 'narration.wav')}`);
