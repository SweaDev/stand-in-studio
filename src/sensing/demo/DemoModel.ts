import { syntheticFace } from '../../core/features/syntheticFace';
import type { SignalFrame } from '../../shared/types';

/** Demo actions (REQUIREMENT §8 keyboard map). */
export type DemoAction =
  'nod' | 'shake' | 'talk' | 'blink' | 'smile' | 'eat' | 'lookAway' | 'away' | 'shield';

export const DEMO_KEYS: Readonly<Record<string, DemoAction>> = Object.freeze({
  n: 'nod',
  s: 'shake',
  t: 'talk',
  b: 'blink',
  h: 'smile',
  e: 'eat',
  l: 'lookAway',
  a: 'away',
  p: 'shield',
});

const NOD_MS = 450;
const SHAKE_MS = 650;
const SMILE_MS = 2_500;
const BLINK_MS = 120;

/**
 * Simulated person. Produces SignalFrames with synthetic landmarks so Demo mode exercises
 * the real feature, calibration, gesture and Auto pipeline. Pure: time is passed in.
 */
export class DemoModel {
  talking = false;
  eating = false;
  lookingAway = false;
  away = false;
  private nodAt = Number.NEGATIVE_INFINITY;
  private shakeAt = Number.NEGATIVE_INFINITY;
  private smileUntil = Number.NEGATIVE_INFINITY;
  private blinkAt = Number.NEGATIVE_INFINITY;
  private nextNaturalBlink = 2_000;

  /** Momentary actions fire once; toggles flip; talk is hold-to-talk (see press/release). */
  trigger(action: DemoAction, now: number): void {
    switch (action) {
      case 'nod':
        this.nodAt = now;
        break;
      case 'shake':
        this.shakeAt = now;
        break;
      case 'blink':
        this.blinkAt = now;
        break;
      case 'smile':
        this.smileUntil = now + SMILE_MS;
        break;
      case 'eat':
        this.eating = !this.eating;
        break;
      case 'lookAway':
        this.lookingAway = !this.lookingAway;
        break;
      case 'away':
        this.away = !this.away;
        break;
      case 'talk':
        this.talking = !this.talking;
        break;
      case 'shield':
        break;
    }
  }

  /** Resets every toggle (used between scripted loop runs). */
  reset(): void {
    this.talking = false;
    this.eating = false;
    this.lookingAway = false;
    this.away = false;
    this.smileUntil = Number.NEGATIVE_INFINITY;
  }

  smiling(now: number): boolean {
    return now < this.smileUntil;
  }

  frame(now: number): SignalFrame {
    // Natural blinks every ~3–5 s.
    if (now >= this.nextNaturalBlink) {
      this.blinkAt = now;
      this.nextNaturalBlink = now + 3_000 + ((now * 7919) % 2_000);
    }
    const breathing = Math.sin((2 * Math.PI * 14 * now) / 60_000);
    if (this.away) {
      return { t: now, validation: 'noFace', talking: false, breathingTrace: [] };
    }

    let pitch = 0.4 + Math.sin(now / 2300) * 0.006;
    let yaw = Math.sin(now / 3100) * 0.01;
    const nodT = now - this.nodAt;
    if (nodT >= 0 && nodT < NOD_MS) pitch += Math.sin((nodT / NOD_MS) * Math.PI) * 0.1;
    const shakeT = now - this.shakeAt;
    if (shakeT >= 0 && shakeT < SHAKE_MS) yaw += Math.sin((shakeT / SHAKE_MS) * Math.PI * 2) * 0.1;
    if (this.lookingAway) yaw += 0.55;

    let mouthGap = 0.02;
    if (this.talking) mouthGap = 0.06 + Math.abs(Math.sin(now / 90)) * 0.22;
    else if (this.eating) mouthGap = 0.32 + Math.abs(Math.sin(now / 300)) * 0.12;

    const blinking = now - this.blinkAt >= 0 && now - this.blinkAt < BLINK_MS;
    return {
      t: now,
      validation: 'ok',
      landmarks: syntheticFace({ pitch, yaw, mouthGap, eyeOpenness: blinking ? 0.02 : 0.3 }),
      blink: blinking,
      talking: this.talking,
      happy: this.smiling(now) ? 0.85 : 0.08,
      breathingTrace: [breathing * 3 + 50],
    };
  }
}
