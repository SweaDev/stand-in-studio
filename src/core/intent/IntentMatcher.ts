import type { IntentAction, IntentDef, IntentTuning } from '../../shared/intents';
import { type SignalId, signalInfo, stateLabel } from '../../shared/signalCatalog';
import { type SignalContext, type SignalReading, readSignal } from './signals';

/** Score at which an intent becomes a candidate, and below which the current one is released. */
export const MATCH_ON = 0.6;
export const MATCH_OFF = 0.4;
/** How long "no intent matches" must last before Auto falls back to the listening blend. */
export const NONE_HOLD_MS = 500;

export interface ConditionEval {
  signal: SignalId;
  states: readonly string[];
  /** max membership over the allowed states (0..1). */
  membership: number;
  reading: SignalReading;
}

export interface IntentEval {
  id: string;
  name: string;
  action: IntentAction;
  /** Fuzzy AND: the lowest condition membership. */
  score: number;
  candidate: boolean;
  /** The condition that set the score (lowest membership), if any. */
  limitedBy: ConditionEval | null;
  conditions: ConditionEval[];
}

/** Evaluates one intent against the current signals. */
export function evaluateIntent(def: IntentDef, ctx: SignalContext, tuning?: IntentTuning): IntentEval {
  const conditions: ConditionEval[] = def.conditions.map((cond) => {
    const reading = readSignal(cond.signal, ctx, tuning?.thresholds[cond.signal]);
    const membership = Math.max(0, ...cond.states.map((s) => reading.m[s] ?? 0));
    return { signal: cond.signal, states: cond.states, membership, reading };
  });
  let score = conditions.length > 0 ? 1 : 0;
  let limitedBy: ConditionEval | null = null;
  for (const ce of conditions) {
    if (ce.membership < score) {
      score = ce.membership;
      limitedBy = ce;
    }
  }
  // A face-based intent can't match without a face, even if every condition were ignored.
  if (!ctx.faceSeen && def.conditions.some((x) => signalInfo(x.signal).needsFace)) score = 0;
  return {
    id: def.id,
    name: def.name,
    action: def.action,
    score,
    candidate: score >= MATCH_ON,
    limitedBy,
    conditions,
  };
}

/** Evaluates every enabled intent, in priority (list) order. */
export function evaluateAll(
  defs: readonly IntentDef[],
  ctx: SignalContext,
  tuning: Readonly<Record<string, IntentTuning>> = {},
): IntentEval[] {
  return defs.filter((d) => d.enabled).map((d) => evaluateIntent(d, ctx, tuning[d.id]));
}

/** "talking = yes" style text of a condition. */
export function describeCondition(signal: SignalId, states: readonly string[]): string {
  return `${signalInfo(signal).label.toLowerCase()} = ${states.map((s) => stateLabel(signal, s).toLowerCase()).join(' or ')}`;
}

export interface TrackerState {
  /** The active intent, or null (none matches → listening blend). */
  current: string | null;
  /** The intent waiting out its hold before taking over (undefined: nothing pending). */
  pending?: { id: string | null; since: number; holdMs: number };
  /** What would win right now, before holds. */
  best: string | null;
}

/**
 * Picks the active intent with hysteresis: the first intent in list order whose score is at
 * least MATCH_ON wins (the current intent keeps counting until it drops below MATCH_OFF),
 * and a change takes effect only after the newcomer's own hold time.
 */
export class IntentTracker {
  private current: string | null = null;
  private pending: { id: string | null; since: number } | null = null;

  update(evals: readonly IntentEval[], holdOf: (id: string | null) => number, now: number): TrackerState {
    let best: string | null = null;
    for (const e of evals) {
      if (e.score >= MATCH_ON || (e.id === this.current && e.score >= MATCH_OFF)) {
        best = e.id;
        break;
      }
    }
    // The current intent was removed or disabled: drop it at once.
    if (this.current !== null && !evals.some((e) => e.id === this.current)) this.current = null;
    if (best === this.current) {
      this.pending = null;
      return { current: this.current, best };
    }
    if (!this.pending || this.pending.id !== best) this.pending = { id: best, since: now };
    const holdMs = holdOf(best);
    if (now - this.pending.since >= holdMs) {
      this.current = best;
      this.pending = null;
      return { current: this.current, best };
    }
    return { current: this.current, pending: { ...this.pending, holdMs }, best };
  }

  get active(): string | null {
    return this.current;
  }

  reset(): void {
    this.current = null;
    this.pending = null;
  }
}
