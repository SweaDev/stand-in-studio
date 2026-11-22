import type { IntentDef, IntentTuning } from '../../shared/intents';
import { type SignalId, signalInfo } from '../../shared/signalCatalog';
import { median, percentile } from '../util/math';
import { MATCH_ON, evaluateIntent } from './IntentMatcher';
import { type SignalContext, readSignal } from './signals';

export const TUNING_MS = 6_000;

/**
 * Learns per-intent thresholds from a short recording of the user acting the intent out.
 * For a condition on "active" states (turned, open, away…), the threshold becomes 60% of
 * the typical recorded value, so the user's own version of the gesture clearly passes. For
 * a condition on the rest state (centred, closed…), it widens to 125% of the recorded
 * 90th percentile, so the user's normal movement still counts as rest.
 */
export function computeTuning(
  intent: IntentDef,
  samples: readonly SignalContext[],
  others: readonly IntentDef[],
  now: number,
): IntentTuning {
  const thresholds: Partial<Record<SignalId, number>> = {};
  for (const cond of intent.conditions) {
    const info = signalInfo(cond.signal);
    const t = info.threshold;
    if (!t) continue;
    const activeStates = info.states.filter((s) => s.active).map((s) => s.id);
    const allActive = cond.states.every((s) => activeStates.includes(s));
    const allRest = cond.states.every((s) => !activeStates.includes(s));
    if (!allActive && !allRest) continue;
    const values: number[] = [];
    for (const ctx of samples) {
      const r = readSignal(cond.signal, ctx);
      if (!r.available) continue;
      values.push(Math.max(...cond.states.map((s) => r.values[s] ?? 0)));
    }
    if (values.length < 5) continue;
    let thr: number;
    if (allActive) {
      const typical = median(values);
      if (!(typical > 0)) continue;
      thr = 0.6 * typical;
    } else {
      thr = Math.max(t.default, 1.25 * percentile(values, 90));
    }
    thresholds[cond.signal] = Math.min(t.max, Math.max(t.min, thr));
  }
  const tuning: IntentTuning = { thresholds, matched: 0, alsoMatched: {}, recordedAt: now };
  if (samples.length > 0) {
    const share = (def: IntentDef, tn?: IntentTuning) =>
      samples.filter((ctx) => evaluateIntent(def, ctx, tn).score >= MATCH_ON).length / samples.length;
    tuning.matched = share(intent, tuning);
    for (const o of others) {
      if (o.id === intent.id || !o.enabled) continue;
      const sh = share(o);
      if (sh >= 0.1) tuning.alsoMatched[o.id] = Math.round(sh * 100) / 100;
    }
  }
  return tuning;
}

/** Collects signal contexts while the user acts an intent out. */
export class TuningRecorder {
  private samples: SignalContext[] = [];
  private startedAt = 0;

  constructor(
    readonly intentId: string,
    readonly durationMs: number = TUNING_MS,
  ) {}

  start(now: number): void {
    this.samples = [];
    this.startedAt = now;
  }

  push(ctx: SignalContext): void {
    this.samples.push(ctx);
  }

  progress(now: number): number {
    return Math.min(1, (now - this.startedAt) / this.durationMs);
  }

  done(now: number): boolean {
    return now - this.startedAt >= this.durationMs;
  }

  get collected(): readonly SignalContext[] {
    return this.samples;
  }
}
