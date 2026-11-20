/** Shared domain types used by core, sensing, render and UI. No runtime dependencies. */

export type Mode = 'character' | 'camera' | 'blend' | 'auto';
export const MODES: readonly Mode[] = ['character', 'camera', 'blend', 'auto'];

export type CharacterId = 'lantern' | 'houseplant' | 'cat' | 'cloud';
export const CHARACTER_IDS: readonly CharacterId[] = ['lantern', 'houseplant', 'cat', 'cloud'];

export type BlendLayout = 'over' | 'beside';

export interface Point {
  x: number;
  y: number;
}

/**
 * Coarse validation state derived from the SDK's validation code:
 * ok → kOk; noFace → kNoFaceFound; poor → any other code (framing, light, motion...).
 */
export type ValidationState = 'ok' | 'noFace' | 'poor';

/** A slow cardio/breathing-rate reading; `confident` folds the SDK's stable flag and confidence. */
export interface RateReading {
  value: number;
  confident: boolean;
}

/**
 * One normalised packet of live signals at engine time `t` (ms). Every field is optional:
 * a packet only carries what the SDK delivered since the previous one.
 */
export interface SignalFrame {
  t: number;
  /** Chest breathing waveform samples (`breathing.upperTrace`), oldest first. */
  breathingTrace?: number[];
  /** True if any `face.blinking` sample in the packet was detected. */
  blink?: boolean;
  /** Latest `face.talking` detection in the packet. */
  talking?: boolean;
  /** Latest face landmarks (pixel coordinates, layout detected by point count). */
  landmarks?: Point[];
  /** Latest HAPPY expression probability, 0..1. */
  happy?: number;
  /** Latest validation state (from the validationStatus event). */
  validation?: ValidationState;
  /** Only present when the Comfort shield requested cardio metrics. */
  pulseRate?: RateReading;
  /** Only present when the Comfort shield requested breathing rate. */
  breathingRate?: RateReading;
}

export type Presence = 'present' | 'away' | 'waking';

/** Everything a character needs to draw one frame. Values are already amplified for small tiles. */
export interface CharacterPose {
  /** Breathing phase, -1 (exhaled) .. 1 (inhaled). Characters scale ~1 ± 3.5%. */
  breath: number;
  /** Eye openness, 0 (closed) .. 1 (open). */
  eyeOpen: number;
  /** Head pitch in degrees, positive = chin down (nod). */
  pitch: number;
  /** Head yaw in degrees, positive = turning to the viewer's right. */
  yaw: number;
  /** Mouth openness 0..1; always 0 unless talking. */
  mouthOpen: number;
  talking: boolean;
  /** Smile glow 0..1. */
  glow: number;
  /** Laugh sparkles (glow plus a talking burst). */
  sparkle: boolean;
  /** Decaying 0..1 envelope after a detected nod / shake gesture. */
  nodPulse: number;
  shakePulse: number;
  /** True for ≥2 nods within 1.5 s. */
  enthusiastic: boolean;
  presence: Presence;
  /** 0..1 progress of the wake-up stretch while presence is 'waking'. */
  wake: number;
  raisedHand: boolean;
}

export const NEUTRAL_POSE: CharacterPose = Object.freeze({
  breath: 0,
  eyeOpen: 1,
  pitch: 0,
  yaw: 0,
  mouthOpen: 0,
  talking: false,
  glow: 0,
  sparkle: false,
  nodPulse: 0,
  shakePulse: 0,
  enthusiastic: false,
  presence: 'present',
  wake: 0,
  raisedHand: false,
});

export interface StageBadges {
  speaking: boolean;
  raisedHand: boolean;
  backSoon: boolean;
}

/** Visual style switches applied to every character. */
export interface StageStyle {
  reducedMotion: boolean;
  highContrast: boolean;
}

/** The complete description of one stage frame, produced by the engine and drawn by the compositor. */
export interface StageState {
  mode: Mode;
  /** Displayed feed opacity 0..1 (after smoothing). */
  feedOpacity: number;
  /** Where the feed opacity is heading 0..1 (drives the dial needle). */
  targetOpacity: number;
  /** Displayed character opacity 0..1 (fades out in Camera mode). */
  characterOpacity: number;
  layout: BlendLayout;
  /** Camera mode: draw the character small in a corner instead of hiding it. */
  cornerBadge: boolean;
  character: CharacterId;
  background: string;
  pose: CharacterPose;
  badges: StageBadges;
  hidden: boolean;
  pinned: boolean;
  style: StageStyle;
  testPattern: boolean;
}
