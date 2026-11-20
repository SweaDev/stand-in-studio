import type { CharacterPose, Presence } from '../../shared/types';
import type { Baseline } from '../calibration/Calibrator';
import { C } from '../constants';
import type { FaceFeatures } from '../features/FaceFeatures';
import type { GestureEvent } from '../trackers/GestureDetector';
import { clamp, clamp01 } from '../util/math';

/** Approximate nose-tip depth in eye-distances: converts displacement into rotation. */
const NOSE_DEPTH_ED = 0.6;
const MAX_PITCH_DEG = 30;
const MAX_YAW_DEG = 35;
const PULSE_MS = 650;
const ENTHUSIASM_HOLD_MS = 1_500;
/** Mouth gap (ed above closed) that reads as fully open. */
const MOUTH_FULL_ED = 0.35;

export interface PoseInputs {
  now: number;
  /** Breathing phase -1..1 (BreathingNormalizer). */
  breath: number;
  /** Eye openness 0..1 from the blink animation. */
  eyeOpen: number;
  /** Latest smoothed face features, or null when no face is tracked. */
  features: FaceFeatures | null;
  baseline: Baseline;
  talking: boolean;
  smiling: boolean;
  glow: number;
  presence: Presence;
  wake: number;
  raisedHand: boolean;
  reducedMotion: boolean;
}

/** Converts a displacement (ed, relative to calibration) to a rotation in degrees. */
export function edToDegrees(deltaEd: number): number {
  return (Math.asin(clamp(deltaEd / NOSE_DEPTH_ED, -1, 1)) * 180) / Math.PI;
}

/**
 * Maps tracker outputs to a CharacterPose (REQUIREMENT §3–§4). Real cues are amplified ×3
 * so a 5° nod reads as a clear 15° character nod on a small tile; reduced motion halves
 * every amplitude and drops sparkles. The mouth moves only while talking, so chewing or
 * yawning never looks like speech.
 */
export class PoseMapper {
  private nodAt = Number.NEGATIVE_INFINITY;
  private shakeAt = Number.NEGATIVE_INFINITY;
  private enthusiasticAt = Number.NEGATIVE_INFINITY;

  onGesture(e: GestureEvent): void {
    if (e.kind === 'nod') this.nodAt = e.t;
    else this.shakeAt = e.t;
    if (e.enthusiastic) this.enthusiasticAt = e.t;
  }

  map(i: PoseInputs): CharacterPose {
    const motion = i.reducedMotion ? C.REDUCED_MOTION_FACTOR : 1;
    const amp = C.AMPLIFY * motion;
    let pitch = 0;
    let yaw = 0;
    let mouthOpen = 0;
    if (i.features) {
      pitch = clamp(edToDegrees(i.features.pitch - i.baseline.pitch) * amp, -MAX_PITCH_DEG, MAX_PITCH_DEG);
      yaw = clamp(edToDegrees(i.features.yaw - i.baseline.yaw) * amp, -MAX_YAW_DEG, MAX_YAW_DEG);
    }
    if (i.talking) {
      mouthOpen = i.features
        ? clamp01((i.features.mouthGap - i.baseline.mouthGap) / MOUTH_FULL_ED)
        : // No landmarks: a gentle speech flap so talking still reads.
          0.35 + 0.3 * Math.sin((2 * Math.PI * 4 * i.now) / 1000);
      mouthOpen = Math.max(mouthOpen, 0.15);
    }
    const pulse = (at: number) => clamp01(1 - (i.now - at) / PULSE_MS) * motion;
    return {
      breath: clamp(i.breath, -1, 1) * motion,
      eyeOpen: i.presence === 'away' ? 0 : clamp01(i.eyeOpen),
      pitch,
      yaw,
      mouthOpen,
      talking: i.talking,
      glow: clamp01(i.glow),
      sparkle: !i.reducedMotion && i.smiling && i.talking,
      nodPulse: i.now >= this.nodAt ? pulse(this.nodAt) : 0,
      shakePulse: i.now >= this.shakeAt ? pulse(this.shakeAt) : 0,
      enthusiastic: i.now - this.enthusiasticAt <= ENTHUSIASM_HOLD_MS,
      presence: i.presence,
      wake: clamp01(i.wake),
      raisedHand: i.raisedHand,
    };
  }

  reset(): void {
    this.nodAt = Number.NEGATIVE_INFINITY;
    this.shakeAt = Number.NEGATIVE_INFINITY;
    this.enthusiasticAt = Number.NEGATIVE_INFINITY;
  }
}
