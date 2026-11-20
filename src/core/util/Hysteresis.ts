export interface HysteresisOptions {
  /** Value at or above which the state wants to turn on. */
  on: number;
  /** Value below which the state wants to turn off (must be ≤ on). */
  off: number;
  /** How long the "on" condition must hold before switching on. */
  onHoldMs?: number;
  /** How long the "off" condition must hold before switching off. */
  offHoldMs?: number;
}

/**
 * A boolean latch with separate on/off thresholds and hold times, so borderline
 * signals don't flicker.
 */
export class Hysteresis {
  private state = false;
  private pendingSince: number | undefined;

  constructor(private readonly opts: HysteresisOptions) {
    if (opts.off > opts.on) throw new RangeError('off threshold must be ≤ on threshold');
  }

  get active(): boolean {
    return this.state;
  }

  update(value: number, now: number): boolean {
    const wantsFlip = this.state ? value < this.opts.off : value >= this.opts.on;
    return this.step(wantsFlip, now);
  }

  /** Drives the latch from an already-boolean condition with the same hold timing. */
  updateBool(condition: boolean, now: number): boolean {
    return this.step(condition !== this.state, now);
  }

  private step(wantsFlip: boolean, now: number): boolean {
    if (!wantsFlip) {
      this.pendingSince = undefined;
      return this.state;
    }
    if (this.pendingSince === undefined) this.pendingSince = now;
    const hold = this.state ? (this.opts.offHoldMs ?? 0) : (this.opts.onHoldMs ?? 0);
    if (now - this.pendingSince >= hold) {
      this.state = !this.state;
      this.pendingSince = undefined;
    }
    return this.state;
  }

  reset(state = false): void {
    this.state = state;
    this.pendingSince = undefined;
  }
}

/** Tracks how long a boolean condition has been continuously true. */
export class SustainTimer {
  private since: number | undefined;

  update(condition: boolean, now: number): number {
    if (!condition) {
      this.since = undefined;
      return 0;
    }
    if (this.since === undefined) this.since = now;
    return now - this.since;
  }

  reset(): void {
    this.since = undefined;
  }
}
