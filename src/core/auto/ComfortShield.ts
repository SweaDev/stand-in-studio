import type { RateReading } from '../../shared/types';
import { C } from '../constants';
import { median } from '../util/math';

const MIN_BASELINE_READINGS = 3;
/** "Back near baseline" thresholds (half the trigger deltas: hysteresis). */
const NEAR_PULSE = C.SHIELD_PULSE_DELTA / 2;
const NEAR_BREATHING = C.SHIELD_BREATHING_DELTA / 2;
/** Readings older than this no longer count as evidence either way. */
const STALE_MS = 30_000;

export interface ShieldInput {
  pulseRate?: RateReading;
  breathingRate?: RateReading;
}

/**
 * Opt-in Comfort shield (REQUIREMENT §5). It learns a personal baseline from confident
 * readings over the first ≥30 s after it is switched on (cardio values are averaged over
 * many seconds, so it is deliberately slow). While pulse is more than 12 bpm or breathing
 * rate more than 5/min above baseline, it caps the feed at 15%, until readings have been
 * back near baseline for 20 s. It only ever lowers the feed and never exposes a number.
 */
export class ComfortShield {
  private enabled = false;
  private enabledAt = 0;
  private pulses: number[] = [];
  private breaths: number[] = [];
  private basePulse: number | null = null;
  private baseBreathing: number | null = null;
  private triggered = false;
  private nearSince: number | undefined;
  private lastPulse: { v: number; t: number } | null = null;
  private lastBreathing: { v: number; t: number } | null = null;

  setEnabled(on: boolean, now: number): void {
    if (on === this.enabled) return;
    this.reset();
    this.enabled = on;
    this.enabledAt = now;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** True once a baseline exists for at least one signal. */
  get ready(): boolean {
    return this.basePulse !== null || this.baseBreathing !== null;
  }

  get active(): boolean {
    return this.triggered;
  }

  /** Feeds new readings; returns the cap (0.15) while triggered, else null. */
  update(input: ShieldInput, now: number): number | null {
    if (!this.enabled) return null;
    if (input.pulseRate?.confident) this.lastPulse = { v: input.pulseRate.value, t: now };
    if (input.breathingRate?.confident) this.lastBreathing = { v: input.breathingRate.value, t: now };

    if (!this.ready) {
      if (input.pulseRate?.confident) this.pulses.push(input.pulseRate.value);
      if (input.breathingRate?.confident) this.breaths.push(input.breathingRate.value);
      if (now - this.enabledAt >= C.SHIELD_BASELINE_MS) {
        if (this.pulses.length >= MIN_BASELINE_READINGS) this.basePulse = median(this.pulses);
        if (this.breaths.length >= MIN_BASELINE_READINGS) this.baseBreathing = median(this.breaths);
      }
      return null;
    }

    const fresh = (r: { v: number; t: number } | null) => (r && now - r.t <= STALE_MS ? r.v : null);
    const p = fresh(this.lastPulse);
    const b = fresh(this.lastBreathing);
    const high =
      (p !== null && this.basePulse !== null && p > this.basePulse + C.SHIELD_PULSE_DELTA) ||
      (b !== null && this.baseBreathing !== null && b > this.baseBreathing + C.SHIELD_BREATHING_DELTA);
    const near =
      (p === null || this.basePulse === null || p <= this.basePulse + NEAR_PULSE) &&
      (b === null || this.baseBreathing === null || b <= this.baseBreathing + NEAR_BREATHING);

    if (high) {
      this.triggered = true;
      this.nearSince = undefined;
    } else if (this.triggered) {
      if (near) {
        this.nearSince ??= now;
        if (now - this.nearSince >= C.SHIELD_RECOVERY_MS) {
          this.triggered = false;
          this.nearSince = undefined;
        }
      } else {
        this.nearSince = undefined;
      }
    }
    return this.triggered ? C.SHIELD_CAP : null;
  }

  /** Forces the trigger (Demo mode "P" key); it recovers like a real trigger. */
  simulateTrigger(now: number): void {
    if (!this.enabled) return;
    this.basePulse ??= 70;
    this.lastPulse = { v: this.basePulse, t: now };
    this.triggered = true;
    this.nearSince = undefined;
  }

  /** Forgets the baseline and all readings (they live in memory only). */
  reset(): void {
    this.pulses = [];
    this.breaths = [];
    this.basePulse = null;
    this.baseBreathing = null;
    this.triggered = false;
    this.nearSince = undefined;
    this.lastPulse = null;
    this.lastBreathing = null;
  }
}
