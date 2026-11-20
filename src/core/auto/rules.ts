import { C } from '../constants';

/** Everything the Auto rules look at, already debounced by the trackers. */
export interface AutoContext {
  now: number;
  /** Filtered validation is OK (face found, framing and light acceptable). */
  faceOk: boolean;
  /** Head within the look-away thresholds of the calibrated pose. */
  facingScreen: boolean;
  /** Talking for over 1 s (TalkTracker.isSustained). */
  talkingSustained: boolean;
  /** Currently talking (debounced). */
  talking: boolean;
  /** How long the look-away condition has held (ms). */
  lookingAwayMs: number;
  /** How long the mouth has been open without talking (ms). */
  eatingMs: number;
  /** How long filtered validation has been "poor" (ms). */
  poorFramingMs: number;
  /** How long filtered validation has been "noFace" (ms). */
  noFaceMs: number;
  /** Comfort-shield cap (0.15) while triggered, else null. */
  shieldCap: number | null;
  /** User's max feed opacity 0..1. */
  max: number;
  /** User's listening level 0..1. */
  listening: number;
}

export type RuleName =
  'talking' | 'listening' | 'lookAway' | 'eating' | 'framing' | 'noFace' | 'comfortShield';

export interface Proposal {
  rule: RuleName;
  target: number;
  /** Bypasses the 2 s hold (only for drops: no face, looking away). */
  immediate: boolean;
}

/**
 * Strategy: one Auto rule. `raises` marks the only rules allowed to show more of you
 * (visible, deliberate cues). Every other rule is a cap that can only lower the target.
 */
export interface AutoRule {
  readonly name: RuleName;
  readonly raises: boolean;
  evaluate(ctx: AutoContext): Proposal | null;
}

const rule = (
  name: RuleName,
  raises: boolean,
  fn: (ctx: AutoContext) => { target: number; immediate?: boolean } | null,
): AutoRule => ({
  name,
  raises,
  evaluate(ctx) {
    const r = fn(ctx);
    return r ? { rule: name, target: r.target, immediate: r.immediate ?? false } : null;
  },
});

/** You are talking, sustained for over 1 s → your max: the speaker should be seen. */
export const TalkingRule = rule('talking', true, (c) =>
  c.faceOk && c.facingScreen && c.talkingSustained ? { target: c.max } : null,
);

/** Face OK, facing the screen, not talking → your listening level. */
export const ListeningRule = rule('listening', true, (c) =>
  c.faceOk && c.facingScreen && !c.talking ? { target: Math.min(c.listening, c.max) } : null,
);

/** Looking away for over 2 s → 0% (immediate once the timer fires). */
export const LookAwayRule = rule('lookAway', false, (c) =>
  c.lookingAwayMs > C.LOOK_AWAY_MS ? { target: 0, immediate: true } : null,
);

/** Mouth open without talking for over 1.5 s (eating, yawning) → 0%. */
export const EatingRule = rule('eating', false, (c) => (c.eatingMs > C.EATING_MS ? { target: 0 } : null));

/** Poor framing or lighting → 0%. */
export const FramingRule = rule('framing', false, (c) => (c.poorFramingMs > 500 ? { target: 0 } : null));

/** No face for over 3 s → 0% (immediate once the timer fires). */
export const NoFaceRule = rule('noFace', false, (c) =>
  c.noFaceMs > C.AWAY_AFTER_MS ? { target: 0, immediate: true } : null,
);

/** Comfort shield triggered → capped at 15%. */
export const ComfortShieldRule = rule('comfortShield', false, (c) =>
  c.shieldCap !== null ? { target: c.shieldCap } : null,
);

export const DEFAULT_RULES: readonly AutoRule[] = [
  TalkingRule,
  ListeningRule,
  LookAwayRule,
  EatingRule,
  FramingRule,
  NoFaceRule,
  ComfortShieldRule,
];
