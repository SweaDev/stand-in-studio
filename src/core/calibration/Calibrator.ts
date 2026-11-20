import { C } from '../constants';
import type { FaceFeatures } from '../features/FaceFeatures';
import { median, percentile } from '../util/math';

/** Personal resting levels captured during calibration; held in memory only. */
export interface Baseline {
  pitch: number;
  yaw: number;
  /** Closed-mouth inner-lip gap (ed). */
  mouthGap: number;
  eyeOpenness: number;
  /** Resting HAPPY probability 0..1 (some faces read "happy" at rest). */
  happyRest: number;
  blinksPerMin: number;
  /** True when built from too few samples (defaults filled in). */
  approximate: boolean;
}

/** Used until calibration finishes, and to fill gaps when signals were missing. */
export const DEFAULT_BASELINE: Baseline = Object.freeze({
  pitch: 0.55,
  yaw: 0,
  mouthGap: 0.03,
  eyeOpenness: 0.3,
  happyRest: 0.1,
  blinksPerMin: 15,
  approximate: true,
});

export type CalibrationPhase = 'idle' | 'collecting' | 'done';

/**
 * State machine: idle → collecting (15 s, extended up to 30 s if the face was barely
 * seen) → done. Feed it features, happy levels and blink events while collecting.
 */
export class Calibrator {
  private phase: CalibrationPhase = 'idle';
  private startedAt = 0;
  private features: FaceFeatures[] = [];
  private happy: number[] = [];
  private blinks = 0;
  private result: Baseline | null = null;

  constructor(
    private readonly durationMs: number = C.CALIBRATION_MS,
    private readonly maxDurationMs: number = C.CALIBRATION_MAX_MS,
    private readonly minSamples: number = C.CALIBRATION_MIN_SAMPLES,
  ) {}

  get state(): CalibrationPhase {
    return this.phase;
  }

  get baseline(): Baseline | null {
    return this.result;
  }

  start(now: number): void {
    this.phase = 'collecting';
    this.startedAt = now;
    this.features = [];
    this.happy = [];
    this.blinks = 0;
    this.result = null;
  }

  /** Abandons calibration and forgets everything collected. */
  reset(): void {
    this.phase = 'idle';
    this.features = [];
    this.happy = [];
    this.blinks = 0;
    this.result = null;
  }

  addFeatures(f: FaceFeatures): void {
    if (this.phase === 'collecting') this.features.push(f);
  }

  addHappy(v: number): void {
    if (this.phase === 'collecting') this.happy.push(v);
  }

  addBlink(): void {
    if (this.phase === 'collecting') this.blinks++;
  }

  /** 0..1 progress towards the nominal duration. */
  progress(now: number): number {
    if (this.phase === 'done') return 1;
    if (this.phase === 'idle') return 0;
    return Math.min(1, (now - this.startedAt) / this.durationMs);
  }

  /** Advances the state machine; returns the baseline once (and thereafter) done. */
  update(now: number): Baseline | null {
    if (this.phase !== 'collecting') return this.result;
    const elapsed = now - this.startedAt;
    const enough = this.features.length >= this.minSamples;
    if ((elapsed >= this.durationMs && enough) || elapsed >= this.maxDurationMs) {
      this.result = this.compute(elapsed);
      this.phase = 'done';
      this.features = [];
      this.happy = [];
    }
    return this.result;
  }

  private compute(elapsedMs: number): Baseline {
    const d = DEFAULT_BASELINE;
    const f = this.features;
    const approximate = f.length < this.minSamples;
    const pick = (xs: number[], fn: (v: number[]) => number, fallback: number) =>
      xs.length > 0 ? fn(xs) : fallback;
    return {
      pitch: pick(
        f.map((x) => x.pitch),
        median,
        d.pitch,
      ),
      yaw: pick(
        f.map((x) => x.yaw),
        median,
        d.yaw,
      ),
      // People talk or smile during calibration; the 20th percentile is "mouth closed".
      mouthGap: pick(
        f.map((x) => x.mouthGap),
        (v) => percentile(v, 20),
        d.mouthGap,
      ),
      eyeOpenness: pick(
        f.map((x) => x.eyeOpenness),
        median,
        d.eyeOpenness,
      ),
      happyRest: pick(this.happy, median, d.happyRest),
      blinksPerMin: elapsedMs > 0 ? (this.blinks * 60_000) / elapsedMs : d.blinksPerMin,
      approximate,
    };
  }
}
