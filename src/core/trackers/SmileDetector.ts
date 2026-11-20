import { C } from '../constants';
import { Hysteresis } from '../util/Hysteresis';
import { ExpSmoother, clamp01 } from '../util/math';

/**
 * Smile → warm glow (REQUIREMENT §4). Compared with the calibrated resting level: on above
 * rest + 0.25 held for 400 ms; off below rest + 0.15.
 */
export class SmileDetector {
  private readonly latch = new Hysteresis({
    on: C.SMILE_ON_DELTA,
    off: C.SMILE_OFF_DELTA,
    onHoldMs: C.SMILE_ON_HOLD_MS,
  });
  private readonly glowSmoother = new ExpSmoother(250);
  private lastDelta = 0;

  update(happy: number | undefined, rest: number, now: number): boolean {
    if (happy !== undefined) {
      this.lastDelta = happy - rest;
      this.latch.update(this.lastDelta, now);
    }
    return this.latch.active;
  }

  /** Forces the smile state (Demo mode). */
  force(on: boolean): void {
    this.latch.reset(on);
    this.lastDelta = on ? 0.5 : 0;
  }

  get smiling(): boolean {
    return this.latch.active;
  }

  /** Smoothed glow 0..1: brighter for a bigger smile. */
  glow(now: number): number {
    const target = this.latch.active ? clamp01(0.55 + (this.lastDelta - C.SMILE_ON_DELTA) * 1.8) : 0;
    return this.glowSmoother.update(target, now);
  }

  reset(): void {
    this.latch.reset();
    this.glowSmoother.reset();
    this.lastDelta = 0;
  }
}
