import type { Settings } from '../../shared/settings';
import type { Mode } from '../../shared/types';
import { MODES } from '../../shared/types';
import type { Transition } from './OpacitySmoother';

export interface ModeContext {
  settings: Settings;
  /** Current Auto policy target (used by Auto mode only). */
  autoTarget: number;
}

/** State pattern: each mode decides what the stage wants to show. */
export interface ModeState {
  readonly mode: Mode;
  /** Feed opacity the mode wants, 0..1. */
  feedTarget(ctx: ModeContext): number;
  /** Character opacity the mode wants, 0..1. */
  characterTarget(ctx: ModeContext): number;
  /** How the feed should move towards the target. */
  readonly transition: Transition;
}

const CharacterMode: ModeState = {
  mode: 'character',
  feedTarget: () => 0,
  characterTarget: () => 1,
  transition: 'fade',
};

const CameraMode: ModeState = {
  mode: 'camera',
  feedTarget: () => 1,
  // With the corner badge on, the character stays visible (drawn small in a corner).
  characterTarget: (c) => (c.settings.camera.badge ? 1 : 0),
  transition: 'fade',
};

const BlendMode: ModeState = {
  mode: 'blend',
  feedTarget: (c) => c.settings.blend.opacity,
  characterTarget: () => 1,
  transition: 'fade',
};

const AutoMode: ModeState = {
  mode: 'auto',
  feedTarget: (c) => Math.min(c.autoTarget, c.settings.auto.max),
  characterTarget: () => 1,
  transition: 'rate',
};

const STATES: Record<Mode, ModeState> = {
  character: CharacterMode,
  camera: CameraMode,
  blend: BlendMode,
  auto: AutoMode,
};

export function modeState(mode: Mode): ModeState {
  return STATES[mode];
}

/** Next mode for the "Cycle mode" hotkey. */
export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length] as Mode;
}

/** User overrides that apply on top of every mode (REQUIREMENT §5). */
export class Overrides {
  hidden = false;
  pinned = false;
  pinnedValue = 0;
  raisedHand = false;
  backSoon = false;

  toggleHide(): void {
    this.hidden = !this.hidden;
  }

  /** Pin freezes the opacity that is on screen right now. */
  togglePin(currentOpacity: number): void {
    this.pinned = !this.pinned;
    if (this.pinned) this.pinnedValue = currentOpacity;
  }

  toggleRaiseHand(): void {
    this.raisedHand = !this.raisedHand;
  }

  toggleBackSoon(): void {
    this.backSoon = !this.backSoon;
  }

  clearPin(): void {
    this.pinned = false;
  }
}

export interface FeedDecision {
  feedTarget: number;
  characterTarget: number;
  transition: Transition;
}

/**
 * Resolves the active mode plus overrides into feed and character targets. Precedence:
 * Hide me (instant 0%, always wins) → Back soon (fade to 0%) → Pin (frozen value) → mode.
 */
export function resolveStage(mode: Mode, ctx: ModeContext, o: Overrides): FeedDecision {
  const state = modeState(mode);
  const characterTarget = state.characterTarget(ctx);
  if (o.hidden) return { feedTarget: 0, characterTarget: 1, transition: 'instant' };
  if (o.backSoon) return { feedTarget: 0, characterTarget: 1, transition: 'fade' };
  if (o.pinned) return { feedTarget: o.pinnedValue, characterTarget, transition: 'fade' };
  return { feedTarget: state.feedTarget(ctx), characterTarget, transition: state.transition };
}
