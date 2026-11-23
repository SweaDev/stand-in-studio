// Writes an original, calm ambient track for the demo video (no samples, no licences):
// warm pads over Cmaj9 · Am9 · Fmaj9 · G6/9, a soft Karplus–Strong pluck arpeggio, a sub
// bass, a light shaker in the middle section, and a Schroeder reverb. 48 kHz stereo WAV.
//
//   node scripts/make-music.mjs <out.wav> [seconds=186]
import { writeFileSync } from 'node:fs';

const [file, secondsArg] = process.argv.slice(2);
if (!file) throw new Error('usage: make-music.mjs <out.wav> [seconds]');
const SR = 48_000;
const SECONDS = Number(secondsArg ?? 186);
const N = Math.round(SR * SECONDS);
const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);

// Deterministic randomness, so the track is the same every run.
let seed = 0x5eed;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const BPM = 84;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const CHORD = BAR * 2;
// MIDI notes per chord: pad voicing, arpeggio tones, bass root.
const CHORDS = [
  { pad: [52, 59, 62, 64, 71], arp: [64, 67, 71, 74, 76], bass: 36 }, // Cmaj9 (E G B D)
  { pad: [52, 57, 60, 64, 71], arp: [64, 69, 72, 71, 76], bass: 33 }, // Am9
  { pad: [53, 57, 60, 64, 67], arp: [65, 69, 72, 76, 79], bass: 29 }, // Fmaj9
  { pad: [50, 55, 59, 62, 64], arp: [62, 67, 71, 74, 76], bass: 31 }, // G6/9
];

/** Overall level over time: in, a lift in the middle, out. */
function arc(t) {
  const fadeIn = Math.min(1, t / 3);
  const fadeOut = Math.min(1, Math.max(0, (SECONDS - t) / 7));
  return fadeIn * fadeOut;
}

// ---- Pads: detuned sine/triangle stacks with slow attack and release, crossfading chords.
const tri = (p) => 2 * Math.abs(2 * (p - Math.floor(p + 0.5))) - 1;
for (let c = 0, start = 0; start < SECONDS; c++, start += CHORD) {
  const chord = CHORDS[c % CHORDS.length];
  const s0 = Math.round(start * SR);
  const len = Math.round((CHORD + 2.5) * SR);
  for (const [k, note] of chord.pad.entries()) {
    for (const detune of [-0.06, 0, 0.07]) {
      const f = hz(note + detune);
      const pan = 0.5 + (k / (chord.pad.length - 1) - 0.5) * 0.6 + detune;
      let ph = rand();
      for (let i = 0; i < len && s0 + i < N; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 1.8) * Math.min(1, Math.max(0, (CHORD + 2.5 - t) / 2.5));
        const trem = 1 + 0.08 * Math.sin(2 * Math.PI * 0.18 * (start + t) + k);
        ph += f / SR;
        const v = (0.65 * Math.sin(2 * Math.PI * ph) + 0.35 * tri(ph)) * env * trem * 0.018;
        const a = arc(start + t);
        L[s0 + i] += v * a * (1 - pan);
        R[s0 + i] += v * a * pan;
        sendL[s0 + i] += v * a * 0.5;
        sendR[s0 + i] += v * a * 0.5;
      }
    }
  }
  // Sub bass: a soft sine root under each chord.
  const fb = hz(chord.bass + 12);
  for (let i = 0; i < len && s0 + i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (CHORD + 0.8 - t) / 1.2));
    const v = Math.sin(2 * Math.PI * fb * t) * env * 0.05 * arc(start + t);
    L[s0 + i] += v;
    R[s0 + i] += v;
  }
}

// ---- Pluck arpeggio (Karplus–Strong), eighth notes from 10 s to the last 12 s.
function pluck(at, midi, vel, pan) {
  const f = hz(midi);
  const period = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(period).map(() => rand() * 2 - 1);
  // Soften the excitation.
  for (let i = 1; i < period; i++) buf[i] = 0.5 * (buf[i] + buf[i - 1]);
  const s0 = Math.round(at * SR);
  const len = Math.round(2.6 * SR);
  let idx = 0;
  for (let i = 0; i < len && s0 + i < N; i++) {
    const next = (idx + 1) % period;
    const out = buf[idx];
    buf[idx] = 0.4985 * (buf[idx] + buf[next]);
    idx = next;
    const v = out * vel * Math.min(1, i / 40);
    L[s0 + i] += v * (1 - pan);
    R[s0 + i] += v * pan;
    sendL[s0 + i] += v * 0.9;
    sendR[s0 + i] += v * 0.9;
  }
}
const ORDER = [0, 2, 1, 3, 2, 4, 3, 1];
for (let step = 0, t = 10; t < SECONDS - 12; step++, t += BEAT / 2) {
  const chord = CHORDS[Math.floor(t / CHORD) % CHORDS.length];
  if (rand() < 0.18) continue; // breathe: leave some steps out
  const note = chord.arp[ORDER[step % ORDER.length]];
  const swing = step % 2 ? 0.03 : 0;
  const lift = t > 50 && t < 150 ? 1 : 0.7;
  pluck(t + swing, note, (0.05 + rand() * 0.025) * lift * arc(t), 0.3 + rand() * 0.4);
}

// ---- Shaker: filtered noise on the off-beats, middle section only.
for (let t = 48 + BEAT / 2; t < 150; t += BEAT) {
  const s0 = Math.round(t * SR);
  let lp = 0;
  for (let i = 0; i < SR * 0.09 && s0 + i < N; i++) {
    const n = rand() * 2 - 1;
    lp += 0.6 * (n - lp);
    const hp = n - lp;
    const env = Math.exp(-i / (SR * 0.025));
    const v = hp * env * 0.016 * Math.min(1, (t - 48) / 6) * Math.min(1, (150 - t) / 6);
    L[s0 + i] += v * 0.8;
    R[s0 + i] += v;
  }
}

// ---- Reverb (Schroeder: four combs into two all-passes) on the send.
function reverb(input, delays) {
  const out = new Float32Array(N);
  for (const d of delays.combs) {
    const buf = new Float32Array(d);
    let i0 = 0;
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[i0];
      lp = 0.75 * lp + 0.25 * y;
      buf[i0] = input[i] + lp * 0.84;
      out[i] += y * 0.25;
      i0 = (i0 + 1) % d;
    }
  }
  for (const d of delays.allpass) {
    const buf = new Float32Array(d);
    let i0 = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[i0];
      const x = out[i];
      const y = -0.5 * x + b;
      buf[i0] = x + 0.5 * y;
      out[i] = y;
      i0 = (i0 + 1) % d;
    }
  }
  return out;
}
const wetL = reverb(sendL, { combs: [1557, 1617, 1491, 1422].map((d) => d * 2), allpass: [225, 556] });
const wetR = reverb(sendR, { combs: [1580, 1640, 1514, 1445].map((d) => d * 2), allpass: [248, 579] });
for (let i = 0; i < N; i++) {
  L[i] += wetL[i] * 0.45;
  R[i] += wetR[i] * 0.45;
}

// ---- Master: gentle high-shelf cut, peak-normalise to −1 dBFS, 16-bit WAV.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.89 / (peak || 1);
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 4, 40);
const clamp = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(clamp(L[i] * gain), 44 + i * 4);
  pcm.writeInt16LE(clamp(R[i] * gain), 46 + i * 4);
}
writeFileSync(file, pcm);
console.log(`wrote ${file}: ${SECONDS}s, 48 kHz stereo`);
