import { type IntentAction, raises } from '../../shared/intents';
import { C } from '../constants';
import { clamp01 } from '../util/math';

export interface PolicyInput {
  now: number;
  /** The active intent's action (the listening blend when none matches). */
  action: IntentAction;
  /** User's max feed opacity 0..1. */
  max: number;
  /** User's listening level 0..1. */
  listening: number;
  /** Comfort-shield cap while triggered, else null. */
  shieldCap: number | null;
}

export interface PolicyDecision {
  /** Committed feed target 0..1. */
  target: number;
  /** Committed character opacity target (0 only while revealing). */
  character: number;
  /** The action behind the committed target. */
  action: IntentAction;
  /** What the active intent asks for right now. */
  candidate: number;
  /** A raise waiting out the hold: how long it has waited (ms), else null. */
  raisePendingMs: number | null;
  /** The shield lowered the candidate. */
  capped: boolean;
}

/** Feed opacity an action asks for. */
export function feedFor(action: IntentAction, max: number, listening: number): number {
  const m = clamp01(max);
  if (action === 'reveal') return m;
  if (action === 'blend') return Math.min(clamp01(listening), m);
  return 0;
}

/**
 * Auto policy over intents (REQUIREMENT §5, intent version). The intent tracker has already
 * applied each intent's own hold. On top of that, covering you happens at once, while
 * showing more of you waits a further 2 s of the same request. The result never exceeds
 * your max, and the Comfort shield can only lower it.
 */
export class IntentPolicy {
  private committed: number;
  private committedAction: IntentAction = 'blend';
  private pendingSince: number | null = null;
  private pendingValue = Number.NaN;

  constructor(
    initial: number,
    private readonly holdMs: number = C.AUTO_HOLD_MS,
  ) {
    this.committed = clamp01(initial);
  }

  update(input: PolicyInput): PolicyDecision {
    let candidate = feedFor(input.action, input.max, input.listening);
    const capped = input.shieldCap !== null && input.shieldCap < candidate;
    if (capped) candidate = input.shieldCap as number;
    // A lower max takes effect at once: it is the user's own, explicit limit.
    if (this.committed > input.max) this.committed = clamp01(input.max);

    let raisePendingMs: number | null = null;
    if (Math.abs(candidate - this.committed) < 1e-3) {
      this.committed = candidate;
      this.committedAction = input.action;
      this.pendingSince = null;
    } else if (candidate < this.committed) {
      this.committed = candidate;
      this.committedAction = input.action;
      this.pendingSince = null;
    } else {
      if (this.pendingSince === null || Math.abs(this.pendingValue - candidate) >= 1e-3) {
        this.pendingSince = input.now;
        this.pendingValue = candidate;
      }
      raisePendingMs = input.now - this.pendingSince;
      if (raisePendingMs >= this.holdMs) {
        this.committed = candidate;
        this.committedAction = input.action;
        this.pendingSince = null;
        raisePendingMs = null;
      }
    }
    const revealing = this.committedAction === 'reveal' && !capped && raises(this.committedAction);
    return {
      target: this.committed,
      character: revealing && this.committed > 0 ? 0 : 1,
      action: this.committedAction,
      candidate,
      raisePendingMs,
      capped,
    };
  }

  get target(): number {
    return this.committed;
  }

  reset(initial: number): void {
    this.committed = clamp01(initial);
    this.committedAction = 'blend';
    this.pendingSince = null;
  }
}
