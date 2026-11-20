import type { CharacterId, CharacterPose, StageStyle } from '../../shared/types';
import type { Ctx2D } from '../sketch';

/** Colours and line weights for one style variant. */
export interface Ink {
  line: string;
  lineWidth: number;
  /** Multiplier for wobble: 0 in high contrast (clean, thick outlines). */
  jitter: number;
  /** Whether strokes "boil" (re-seed a few times a second). */
  boil: boolean;
  highContrast: boolean;
}

export interface DrawArgs {
  ctx: Ctx2D;
  /** Centre of the character's box. */
  cx: number;
  cy: number;
  /** Height of the character's box in px; characters scale everything from this. */
  size: number;
  /** Time in ms (for idle animation). */
  t: number;
  pose: CharacterPose;
  style: StageStyle;
  ink: Ink;
}

/** Strategy: one procedural, hand-drawn-style character. */
export interface Character {
  readonly id: CharacterId;
  readonly name: string;
  /** Raised-hand prop, for the UI ("a lantern tassel"). */
  readonly handProp: string;
  draw(args: DrawArgs): void;
}

/** Derives the ink for a style variant (REQUIREMENT §3: reduced motion, high contrast). */
export function inkFor(style: StageStyle, size: number): Ink {
  const base = Math.max(1.5, size / 110);
  if (style.highContrast) {
    return { line: '#000000', lineWidth: base * 2.2, jitter: 0, boil: false, highContrast: true };
  }
  return { line: '#2d2a32', lineWidth: base, jitter: 1, boil: !style.reducedMotion, highContrast: false };
}
