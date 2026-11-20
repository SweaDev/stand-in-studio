import { C } from '../constants';
import { clamp01 } from '../util/math';
import { type AutoContext, type AutoRule, DEFAULT_RULES, type RuleName } from './rules';

export interface AutoDecision {
  /** The committed target the feed is moving towards. */
  target: number;
  /** What the rules want right now (may still be waiting for the 2 s hold). */
  candidate: number;
  /** Rules that shaped the candidate. */
  reasons: RuleName[];
}

/**
 * The Auto invariant (REQUIREMENT §5) as a pure function. Raising rules propose a level
 * (lowest wins); without any, the current target stays. Every other rule is a cap. The
 * result never exceeds the user's max, so body signals can only ever show less of you.
 */
export function candidateTarget(
  ctx: AutoContext,
  committed: number,
  rules: readonly AutoRule[] = DEFAULT_RULES,
): { candidate: number; immediate: boolean; reasons: RuleName[] } {
  const max = clamp01(ctx.max);
  const raising: { t: number; r: RuleName }[] = [];
  const caps: { t: number; r: RuleName; immediate: boolean }[] = [];
  for (const rule of rules) {
    const p = rule.evaluate(ctx);
    if (!p) continue;
    if (rule.raises) raising.push({ t: Math.min(clamp01(p.target), max), r: p.rule });
    else caps.push({ t: clamp01(p.target), r: p.rule, immediate: p.immediate });
  }
  let candidate = raising.length > 0 ? Math.min(...raising.map((x) => x.t)) : Math.min(committed, max);
  const reasons: RuleName[] = raising.filter((x) => x.t === candidate).map((x) => x.r);
  let immediate = false;
  for (const cap of caps) {
    if (cap.t < candidate) {
      candidate = cap.t;
      reasons.length = 0;
    }
    if (cap.t <= candidate) {
      reasons.push(cap.r);
      immediate ||= cap.immediate;
    }
  }
  return { candidate: clamp01(Math.min(candidate, max)), immediate, reasons };
}

/**
 * Stateful Auto policy: a new candidate must hold for 2 s before it is committed, except
 * immediate drops (no face, looking away) once their own timers have fired.
 */
export class AutoPolicy {
  private committed: number;
  private pending: number | null = null;
  private pendingSince = 0;

  constructor(
    initial: number,
    private readonly rules: readonly AutoRule[] = DEFAULT_RULES,
    private readonly holdMs: number = C.AUTO_HOLD_MS,
  ) {
    this.committed = clamp01(initial);
  }

  get target(): number {
    return this.committed;
  }

  update(ctx: AutoContext): AutoDecision {
    const { candidate, immediate, reasons } = candidateTarget(ctx, this.committed, this.rules);
    // A lower max takes effect at once: it is the user's own, explicit limit.
    if (this.committed > ctx.max) this.committed = clamp01(ctx.max);

    if (Math.abs(candidate - this.committed) < 1e-3) {
      this.pending = null;
    } else if (immediate && candidate < this.committed) {
      this.committed = candidate;
      this.pending = null;
    } else {
      if (this.pending === null || Math.abs(this.pending - candidate) >= 1e-3) {
        this.pending = candidate;
        this.pendingSince = ctx.now;
      }
      if (ctx.now - this.pendingSince >= this.holdMs) {
        this.committed = candidate;
        this.pending = null;
      }
    }
    return { target: this.committed, candidate, reasons };
  }

  reset(initial: number): void {
    this.committed = clamp01(initial);
    this.pending = null;
  }
}
