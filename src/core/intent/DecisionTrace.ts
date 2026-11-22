import { ACTION_LABELS, type IntentAction } from '../../shared/intents';
import { SIGNALS, type SignalId, stateLabel } from '../../shared/signalCatalog';
import type { Mode } from '../../shared/types';
import type { PolicyDecision } from '../auto/IntentPolicy';
import { type IntentEval, type TrackerState, describeCondition } from './IntentMatcher';
import { type SignalContext, readSignal } from './signals';

export interface TraceSignal {
  id: SignalId;
  label: string;
  /** Raw value, e.g. "yaw +0.31 ed". */
  text: string;
  /** Most likely state and its membership. */
  state: string;
  membership: number;
  available: boolean;
  ignored: boolean;
}

export interface TraceIntent {
  id: string;
  name: string;
  action: IntentAction;
  score: number;
  candidate: boolean;
  /** The condition that set the score, e.g. "head turn = facing the screen (0.12)". */
  limitedBy: string | null;
}

/** One evaluation of Auto, for the developer-mode decision log (control window only). */
export interface DecisionTrace {
  t: number;
  mode: Mode;
  signals: TraceSignal[];
  intents: TraceIntent[];
  current: { id: string | null; name: string; action: IntentAction; score: number | null };
  pending: { id: string | null; name: string; elapsedMs: number; holdMs: number } | null;
  policy: {
    candidate: number;
    target: number;
    character: number;
    raisePendingMs: number | null;
    holdMs: number;
    shieldCap: number | null;
    override: 'hidden' | 'pinned' | 'backSoon' | null;
    /** Final feed target the stage moves to (after mode and overrides). */
    feedTarget: number;
  };
  tuning: { id: string; progress: number } | null;
  summary: string;
}

const NONE_NAME = 'No intent matches';

export interface TraceInput {
  now: number;
  mode: Mode;
  ctx: SignalContext;
  evals: readonly IntentEval[];
  tracker: TrackerState;
  names: ReadonlyMap<string, string>;
  policy: PolicyDecision;
  policyHoldMs: number;
  shieldCap: number | null;
  override: DecisionTrace['policy']['override'];
  feedTarget: number;
  tuning: DecisionTrace['tuning'];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function limitText(e: IntentEval): string | null {
  const l = e.limitedBy;
  if (!l) return null;
  const why = l.reading.available ? l.reading.text : (l.reading.reason ?? 'n/a');
  return `${describeCondition(l.signal, l.states)} (${l.membership.toFixed(2)}: ${why})`;
}

export function buildTrace(i: TraceInput): DecisionTrace {
  const signals: TraceSignal[] = SIGNALS.map((info) => {
    const r = readSignal(info.id, i.ctx);
    let best = info.states[0]?.id ?? '';
    for (const s of info.states) if ((r.m[s.id] ?? 0) > (r.m[best] ?? 0)) best = s.id;
    return {
      id: info.id,
      label: info.label,
      text: r.text,
      state: r.available ? stateLabel(info.id, best) : '—',
      membership: r.available ? (r.m[best] ?? 0) : 0,
      available: r.available,
      ignored: r.ignored,
    };
  });
  const intents: TraceIntent[] = i.evals.map((e) => ({
    id: e.id,
    name: e.name,
    action: e.action,
    score: e.score,
    candidate: e.candidate,
    limitedBy: limitText(e),
  }));
  const currentEval = i.evals.find((e) => e.id === i.tracker.current);
  const current = {
    id: i.tracker.current,
    name: currentEval?.name ?? NONE_NAME,
    action: currentEval?.action ?? ('blend' as IntentAction),
    score: currentEval?.score ?? null,
  };
  const p = i.tracker.pending;
  const pending = p
    ? {
        id: p.id,
        name: p.id === null ? NONE_NAME : (i.names.get(p.id) ?? p.id),
        elapsedMs: Math.max(0, i.now - p.since),
        holdMs: p.holdMs,
      }
    : null;

  // "Cover ← Talking to someone else (0.84) beat Talking in the meeting (0.12: head turn = …)"
  const parts: string[] = [];
  parts.push(
    current.id === null
      ? `${ACTION_LABELS[current.action]} ← ${NONE_NAME} (listening fallback)`
      : `${ACTION_LABELS[current.action]} ← ${current.name} (${(current.score ?? 0).toFixed(2)})`,
  );
  const runnerUp = i.evals
    .filter((e) => e.id !== current.id)
    .reduce<IntentEval | null>((a, b) => (a === null || b.score > a.score ? b : a), null);
  if (runnerUp) {
    const lim = runnerUp.candidate ? 'lower in the list' : (limitText(runnerUp) ?? '');
    parts.push(`beat ${runnerUp.name} (${runnerUp.score.toFixed(2)}${lim ? `: ${lim}` : ''})`);
  }
  if (pending)
    parts.push(`waiting for ${pending.name} ${Math.round(pending.elapsedMs)}/${pending.holdMs} ms`);
  if (i.policy.raisePendingMs !== null)
    parts.push(
      `raise to ${pct(i.policy.candidate)} in ${Math.round(Math.max(0, i.policyHoldMs - i.policy.raisePendingMs))} ms`,
    );
  if (i.policy.capped && i.shieldCap !== null) parts.push(`Comfort shield cap ${pct(i.shieldCap)}`);
  if (i.override) parts.push(`override: ${i.override}`);
  if (i.mode !== 'auto') parts.push(`mode ${i.mode}: Auto not applied`);
  parts.push(`feed → ${pct(i.feedTarget)}`);

  return {
    t: i.now,
    mode: i.mode,
    signals,
    intents,
    current,
    pending,
    policy: {
      candidate: i.policy.candidate,
      target: i.policy.target,
      character: i.policy.character,
      raisePendingMs: i.policy.raisePendingMs,
      holdMs: i.policyHoldMs,
      shieldCap: i.shieldCap,
      override: i.override,
      feedTarget: i.feedTarget,
    },
    tuning: i.tuning,
    summary: parts.join(' · '),
  };
}
