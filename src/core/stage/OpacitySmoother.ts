import { C } from '../constants';
import { clamp01, easeInOutCubic, lerp } from '../util/math';

/**
 * How the displayed opacity reaches a new target:
 * - 'fade': eased cross-fade (manual changes, mode switches), REQUIREMENT §2;
 * - 'rate': moves at most 40% per second (Auto), REQUIREMENT §5;
 * - 'instant': jumps (only for Hide me, which must win at once).
 */
export type Transition = 'fade' | 'rate' | 'instant';

export class OpacitySmoother {
  private current: number;
  private to: number;
  private from: number;
  private transition: Transition = 'instant';
  private startedAt = 0;
  private lastT: number | undefined;

  constructor(
    initial: number,
    private readonly ratePerS: number = C.AUTO_RATE_PER_S,
    private readonly fadeMs: number = C.CROSSFADE_MS,
  ) {
    this.current = clamp01(initial);
    this.to = this.current;
    this.from = this.current;
  }

  get target(): number {
    return this.to;
  }

  setTarget(target: number, transition: Transition, now: number): void {
    const t = clamp01(target);
    if (Math.abs(t - this.to) < 1e-4 && transition === this.transition) return;
    this.value(now); // bring `current` up to date before changing course
    this.to = t;
    this.from = this.current;
    this.transition = transition;
    this.startedAt = now;
    if (transition === 'instant') this.current = t;
  }

  value(now: number): number {
    const dt = this.lastT === undefined ? 0 : Math.max(0, now - this.lastT);
    this.lastT = now;
    if (this.current === this.to) return this.current;
    switch (this.transition) {
      case 'instant':
        this.current = this.to;
        break;
      case 'fade': {
        const k = this.fadeMs <= 0 ? 1 : (now - this.startedAt) / this.fadeMs;
        this.current = k >= 1 ? this.to : lerp(this.from, this.to, easeInOutCubic(k));
        break;
      }
      case 'rate': {
        const step = (this.ratePerS * dt) / 1000;
        const diff = this.to - this.current;
        this.current = Math.abs(diff) <= step ? this.to : this.current + Math.sign(diff) * step;
        break;
      }
    }
    return this.current;
  }

  /** Jumps to a value without animation (e.g. on startup). */
  snap(v: number, now: number): void {
    this.current = clamp01(v);
    this.to = this.current;
    this.from = this.current;
    this.lastT = now;
  }
}
