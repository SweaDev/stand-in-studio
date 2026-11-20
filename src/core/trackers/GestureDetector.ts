import { C } from '../constants';
import { ExpSmoother } from '../util/math';

export type GestureKind = 'nod' | 'shake';

export interface GestureEvent {
  kind: GestureKind;
  t: number;
  /** Two or more gestures of this kind within 1.5 s. */
  enthusiastic: boolean;
}

export interface GestureOptions {
  /** 'positive' only counts excursions in the + direction (a nod is a pitch dip). */
  direction: 'positive' | 'both';
  thresholdEd?: number;
  returnMs?: number;
  enthusiasticMs?: number;
}

type State = 'rest' | 'out' | 'held';

/**
 * Detects a quick excursion that returns (REQUIREMENT §4): a nod is a pitch dip of
 * ≥ 0.05 eye-distances that comes back within 700 ms; a shake is the same on yaw.
 * Slow posture drift is absorbed by a slowly adapting rest level, and excursions that
 * don't return in time (looking down, turning away) are ignored.
 */
export class GestureDetector {
  private readonly rest = new ExpSmoother(2_000);
  private state: State = 'rest';
  private startedAt = 0;
  private peak = 0;
  private recent: number[] = [];
  private readonly threshold: number;
  private readonly returnMs: number;
  private readonly enthusiasticMs: number;

  constructor(
    readonly kind: GestureKind,
    private readonly opts: GestureOptions,
  ) {
    this.threshold = opts.thresholdEd ?? C.GESTURE_THRESHOLD_ED;
    this.returnMs = opts.returnMs ?? C.GESTURE_RETURN_MS;
    this.enthusiasticMs = opts.enthusiasticMs ?? C.GESTURE_ENTHUSIASTIC_MS;
  }

  /** `value` is the deviation from the calibrated neutral, in eye-distances. */
  update(value: number, now: number): GestureEvent | null {
    const rest = this.rest.current ?? value;
    const dev = value - rest;
    const out = this.opts.direction === 'positive' ? dev >= this.threshold : Math.abs(dev) >= this.threshold;
    if (this.state === 'out') this.peak = Math.max(this.peak, Math.abs(dev));
    // "Returned" = back near rest, or most of the way back from the peak (the rest level
    // lags a little when posture drifts).
    const back = Math.abs(dev) <= Math.max(this.threshold * 0.4, this.peak * 0.35);

    let event: GestureEvent | null = null;
    switch (this.state) {
      case 'rest':
        if (out) {
          this.state = 'out';
          this.startedAt = now;
          this.peak = Math.abs(dev);
        }
        break;
      case 'out':
        if (now - this.startedAt > this.returnMs) this.state = 'held';
        else if (back) {
          this.state = 'rest';
          event = this.emit(now);
        }
        break;
      case 'held':
        if (Math.abs(dev) < this.threshold * 0.4) this.state = 'rest';
        break;
    }
    // The rest level only adapts while at rest, so a gesture doesn't drag it along;
    // after a long hold it re-anchors to wherever the head settled.
    if (this.state === 'rest') this.rest.update(value, now);
    else if (this.state === 'held' && now - this.startedAt > this.returnMs * 4) {
      this.rest.reset();
      this.rest.update(value, now);
      this.state = 'rest';
    }
    return event;
  }

  private emit(now: number): GestureEvent {
    this.recent = this.recent.filter((t) => now - t <= this.enthusiasticMs);
    this.recent.push(now);
    return { kind: this.kind, t: now, enthusiastic: this.recent.length >= 2 };
  }

  reset(): void {
    this.rest.reset();
    this.state = 'rest';
    this.recent = [];
  }
}
