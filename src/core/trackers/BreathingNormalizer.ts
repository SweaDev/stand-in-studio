import { C } from '../constants';
import { TimeWindow } from '../util/RingBuffer';
import { ExpSmoother, clamp, percentile } from '../util/math';

/**
 * Turns the raw chest breathing waveform into a -1..1 phase (REQUIREMENT §4): each sample
 * is normalised against the 10th–90th percentile of the last 15 s. When no fresh sample has
 * arrived for 2 s, a soft idle breath at 12/min keeps the character alive.
 */
export class BreathingNormalizer {
  private readonly window = new TimeWindow<number>(C.BREATH_WINDOW_MS);
  private readonly out = new ExpSmoother(180);
  private lastSampleAt = Number.NEGATIVE_INFINITY;
  private latest = 0;

  push(samples: readonly number[], now: number): void {
    if (samples.length === 0) return;
    for (const v of samples) this.window.push(now, v);
    this.latest = samples[samples.length - 1] as number;
    this.lastSampleAt = now;
  }

  /** True while live samples drive the output (false = idle breath). */
  isLive(now: number): boolean {
    return now - this.lastSampleAt <= C.BREATH_STALE_MS;
  }

  /** Current breathing phase in -1..1. */
  value(now: number): number {
    let target: number;
    if (this.isLive(now)) {
      this.window.prune(now);
      const vals = this.window.values();
      const lo = percentile(vals, 10);
      const hi = percentile(vals, 90);
      const range = hi - lo;
      target = range > 1e-9 ? clamp(((this.latest - lo) / range) * 2 - 1, -1, 1) : 0;
    } else {
      target = idleBreath(now);
    }
    // Smoothing also hides the hand-over between live and idle breathing.
    return this.out.update(target, now);
  }

  reset(): void {
    this.window.clear();
    this.out.reset();
    this.lastSampleAt = Number.NEGATIVE_INFINITY;
    this.latest = 0;
  }
}

/** Soft sinusoidal breath at the idle rate (12/min). */
export function idleBreath(now: number): number {
  return Math.sin((2 * Math.PI * C.BREATH_IDLE_PER_MIN * now) / 60_000);
}
